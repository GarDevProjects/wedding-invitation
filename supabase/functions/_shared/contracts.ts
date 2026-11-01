import { z } from 'zod';

export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const responseSchema = z.enum(['pending', 'accepted', 'declined']);
export const guestFields = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).regex(/^[+\d\s().-]*$/).default(''),
  expires_at: z.iso.datetime({ offset: true }),
});
export const MAX_IMPORT_ROWS = 200;
export const RESET_CONFIRMATION = 'BORRAR TODO';
export type GuestFields = z.infer<typeof guestFields>;
export const seatingTableFields = z.object({ name: z.string().trim().min(2).max(60), capacity: z.number().int().min(1).max(100) });
export const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resolve'), token: tokenSchema }).strict(),
  z.object({ action: z.literal('respond'), token: tokenSchema, status: z.enum(['accepted', 'declined']), notes: z.string().trim().max(1000).default('') }).strict(),
  z.object({ action: z.literal('list') }).strict(),
  guestFields.extend({ action: z.literal('create') }).strict(),
  z.object({ action: z.literal('import'), batch_id: z.uuid(), guests: z.array(guestFields.strict()).min(1).max(MAX_IMPORT_ROWS) }).strict(),
  z.object({ action: z.literal('reset_preview') }).strict(),
  z.object({ action: z.literal('reset'), confirmation: z.literal(RESET_CONFIRMATION), version: tokenSchema }).strict(),
  guestFields.extend({ action: z.literal('edit'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('rotate'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('revoke'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('delete'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('archive'), id: z.uuid(), archived: z.boolean() }).strict(),
  z.object({ action: z.literal('sent'), id: z.uuid() }).strict(),
  seatingTableFields.extend({ action: z.literal('seating_create') }).strict(),
  seatingTableFields.extend({ action: z.literal('seating_edit'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('seating_delete'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('seating_assign'), table_id: z.uuid().nullable(), invitation_ids: z.array(z.uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length) }).strict(),
]);
export type ApiRequest = z.infer<typeof requestSchema>;
export type ResponseStatus = z.infer<typeof responseSchema>;
export interface GuestInvitation {
  full_name: string; expires_at: string; status: ResponseStatus; notes: string; can_respond: boolean;
}
export interface AdminInvitation {
  id: string; full_name: string; phone: string; expires_at: string; created_at: string;
  updated_at: string; sent_at: string | null; archived_at: string | null;
  revoked: boolean; status: ResponseStatus; notes: string; responded_at: string | null;
}
export interface Metrics {
  total: number; sent: number; pending: number; accepted: number; declined: number; response_rate: number;
}
export interface SeatingTable { id: string; name: string; capacity: number; created_at: string; updated_at: string }
export interface SeatingAssignment { invitation_id: string; table_id: string; assigned_at: string }
export interface SeatingPlan { tables: SeatingTable[]; assignments: SeatingAssignment[] }
export interface AdminSnapshot { invitations: AdminInvitation[]; metrics: Metrics; fetched_at: string; seating?: SeatingPlan }
export interface ImportedInvitation extends GuestFields { id: string; token: string }
export interface ImportResult { already_imported: boolean; created_count: number; invitations?: ImportedInvitation[] }
export interface ResetPreview { count: number; version: string }
