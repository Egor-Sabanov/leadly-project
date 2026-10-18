-- LEADLY: run in Supabase SQL Editor as the project owner.
-- Read-only schema inspection. No user rows, passwords or tokens are selected.
begin read only;

select jsonb_pretty(jsonb_build_object(
  'checked_at', now(),
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname, 'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  ),
  'profile_fields', (
    select jsonb_agg(jsonb_build_object(
      'column', column_name, 'type', data_type,
      'nullable', is_nullable, 'default', column_default
    ) order by ordinal_position)
    from information_schema.columns
    where table_schema='public' and table_name='profiles'
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname, 'roles', roles,
      'command', cmd, 'permissive', permissive,
      'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname='public'
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'settings', p.proconfig,
      'definition', pg_get_functiondef(p.oid),
      'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_role_execute', has_function_privilege('service_role',p.oid,'EXECUTE')
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and (p.proname like 'leadly_%' or p.proname='is_authenticated')
  ),
  'profile_and_auth_triggers', (
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname,
      'trigger', t.tgname, 'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid),
      'function_schema', pn.nspname,
      'function_definition', pg_get_functiondef(p.oid)
    ) order by n.nspname, c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where not t.tgisinternal and (
      (n.nspname='auth' and c.relname='users') or
      (n.nspname='public' and c.relname='profiles')
    )
  ),
  'catalog_counts', jsonb_build_object(
    'skills', (select count(*) from public.skills),
    'services', (select count(*) from public.services)
  )
)) as leadly_schema_audit;

commit;
