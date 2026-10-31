begin;
create function public.delete_invitation(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_id is null then raise exception 'INVALID_INPUT'; end if;
  delete from public.invitations where id = p_id returning id into v_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- Existing foreign keys cascade to the RSVP, events and private token hash.
  return jsonb_build_object('id', v_id, 'deleted_count', 1);
end;
$$;
revoke all on function public.delete_invitation(uuid) from public, anon, authenticated;
grant execute on function public.delete_invitation(uuid) to service_role;
commit;
