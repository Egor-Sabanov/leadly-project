-- Keep in-flight/uncertain/rate-limited updates safe across ten-minute boundaries.
begin;
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
 if p_kind='updates' then
  -- A previous interval can still be in flight. Serialize across slot boundaries.
  if exists(select 1 from public.telegram_notification_deliveries where user_id=p_user_id and kind='updates' and status in ('prepared','sending') and lease_until>now()) then
   return jsonb_build_object('status','prepared');
  end if;
  update public.telegram_notification_deliveries set status='uncertain',finished_at=now(),lease_until=null,error_code='interrupted'
   where user_id=p_user_id and kind='updates' and status='sending' and lease_until<=now();
  -- Ambiguous sends must not reappear as a new notification in the next interval.
  update public.telegram_notification_settings set cursor_at=greatest(cursor_at,coalesce((select max(cutoff_at) from public.telegram_notification_deliveries where user_id=p_user_id and kind='updates' and status='uncertain'),cursor_at)) where user_id=p_user_id returning * into s;
  if exists(select 1 from public.telegram_notification_deliveries where user_id=p_user_id and kind='updates' and status='failed' and retry_after>now()) then
   return jsonb_build_object('status','retry_wait');
  end if;
 end if;
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


revoke all on function public.leadly_claim_telegram_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.leadly_claim_telegram_delivery(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
