-- Operations only: additive run history and distributed ingestion lease.
begin;
create table if not exists public.leadly_runtime_runs (
 id uuid primary key default gen_random_uuid(),
 job text not null check (job = 'ingest'),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','partial','failed','interrupted')),
 summary jsonb not null default '{}'::jsonb check(jsonb_typeof(summary)='object')
);
create index if not exists leadly_runtime_runs_started on public.leadly_runtime_runs(started_at desc);
create table if not exists public.leadly_runtime_leases (
 job text primary key check(job='ingest'),
 run_id uuid not null references public.leadly_runtime_runs(id),
 expires_at timestamptz not null
);
alter table public.leadly_runtime_runs enable row level security;
alter table public.leadly_runtime_leases enable row level security;
revoke all on public.leadly_runtime_runs,public.leadly_runtime_leases from public,anon,authenticated;
grant select,insert,update,delete on public.leadly_runtime_runs,public.leadly_runtime_leases to service_role;

create or replace function public.leadly_begin_runtime_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.leadly_runtime_leases%rowtype;
begin
 if p_run_id is null then return jsonb_build_object('ok',false); end if;
 -- Fixed advisory key serializes only acquisition, never the network work.
 perform pg_catalog.pg_advisory_xact_lock(725492811);
 select * into previous from public.leadly_runtime_leases where job='ingest' for update;
 if found and previous.expires_at > now() then
  return jsonb_build_object('ok',false,'busy',true);
 end if;
 if previous.run_id is not null then
  update public.leadly_runtime_runs set status='interrupted',finished_at=now()
   where id=previous.run_id and status='running';
 end if;
 insert into public.leadly_runtime_runs(id,job) values(p_run_id,'ingest');
 insert into public.leadly_runtime_leases(job,run_id,expires_at) values('ingest',p_run_id,now()+interval '6 minutes')
  on conflict(job) do update set run_id=excluded.run_id,expires_at=excluded.expires_at;
 -- Keep a bounded operator history; never touch any user/workspace tables.
 delete from public.leadly_runtime_runs where started_at < now()-interval '90 days'
  and id<>p_run_id and status<>'running' and not exists(select 1 from public.leadly_runtime_leases l where l.run_id=leadly_runtime_runs.id);
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.leadly_finish_runtime_run(p_run_id uuid,p_status text,p_summary jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_run_id is null or p_status not in ('completed','partial','failed') or p_status is null
  or p_summary is null or jsonb_typeof(p_summary)<>'object' then return false; end if;
 perform 1 from public.leadly_runtime_leases where job='ingest' and run_id=p_run_id for update;
 if not found then return false; end if;
 update public.leadly_runtime_runs set status=p_status,finished_at=now(),summary=p_summary
  where id=p_run_id and status='running';
 if not found then return false; end if;
 delete from public.leadly_runtime_leases where job='ingest' and run_id=p_run_id;
 return true;
end $$;
revoke all on function public.leadly_begin_runtime_run(uuid) from public,anon,authenticated;
revoke all on function public.leadly_finish_runtime_run(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.leadly_begin_runtime_run(uuid) to service_role;
grant execute on function public.leadly_finish_runtime_run(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
