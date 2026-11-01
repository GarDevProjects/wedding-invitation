import { describe, expect, it } from 'vitest';
import { requestSchema } from '../../supabase/functions/_shared/contracts';
import { errorMessage, ApiError } from '../../src/lib/api';

const id = '00000000-0000-4000-8000-000000000001';
describe('administrator seating requests', () => {
  it('validates table names and integral capacities', () => {
    expect(requestSchema.safeParse({ action: 'seating_create', name: 'Mesa 1', capacity: 8 }).success).toBe(true);
    for (const capacity of [0, 101, 2.5, '8', null]) expect(requestSchema.safeParse({ action: 'seating_create', name: 'Mesa 1', capacity }).success).toBe(false);
    for (const name of ['', 'a', 'a'.repeat(61)]) expect(requestSchema.safeParse({ action: 'seating_edit', id, name, capacity: 8 }).success).toBe(false);
  });
  it('supports bounded groups, moves and removal without duplicate identities', () => {
    const valid = { action: 'seating_assign', table_id: id, invitation_ids: [id] };
    expect(requestSchema.safeParse(valid).success).toBe(true);
    expect(requestSchema.safeParse({ ...valid, table_id: null }).success).toBe(true);
    for (const invitation_ids of [[], [id, id], ['wrong-id'], Array(101).fill(id)]) expect(requestSchema.safeParse({ ...valid, invitation_ids }).success).toBe(false);
    expect(requestSchema.safeParse({ ...valid, full_name: 'Forged identity' }).success).toBe(false);
    expect(requestSchema.safeParse({ action: 'seating_delete', id }).success).toBe(true);
  });
  it('gives actionable messages for capacity and changed guest status', () => {
    expect(errorMessage(new ApiError('TABLE_FULL', 409))).toContain('plazas');
    expect(errorMessage(new ApiError('TABLE_NAME_EXISTS', 409))).toContain('nombre');
    expect(errorMessage(new ApiError('TABLE_CAPACITY_TOO_SMALL', 409))).toContain('capacidad');
    expect(errorMessage(new ApiError('INVITATION_UNAVAILABLE', 409))).toContain('no asistirá');
  });
});
