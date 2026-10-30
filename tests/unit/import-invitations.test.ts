import { describe, expect, it } from 'vitest';
import { parseInvitationsCsv, importedLinksCsv, importTemplate } from '../../src/lib/import-invitations';
import { requestSchema } from '../../supabase/functions/_shared/contracts';

const deadline = '2027-01-01T23:59:59-06:00';
const now = Date.parse('2026-10-30T00:00:00Z');
const parse = (csv: string) => parseInvitationsCsv(csv, deadline, now);
describe('CSV invitation import', () => {
  it('reads BOM, CRLF, quoted commas and escaped quotes without changing names', () => {
    const result = parse('\uFEFFnombre,telefono,fecha_limite\r\n"López, María ""Mari""",+50688888888,\r\nCarlos,,2027-01-02 14:30\r\n');
    expect(result.errors).toEqual([]);
    expect(result.guests).toEqual([
      { full_name: 'López, María "Mari"', phone: '+50688888888', expires_at: deadline },
      { full_name: 'Carlos', phone: '', expires_at: '2027-01-02T14:30:00-06:00' },
    ]);
  });
  it('supports semicolons, accents in headers, optional columns and the downloadable template', () => {
    expect(parse('nombre;teléfono\nAna López;50688888888').errors).toEqual([]);
    expect(parse('nombre\nAna López').guests[0].expires_at).toBe(deadline);
    expect(parse(importTemplate()).guests).toHaveLength(2);
    expect(parse('full_name,phone,expires_at\nAna López,,2027-01-02T20:30:00Z').errors).toEqual([]);
  });
  it('rejects malformed or ambiguous CSV headers and fields', () => {
    for (const input of ['', 'nombre', 'nombre,nombre\nAna,Ana', 'nombre,correo\nAna,a@b.test', 'telefono\n88888888', 'nombre,telefono\nAna,1,2', 'nombre\n"Ana', 'nombre\n"Ana"x', 'nombre\nAn"a', 'nombre\n"Ana\nLópez"']) expect(parse(input).errors.length).toBeGreaterThan(0);
  });
  it('rejects invalid phones, impossible dates, expired deadlines and duplicates', () => {
    for (const row of ['A,,', 'Ana,call me,', 'Ana,,2027-02-30 15:00', 'Ana,,2026-10-01 15:00', 'Ana,,01/02/2027']) expect(parse(`nombre,telefono,fecha_limite\n${row}`).errors.length).toBeGreaterThan(0);
    expect(parse('nombre,telefono\nAna López,+506 8888-8888\nANA  LÓPEZ,50688888888').errors[0]).toContain('duplicados');
    expect(parseInvitationsCsv('nombre\nAna López', '2020-01-01T00:00:00Z', now).errors[0]).toContain('futuro');
  });
  it('caps rows and bytes before import', () => {
    expect(parse('nombre\n' + Array.from({ length: 200 }, (_, i) => `Invitado ${i}`).join('\n')).errors).toEqual([]);
    expect(parse('nombre\n' + Array.from({ length: 201 }, (_, i) => `Invitado ${i}`).join('\n')).errors[0]).toContain('200');
    expect(parse('x'.repeat(131073)).errors[0]).toContain('128 KB');
  });
  it('exports the generated links and escapes formula-like names and phone numbers', () => {
    const csv = importedLinksCsv([{ id: 'id', full_name: '=HYPERLINK("bad")', phone: '+50688888888', expires_at: deadline, token: 'a'.repeat(64) }], 'https://wedding.example');
    expect(csv).toContain(`https://wedding.example/i/${'a'.repeat(64)}`);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'+50688888888"');
  });
  it('requires explicit reset confirmation, snapshot version and bounded strict import requests', () => {
    const reset = { action: 'reset', confirmation: 'BORRAR TODO', version: 'a'.repeat(64) };
    expect(requestSchema.safeParse(reset).success).toBe(true);
    expect(requestSchema.safeParse({ ...reset, confirmation: 'yes' }).success).toBe(false);
    expect(requestSchema.safeParse({ action: 'reset', confirmation: 'BORRAR TODO' }).success).toBe(false);
    const bulk = { action: 'import', batch_id: '00000000-0000-4000-8000-000000000001', guests: parse('nombre\nAna López').guests };
    expect(requestSchema.safeParse(bulk).success).toBe(true);
    expect(requestSchema.safeParse({ ...bulk, guests: [] }).success).toBe(false);
    expect(requestSchema.safeParse({ ...bulk, guests: Array(201).fill(bulk.guests[0]) }).success).toBe(false);
    expect(requestSchema.safeParse({ ...bulk, guests: [{ ...bulk.guests[0], token: 'chosen' }] }).success).toBe(false);
  });
});
