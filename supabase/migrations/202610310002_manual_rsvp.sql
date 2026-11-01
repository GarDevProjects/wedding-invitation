begin;
alter table public.rsvp_events
  add column source text not null default 'guest' check (source in ('guest','admin')),
  add column actor_user_id uuid references auth.users(id) on delete set null,
  add constraint rsvp_events_guest_actor_check check (source='admin' or actor_user_id is null);

create function public.admin_set_rsvp(p_id uuid, p_status text, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_invitation public.invitations; v_previous public.rsvps;
begin
  if p_actor is null or not exists(select 1 from public.admin_profiles where user_id=p_actor and role='admin') then raise exception 'FORBIDDEN'; end if;
  if p_id is null or p_status is null or p_status not in ('accepted','declined') then raise exception 'INVALID_INPUT'; end if;
  select * into v_invitation from public.invitations where id=p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_invitation.archived_at is not null then raise exception 'INVITATION_ARCHIVED'; end if;
  select * into strict v_previous from public.rsvps where invitation_id=p_id;
  if v_previous.status is distinct from p_status then
    -- Administrators may record an in-person answer after the public deadline.
    -- Preserve the guest's notes, invitation token, sent marker and seating.
    update public.rsvps set status=p_status, responded_at=coalesce(responded_at,clock_timestamp()), updated_at=clock_timestamp()
      where invitation_id=p_id;
    insert into public.rsvp_events(invitation_id,event_type,source,actor_user_id) values(p_id,p_status,'admin',p_actor);
  end if;
  return jsonb_build_object('id',p_id,'status',p_status);
end;
$$;
revoke all on function public.admin_set_rsvp(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_set_rsvp(uuid,text,uuid) to service_role;
commit;
