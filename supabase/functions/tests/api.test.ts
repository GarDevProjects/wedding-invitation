import { strict as assert } from 'node:assert';

Deno.env.set('SUPABASE_URL', 'https://test-project.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
Deno.env.set('ALLOWED_ORIGINS', 'https://wedding.example');
Deno.env.set('RATE_LIMIT_SALT', 'a'.repeat(64));
const { handler } = await import('../wedding-api/handler.ts');
const token = 'a'.repeat(64);

Deno.test('API validates origin, token, Auth identity and administrator membership', async t => {
  const originalFetch = globalThis.fetch;
  let allowRate = true, admin = false, signedIn = false, failDatabase = false;
  const calls: string[] = [];
  globalThis.fetch = async (input, _init) => {
    const url = String(input); calls.push(url);
    if (url.includes('/rpc/consume_rate_limit')) return Response.json(allowRate);
    if (url.includes('/auth/v1/user')) return signedIn
      ? Response.json({ id: '00000000-0000-4000-8000-000000000001', email: 'admin@example.test' })
      : Response.json({ message: 'Invalid JWT', error_code: 'bad_jwt' }, { status: 401 });
    if (url.includes('/admin_profiles')) return Response.json(admin ? { role: 'admin' } : null);
    if (url.includes('/rpc/resolve_invitation')) return failDatabase
      ? Response.json({ message: 'secret guest details in internal database error' }, { status: 500 })
      : Response.json({ full_name: 'María López', status: 'pending', notes: '', can_respond: true, expires_at: '2027-01-16T05:59:59Z' });
    if (url.includes('/rpc/admin_snapshot')) return Response.json({ invitations: [], metrics: { total: 0 }, fetched_at: new Date().toISOString() });
    if (url.includes('/rpc/import_invitations')) return Response.json({ already_imported: false, created_count: 1, invitations: [] });
    if (url.includes('/rpc/admin_reset_preview')) return Response.json({ count: 1, version: token });
    if (url.includes('/rpc/reset_invitations')) return Response.json({ deleted_count: 1 });
    if (url.includes('/rpc/delete_invitation')) return Response.json({ id: '00000000-0000-4000-8000-000000000001', deleted_count: 1 });
    throw new Error('Unexpected network call: ' + url);
  };
  const request = (body: unknown, jwt?: string, origin = 'https://wedding.example') => handler(new Request('https://test-project.supabase.co/functions/v1/wedding-api', {
    method: 'POST', headers: { 'content-type': 'application/json', origin, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) }, body: JSON.stringify(body),
  }));
  try {
    await t.step('rejects unconfigured origins before database access', async () => {
      const response = await request({ action: 'resolve', token }, undefined, 'https://evil.example');
      assert.equal(response.status, 403); assert.equal(calls.length, 0);
    });
    await t.step('preflight has an exact origin and no wildcard', async () => {
      const response = await handler(new Request('https://api.example', { method: 'OPTIONS', headers: { origin: 'https://wedding.example' } }));
      assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://wedding.example');
    });
    await t.step('cannot choose another guest identity or add seats', async () => {
      assert.equal((await request({ action: 'respond', token, status: 'accepted', invitation_id: 'another-guest', seats: 2 })).status, 400);
    });
    await t.step('public requests are rate limited before token resolution', async () => {
      allowRate = false; const response = await request({ action: 'resolve', token });
      assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '600'); allowRate = true;
    });
    await t.step('valid token resolution returns no-store private response', async () => {
      const response = await request({ action: 'resolve', token });
      assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal((await response.json()).full_name, 'María López');
    });
    await t.step('admin action without Auth is rejected', async () => { assert.equal((await request({ action: 'list' })).status, 401); });
    await t.step('invalid JWT is rejected by Auth', async () => { assert.equal((await request({ action: 'list' }, 'bad-jwt')).status, 401); });
    await t.step('valid Auth identity without membership is denied', async () => {
      signedIn = true; assert.equal((await request({ action: 'list' }, 'valid-jwt')).status, 403);
    });
    await t.step('authorized admin gets a server snapshot', async () => {
      admin = true; const response = await request({ action: 'list' }, 'valid-jwt');
      assert.equal(response.status, 200); assert.deepEqual((await response.json()).invitations, []);
    });
    await t.step('bulk and reset operations require verified administrator membership', async () => {
      const actions = [
        { action: 'import', batch_id: '00000000-0000-4000-8000-000000000010', guests: [{ full_name: 'Ana López', phone: '', expires_at: '2027-01-01T23:59:59-06:00' }] },
        { action: 'reset_preview' },
        { action: 'delete', id: '00000000-0000-4000-8000-000000000001' },
        { action: 'reset', confirmation: 'BORRAR TODO', version: token },
      ];
      for (const action of actions) {
        assert.equal((await request(action)).status, 401);
        admin = false;
        const start = calls.length;
        assert.equal((await request(action, 'valid-jwt')).status, 403);
        assert.ok(!calls.slice(start).some(url => /rpc\/(import_invitations|reset_invitations|admin_reset_preview|delete_invitation)/.test(url)));
        admin = true;
        assert.equal((await request(action, 'valid-jwt')).status, action.action === 'import' ? 201 : 200);
      }
    });
    await t.step('reset without exact confirmation and imports with forged fields are rejected', async () => {
      assert.equal((await request({ action: 'reset', confirmation: 'yes', version: token }, 'valid-jwt')).status, 400);
      assert.equal((await request({ action: 'import', batch_id: '00000000-0000-4000-8000-000000000010', guests: [{ full_name: 'Ana López', phone: '', expires_at: '2027-01-01T23:59:59-06:00', token }] }, 'valid-jwt')).status, 400);
      assert.equal((await request({ action: 'reset', confirmation: 'BORRAR TODO', version: token, extra: 'x'.repeat(131072) }, 'valid-jwt')).status, 413);
    });
    await t.step('internal errors never expose private data', async () => {
      failDatabase = true; const response = await request({ action: 'resolve', token });
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'UNAVAILABLE' });
    });
  } finally { globalThis.fetch = originalFetch; }
});
