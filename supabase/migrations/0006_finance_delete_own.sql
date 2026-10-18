-- The finance UI deletes entries only after confirmation. Live schema audit found
-- SELECT/INSERT policies but no DELETE policy. Preserve existing policies.
begin;
alter table public.transactions enable row level security;
grant delete on table public.transactions to authenticated;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='transactions'
      and policyname='transactions_delete_own'
  ) then
    create policy transactions_delete_own on public.transactions
      for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
commit;
