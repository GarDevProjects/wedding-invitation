import { test, expect } from '@playwright/test';

const token = 'a'.repeat(64);
test('retains the invitation, opens accessibly, defers audio and supports the gallery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Content Security Policy')) errors.push(message.text()); });
  let audioRequests = 0;
  page.on('request', request => { if (request.url().endsWith('.mp3')) audioRequests++; });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Nuestro para siempre' })).toBeVisible();
  expect(audioRequests).toBe(0);
  await page.getByRole('button', { name: 'Abrir invitación', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('Akion & Mariamalia');
  await expect(page.locator('.hero__names span').last()).toHaveCSS('opacity', '1');
  await expect(page.locator('.hero__date')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `.tools/preview-${test.info().project.name}.png` });
  await expect(page.getByText('Para confirmar, abre el enlace personal')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Agendar la fecha' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  const photo = page.locator('.moment-card').first();
  await photo.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Vista ampliada de la foto' })).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
  await expect(photo).toBeFocused();
  await page.getByRole('button', { name: 'Reproducir música' }).click();
  await expect(page.getByRole('button', { name: 'Pausar música' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pausar música' }).click();
  expect(audioRequests).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('personalizes a deep link and allows acceptance then decline without reloading music', async ({ page }) => {
  let status = 'pending';
  await page.route('**/functions/v1/wedding-api', async route => {
    const input = route.request().postDataJSON();
    if (input.action === 'respond') { expect(input).not.toHaveProperty('invitation_id'); status = input.status; }
    await route.fulfill({ json: { full_name: 'María López', expires_at: '2027-01-16T05:59:59Z', status, notes: '', can_respond: true } });
  });
  await page.goto(`/i/${token}`);
  await page.getByRole('button', { name: 'Abrir invitación', exact: true }).click();
  await expect(page.getByText('María López', { exact: true })).toBeVisible();
  await page.getByLabel('Sí, con mucho gusto').check();
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  await expect(page.getByRole('status')).toContainText('Tu lugar está confirmado');
  await page.getByLabel('No podré asistir').check();
  await page.getByRole('button', { name: 'Actualizar respuesta' }).click();
  await expect(page.getByRole('status')).toContainText('Gracias por avisarnos');
});

test('expired invitations are read-only and revoked links expose no guest form', async ({ page }) => {
  await page.route('**/functions/v1/wedding-api', route => route.fulfill({ json: { full_name: 'María López', expires_at: '2026-01-01T00:00:00Z', status: 'accepted', notes: '', can_respond: false } }));
  await page.goto(`/i/${token}`); await page.getByRole('button', { name: 'Abrir invitación', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Actualizar respuesta' })).toBeDisabled();
  await page.unroute('**/functions/v1/wedding-api');
  await page.route('**/functions/v1/wedding-api', route => route.fulfill({ status: 404, json: { error: 'INVALID_LINK' } }));
  await page.reload(); await page.getByRole('button', { name: 'Abrir invitación', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Esta invitación no está disponible');
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('content stays readable without JavaScript and with reduced motion', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage(); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Formal tropical' })).toBeVisible();
  await expect(page.locator('[data-text="venueName"]')).toHaveText('Sala de Eventos Laureal');
  await expect(page.locator('.hero__image')).toHaveAttribute('srcset', /640w/);
  await context.close();
});
