begin;

-- Receipts prevent duplicate imports after a lost response. Never persist raw invitation tokens.
create table private.invitation_imports (
  batch_id uuid primary key,
  fingerprint text not null,
  created_count integer not null,
  created_at timestamptz not null default now()
);
alter table private.invitation_imports enable row level security;
revoke all on private.invitation_imports from public, anon, authenticated;

create function public.import_invitations(p_batch_id uuid, p_guests jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_receipt private.invitation_imports;
  v_fingerprint text;
  v_guest jsonb;
  v_created jsonb;
  v_result jsonb := '[]'::jsonb;
  v_name text; v_phone text; v_expiry timestamptz;
begin
  if p_batch_id is null or p_guests is null or jsonb_typeof(p_guests) <> 'array' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_array_length(p_guests) not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
  -- Serializes imports and ordinary inserts for an atomic duplicate check.
  lock table public.invitations in share row exclusive mode;
  v_fingerprint := encode(extensions.digest(p_guests::text, 'sha256'), 'hex');
  select * into v_receipt from private.invitation_imports where batch_id = p_batch_id;
  if found then
    if v_receipt.fingerprint <> v_fingerprint then raise exception 'BATCH_CONFLICT'; end if;
    return jsonb_build_object('already_imported', true, 'created_count', v_receipt.created_count);
  end if;
  for v_guest in select value from jsonb_array_elements(p_guests) loop
    if jsonb_typeof(v_guest) <> 'object' or jsonb_typeof(v_guest->'full_name') is distinct from 'string'
      or jsonb_typeof(v_guest->'phone') is distinct from 'string'
      or jsonb_typeof(v_guest->'expires_at') is distinct from 'string' then raise exception 'INVALID_INPUT'; end if;
    v_name := btrim(v_guest->>'full_name'); v_phone := btrim(v_guest->>'phone');
    if char_length(v_name) not between 2 and 120 or char_length(v_phone) > 30 or v_phone !~ '^[+0-9\s().-]*$' then raise exception 'INVALID_INPUT'; end if;
    begin
      v_expiry := (v_guest->>'expires_at')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_DEADLINE'; end;
    if v_expiry is null or not isfinite(v_expiry) or v_expiry <= now() then raise exception 'INVALID_DEADLINE'; end if;
    if exists (select 1 from public.invitations where
      lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
      and regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g')) then
      raise exception 'DUPLICATE_GUEST';
    end if;
    v_created := public.create_invitation(v_name, v_phone, v_expiry);
    v_result := v_result || jsonb_build_array(v_created || jsonb_build_object('full_name', v_name, 'phone', v_phone, 'expires_at', v_expiry));
  end loop;
  insert into private.invitation_imports(batch_id, fingerprint, created_count) values (p_batch_id, v_fingerprint, jsonb_array_length(p_guests));
  return jsonb_build_object('already_imported', false, 'created_count', jsonb_array_length(p_guests), 'invitations', v_result);
end;
$$;

create function public.admin_reset_preview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count', count(*), 'version', encode(extensions.digest(
    coalesce(jsonb_agg(jsonb_build_array(to_jsonb(i), to_jsonb(r)) order by i.id)::text, '[]'), 'sha256'), 'hex'))
  from public.invitations i join public.rsvps r on r.invitation_id = i.id;
$$;

create function public.reset_invitations(p_confirmation text, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_state jsonb;
begin
  if p_confirmation is distinct from 'BORRAR TODO' or p_version is null then raise exception 'INVALID_INPUT'; end if;
  -- No invitation/RSVP can change between the version check and deletion.
  lock table public.invitations, public.rsvps in exclusive mode;
  v_state := public.admin_reset_preview();
  if p_version is distinct from v_state->>'version' then raise exception 'RESET_CHANGED'; end if;
  delete from public.invitations; -- cascades to RSVP, events and private credentials, including archived invites
  delete from private.invitation_imports;
  return jsonb_build_object('deleted_count', (v_state->>'count')::integer);
end;
$$;

revoke all on function public.import_invitations(uuid,jsonb), public.admin_reset_preview(), public.reset_invitations(text,text) from public, anon, authenticated;
grant execute on function public.import_invitations(uuid,jsonb), public.admin_reset_preview(), public.reset_invitations(text,text) to service_role;
commit;
