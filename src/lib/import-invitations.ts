import { guestFields, MAX_IMPORT_ROWS, type GuestFields, type ImportedInvitation } from '../../supabase/functions/_shared/contracts';
import { csvCell } from './admin';

export const MAX_CSV_BYTES = 128 * 1024;
export interface ImportPreview { guests: GuestFields[]; errors: string[] }

// RFC-style quoted fields, escaped quotes, CRLF, UTF-8 BOM and Excel's semicolon separator.
function readCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  let inQuotes = false, commas = 0, semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { if (inQuotes && text[i + 1] === '"') i++; else inQuotes = !inQuotes; }
    else if (!inQuotes) {
      if (text[i] === '\r' || text[i] === '\n') break;
      if (text[i] === ',') commas++;
      if (text[i] === ';') semicolons++;
    }
  }
  const separator = semicolons > commas ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const finishField = () => { row.push(field); field = ''; closed = false; };
  const finishRow = () => {
    finishField();
    if (row.some(cell => cell.trim())) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error(`El máximo es ${MAX_IMPORT_ROWS} invitados por archivo.`);
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === separator) finishField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (char === '"') {
      if (field || closed) throw new Error('Comillas inválidas en el CSV. Guarda el archivo como CSV UTF-8.');
      quoted = true;
    } else if (closed) {
      if (!/\s/.test(char)) throw new Error('Hay texto después de una celda entre comillas.');
    } else field += char;
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar.');
  if (field || row.length || closed) finishRow();
  return rows;
}

export function parseInvitationsCsv(text: string, defaultDeadline: string, now = Date.now()): ImportPreview {
  const guests: GuestFields[] = [], errors: string[] = [];
  if (new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) return { guests, errors: ['El archivo supera 128 KB.'] };
  let rows: string[][];
  try { rows = readCsv(text); } catch (error) { return { guests, errors: [(error as Error).message] }; }
  if (rows.length < 2) return { guests, errors: ['El CSV necesita encabezados y al menos un invitado.'] };
  const aliases: Record<string, string> = { nombre: 'full_name', full_name: 'full_name', telefono: 'phone', phone: 'phone', fecha_limite: 'expires_at', expires_at: 'expires_at' };
  const headers = rows[0].map(value => aliases[value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')]);
  if (headers.some(value => !value) || new Set(headers).size !== headers.length || !headers.includes('full_name')) {
    return { guests, errors: ['Usa las columnas nombre, telefono y fecha_limite (solo nombre es obligatoria), sin columnas repetidas o adicionales.'] };
  }
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const label = `Fila de datos ${index + 1}`;
    if (row.length !== headers.length) { errors.push(`${label}: la cantidad de columnas no coincide con los encabezados.`); return; }
    const data = Object.fromEntries(headers.map((key, i) => [key, row[i].trim()]));
    let expiry = data.expires_at || defaultDeadline;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(expiry)) {
      expiry = expiry.replace(' ', 'T');
      if (expiry.length === 16) expiry += ':00';
      expiry += '-06:00';
    }
    const result = guestFields.safeParse({ full_name: data.full_name, phone: data.phone || '', expires_at: expiry });
    if (!result.success) {
      const labels: Record<string, string> = { full_name: 'nombre (2–120 caracteres)', phone: 'teléfono (máximo 30 caracteres, números y + . - ( ))', expires_at: 'fecha límite (AAAA-MM-DD HH:mm, hora de Costa Rica)' };
      errors.push(`${label}: revisa ${[...new Set(result.error.issues.map(issue => labels[String(issue.path[0])] ?? 'los datos'))].join(', ')}.`); return;
    }
    if (/[\r\n\u0000]/.test(result.data.full_name + result.data.phone)) { errors.push(`${label}: nombre y teléfono deben estar en una sola línea.`); return; }
    if (Date.parse(result.data.expires_at) <= now) { errors.push(`${label}: la fecha límite debe estar en el futuro.`); return; }
    const identity = JSON.stringify([result.data.full_name.toLowerCase().replace(/\s+/g, ' '), result.data.phone.replace(/\D/g, '')]);
    if (seen.has(identity)) { errors.push(`${label}: nombre y teléfono duplicados dentro del archivo.`); return; }
    seen.add(identity); guests.push(result.data);
  });
  return { guests, errors };
}

export function importTemplate() {
  return '\uFEFFnombre,telefono,fecha_limite\r\nMaría López,50688888888,\r\nCarlos Pérez,,\r\n';
}
export function importedLinksCsv(rows: ImportedInvitation[], origin: string) {
  return '\uFEFF' + [['Nombre', 'Teléfono', 'Fecha límite', 'Enlace personal'], ...rows.map(row => [row.full_name, row.phone, row.expires_at, `${origin}/i/${row.token}`])]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
