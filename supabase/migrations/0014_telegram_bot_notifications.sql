-- The bot changes only job notifications; concurrent reminder choices stay intact.
begin;
alter table public.telegram_notification_settings
 add column if not exists bot_update_id bigint,
 add column if not exists bot_update_at timestamptz;
create or replace function public.leadly_set_telegram_job_notifications(p_user_id uuid,p_frequency text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype;
begin
 if p_user_id is null or p_frequency is null or p_frequency not in ('updates','daily','off')
  or not exists(select 1 from public.telegram_accounts where user_id=p_user_id) then
  return jsonb_build_object('ok',false);
 end if;
 insert into public.telegram_notification_settings(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if not found then return jsonb_build_object('ok',false);end if;
 return public.leadly_set_telegram_notifications(p_user_id,p_frequency<>'off',s.tasks_enabled,
  case when p_frequency='off' then s.opportunity_frequency else p_frequency end);
exception when foreign_key_violation then
 return jsonb_build_object('ok',false);
end $$;
revoke all on function public.leadly_set_telegram_job_notifications(uuid,text) from public,anon,authenticated;
grant execute on function public.leadly_set_telegram_job_notifications(uuid,text) to service_role;
-- Telegram retries a failed webhook for up to 24 hours. Serialize choices and
-- reject older updates even if a newer web/bot choice has since disabled jobs.
create or replace function public.leadly_set_telegram_job_notifications(p_user_id uuid,p_frequency text,p_update_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.telegram_notification_settings%rowtype; result jsonb;
begin
 if p_user_id is null or p_frequency is null or p_frequency not in ('updates','daily','off')
  or p_update_id is null or p_update_id<0 or p_update_id>9007199254740991
  or not exists(select 1 from public.telegram_accounts where user_id=p_user_id) then
  return jsonb_build_object('ok',false);
 end if;
 insert into public.telegram_notification_settings(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select * into s from public.telegram_notification_settings where user_id=p_user_id for update;
 if not found then return jsonb_build_object('ok',false); end if;
 -- After a week without any incoming updates Telegram may randomize update_id.
 -- Six days exceeds its retry retention and allows that fresh sequence.
 if s.bot_update_at>now()-interval '6 days' and s.bot_update_id>=p_update_id then
  return jsonb_build_object('ok',true,'applied',false);
 end if;
 result:=public.leadly_set_telegram_job_notifications(p_user_id,p_frequency);
 if result->>'ok'='true' then
  update public.telegram_notification_settings set bot_update_id=p_update_id,bot_update_at=now() where user_id=p_user_id;
 end if;
 return result;
exception when foreign_key_violation then
 return jsonb_build_object('ok',false);
end $$;
revoke all on function public.leadly_set_telegram_job_notifications(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.leadly_set_telegram_job_notifications(uuid,text,bigint) to service_role;
notify pgrst,'reload schema';
commit;
