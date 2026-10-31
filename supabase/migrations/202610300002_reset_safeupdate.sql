begin;

-- Hosted Supabase loads safeupdate for PostgREST sessions, which rejects DELETE
-- statements without WHERE even inside a privileged RPC. Limit both deletes to
-- the IDs captured under the reset lock after checking the confirmed version.
create or replace function public.reset_invitations(p_confirmation text, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb;
  v_invitation_ids uuid[];
  v_batch_ids uuid[];
  v_deleted integer;
begin
  if p_confirmation is distinct from 'BORRAR TODO' or p_version is null then raise exception 'INVALID_INPUT'; end if;
  lock table public.invitations, public.rsvps in exclusive mode;
  v_state := public.admin_reset_preview();
  if p_version is distinct from v_state->>'version' then raise exception 'RESET_CHANGED'; end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_invitation_ids from public.invitations;
  select coalesce(array_agg(batch_id), '{}'::uuid[]) into v_batch_ids from private.invitation_imports;
  delete from public.invitations where id = any(v_invitation_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> (v_state->>'count')::integer then raise exception 'RESET_CHANGED'; end if;
  delete from private.invitation_imports where batch_id = any(v_batch_ids);
  return jsonb_build_object('deleted_count', v_deleted);
end;
$$;

revoke all on function public.reset_invitations(text,text) from public, anon, authenticated;
grant execute on function public.reset_invitations(text,text) to service_role;
commit;
