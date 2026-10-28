import { createClient } from '@supabase/supabase-js';
import { requestSchema } from '../_shared/contracts.ts';
import { boundedJson, corsHeaders, HttpError, sha256 } from '../_shared/http.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean);
const salt = Deno.env.get('RATE_LIMIT_SALT') ?? '';
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

export const handler = async (request: Request) => {
  let headers: Record<string, string> = {};
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...(status === 429 ? { 'Retry-After': '600' } : {}) },
  });
  try {
    if (!origins.length || salt.length < 32 || salt.startsWith('replace-')) throw new HttpError(503, 'SERVER_NOT_CONFIGURED');
    headers = corsHeaders(request.headers.get('origin'), origins);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
    // Supabase's ingress supplies X-Forwarded-For; use the rightmost address, not an untrusted prepended value.
    const ip = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    const { data: allowed, error: rateError } = await db.rpc('consume_rate_limit', { p_bucket: await sha256(`${salt}:ip:${ip}`), p_limit: 120, p_seconds: 600 });
    if (rateError) throw rateError;
    if (!allowed) throw new HttpError(429, 'RATE_LIMITED');
    const parsed = requestSchema.safeParse(await boundedJson(request));
    if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT');
    const input = parsed.data;
    if (input.action === 'resolve' || input.action === 'respond') {
      const hash = await sha256(input.token);
      if (input.action === 'respond') {
        const { data: tokenAllowed, error } = await db.rpc('consume_rate_limit', { p_bucket: `token:${hash}`, p_limit: 30, p_seconds: 3600 });
        if (error) throw error;
        if (!tokenAllowed) throw new HttpError(429, 'RATE_LIMITED');
      }
      const result = input.action === 'resolve'
        ? await db.rpc('resolve_invitation', { p_hash: hash })
        : await db.rpc('submit_rsvp', { p_hash: hash, p_status: input.status, p_notes: input.notes });
      if (result.error) throw result.error;
      if (!result.data) throw new HttpError(404, 'INVALID_LINK');
      return reply(result.data);
    }
    // Never trust a decoded JWT or user-editable metadata as administrator authorization.
    const authorization = request.headers.get('authorization');
    const jwt = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!jwt) throw new HttpError(401, 'UNAUTHORIZED');
    const { data: { user }, error: authError } = await db.auth.getUser(jwt);
    if (authError || !user) throw new HttpError(401, 'UNAUTHORIZED');
    const { data: profile, error: profileError } = await db.from('admin_profiles').select('role').eq('user_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'admin') throw new HttpError(403, 'FORBIDDEN');

    if (input.action === 'list') {
      const { data, error } = await db.rpc('admin_snapshot'); if (error) throw error; return reply(data);
    }
    if (input.action === 'create') {
      const { data, error } = await db.rpc('create_invitation', { p_full_name: input.full_name, p_phone: input.phone, p_expires_at: input.expires_at });
      if (error) throw error; return reply(data, 201);
    }
    if (input.action === 'rotate') {
      const { data, error } = await db.rpc('rotate_invitation', { p_id: input.id }); if (error) throw error; return reply(data);
    }
    const changes = input.action === 'edit' ? { full_name: input.full_name, phone: input.phone, expires_at: input.expires_at }
      : input.action === 'archive' ? { archived_at: input.archived ? new Date().toISOString() : null }
      : input.action === 'revoke' ? { revoked: true }
      : { sent_at: new Date().toISOString() };
    const { data, error } = await db.from('invitations').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', input.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'NOT_FOUND');
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.code }, error.status);
    // SQL errors may contain private data. Return only a fixed allowlist; never log bodies or tokens.
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    const status: Record<string, number> = { INVALID_LINK: 404, DEADLINE_PASSED: 409, INVALID_INPUT: 400, INVALID_DEADLINE: 400, NOT_FOUND: 404 };
    if (message in status) return reply({ error: message }, status[message]);
    return reply({ error: 'UNAVAILABLE' }, 503);
  }
};
