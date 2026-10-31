begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok(not has_function_privilege('anon', 'public.import_invitations(uuid,jsonb)', 'execute'), 'Guests cannot import');
select ok(not has_function_privilege('authenticated', 'public.import_invitations(uuid,jsonb)', 'execute'), 'Browser roles cannot import directly');
select ok(not has_function_privilege('authenticated', 'public.reset_invitations(text,text)', 'execute'), 'Browser roles cannot reset directly');
select ok(not has_function_privilege('anon', 'public.reset_invitations(text,text)', 'execute'), 'Guests cannot reset');
select ok(not has_function_privilege('authenticated', 'public.admin_reset_preview()', 'execute'), 'Reset preview is service-only');
select ok(has_function_privilege('service_role', 'public.reset_invitations(text,text)', 'execute'), 'Service role can execute reset');
select matches(lower(pg_get_functiondef('public.reset_invitations(text,text)'::regprocedure)), 'delete\s+from\s+public\.invitations\s+where\s+', 'Reset invitation delete has a WHERE clause required by hosted safeupdate');
select matches(lower(pg_get_functiondef('public.reset_invitations(text,text)'::regprocedure)), 'delete\s+from\s+private\.invitation_imports\s+where\s+', 'Reset receipt delete also has a WHERE clause');
select ok(not has_table_privilege('authenticated', 'private.invitation_imports', 'select'), 'Import receipts stay private');

create temp table batch as select '00000000-0000-4000-8000-000000000010'::uuid as id,
  jsonb_build_array(jsonb_build_object('full_name','María López','phone','+50688888888','expires_at',now()+interval '10 days'),
    jsonb_build_object('full_name','Carlos Pérez','phone','','expires_at',now()+interval '10 days')) as guests;
create temp table imported as select public.import_invitations(id, guests) as result from batch;
select is((select result->>'created_count' from imported), '2', 'Bulk import creates two invitations');
select is((select count(*)::integer from public.rsvps), 2, 'Every imported person has one pending response');
select is((select count(distinct token_hash)::integer from private.invitation_credentials), 2, 'Each invitation has a distinct token hash');
select is(length((select result->'invitations'->0->>'token' from imported)), 64, 'Raw token is returned once');
select is(public.resolve_invitation(encode(extensions.digest((select result->'invitations'->0->>'token' from imported), 'sha256'),'hex'))->>'full_name','María López','Imported token resolves');
select is((select public.import_invitations(id,guests)->>'already_imported' from batch), 'true', 'Lost-response retry is idempotent');
select is((select count(*)::integer from public.invitations), 2, 'Retry does not create more invitations');
select ok(not (select public.import_invitations(id,guests) ? 'invitations' from batch), 'Receipt does not persist or replay raw tokens');
select throws_ok($$select public.import_invitations(gen_random_uuid(),'{}'::jsonb)$$, 'P0001', 'INVALID_INPUT', 'Non-array payload rejected');
select throws_ok($$select public.import_invitations(id, jsonb_build_array(guests->0)) from batch$$,'P0001','BATCH_CONFLICT','Batch id cannot be reused for different guests');
select throws_ok($$select public.import_invitations(gen_random_uuid(), guests) from batch$$,'P0001','DUPLICATE_GUEST','Same name/contact cannot be imported again');
select throws_ok($$select public.import_invitations(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('full_name','First Valid','phone','','expires_at',now()+interval '10 days'),
  jsonb_build_object('full_name','Expired Guest','phone','','expires_at',now()-interval '1 day')))$$,'P0001','INVALID_DEADLINE','Late invalid row rolls back the whole import');
select is((select count(*)::integer from public.invitations), 2, 'No partial invitations survive');
select throws_ok($$select public.import_invitations(gen_random_uuid(), '[]'::jsonb)$$,'P0001','INVALID_INPUT','Empty batch rejected');
select throws_ok($$select public.import_invitations(gen_random_uuid(), (select jsonb_agg('{}'::jsonb) from generate_series(1,201)))$$,'P0001','INVALID_INPUT','Oversized batch rejected');

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','admin@example.test');
insert into public.admin_profiles(user_id) values ('00000000-0000-4000-8000-000000000001');
select public.consume_rate_limit('keep-after-reset',10,600);
create temp table reset_state as select public.admin_reset_preview() as state;
select is((select state->>'count' from reset_state),'2','Preview counts all invitations');
select public.submit_rsvp(encode(extensions.digest((select result->'invitations'->0->>'token' from imported),'sha256'),'hex'),'accepted','Test');
select throws_ok($$select public.reset_invitations('BORRAR TODO',(select state->>'version' from reset_state))$$,'P0001','RESET_CHANGED','A new RSVP invalidates reset confirmation');
update public.invitations set archived_at = now(), updated_at = clock_timestamp();
update reset_state set state = public.admin_reset_preview();
update public.invitations set full_name = full_name || ' edited';
select throws_ok($$select public.reset_invitations('BORRAR TODO',(select state->>'version' from reset_state))$$,'P0001','RESET_CHANGED','Even changes without timestamp updates invalidate reset confirmation');
update reset_state set state = public.admin_reset_preview();
select throws_ok($$select public.reset_invitations('yes',(select state->>'version' from reset_state))$$,'P0001','INVALID_INPUT','Exact confirmation is mandatory');
select is(public.reset_invitations('BORRAR TODO',(select state->>'version' from reset_state))->>'deleted_count','2','Reset includes archived invitations');
select is((select count(*)::integer from public.invitations),0,'All invitations removed');
select is((select count(*)::integer from public.rsvps),0,'All responses removed');
select is((select count(*)::integer from public.rsvp_events),0,'All RSVP history removed');
select is((select count(*)::integer from private.invitation_credentials),0,'All tokens invalidated');
select is((select count(*)::integer from private.invitation_imports),0,'Import receipts cleared for testing from zero');
select is((select count(*)::integer from public.admin_profiles),1,'Admin membership retained');
select is((select count(*)::integer from auth.users),1,'Auth account retained');
select is((select count(*)::integer from private.rate_limits),1,'Rate limits retained');
select is((select public.import_invitations(id,guests)->>'created_count' from batch),'2','Same CSV can be imported after reset');
select is(public.import_invitations(gen_random_uuid(), (select jsonb_agg(jsonb_build_object('full_name','Invitado prueba ' || n,'phone','','expires_at',now()+interval '10 days')) from generate_series(1,100) as n))->>'created_count','100','Import a full 100-person test file');
select is(public.reset_invitations('BORRAR TODO',public.admin_reset_preview()->>'version')->>'deleted_count','102','Reset deletes the complete confirmed 102-person test collection');
select is((select count(*)::integer from private.invitation_credentials),0,'Large reset invalidates all tokens');
select is((select count(*)::integer from private.invitation_imports),0,'Large reset clears all import receipts');
select * from finish();
rollback;
