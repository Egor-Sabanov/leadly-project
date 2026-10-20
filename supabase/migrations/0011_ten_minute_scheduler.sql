-- One-time operator installation. Secrets never appear in the job command.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.leadly_scheduler_authorized(p_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare expected text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false;end if;
 select decrypted_secret into expected from vault.decrypted_secrets where name='leadly_feed_scheduler' limit 1;
 return expected is not null and expected=p_token;
end $$;
create or replace function public.leadly_request_ingestion()
returns bigint language plpgsql security definer set search_path='' as $$
declare token text;request_id bigint;
begin
 select decrypted_secret into token from vault.decrypted_secrets where name='leadly_feed_scheduler' limit 1;
 if token is null then raise exception 'Scheduler credential missing';end if;
 select net.http_get(url:='https://leadly-topaz-seven.vercel.app/api/cron/ingest',
  headers:=jsonb_build_object('x-leadly-scheduler-key',token),timeout_milliseconds:=280000) into request_id;
 return request_id;
end $$;
create or replace function public.leadly_enable_ten_minute_sync()
returns jsonb language plpgsql security definer set search_path='' as $$
declare job_id bigint;
begin
 if not exists(select 1 from vault.decrypted_secrets where name='leadly_feed_scheduler') then
  perform vault.create_secret(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'leadly_feed_scheduler','LEADLY scheduled ingestion credential');
 end if;
 select cron.schedule('leadly-feed-10-minutes','*/10 * * * *','select public.leadly_request_ingestion()') into job_id;
 return jsonb_build_object('enabled',true,'schedule','*/10 * * * *');
end $$;
create or replace function public.leadly_scheduler_status()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('enabled',coalesce(bool_or(active),false),'schedule',max(schedule)) from cron.job where jobname='leadly-feed-10-minutes';
$$;
revoke all on function public.leadly_scheduler_authorized(text) from public,anon,authenticated;
revoke all on function public.leadly_request_ingestion() from public,anon,authenticated;
revoke all on function public.leadly_enable_ten_minute_sync() from public,anon,authenticated;
revoke all on function public.leadly_scheduler_status() from public,anon,authenticated;
grant execute on function public.leadly_scheduler_authorized(text) to service_role;
grant execute on function public.leadly_request_ingestion() to service_role;
grant execute on function public.leadly_enable_ten_minute_sync() to service_role;
grant execute on function public.leadly_scheduler_status() to service_role;
notify pgrst,'reload schema';
commit;
-- Deliberately does not start the job before the matching application is deployed.
