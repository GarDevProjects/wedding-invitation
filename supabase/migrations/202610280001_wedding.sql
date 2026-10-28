begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null default '' check (char_length(phone) <= 30 and phone ~ '^[+0-9\s().-]*$'),
  expires_at timestamptz not null,
  sent_at timestamptz,
  archived_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.invitation_credentials (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$')
);
create table public.rsvps (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  notes text not null default '' check (char_length(notes) <= 1000),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);
create index rsvps_status_idx on public.rsvps(status);
create index invitations_active_idx on public.invitations(created_at) where archived_at is null;
create table public.rsvp_events (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  event_type text not null check (event_type in ('accepted', 'declined', 'updated')),
  created_at timestamptz not null default now()
);
create index rsvp_events_invitation_idx on public.rsvp_events(invitation_id, created_at desc);
create table private.rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hits integer not null
);

create function public.is_admin() returns boolean language sql stable security definer
set search_path = '' as $$
  select exists(select 1 from public.admin_profiles where user_id = (select auth.uid()) and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.admin_profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.rsvps enable row level security;
alter table public.rsvp_events enable row level security;
alter table private.invitation_credentials enable row level security;
alter table private.rate_limits enable row level security;
revoke all on public.admin_profiles, public.invitations, public.rsvps, public.rsvp_events from anon, authenticated;
grant select on public.admin_profiles, public.invitations, public.rsvps, public.rsvp_events to authenticated;
grant all on public.admin_profiles, public.invitations, public.rsvps, public.rsvp_events to service_role;
create policy own_admin_profile on public.admin_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy admin_invitations on public.invitations for select to authenticated using ((select public.is_admin()));
create policy admin_rsvps on public.rsvps for select to authenticated using ((select public.is_admin()));
create policy admin_events on public.rsvp_events for select to authenticated using ((select public.is_admin()));

create function private.initial_rsvp() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rsvps(invitation_id) values (new.id);
  return new;
end;
$$;
create trigger initial_rsvp after insert on public.invitations for each row execute function private.initial_rsvp();

create function public.create_invitation(p_full_name text, p_phone text, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_token text;
begin
  if p_expires_at <= now() then raise exception 'INVALID_DEADLINE'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations(full_name, phone, expires_at) values (btrim(p_full_name), btrim(p_phone), p_expires_at) returning id into v_id;
  insert into private.invitation_credentials values (v_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

create function public.rotate_invitation(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  perform 1 from public.invitations where id = p_id and archived_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update private.invitation_credentials set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') where invitation_id = p_id;
  update public.invitations set revoked = false, sent_at = null, updated_at = clock_timestamp() where id = p_id;
  return jsonb_build_object('id', p_id, 'token', v_token);
end;
$$;

create function public.resolve_invitation(p_hash text) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('full_name', i.full_name, 'expires_at', i.expires_at,
    'status', r.status, 'notes', r.notes, 'can_respond', i.expires_at > now())
  from public.invitations i join private.invitation_credentials c on c.invitation_id = i.id
  join public.rsvps r on r.invitation_id = i.id
  where c.token_hash = p_hash and not i.revoked and i.archived_at is null;
$$;

create function public.submit_rsvp(p_hash text, p_status text, p_notes text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_invitation public.invitations; v_previous public.rsvps;
begin
  if p_status not in ('accepted', 'declined') or p_status is null or p_notes is null or char_length(p_notes) > 1000 then raise exception 'INVALID_INPUT'; end if;
  select i.* into v_invitation from public.invitations i
    join private.invitation_credentials c on c.invitation_id = i.id where c.token_hash = p_hash for update of i;
  if not found then raise exception 'INVALID_LINK'; end if;
  -- Recheck after the lock: a concurrent rotation/revocation must invalidate the old token.
  if v_invitation.revoked or v_invitation.archived_at is not null or not exists (
    select 1 from private.invitation_credentials where invitation_id = v_invitation.id and token_hash = p_hash
  ) then raise exception 'INVALID_LINK'; end if;
  if v_invitation.expires_at <= clock_timestamp() then raise exception 'DEADLINE_PASSED'; end if;
  select * into strict v_previous from public.rsvps where invitation_id = v_invitation.id;
  if v_previous.status is distinct from p_status or v_previous.notes is distinct from btrim(p_notes) then
    update public.rsvps set status = p_status, notes = btrim(p_notes),
      responded_at = coalesce(responded_at, clock_timestamp()), updated_at = clock_timestamp()
      where invitation_id = v_invitation.id;
    insert into public.rsvp_events(invitation_id, event_type) values (
      v_invitation.id, case when v_previous.status = p_status then 'updated' else p_status end
    );
  end if;
  return public.resolve_invitation(p_hash);
end;
$$;

create function public.consume_rate_limit(p_bucket text, p_limit integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into private.rate_limits as limits (bucket, window_start, hits) values (p_bucket, clock_timestamp(), 1)
  on conflict (bucket) do update set
    hits = case when limits.window_start < clock_timestamp() - make_interval(secs => p_seconds) then 1 else limits.hits + 1 end,
    window_start = case when limits.window_start < clock_timestamp() - make_interval(secs => p_seconds) then clock_timestamp() else limits.window_start end
  returning hits into v_hits;
  -- Bound retention without storing IP addresses or invitation tokens.
  delete from private.rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_limit;
end;
$$;

create function public.admin_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
  with guests as (
    select i.*, r.status, r.notes, r.responded_at, greatest(i.updated_at, r.updated_at) as last_updated
    from public.invitations i join public.rsvps r on r.invitation_id = i.id
  ), metrics as (
    select count(*) as total, count(*) filter (where sent_at is not null) as sent,
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'accepted') as accepted,
      count(*) filter (where status = 'declined') as declined,
      coalesce(round(100.0 * count(*) filter (where status <> 'pending') / nullif(count(*), 0), 1), 0) as response_rate
    from guests where archived_at is null
  ) select jsonb_build_object(
    'invitations', coalesce((select jsonb_agg((to_jsonb(g) - 'last_updated') || jsonb_build_object('updated_at', g.last_updated) order by g.created_at desc) from guests g), '[]'::jsonb),
    'metrics', (select to_jsonb(m) from metrics m), 'fetched_at', now()
  );
$$;

-- Only the Edge Function service client can call privileged RPCs. No browser mutation grants.
revoke all on function public.create_invitation(text,text,timestamptz), public.rotate_invitation(uuid),
  public.resolve_invitation(text), public.submit_rsvp(text,text,text),
  public.consume_rate_limit(text,integer,integer), public.admin_snapshot() from public, anon, authenticated;
grant execute on function public.create_invitation(text,text,timestamptz), public.rotate_invitation(uuid),
  public.resolve_invitation(text), public.submit_rsvp(text,text,text),
  public.consume_rate_limit(text,integer,integer), public.admin_snapshot() to service_role;
revoke all on all functions in schema private from public, anon, authenticated;

-- No token hashes/credentials are ever included in the Realtime publication.
alter publication supabase_realtime add table public.invitations, public.rsvps;

commit;
