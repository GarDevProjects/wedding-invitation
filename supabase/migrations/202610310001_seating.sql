begin;

create table public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  capacity integer not null check (capacity between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index seating_tables_name_idx on public.seating_tables(lower(btrim(name)));
create table public.seating_assignments (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  table_id uuid not null references public.seating_tables(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
create index seating_assignments_table_idx on public.seating_assignments(table_id);
alter table public.seating_tables enable row level security;
alter table public.seating_assignments enable row level security;
revoke all on public.seating_tables, public.seating_assignments from public, anon, authenticated;
grant select on public.seating_tables, public.seating_assignments to authenticated;
grant all on public.seating_tables, public.seating_assignments to service_role;
create policy admin_seating_tables on public.seating_tables for select to authenticated using ((select public.is_admin()));
create policy admin_seating_assignments on public.seating_assignments for select to authenticated using ((select public.is_admin()));

create function public.create_seating_table(p_name text, p_capacity integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 60 or p_capacity is null or p_capacity not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  insert into public.seating_tables(name,capacity) values (btrim(p_name),p_capacity) returning id into v_id;
  return jsonb_build_object('id',v_id);
exception when unique_violation then raise exception 'TABLE_NAME_EXISTS';
end;
$$;

create function public.edit_seating_table(p_id uuid, p_name text, p_capacity integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 60 or p_capacity is null or p_capacity not between 1 and 100 then raise exception 'INVALID_INPUT'; end if;
  -- All seating changes lock invitations first. This serializes capacity checks
  -- and moves, and has the same lock order as archiving, deletion and reset.
  lock table public.invitations, public.seating_tables, public.seating_assignments in share row exclusive mode;
  if not exists(select 1 from public.seating_tables where id=p_id) then raise exception 'NOT_FOUND'; end if;
  if p_capacity < (select count(*) from public.seating_assignments where table_id=p_id) then raise exception 'TABLE_CAPACITY_TOO_SMALL'; end if;
  update public.seating_tables set name=btrim(p_name),capacity=p_capacity,updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('id',p_id);
exception when unique_violation then raise exception 'TABLE_NAME_EXISTS';
end;
$$;

create function public.delete_seating_table(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  lock table public.invitations, public.seating_tables, public.seating_assignments in share row exclusive mode;
  delete from public.seating_tables where id=p_id returning id into v_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('id',v_id);
end;
$$;

create function public.assign_seating_guests(p_table_id uuid, p_invitation_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_capacity integer; v_existing integer;
begin
  if p_invitation_ids is null or cardinality(p_invitation_ids) not between 1 and 100
    or array_position(p_invitation_ids,null) is not null
    or (select count(distinct id) from unnest(p_invitation_ids) id) <> cardinality(p_invitation_ids) then raise exception 'INVALID_INPUT'; end if;
  lock table public.invitations, public.seating_tables, public.seating_assignments in share row exclusive mode;
  if (select count(*) from public.invitations where id=any(p_invitation_ids)) <> cardinality(p_invitation_ids) then raise exception 'NOT_FOUND'; end if;
  if p_table_id is null then
    delete from public.seating_assignments where invitation_id=any(p_invitation_ids);
    return jsonb_build_object('ok',true);
  end if;
  select capacity into v_capacity from public.seating_tables where id=p_table_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if exists(select 1 from public.invitations i join public.rsvps r on r.invitation_id=i.id
    where i.id=any(p_invitation_ids) and (i.archived_at is not null or r.status='declined')) then raise exception 'INVITATION_UNAVAILABLE'; end if;
  select count(*) into v_existing from public.seating_assignments where table_id=p_table_id and not(invitation_id=any(p_invitation_ids));
  if v_existing+cardinality(p_invitation_ids)>v_capacity then raise exception 'TABLE_FULL'; end if;
  insert into public.seating_assignments as current_seat(invitation_id,table_id)
    select id,p_table_id from unnest(p_invitation_ids) id
    on conflict(invitation_id) do update set table_id=excluded.table_id,
      assigned_at=case when current_seat.table_id=excluded.table_id then current_seat.assigned_at else clock_timestamp() end;
  return jsonb_build_object('ok',true);
end;
$$;

create function private.clear_archived_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is not null then delete from public.seating_assignments where invitation_id=new.id; end if;
  return new;
end;
$$;
create trigger clear_archived_seat after update of archived_at on public.invitations for each row execute function private.clear_archived_seat();
revoke all on function private.clear_archived_seat() from public, anon, authenticated;

create function private.seating_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'tables',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from public.seating_tables t),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.invitation_id) from public.seating_assignments a),'[]'::jsonb)
  );
$$;
revoke all on function private.seating_snapshot() from public, anon, authenticated;

create or replace function public.admin_snapshot() returns jsonb language sql stable security definer set search_path = '' as $$
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
    'metrics', (select to_jsonb(m) from metrics m), 'fetched_at', now(), 'seating',private.seating_snapshot()
  );
$$;

-- Reset deletes assignments through invitation cascades but keeps the table plan.
-- A new seating assignment invalidates an already prepared reset confirmation.
create or replace function public.admin_reset_preview() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count',(select count(*) from public.invitations),'version',encode(extensions.digest(jsonb_build_object(
    'invitations',coalesce((select jsonb_agg(jsonb_build_array(to_jsonb(i),to_jsonb(r)) order by i.id) from public.invitations i join public.rsvps r on r.invitation_id=i.id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.invitation_id) from public.seating_assignments a),'[]'::jsonb)
  )::text,'sha256'),'hex'));
$$;

revoke all on function public.create_seating_table(text,integer), public.edit_seating_table(uuid,text,integer), public.delete_seating_table(uuid), public.assign_seating_guests(uuid,uuid[]), public.admin_snapshot(), public.admin_reset_preview() from public, anon, authenticated;
grant execute on function public.create_seating_table(text,integer), public.edit_seating_table(uuid,text,integer), public.delete_seating_table(uuid), public.assign_seating_guests(uuid,uuid[]), public.admin_snapshot(), public.admin_reset_preview() to service_role;
alter publication supabase_realtime add table public.seating_tables,public.seating_assignments;
commit;
