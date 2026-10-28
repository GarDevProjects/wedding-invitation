begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

select ok(not has_table_privilege('anon', 'public.invitations', 'select'), 'Guests cannot enumerate invitations');
select ok(not has_table_privilege('anon', 'public.rsvps', 'select'), 'Guests cannot read responses');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'Credential schema is inaccessible to browser roles');
select ok(not has_function_privilege('anon', 'public.resolve_invitation(text)', 'execute'), 'Guests cannot bypass the rate-limited API');
select ok(not has_function_privilege('authenticated', 'public.admin_snapshot()', 'execute'), 'Snapshot is service-only');
select ok(not has_function_privilege('authenticated', 'public.create_invitation(text,text,timestamptz)', 'execute'), 'Signed-in users cannot create invitations directly');
select ok(not has_table_privilege('authenticated', 'public.admin_profiles', 'insert'), 'Users cannot promote themselves');
select ok(not has_table_privilege('authenticated', 'public.invitations', 'update'), 'Browser admin mutations must use authorized API');

create temp table test_links as select public.create_invitation('María López', '+50688888888', now() + interval '10 days') as result;
alter table test_links add column old_hash text;
update test_links set old_hash = encode(extensions.digest(result->>'token', 'sha256'), 'hex');
select is(length((select result->>'token' from test_links)), 64, 'Token contains 256 random bits encoded as hex');
select is((select count(*)::integer from public.rsvps where invitation_id = (select (result->>'id')::uuid from test_links)), 1, 'Creation makes exactly one pending response');
select is(public.resolve_invitation((select old_hash from test_links))->>'full_name', 'María López', 'Token resolves only the named guest');
select ok(public.resolve_invitation(repeat('0',64)) is null, 'Unknown token returns nothing');
select is(public.submit_rsvp((select old_hash from test_links), 'accepted', 'Gracias')->>'status', 'accepted', 'Guest accepts');
select is((public.admin_snapshot()->'metrics'->>'accepted')::integer, 1, 'One acceptance equals one seat');
select lives_ok($$select public.submit_rsvp((select old_hash from test_links), 'accepted', 'Gracias')$$, 'Identical retry is idempotent');
select is((select count(*)::integer from public.rsvp_events), 1, 'Identical retry creates no duplicate audit event');
select is(public.submit_rsvp((select old_hash from test_links), 'declined', 'Cambio de planes')->>'status', 'declined', 'Response can change before deadline');
select is((select count(*)::integer from public.rsvps), 1, 'Updates keep a single current RSVP');
select throws_ok($$select public.submit_rsvp((select old_hash from test_links), 'pending', '')$$, 'P0001', 'INVALID_INPUT', 'Guests cannot reset to pending');

update public.invitations set expires_at = now() - interval '1 second';
select throws_ok($$select public.submit_rsvp((select old_hash from test_links), 'accepted', '')$$, 'P0001', 'DEADLINE_PASSED', 'Server enforces the deadline');
update public.invitations set expires_at = now() + interval '10 days';
update test_links set result = public.rotate_invitation((result->>'id')::uuid);
select ok(public.resolve_invitation((select old_hash from test_links)) is null, 'Rotation invalidates the old token');
update test_links set old_hash = encode(extensions.digest(result->>'token', 'sha256'), 'hex');
update public.invitations set revoked = true;
select ok(public.resolve_invitation((select old_hash from test_links)) is null, 'Revoked invitation reveals no personal data');
update public.invitations set revoked = false, archived_at = now();
select ok(public.resolve_invitation((select old_hash from test_links)) is null, 'Archived invitation is inaccessible');
select is((public.admin_snapshot()->'metrics'->>'total')::integer, 0, 'Archived invitations do not affect totals');

select ok(public.consume_rate_limit('test', 1, 600), 'First request within rate limit');
select ok(not public.consume_rate_limit('test', 1, 600), 'Second request blocked atomically');

insert into auth.users(id, email) values ('00000000-0000-4000-8000-000000000001', 'admin@example.test'), ('00000000-0000-4000-8000-000000000002', 'other@example.test');
insert into public.admin_profiles(user_id) values ('00000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*)::integer from public.invitations), 0, 'Non-admin authenticated user sees no invitations');
select is((select count(*)::integer from public.rsvps), 0, 'Non-admin sees no RSVPs');
select is((select count(*)::integer from public.rsvp_events), 0, 'Non-admin sees no audit trail');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is((select count(*)::integer from public.invitations), 1, 'Authorized admin can read invitations for Realtime');
select is((select count(*)::integer from public.rsvps), 1, 'Authorized admin can read current responses');
reset role;
delete from public.admin_profiles;
set local role authenticated;
select is((select count(*)::integer from public.invitations), 0, 'Removing admin membership immediately revokes database access');
reset role;

select * from finish();
rollback;
