import { test, expect } from '@playwright/test';
import type { AdminInvitation } from '../../supabase/functions/_shared/contracts';

const userId = '00000000-0000-4000-8000-000000000001';
const token = 'b'.repeat(64);
test('admin signs in, creates, edits, shares, filters, exports and archives an invitation', async ({ page }) => {
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url'), 'signature'].join('.');
  await page.route('**/auth/v1/token?**', route => route.fulfill({ json: {
    access_token: jwt, refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600,
    user: { id: userId, aud: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  } }));
  let rows: AdminInvitation[] = [];
  await page.route('**/functions/v1/wedding-api', async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${jwt}`);
    const input = route.request().postDataJSON();
    const now = new Date().toISOString();
    if (input.action === 'list') {
      const active = rows.filter(row => !row.archived_at);
      await route.fulfill({ json: { invitations: rows, metrics: { total: active.length, sent: active.filter(row => row.sent_at).length, accepted: 0, declined: 0, pending: active.length, response_rate: 0 }, fetched_at: now } }); return;
    }
    if (input.action === 'create') {
      rows.push({ id: userId, full_name: input.full_name, phone: input.phone, expires_at: input.expires_at, created_at: now, updated_at: now, sent_at: null, archived_at: null, revoked: false, status: 'pending', notes: '', responded_at: null });
      await route.fulfill({ json: { id: userId, token } }); return;
    }
    const row = rows.find(row => row.id === input.id)!;
    if (input.action === 'edit') Object.assign(row, { full_name: input.full_name, phone: input.phone, expires_at: input.expires_at });
    if (input.action === 'sent') row.sent_at = now;
    if (input.action === 'archive') row.archived_at = input.archived ? now : null;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/admin/');
  await page.getByLabel('Correo').fill('admin@example.test');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('button', { name: 'Nueva invitación' }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('María López');
  await page.getByLabel('Teléfono').fill('+50688888888');
  await page.getByLabel('Fecha límite').fill('2027-01-15T23:59');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByLabel('Enlace personal recién generado')).toHaveValue(new RegExp(`/i/${token}$`));
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa.me\/50688888888/);
  await page.getByRole('heading', { name: 'Lista de invitados' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.tools/admin-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Marcar enviada' }).click();
  await expect(page.getByRole('button', { name: 'Marcar enviada' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('María López Solís');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByLabel('Buscar por nombre').fill('maria');
  await expect(page.getByRole('cell', { name: /María López Solís/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Estado' }).selectOption('accepted');
  await expect(page.getByText('No hay invitaciones en esta vista.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Estado' }).selectOption('all');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar vista CSV/ }).click();
  expect((await download).suggestedFilename()).toBe('invitaciones.csv');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByText('No hay invitaciones en esta vista.')).toBeVisible();
  await page.getByLabel('Ver archivadas').check();
  await expect(page.getByRole('button', { name: 'Restaurar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
