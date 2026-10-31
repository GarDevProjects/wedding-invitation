import { test, expect, type Page } from '@playwright/test';
import type { AdminInvitation } from '../../supabase/functions/_shared/contracts';

const userId = '00000000-0000-4000-8000-000000000001';
async function setup(page: Page) {
  const now = new Date().toISOString();
  const state = { deleteCalls: 0, failDelete: false, rows: ['Ana López', 'Carlos Pérez', 'María Solís', 'Diego Mora', 'Invitada archivada'].map((full_name, index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`, full_name, phone: '', expires_at: '2027-01-02T20:30:00Z', created_at: now, updated_at: now,
    sent_at: index < 2 ? now : null, archived_at: index === 4 ? now : null, revoked: false,
    status: index === 2 ? 'declined' : index === 3 ? 'pending' : 'accepted', notes: '', responded_at: index === 3 ? null : now,
  })) as AdminInvitation[] };
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url'), 'signature'].join('.');
  await page.route('**/auth/v1/token?**', route => route.fulfill({ json: { access_token: jwt, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user: { id: userId, aud: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: now } } }));
  await page.route('**/functions/v1/wedding-api', async route => {
    const input = route.request().postDataJSON();
    if (input.action === 'list') {
      const active = state.rows.filter(row => !row.archived_at);
      const accepted = active.filter(row => row.status === 'accepted').length;
      const declined = active.filter(row => row.status === 'declined').length;
      return route.fulfill({ json: { invitations: state.rows, metrics: { total: active.length, accepted, declined, pending: active.length - accepted - declined, sent: active.filter(row => row.sent_at).length, response_rate: active.length ? Math.round((accepted + declined) / active.length * 1000) / 10 : 0 }, fetched_at: now } });
    }
    if (input.action === 'delete') {
      state.deleteCalls++;
      expect(route.request().headers().authorization).toBe(`Bearer ${jwt}`);
      if (state.failDelete) { state.failDelete = false; return route.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } }); }
      state.rows = state.rows.filter(row => row.id !== input.id);
      return route.fulfill({ json: { id: input.id, deleted_count: 1 } });
    }
    throw new Error(`Unexpected action ${input.action}`);
  });
  await page.goto('/admin/');
  await page.getByLabel('Correo').fill('admin@example.test');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Confirmados: 2. Pendientes: 1. No asistirán: 1.' })).toBeVisible();
  return state;
}

test('dashboard has neutral styling, accurate charts, visible tools and responsive navigation', async ({ page, isMobile }) => {
  await setup(page);
  await expect(page.getByRole('meter', { name: 'Porcentaje de invitaciones enviadas' })).toHaveAttribute('aria-valuenow', '50');
  await expect(page.locator('.admin-metrics article').first()).toContainText('4');
  await expect(page.locator('.admin-sidebar')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: 'Importar invitaciones desde CSV', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reiniciar invitaciones', exact: true })).toBeVisible();
  expect(await page.locator('details').count()).toBe(0);
  await page.screenshot({ path: `.tools/dashboard-overview-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ver invitaciones sin enviar' }).click();
  await expect(page.getByRole('combobox', { name: 'Estado' })).toHaveValue('not_sent');
  await expect(page.getByRole('cell', { name: 'Diego Mora', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ana López', exact: true })).toHaveCount(0);
  if (isMobile) await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegación de administración' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Respuestas de invitados' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar invitaciones desde CSV', exact: true }).click();
  await expect(page.getByLabel('Archivo CSV')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar invitaciones', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preparar reinicio' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 235, 221)');
});

test('individual deletion supports cancellation, recoverable failure and an archived target', async ({ page, isMobile }) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Ver invitados', exact: true }).click();
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Ana López', exact: true }) });
  await row.getByRole('button', { name: 'Eliminar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar esta invitación?' });
  await expect(dialog).toContainText('Ana López');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).not.toBeVisible(); expect(state.deleteCalls).toBe(0);
  await row.getByRole('button', { name: 'Eliminar', exact: true }).click();
  state.failDelete = true;
  await dialog.getByRole('button', { name: 'Eliminar invitación', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(state.rows).toHaveLength(5);
  await dialog.getByRole('button', { name: 'Eliminar invitación', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ana López', exact: true })).toHaveCount(0);
  expect(state.rows).toHaveLength(4);
  await page.getByLabel('Ver archivadas').check();
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Invitada archivada', exact: true }) }).getByRole('button', { name: 'Eliminar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Eliminar invitación', exact: true }).click();
  await expect(page.getByText('No hay invitaciones en esta vista.')).toBeVisible();
  expect(state.rows).toHaveLength(3);
  expect(state.rows.some(row => row.full_name === 'Carlos Pérez')).toBe(true);
  await page.screenshot({ path: `.tools/dashboard-guests-${test.info().project.name}.png`, fullPage: true });
  if (isMobile) await page.getByRole('button', { name: 'Menú', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegación de administración' }).getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Confirmados: 1. Pendientes: 1. No asistirán: 1.' })).toBeVisible();
  await expect(page.locator('.admin-metrics article').first()).toContainText('3');
});
