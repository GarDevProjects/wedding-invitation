import { describe, expect, it } from 'vitest';
import { requestSchema } from '../../supabase/functions/_shared/contracts';
import { boundedJson, corsHeaders, sha256 } from '../../supabase/functions/_shared/http';
import { calendarFile, display } from '../../src/lib/dates';
import { csvCell, filterInvitations, fromCostaRicaInput, invitationsCsv, toCostaRicaInput } from '../../src/lib/admin';
import { invitationToken } from '../../src/lib/api';
import type { AdminInvitation } from '../../supabase/functions/_shared/contracts';

const token = 'a'.repeat(64);
const row: AdminInvitation = { id: '00000000-0000-4000-8000-000000000001', full_name: 'María López', phone: '+50688888888', status: 'accepted', notes: '=HYPERLINK("evil")', created_at: '2026-10-28T12:00:00Z', updated_at: '2026-10-28T12:00:00Z', expires_at: '2027-01-16T05:59:59Z', responded_at: '2026-10-28T12:00:00Z', sent_at: null, archived_at: null, revoked: false };

describe('invitation boundaries', () => {
  it('accepts only 256-bit hex token paths without guest identifiers', () => {
    expect(invitationToken(`/i/${token}/`)).toBe(token);
    for (const path of ['/i/1', '/i/guest-name', `/i/${token}/other`, '/']) expect(invitationToken(path)).toBeNull();
  });
  it('rejects guest-controlled identities, extra seats, pending submissions and oversized notes', () => {
    const valid = { action: 'respond', token, status: 'accepted', notes: '' };
    expect(requestSchema.safeParse(valid).success).toBe(true);
    for (const extra of [{ invitation_id: row.id }, { full_name: 'Other guest' }, { seats: 2 }, { status: 'pending' }, { notes: 'a'.repeat(1001) }]) {
      expect(requestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
  it('hashes tokens consistently with PostgreSQL SHA-256', async () => {
    expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
describe('HTTP safeguards', () => {
  it('allows only configured browser origins', () => {
    expect(corsHeaders('https://wedding.example', ['https://wedding.example'])['Access-Control-Allow-Origin']).toBe('https://wedding.example');
    expect(() => corsHeaders('https://evil.example', ['https://wedding.example'])).toThrow('ORIGIN_NOT_ALLOWED');
    expect(corsHeaders(null, ['https://wedding.example'])).not.toHaveProperty('Access-Control-Allow-Origin');
  });
  it('limits streamed bodies even without a content-length header', async () => {
    const request = new Request('https://api.example', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'x'.repeat(9000) }) });
    await expect(boundedJson(request)).rejects.toMatchObject({ status: 413 });
  });
  it('rejects invalid JSON and unsupported content types', async () => {
    await expect(boundedJson(new Request('https://api.example', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 });
    await expect(boundedJson(new Request('https://api.example', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).rejects.toMatchObject({ status: 400 });
  });
});
describe('admin reports', () => {
  it('searches accents and applies status, unsent and archive filters together', () => {
    const rows = [row, { ...row, id: '2', status: 'declined' as const, archived_at: '2026-10-28T00:00:00Z' }];
    expect(filterInvitations(rows, 'maria', 'not_sent', false)).toEqual([row]);
    expect(filterInvitations(rows, '', 'declined', false)).toEqual([]);
    expect(filterInvitations(rows, '', 'declined', true)).toHaveLength(1);
  });
  it('exports one seat per acceptance and escapes spreadsheet formulas, quotes and multiline notes', () => {
    const csv = invitationsCsv([row]);
    expect(csv).toContain('"Confirmado","1"');
    expect(csv).toContain(csvCell(row.notes));
    for (const value of ['=SUM(1)', '+123', '-123', '@cmd', '\t=cmd', '  =cmd']) expect(csvCell(value)).toMatch(/^"'/);
    expect(csvCell('normal, "quoted"\ntext')).toBe('"normal, ""quoted""\ntext"');
    expect(csv).not.toContain('token');
  });
});
describe('Costa Rica event times', () => {
  it('preserves the configured wedding date and UTC start in calendar downloads', () => {
    expect(display.dayNumber).toBe('29'); expect(display.monthName).toBe('Enero');
    const calendar = calendarFile(new Date('2026-10-28T00:00:00Z'));
    expect(calendar).toContain('DTSTART:20270129T203000Z');
    expect(calendar).toContain('DTEND:20270130T023000Z');
    for (const line of calendar.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('edits deadlines in Costa Rica time independently of the admin device timezone', () => {
    expect(toCostaRicaInput('2027-01-16T05:59:59Z')).toBe('2027-01-15T23:59:59');
    expect(fromCostaRicaInput('2027-01-15T23:59')).toBe('2027-01-16T05:59:00.000Z');
    expect(fromCostaRicaInput('2027-01-15T23:59:59')).toBe('2027-01-16T05:59:59.000Z');
  });
});
