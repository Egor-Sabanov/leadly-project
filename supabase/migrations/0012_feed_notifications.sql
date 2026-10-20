-- Preserve daily consent, add explicit update frequency and ten-minute slots.
begin;
alter table public.telegram_notification_settings add column if not exists opportunity_frequency text not null default 'daily' check(opportunity_frequency in ('daily','updates'));
alter table public.telegram_notification_deliveries add column if not exists slot_key text;
update public.telegram_notification_deliveries set slot_key=slot_date::text where slot_key is null;
alter table public.telegram_notification_deliveries alter column slot_key set not null;
alter table public.telegram_notification_deliveries drop constraint if exists telegram_notification_deliveries_user_id_kind_slot_date_key;
create unique index if not exists telegram_delivery_unique_slot on public.telegram_notification_deliveries(user_id,kind,slot_key);
alter table public.telegram_notification_deliveries drop constraint if exists telegram_notification_deliveries_kind_check;
alter table public.telegram_notification_deliveries add constraint telegram_notification_deliveries_kind_check check(kind in ('daily','test','updates'));
drop function if exists public.leadly_set_telegram_notifications(uuid,boolean,boolean);
create or replace function public.leadly_set_telegram_notifications(p_user_id uuid,p_opportunities boolean,p_tasks boolean,p_frequency text default 'daily')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype;
begin
 if p_frequency is null or p_frequency not in ('daily','updates') or p_user_id is null or p_opportunities is null or p_tasks is null
  or not exists(select 1 from public.telegram_accounts where user_id=p_user_id) then return jsonb_build_object('ok',false); end if;
 if (p_opportunities or p_tasks) and not exists(select 1 from auth.users where id=p_user_id and deleted_at is null and email_confirmed_at is not null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now())) then return jsonb_build_object('ok',false); end if;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if found and not(p_opportunities or p_tasks) then p_frequency:=s.opportunity_frequency;end if;
 if found and s.opportunities_enabled=p_opportunities and s.tasks_enabled=p_tasks and s.disabled_reason is null and s.opportunity_frequency=p_frequency then return jsonb_build_object('ok',true); end if;
 insert into public.telegram_notification_settings(user_id,opportunities_enabled,tasks_enabled,opportunity_frequency)
  values(p_user_id,p_opportunities,p_tasks,p_frequency)
 on conflict(user_id) do update set opportunities_enabled=excluded.opportunities_enabled,tasks_enabled=excluded.tasks_enabled,
  revision=gen_random_uuid(),opportunity_frequency=excluded.opportunity_frequency,cursor_at=case when not telegram_notification_settings.opportunities_enabled and excluded.opportunities_enabled then now() else telegram_notification_settings.cursor_at end,updated_at=now(),disabled_reason=null;
 update public.telegram_notification_deliveries set status='cancelled',finished_at=now(),lease_until=null
  where user_id=p_user_id and status='prepared';
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.leadly_claim_telegram_delivery(p_user_id uuid,p_kind text default 'daily')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype; d public.telegram_notification_deliveries%rowtype;
 actor bigint; slot date; tz text; slot_key_value text; jobs boolean; reminders boolean;
begin
 if p_user_id is null or p_kind is null or p_kind not in ('daily','test','updates') then return jsonb_build_object('status','invalid'); end if;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if not found or not(s.opportunities_enabled or s.tasks_enabled) then return jsonb_build_object('status','disabled'); end if;
 select a.telegram_user_id into actor from public.telegram_accounts a join auth.users u on u.id=a.user_id
  where a.user_id=p_user_id and a.chat_id=a.telegram_user_id and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now());
 if actor is null then return jsonb_build_object('status','unavailable'); end if;
 select coalesce((select t.name from pg_catalog.pg_timezone_names t join public.profiles p on p.timezone=t.name where p.id=p_user_id limit 1),'Europe/Moscow') into tz;
 slot:=(now() at time zone tz)::date;
 jobs:=s.opportunities_enabled and ((p_kind='updates' and s.opportunity_frequency='updates') or (p_kind='daily' and s.opportunity_frequency='daily') or p_kind='test');
 reminders:=s.tasks_enabled and p_kind in ('daily','test');
 if p_kind<>'test' and not(jobs or reminders) then return jsonb_build_object('status','disabled');end if;
 if p_kind='daily' and extract(hour from now() at time zone tz)<9 then return jsonb_build_object('status','deferred');end if;
 slot_key_value:=case when p_kind='updates' then to_char(date_trunc('hour',now() at time zone 'UTC')+floor(extract(minute from now() at time zone 'UTC')/10)*interval '10 minutes','YYYY-MM-DD"T"HH24:MI') else slot::text end;
 update public.telegram_notification_settings set last_checked_at=now() where user_id=p_user_id;
 insert into public.telegram_notification_deliveries(user_id,telegram_user_id,kind,slot_date,slot_key,preference_revision,opportunities_enabled,tasks_enabled,from_at,cutoff_at,lease_until)
  values(p_user_id,actor,p_kind,slot,slot_key_value,s.revision,jobs,reminders,s.cursor_at,now(),now()+interval '60 seconds')
  on conflict(user_id,kind,slot_key) do nothing returning * into d;
 if not found then
  select * into d from public.telegram_notification_deliveries where user_id=p_user_id and kind=p_kind and slot_key=slot_key_value for update;
  if d.status='sending' and d.lease_until<=now() then
   update public.telegram_notification_deliveries set status='uncertain',finished_at=now(),lease_until=null,error_code='interrupted' where id=d.id;
   return jsonb_build_object('status','uncertain');
  end if;
  if d.status='prepared' and d.lease_until<=now() and d.attempts>=3 then
   update public.telegram_notification_deliveries set status='failed',lease_until=null,finished_at=now(),error_code='content_unavailable',retry_after=null where id=d.id;
   return jsonb_build_object('status','failed');
  end if;
  if d.attempts<3 and ((d.status='prepared' and d.lease_until<=now()) or (d.status='failed' and d.retry_after<=now())) then
   update public.telegram_notification_deliveries set status='prepared',lease_id=gen_random_uuid(),lease_until=now()+interval '60 seconds',attempts=attempts+1,
    preference_revision=s.revision,opportunities_enabled=jobs,tasks_enabled=reminders,from_at=s.cursor_at,cutoff_at=now(),telegram_user_id=actor,retry_after=null,finished_at=null,error_code=null where id=d.id returning * into d;
  else return jsonb_build_object('status',d.status); end if;
 end if;
 delete from public.telegram_notification_deliveries where user_id=p_user_id and created_at<now()-interval '30 days' and status not in ('prepared','sending');
 return jsonb_build_object('status','claimed','id',d.id,'lease',d.lease_id,'userId',d.user_id,'telegramId',d.telegram_user_id,'fromAt',d.from_at,'cutoffAt',d.cutoff_at,'slotDate',d.slot_date,'opportunities',d.opportunities_enabled,'tasks',d.tasks_enabled,'kind',d.kind);
end $$;

create or replace function public.leadly_begin_telegram_send(p_id uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid; s public.telegram_notification_settings%rowtype; d public.telegram_notification_deliveries%rowtype;
begin
 select user_id into owner_id from public.telegram_notification_deliveries where id=p_id;
 if owner_id is null then return false; end if;
 select * into s from public.telegram_notification_settings where user_id=owner_id for update;
 select * into d from public.telegram_notification_deliveries where id=p_id and lease_id=p_lease for update;
 if not found or d.status<>'prepared' or d.lease_until<=now() then return false; end if;
 if s.user_id is null or not(s.opportunities_enabled or s.tasks_enabled) or s.revision<>d.preference_revision
  or not exists(select 1 from public.telegram_accounts a join auth.users u on u.id=a.user_id where a.user_id=d.user_id and a.telegram_user_id=d.telegram_user_id and a.chat_id=d.telegram_user_id and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then
  update public.telegram_notification_deliveries set status='cancelled',finished_at=now(),lease_until=null where id=d.id;return false;
 end if;
 update public.telegram_notification_deliveries set status='sending' where id=d.id;
 return true;
end $$;

create or replace function public.leadly_finish_telegram_delivery(p_id uuid,p_lease uuid,p_result text,p_error text default null,p_message_id bigint default null,p_retry_seconds integer default 60)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid; s public.telegram_notification_settings%rowtype; d public.telegram_notification_deliveries%rowtype;
begin
 if p_result is null or p_result not in ('sent','empty','failed','uncertain','cancelled','blocked') or p_retry_seconds is null or p_retry_seconds not between 1 and 86400
  or (p_error is not null and p_error not in ('rate_limit','rejected','network_unknown','blocked','content_unavailable','interrupted'))
  or (p_result='sent' and (p_message_id is null or p_message_id not between 1 and 9007199254740991)) then return false;end if;
 select user_id into owner_id from public.telegram_notification_deliveries where id=p_id;
 if owner_id is null then return false;end if;
 select * into s from public.telegram_notification_settings where user_id=owner_id for update;
 select * into d from public.telegram_notification_deliveries where id=p_id and lease_id=p_lease for update;
 if not found or not((d.status='prepared' and p_result in ('empty','failed','cancelled')) or (d.status='sending' and p_result in ('sent','failed','uncertain','cancelled','blocked'))) then return false;end if;
 update public.telegram_notification_deliveries set status=case when p_result='blocked' then 'cancelled' else p_result end,
  lease_until=null,finished_at=now(),error_code=p_error,telegram_message_id=case when p_result='sent' then p_message_id else null end,
  retry_after=case when p_result='failed' then now()+p_retry_seconds*interval '1 second' else null end where id=d.id;
 if p_result='blocked' then
  update public.telegram_notification_settings set opportunities_enabled=false,tasks_enabled=false,revision=gen_random_uuid(),disabled_reason='blocked',updated_at=now() where user_id=owner_id;
 elsif p_result in ('sent','empty') and d.kind in ('daily','updates') and d.opportunities_enabled and s.revision=d.preference_revision then
  update public.telegram_notification_settings set cursor_at=greatest(cursor_at,d.cutoff_at) where user_id=owner_id;
 end if;
 return true;
end $$;


revoke all on function public.leadly_set_telegram_notifications(uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.leadly_set_telegram_notifications(uuid,boolean,boolean,text) to service_role;
revoke all on function public.leadly_claim_telegram_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.leadly_begin_telegram_send(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leadly_finish_telegram_delivery(uuid,uuid,text,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.leadly_claim_telegram_delivery(uuid,text) to service_role;
grant execute on function public.leadly_begin_telegram_send(uuid,uuid) to service_role;
grant execute on function public.leadly_finish_telegram_delivery(uuid,uuid,text,text,bigint,integer) to service_role;
notify pgrst,'reload schema';
commit;
