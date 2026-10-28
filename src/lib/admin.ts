import type { AdminInvitation } from '../../supabase/functions/_shared/contracts';

export const statusLabels = { pending: 'Pendiente', accepted: 'Confirmado', declined: 'No asistirá' } as const;
export function filterInvitations(rows: AdminInvitation[], search: string, filter: string, archived: boolean) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
  return rows.filter(row => Boolean(row.archived_at) === archived && normalize(row.full_name).includes(normalize(search)) &&
    (filter === 'all' || (filter === 'not_sent' ? !row.sent_at : row.status === filter)));
}
// Protect spreadsheet users from CSV formula injection, including leading control characters.
export function csvCell(value: string | null) {
  let safe = value ?? '';
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(safe) || /^[\t\r\n]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function invitationsCsv(rows: AdminInvitation[]) {
  const header = ['Nombre', 'Contacto', 'Estado', 'Asientos confirmados', 'Enviada (UTC)', 'Fecha límite (UTC)', 'Respondió (UTC)', 'Actualizada (UTC)', 'Notas', 'Archivada', 'Enlace revocado'];
  return '\uFEFF' + [header, ...rows.map(row => [row.full_name, row.phone, statusLabels[row.status], row.status === 'accepted' ? '1' : '0', row.sent_at, row.expires_at, row.responded_at, row.updated_at, row.notes, row.archived_at ? 'Sí' : 'No', row.revoked ? 'Sí' : 'No'])]
    .map(values => values.map(csvCell).join(',')).join('\r\n');
}
export const toCostaRicaInput = (iso: string) => new Date(new Date(iso).getTime() - 6 * 3600000).toISOString().slice(0,19);
export const fromCostaRicaInput = (local: string) => new Date(`${local.length === 16 ? local + ':00' : local}-06:00`).toISOString();
