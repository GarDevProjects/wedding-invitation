import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { AdminInvitation, GuestFields } from '../../supabase/functions/_shared/contracts';

const userId = '00000000-0000-4000-8000-000000000001';
const file = (text: string) => ({ name: 'invitados.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
const csv = 'nombre,telefono,fecha_limite\nMaría López,+50688888888,\nCarlos Pérez,,2027-01-02 14:30';
async function setup(page: Page) {
  const now = new Date().toISOString();
  const state = { imports: 0, resets: 0, loseResponse: false, staleReset: false, batchIds: [] as string[], rows: [{ id: userId, full_name: 'Invitado archivado', phone: '', expires_at: '2027-01-02T20:30:00Z', created_at: now, updated_at: now, sent_at: null, archived_at: now, revoked: false, status: 'pending', notes: '', responded_at: null }] as AdminInvitation[] };
  const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url'), 'signature'].join('.');
  await page.route('**/auth/v1/token?**', route => route.fulfill({ json: { access_token: jwt, refresh_token: 'refresh-test', token_type: 'bearer', expires_in: 3600, user: { id: userId, aud: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: now } } }));
  await page.route('**/functions/v1/wedding-api', async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${jwt}`);
    const input = route.request().postDataJSON();
    if (input.action === 'list') {
      const active = state.rows.filter(row => !row.archived_at);
      return route.fulfill({ json: { invitations: state.rows, metrics: { total: active.length, sent: 0, accepted: 0, declined: 0, pending: active.length, response_rate: 0 }, fetched_at: now } });
    }
    if (input.action === 'import') {
      state.imports++;
      state.batchIds.push(input.batch_id);
      if (state.batchIds.length > 1 && input.batch_id === state.batchIds[0]) return route.fulfill({ json: { already_imported: true, created_count: 2 } });
      const invitations = input.guests.map((guest: GuestFields, index: number) => {
        const id = `00000000-0000-4000-8000-00000000000${index + 2}`;
        state.rows.push({ ...guest, id, created_at: now, updated_at: now, sent_at: null, archived_at: null, revoked: false, status: 'pending', notes: '', responded_at: null });
        return { ...guest, id, token: String(index + 1).repeat(64) };
      });
      if (state.loseResponse) { state.loseResponse = false; return route.abort('failed'); }
      return route.fulfill({ json: { already_imported: false, created_count: invitations.length, invitations } });
    }
    if (input.action === 'reset_preview') return route.fulfill({ json: { count: state.rows.length, version: 'a'.repeat(64) } });
    if (input.action === 'reset') {
      expect(input.confirmation).toBe('BORRAR TODO'); expect(input.version).toBe('a'.repeat(64));
      if (state.staleReset) { state.staleReset = false; return route.fulfill({ status: 409, json: { error: 'RESET_CHANGED' } }); }
      state.resets++; const deleted_count = state.rows.length; state.rows = [];
      return route.fulfill({ json: { deleted_count } });
    }
    throw new Error(`Unexpected API action: ${input.action}`);
  });
  await page.goto('/admin/');
  await page.getByLabel('Correo').fill('admin@example.test');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByRole('button', { name: 'Nueva invitación' }).waitFor();
  await page.getByRole('button', { name: 'Importar invitaciones desde CSV', exact: true }).click();
  return state;
}

test('admin validates CSV, imports, downloads links and explicitly resets all invitations', async ({ page }) => {
  const state = await setup(page);
  const input = page.getByLabel('Archivo CSV');
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar plantilla CSV' }).click();
  expect((await templateDownload).suggestedFilename()).toBe('plantilla-invitaciones.csv');
  await input.setInputFiles(file('nombre,telefono\nAna,invalid\nCarlos,8888'));
  await expect(page.getByRole('alert')).toContainText('teléfono');
  await expect(page.getByRole('button', { name: 'Crear 1 invitaciones', exact: true })).toBeDisabled();
  expect(state.imports).toBe(0);
  await input.setInputFiles(file(csv));
  await expect(page.getByRole('table', { name: 'Vista previa de invitados' })).toContainText('María López');
  await page.getByRole('button', { name: 'Crear 2 invitaciones', exact: true }).click();
  await expect(page.getByText('2 invitaciones creadas.', { exact: false })).toBeVisible();
  expect(state.imports).toBe(1); expect(state.rows).toHaveLength(3);
  expect(state.rows[1].expires_at).toBe('2027-01-01T23:59:59-06:00');
  const linksDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar CSV con enlaces' }).click();
  const download = await linksDownload;
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toContain(`/i/${'1'.repeat(64)}`);
  expect(exported).toContain('María López');
  await page.getByRole('button', { name: 'Reiniciar invitaciones', exact: true }).click();
  await page.getByRole('button', { name: 'Preparar reinicio' }).click();
  await expect(page.getByText('Se eliminarán 3 invitaciones.', { exact: true })).toBeVisible();
  const deleteButton = page.getByRole('button', { name: 'Eliminar todas las invitaciones' });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel('Escribe BORRAR TODO para confirmar').fill('BORRAR');
  await expect(deleteButton).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar reinicio' }).click();
  expect(state.resets).toBe(0);
  await page.getByRole('button', { name: 'Preparar reinicio' }).click();
  await page.getByLabel('Escribe BORRAR TODO para confirmar').fill('BORRAR TODO');
  await page.locator('.admin-reset').screenshot({ path: `.tools/admin-reset-${test.info().project.name}.png` });
  state.staleReset = true;
  await deleteButton.click();
  await expect(page.getByText('Las invitaciones o respuestas cambiaron.', { exact: false })).toBeVisible();
  expect(state.resets).toBe(0);
  await page.getByRole('button', { name: 'Preparar reinicio' }).click();
  await page.getByLabel('Escribe BORRAR TODO para confirmar').fill('BORRAR TODO');
  await deleteButton.click();
  await expect(page.getByText('Reinicio completado:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar CSV con enlaces' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Nueva invitación', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('No hay invitaciones en esta vista.')).toBeVisible();
  expect(state.rows).toHaveLength(0); expect(state.resets).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a lost import response retries with the same batch id without duplicate invitations', async ({ page }) => {
  const state = await setup(page); state.loseResponse = true;
  await page.getByLabel('Archivo CSV').setInputFiles(file(csv));
  const create = page.getByRole('button', { name: 'Crear 2 invitaciones', exact: true });
  await expect(create).toBeEnabled();
  await page.screenshot({ path: `.tools/admin-import-preview-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await create.click();
  await expect(page.getByText('Si la conexión se interrumpió', { exact: false })).toBeVisible();
  await create.click();
  await expect(page.getByText('Este lote de 2 invitaciones ya se había guardado.', { exact: false })).toBeVisible();
  expect(state.imports).toBe(2); expect(new Set(state.batchIds).size).toBe(1); expect(state.rows).toHaveLength(3);
});
