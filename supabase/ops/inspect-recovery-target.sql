-- Read-only compatibility inventory for a separate Supabase recovery project.
-- No account contents, passwords, sessions, tokens or function bodies are read.
-- This does not restore anything and is not an installation migration.
select jsonb_build_object(
  'readOnly', true,
  'observedAt', now(),
  'serverVersion', current_setting('server_version'),
  'database', current_database(),
  'authUsers', (select count(*) from auth.users),
  'storageObjects', (select count(*) from storage.objects),
  'publicObjects', (
    select coalesce(jsonb_agg(jsonb_build_object('name', c.relname, 'kind', c.relkind) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ),
  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) order by extname), '[]'::jsonb)
    from pg_extension
  ),
  'managedColumns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'table', c.relname, 'column', a.attname,
      'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull,
      'hasDefault', a.atthasdef, 'identity', a.attidentity, 'generated', a.attgenerated
    ) order by n.nspname, c.relname, a.attnum), '[]'::jsonb)
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('auth', 'storage') and c.relkind in ('r', 'p')
      and a.attnum > 0 and not a.attisdropped
  )
) as recovery_target_inventory;
