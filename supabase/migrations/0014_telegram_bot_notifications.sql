-- The bot changes only job notifications; concurrent reminder choices stay intact.
begin;
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
notify pgrst,'reload schema';
commit;
