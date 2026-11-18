-- Transactional integration checks: no accounts, orders, or messages survive rollback.
begin;
do $$
declare owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid();
  plane uuid; other_plane uuid; decay_plane uuid; request_one uuid; request_two uuid; decay_request uuid;
  denied boolean; score integer; jobs jsonb; job jsonb; prepared jsonb; count_before integer;
  day date:=(now() at time zone 'Europe/Berlin')::date;
begin
  select count(*) into count_before from public.pjd_outbox;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_a,'qa-care-a-'||owner_a||'@example.invalid',now(),'{}'),
    (owner_b,'qa-care-b-'||owner_b||'@example.invalid',now(),'{}'),
    (administrator,'qa-care-admin-'||administrator||'@example.invalid',now(),'{}');
  insert into public.pjd_admins values(administrator);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.pjd_aircraft(owner_id,model_id,registration,airport,notes,interval_days)
    values(owner_a,'Cessna 177 Cardinal','QA-CARE-A','EDDB','',30) returning id into plane;
  select condition_percent into score from public.pjd_aircraft_care where id=plane;
  if score<>0 then raise exception 'New aircraft must start at zero'; end if;
  insert into public.pjd_requests(owner_id,aircraft_id,idempotency_key,airport,requested_date,services,notes)
    values(owner_a,plane,gen_random_uuid(),'EDDB',day,array['Cabin Refresh'],'') returning id into request_one;
  denied=false;
  begin perform public.pjd_portal_admin_order(request_one,1,'completed',jsonb_build_object('completed_on',day,'next_due',day+7,'services',array['Deep Clean']));
  exception when insufficient_privilege then denied=true; end;
  if not denied then raise exception 'Customer was able to complete an order'; end if;
  denied=false;
  begin update public.pjd_aircraft set last_cleaned=day where id=plane;
  exception when insufficient_privilege then denied=true; end;
  if not denied then raise exception 'Customer was able to write condition inputs'; end if;
  denied=false;
  begin insert into public.pjd_admins values(owner_a);
  exception when insufficient_privilege then denied=true; end;
  if not denied then raise exception 'Customer was able to grant admin'; end if;
  perform public.pjd_portal_preferences(true,7,'QA owner','QA company');
  reset role;
  insert into public.pjd_aircraft(owner_id,model_id,registration,airport,notes) values(owner_b,'Piper PA-28','QA-CARE-B','EDDB','') returning id into other_plane;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.pjd_aircraft_care where id=other_plane) then raise exception 'Cross-owner care disclosure'; end if;
  reset role;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.pjd_portal_admin_order(request_one,1,'completed',jsonb_build_object('completed_on',day,'next_due',day+7,'services',array['Cabin Refresh']));
  select condition_percent into score from public.pjd_aircraft_care where id=plane;
  if score<>25 then raise exception 'Cabin service weight expected 25, got %',score; end if;
  perform public.pjd_portal_admin_order(request_one,1,'completed',jsonb_build_object('completed_on',day,'next_due',day+7,'services',array['Cabin Refresh']));
  if (select count(*) from public.pjd_services where request_id=request_one)<>1 then raise exception 'Duplicate completion'; end if;
  reset role;
  insert into public.pjd_requests(owner_id,aircraft_id,idempotency_key,airport,requested_date,services,notes)
    values(owner_a,plane,gen_random_uuid(),'EDDB',day,array['Deep Clean'],'') returning id into request_two;
  set local role authenticated;
  denied=false;
  begin perform public.pjd_portal_admin_order(request_two,99,'completed',jsonb_build_object('completed_on',day,'next_due',day+7,'services',array['Deep Clean']));
  exception when serialization_failure then denied=true; end;
  if not denied then raise exception 'Stale order version accepted'; end if;
  perform public.pjd_portal_admin_order(request_two,1,'completed',jsonb_build_object('completed_on',day,'next_due',day+7,'services',array['Deep Clean']));
  select condition_percent into score from public.pjd_aircraft_care where id=plane;
  if score<>100 then raise exception 'Deep Clean expected 100, got %',score; end if;
  reset role;
  insert into public.pjd_aircraft(owner_id,model_id,registration,airport,notes) values(owner_a,'Cessna 172','QA-CARE-DECAY','EDDB','') returning id into decay_plane;
  insert into public.pjd_requests(owner_id,aircraft_id,idempotency_key,airport,requested_date,services,notes,created_at)
    values(owner_a,decay_plane,gen_random_uuid(),'EDDB',day-15,array['Deep Clean'],'',now()-interval '16 days') returning id into decay_request;
  set local role authenticated;
  perform public.pjd_portal_admin_order(decay_request,1,'completed',jsonb_build_object('completed_on',day-15,'next_due',day+15,'services',array['Deep Clean']));
  select condition_percent into score from public.pjd_aircraft_care where id=decay_plane;
  if score<>50 then raise exception 'Midpoint decay expected 50, got %',score; end if;
  reset role;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  select condition_percent into score from public.pjd_aircraft_care where id=plane;
  if score<>100 then raise exception 'Customer did not see admin completion'; end if;
  denied=false;
  begin perform public.pjd_portal_mail_worker('claim'); exception when insufficient_privilege then denied=true; end;
  if not denied then raise exception 'Customer accessed mail worker'; end if;
  reset role;
  set local role anon;
  denied=false;
  begin perform public.pjd_portal_mail_worker('claim'); exception when insufficient_privilege then denied=true; end;
  if not denied then raise exception 'Anonymous role accessed mail worker'; end if;
  reset role;
  set local role service_role;
  jobs=public.pjd_portal_mail_worker('claim');
  if jsonb_array_length(jobs)<>1 then raise exception 'Expected one eligible reminder, got %',jobs; end if;
  job=jobs->0;
  prepared=public.pjd_portal_mail_worker('prepare',job);
  if prepared->'payload'->>'aircraft_id'<>plane::text then raise exception 'Wrong reminder aircraft'; end if;
  if public.pjd_portal_mail_worker('claim')<>'[]'::jsonb then raise exception 'Duplicate reminder claimed'; end if;
  reset role;
  set local role authenticated;
  perform public.pjd_portal_preferences(false,7,'QA owner','QA company');
  reset role;
  set local role service_role;
  if public.pjd_portal_mail_worker('prepare',job) is not null then raise exception 'Unsubscribed customer received reminder'; end if;
  reset role;
end $$;
rollback;
select 'PASS: zero start, 25% partial, 100% deep clean, 50% decay, idempotency, stale writes, tenant isolation, admin-only completion, worker access, reminder dedupe and opt-out' as result;
