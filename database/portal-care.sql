-- Service-backed care index. Customer clients never write completion records.
create or replace function public.pjd_care_components(p_aircraft uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_agg(jsonb_build_object('service',w.service,'weight',w.weight,
    'completed_on',s.completed_on,'next_due',s.next_due,
    'percent',case when s.id is null then 0 else
      round(100 * greatest(0::numeric,least(1::numeric,
        (s.next_due - (now() at time zone 'Europe/Berlin')::date)::numeric /
        greatest(1,s.next_due-s.completed_on))))::integer end) order by w.ordinal)
  from (values (1,'Cabin Refresh',25),(2,'Leather Care',20),(3,'Carpet & Textile',20),
    (4,'Veneer & Surfaces',15),(5,'Galley & Lavatory',15),(6,'Protection',5)) w(ordinal,service,weight)
  left join lateral (select s.* from public.pjd_services s where s.aircraft_id=p_aircraft
    and (w.service=any(s.services) or 'Deep Clean'=any(s.services))
    order by s.completed_on desc,s.created_at desc,s.id limit 1) s on true;
$$;
revoke all on function public.pjd_care_components(uuid) from public,anon;
grant execute on function public.pjd_care_components(uuid) to authenticated,service_role;
grant select on public.pjd_services to authenticated;
create or replace view public.pjd_aircraft_care with (security_invoker=true) as
select a.*,c.components,
  (select round(sum((v->>'weight')::numeric*(v->>'percent')::numeric)/100)::integer
    from jsonb_array_elements(c.components) v) as condition_percent
from public.pjd_aircraft a cross join lateral (select public.pjd_care_components(a.id) components) c;
revoke all on public.pjd_aircraft_care from anon;
grant select on public.pjd_aircraft_care to authenticated,service_role;

create or replace function pjd_private.portal_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
    or not pjd_private.admitted(auth.uid()) then raise exception 'Bitte erneut anmelden.' using errcode='42501'; end if;
  return jsonb_build_object('admin',exists(select 1 from public.pjd_admins where user_id=auth.uid()));
end $$;
revoke all on function pjd_private.portal_access() from public,anon;
grant execute on function pjd_private.portal_access() to authenticated;
create or replace function public.pjd_portal_access()
returns jsonb language sql stable security invoker set search_path='' as $$ select pjd_private.portal_access(); $$;
revoke all on function public.pjd_portal_access() from public,anon;
grant execute on function public.pjd_portal_access() to authenticated;

create or replace function pjd_private.portal_preferences(p_enabled boolean,p_lead integer,p_name text,p_company text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform pjd_private.portal_access();
  if p_enabled is null or p_lead is null or p_lead not between 0 and 30 or length(p_name)>120 or length(p_company)>160 then
    raise exception 'Bitte gültige Einstellungen eingeben.' using errcode='22023'; end if;
  update public.pjd_profiles set full_name=trim(coalesce(p_name,'')),company=trim(coalesce(p_company,'')),
    reminders_enabled=p_enabled,reminder_lead_days=p_lead,
    reminder_consent_at=case when p_enabled then coalesce(reminder_consent_at,now()) else null end
    where user_id=auth.uid() returning to_jsonb(pjd_profiles) into result;
  insert into public.pjd_audit(actor_id,action,target_id) values(auth.uid(),case when p_enabled then 'reminders_enabled' else 'reminders_disabled' end,auth.uid());
  return result;
end $$;
revoke all on function pjd_private.portal_preferences(boolean,integer,text,text) from public,anon;
grant execute on function pjd_private.portal_preferences(boolean,integer,text,text) to authenticated;
create or replace function public.pjd_portal_preferences(p_enabled boolean,p_lead integer,p_name text,p_company text)
returns jsonb language sql security invoker set search_path='' as $$ select pjd_private.portal_preferences(p_enabled,p_lead,p_name,p_company); $$;
revoke all on function public.pjd_portal_preferences(boolean,integer,text,text) from public,anon;
grant execute on function public.pjd_portal_preferences(boolean,integer,text,text) to authenticated;

create or replace function pjd_private.portal_admin_order(p_id uuid,p_version integer,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pjd_requests; a public.pjd_aircraft; s public.pjd_services; done date; due date; performed text[]; appointment timestamptz;
begin
  if not (pjd_private.portal_access()->>'admin')::boolean then raise exception 'Nur für Administratoren.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('confirmed','completed','cancelled') then raise exception 'Ungültige Aktion.' using errcode='22023'; end if;
  select * into r from public.pjd_requests where id=p_id for update;
  if not found then raise exception 'Auftrag nicht gefunden.' using errcode='P0002'; end if;
  if r.status='completed' and p_action='completed' then return to_jsonb(r); end if;
  if r.status in ('completed','cancelled') then raise exception 'Dieser Auftrag ist bereits abgeschlossen.' using errcode='22023'; end if;
  if p_version is null or r.version<>p_version then raise exception 'Der Auftrag wurde geändert. Bitte aktualisieren.' using errcode='40001'; end if;
  select * into a from public.pjd_aircraft where id=r.aircraft_id for update;
  if a.archived then raise exception 'Das Flugzeug wurde archiviert.' using errcode='22023'; end if;
  if p_action='completed' then
    done=(p_data->>'completed_on')::date; due=(p_data->>'next_due')::date;
    performed=array(select distinct jsonb_array_elements_text(p_data->'services'));
    if done is null or due is null or done>(now() at time zone 'Europe/Berlin')::date
      or done<(r.created_at at time zone 'Europe/Berlin')::date or due-done not between 7 and 365
      or cardinality(performed) not between 1 and 6
      or not performed <@ array['Deep Clean','Cabin Refresh','Leather Care','Carpet & Textile','Veneer & Surfaces','Galley & Lavatory','Protection']::text[]
      or ('Deep Clean'=any(performed) and cardinality(performed)<>1) then
      raise exception 'Leistungen und Pflegedaten prüfen (Intervall: 7–365 Tage).' using errcode='22023'; end if;
    insert into public.pjd_services(request_id,owner_id,aircraft_id,completed_on,next_due,services,note,recorded_by)
      values(r.id,r.owner_id,r.aircraft_id,done,due,performed,left(coalesce(p_data->>'note',''),2000),auth.uid()) returning * into s;
    update public.pjd_aircraft set
      last_cleaned=(select max(completed_on) from public.pjd_services where aircraft_id=a.id),
      next_due=(select min((v->>'next_due')::date) from jsonb_array_elements(public.pjd_care_components(a.id)) v),
      interval_days=due-done where id=a.id;
  elsif p_action='confirmed' then
    appointment=(p_data->>'scheduled_at')::timestamptz;
    if appointment is null or appointment<now() then raise exception 'Bitte einen zukünftigen Termin angeben.' using errcode='22023'; end if;
  end if;
  update public.pjd_requests set status=p_action,scheduled_at=coalesce(appointment,scheduled_at),
    admin_note=left(coalesce(p_data->>'note',''),2000),version=version+1,updated_at=now() where id=r.id returning * into r;
  insert into public.pjd_audit(actor_id,action,target_id) values(auth.uid(),'request_'||p_action,r.id);
  return to_jsonb(r);
end $$;
revoke all on function pjd_private.portal_admin_order(uuid,integer,text,jsonb) from public,anon;
grant execute on function pjd_private.portal_admin_order(uuid,integer,text,jsonb) to authenticated;
create or replace function public.pjd_portal_admin_order(p_id uuid,p_version integer,p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select pjd_private.portal_admin_order(p_id,p_version,p_action,p_data); $$;
revoke all on function public.pjd_portal_admin_order(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.pjd_portal_admin_order(uuid,integer,text,jsonb) to authenticated;

-- Delivery is restricted to the existing server role. No anonymous worker access.
create table if not exists pjd_private.mail_worker_runs (
  id boolean primary key default true check(id),last_run_at timestamptz,last_success_at timestamptz
);
alter table pjd_private.mail_worker_runs enable row level security;
revoke all on pjd_private.mail_worker_runs from public,anon,authenticated;
grant select,insert,update on pjd_private.mail_worker_runs to service_role;
insert into pjd_private.mail_worker_runs(id) values(true) on conflict do nothing;

-- Expose only a confirmed delivery address to the trusted worker, not auth records.
create or replace function pjd_private.confirmed_delivery_email(p_owner uuid)
returns text language sql stable security definer set search_path='' as $$
  select email from auth.users where id=p_owner and email_confirmed_at is not null;
$$;
revoke all on function pjd_private.confirmed_delivery_email(uuid) from public,anon,authenticated;
grant execute on function pjd_private.confirmed_delivery_email(uuid) to service_role;

create or replace function pjd_private.reminder_valid(p_owner uuid,p_payload jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.pjd_aircraft a join public.pjd_profiles p on p.user_id=a.owner_id
    where a.id=(p_payload->>'aircraft_id')::uuid and a.owner_id=p_owner and not a.archived
      and a.next_due=(p_payload->>'next_due')::date and p.reminders_enabled and p.reminder_consent_at is not null
      and pjd_private.confirmed_delivery_email(p.user_id) is not null and pjd_private.admitted(p.user_id)
      and a.next_due between (now() at time zone 'Europe/Berlin')::date-30 and (now() at time zone 'Europe/Berlin')::date+p.reminder_lead_days
      and not exists(select 1 from public.pjd_requests r where r.aircraft_id=a.id and r.status in ('requested','confirmed')));
$$;
revoke all on function pjd_private.reminder_valid(uuid,jsonb) from public,anon,authenticated;

create or replace function public.pjd_portal_mail_worker(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.pjd_outbox; result jsonb; mail text;
begin
  if p_action='health' then return jsonb_build_object('configured',true); end if;
  if p_action='claim' then
    update pjd_private.mail_worker_runs set last_run_at=now() where id;
    -- A new care date creates one reminder cycle. No reminder while service is already requested.
    insert into public.pjd_outbox(dedupe_key,owner_id,kind,payload)
      select 'reminder/'||a.id||'/'||a.next_due,a.owner_id,'cleaning_reminder',
        jsonb_build_object('aircraft_id',a.id,'registration',a.registration,'next_due',a.next_due,'airport',a.airport)
      from public.pjd_aircraft a where pjd_private.reminder_valid(a.owner_id,jsonb_build_object('aircraft_id',a.id,'next_due',a.next_due))
      on conflict(dedupe_key) do nothing;
    update public.pjd_outbox set state='failed',last_error='Delivery uncertain or retry budget exhausted; review required',lease_until=null
      where kind='cleaning_reminder' and state in ('pending','sending')
        and (attempts>=5 or first_attempt<now()-interval '23 hours') and (lease_until is null or lease_until<now());
    update public.pjd_outbox set state='skipped',last_error='Reminder no longer applicable'
      where kind='cleaning_reminder' and state='pending' and not pjd_private.reminder_valid(owner_id,payload);
    with ready as (select id from public.pjd_outbox where kind='cleaning_reminder'
      and (state='pending' or (state='sending' and lease_until<now())) and next_attempt<=now() and attempts<5
      order by created_at for update skip locked limit 20), claimed as (
      update public.pjd_outbox o set state='sending',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',first_attempt=coalesce(first_attempt,now())
      from ready where o.id=ready.id returning o.id,o.lease_token)
    select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
    return result;
  elsif p_action='prepare' then
    select * into item from public.pjd_outbox where id=(p_data->>'id')::uuid and lease_token=(p_data->>'lease_token')::uuid
      and kind='cleaning_reminder' and state='sending' and lease_until>now() for update;
    if not found then return null; end if;
    if not pjd_private.reminder_valid(item.owner_id,item.payload) then
      update public.pjd_outbox set state='skipped',lease_until=null where id=item.id; return null;
    end if;
    mail=pjd_private.confirmed_delivery_email(item.owner_id);
    return jsonb_build_object('id',item.id,'email',mail,'payload',item.payload);
  elsif p_action='finish' then
    if p_data->>'state' is null or p_data->>'state' not in ('sent','pending','failed') then raise exception 'Invalid state'; end if;
    update public.pjd_outbox set state=p_data->>'state',provider_id=left(p_data->>'provider_id',200),last_error=left(p_data->>'error',200),
      sent_at=case when p_data->>'state'='sent' then now() else sent_at end,lease_until=null,next_attempt=now()+interval '5 minutes'
      where id=(p_data->>'id')::uuid and lease_token=(p_data->>'lease_token')::uuid and state='sending' and kind='cleaning_reminder';
    return jsonb_build_object('ok',found);
  elsif p_action='done' then
    update pjd_private.mail_worker_runs set last_success_at=now() where id;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Invalid operation' using errcode='22023';
end $$;
revoke all on function public.pjd_portal_mail_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.pjd_portal_mail_worker(text,jsonb) to service_role;
grant execute on function pjd_private.reminder_valid(uuid,jsonb) to service_role;

create or replace function pjd_private.portal_mail_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not (pjd_private.portal_access()->>'admin')::boolean then raise exception 'Forbidden' using errcode='42501'; end if;
  return jsonb_build_object('last_run',(select last_run_at from pjd_private.mail_worker_runs where id),
    'last_success',(select last_success_at from pjd_private.mail_worker_runs where id),
    'sent',(select count(*) from public.pjd_outbox where kind='cleaning_reminder' and state='sent'),
    'failed',(select count(*) from public.pjd_outbox where kind='cleaning_reminder' and state='failed'),
    'pending',(select count(*) from public.pjd_outbox where kind='cleaning_reminder' and state in ('pending','sending')));
end $$;
revoke all on function pjd_private.portal_mail_status() from public,anon;
grant execute on function pjd_private.portal_mail_status() to authenticated;
create or replace function public.pjd_portal_mail_status()
returns jsonb language sql stable security invoker set search_path='' as $$ select pjd_private.portal_mail_status(); $$;
revoke all on function public.pjd_portal_mail_status() from public,anon;
grant execute on function public.pjd_portal_mail_status() to authenticated;
create index if not exists pjd_services_aircraft_completed_idx on public.pjd_services(aircraft_id,completed_on desc,created_at desc);
notify pgrst,'reload schema';
