-- Explicit opt-in only. Legacy telegram_notifications_enabled is not consent.
begin;
create table if not exists public.telegram_notification_settings (
 user_id uuid primary key references public.telegram_accounts(user_id) on delete cascade,
 opportunities_enabled boolean not null default false,
 tasks_enabled boolean not null default false,
 revision uuid not null default gen_random_uuid(),
 cursor_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_checked_at timestamptz,
 disabled_reason text check(disabled_reason is null or disabled_reason='blocked'),
 notice_version text not null default 'telegram-notifications-2026-10-20.1'
);
create table if not exists public.telegram_notification_deliveries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.telegram_accounts(user_id) on delete cascade,
 telegram_user_id bigint not null check(telegram_user_id between 1 and 9007199254740991),
 kind text not null check(kind in ('daily','test')),
 slot_date date not null,
 preference_revision uuid not null,
 opportunities_enabled boolean not null,
 tasks_enabled boolean not null,
 from_at timestamptz not null,
 cutoff_at timestamptz not null,
 status text not null default 'prepared' check(status in ('prepared','sending','sent','empty','failed','uncertain','cancelled')),
 lease_id uuid not null default gen_random_uuid(),
 lease_until timestamptz,
 attempts smallint not null default 1 check(attempts between 1 and 3),
 retry_after timestamptz,
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 telegram_message_id bigint check(telegram_message_id between 1 and 9007199254740991),
 error_code text check(error_code is null or error_code in ('rate_limit','rejected','network_unknown','blocked','content_unavailable','interrupted')),
 check(status not in ('prepared','sending') or lease_until is not null),
 unique(user_id,kind,slot_date)
);
create index if not exists telegram_notification_due on public.telegram_notification_settings(last_checked_at nulls first) where opportunities_enabled or tasks_enabled;
create index if not exists telegram_notification_outcomes on public.telegram_notification_deliveries(created_at desc,status);
alter table public.telegram_notification_settings enable row level security;
alter table public.telegram_notification_deliveries enable row level security;
revoke all on public.telegram_notification_settings,public.telegram_notification_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.telegram_notification_settings,public.telegram_notification_deliveries to service_role;

create or replace function public.leadly_set_telegram_notifications(p_user_id uuid,p_opportunities boolean,p_tasks boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype;
begin
 if p_user_id is null or p_opportunities is null or p_tasks is null
  or not exists(select 1 from public.telegram_accounts where user_id=p_user_id) then return jsonb_build_object('ok',false); end if;
 if (p_opportunities or p_tasks) and not exists(select 1 from auth.users where id=p_user_id and deleted_at is null and email_confirmed_at is not null and not coalesce(is_anonymous,false) and (banned_until is null or banned_until<=now())) then return jsonb_build_object('ok',false); end if;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if found and s.opportunities_enabled=p_opportunities and s.tasks_enabled=p_tasks and s.disabled_reason is null then return jsonb_build_object('ok',true); end if;
 insert into public.telegram_notification_settings(user_id,opportunities_enabled,tasks_enabled)
  values(p_user_id,p_opportunities,p_tasks)
 on conflict(user_id) do update set opportunities_enabled=excluded.opportunities_enabled,tasks_enabled=excluded.tasks_enabled,
  revision=gen_random_uuid(),cursor_at=case when not telegram_notification_settings.opportunities_enabled and excluded.opportunities_enabled then now() else telegram_notification_settings.cursor_at end,updated_at=now(),disabled_reason=null;
 update public.telegram_notification_deliveries set status='cancelled',finished_at=now(),lease_until=null
  where user_id=p_user_id and status='prepared';
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.leadly_claim_telegram_delivery(p_user_id uuid,p_kind text default 'daily')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype; d public.telegram_notification_deliveries%rowtype;
 actor bigint; slot date; tz text;
begin
 if p_user_id is null or p_kind is null or p_kind not in ('daily','test') then return jsonb_build_object('status','invalid'); end if;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if not found or not(s.opportunities_enabled or s.tasks_enabled) then return jsonb_build_object('status','disabled'); end if;
 select a.telegram_user_id into actor from public.telegram_accounts a join auth.users u on u.id=a.user_id
  where a.user_id=p_user_id and a.chat_id=a.telegram_user_id and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now());
 if actor is null then return jsonb_build_object('status','unavailable'); end if;
 select coalesce((select t.name from pg_catalog.pg_timezone_names t join public.profiles p on p.timezone=t.name where p.id=p_user_id limit 1),'Europe/Moscow') into tz;
 slot:=(now() at time zone tz)::date;
 update public.telegram_notification_settings set last_checked_at=now() where user_id=p_user_id;
 insert into public.telegram_notification_deliveries(user_id,telegram_user_id,kind,slot_date,preference_revision,opportunities_enabled,tasks_enabled,from_at,cutoff_at,lease_until)
  values(p_user_id,actor,p_kind,slot,s.revision,s.opportunities_enabled,s.tasks_enabled,s.cursor_at,now(),now()+interval '60 seconds')
  on conflict(user_id,kind,slot_date) do nothing returning * into d;
 if not found then
  select * into d from public.telegram_notification_deliveries where user_id=p_user_id and kind=p_kind and slot_date=slot for update;
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
    preference_revision=s.revision,opportunities_enabled=s.opportunities_enabled,tasks_enabled=s.tasks_enabled,from_at=s.cursor_at,cutoff_at=now(),telegram_user_id=actor,retry_after=null,finished_at=null,error_code=null where id=d.id returning * into d;
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
 elsif p_result in ('sent','empty') and d.kind='daily' and s.revision=d.preference_revision then
  update public.telegram_notification_settings set cursor_at=greatest(cursor_at,d.cutoff_at) where user_id=owner_id;
 end if;
 return true;
end $$;

revoke all on function public.leadly_set_telegram_notifications(uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.leadly_claim_telegram_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.leadly_begin_telegram_send(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leadly_finish_telegram_delivery(uuid,uuid,text,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.leadly_set_telegram_notifications(uuid,boolean,boolean) to service_role;
grant execute on function public.leadly_claim_telegram_delivery(uuid,text) to service_role;
grant execute on function public.leadly_begin_telegram_send(uuid,uuid) to service_role;
grant execute on function public.leadly_finish_telegram_delivery(uuid,uuid,text,text,bigint,integer) to service_role;
notify pgrst,'reload schema';
commit;
