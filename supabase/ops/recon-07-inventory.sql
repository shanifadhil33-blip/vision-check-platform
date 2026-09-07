-- Read-only inventory of the live database.
-- Paste into the Supabase SQL editor. Safe against production: SELECT only.
-- Purpose: reconnaissance before any schema is specified.
-- Project ref: porfkwjyhgmnoleyqoip
-- One statement, one json cell. Empty aggregates return [] not null.

select jsonb_pretty(jsonb_build_object(
  -- 1. connection: session builtins
  'connection', jsonb_build_object(
    'current_database', current_database(),
    'current_user', current_user,
    'version', version()
  ),

  -- 2. schemas: pg_namespace (exclude ^pg_ and information_schema)
  'schemas', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'nspname', n.nspname,
        'owner', pg_get_userbyid(n.nspowner),
        'nspacl', n.nspacl
      )
      order by n.nspname
    )
    from pg_namespace n
    where n.nspname !~ '^pg_'
      and n.nspname <> 'information_schema'
  ), '[]'::jsonb),

  -- 3. tables: pg_class joined pg_namespace, relkind in ('r','p')
  'tables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'relrowsecurity', c.relrowsecurity,
        'relforcerowsecurity', c.relforcerowsecurity,
        'relacl', c.relacl
      )
      order by n.nspname, c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname !~ '^pg_'
      and n.nspname <> 'information_schema'
  ), '[]'::jsonb),

  -- 4. policies: pg_policies (pg_catalog view over pg_policy)
  'policies', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', p.schemaname,
        'table', p.tablename,
        'policy', p.policyname,
        'permissive', p.permissive,
        'roles', to_jsonb(p.roles),
        'cmd', p.cmd
      )
      order by p.schemaname, p.tablename, p.policyname
    )
    from pg_policies p
  ), '[]'::jsonb),

  -- 5. default_privileges: pg_default_acl left joined pg_namespace
  'default_privileges', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'granting_role', pg_get_userbyid(d.defaclrole),
        'schema', n.nspname,
        'defaclobjtype', d.defaclobjtype,
        'defaclacl', d.defaclacl
      )
      order by pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype
    )
    from pg_default_acl d
    left join pg_namespace n on n.oid = d.defaclnamespace
  ), '[]'::jsonb),

  -- 6. roles: pg_roles (exclude ^pg_)
  'roles', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'rolname', r.rolname,
        'rolcanlogin', r.rolcanlogin,
        'rolsuper', r.rolsuper,
        'rolbypassrls', r.rolbypassrls
      )
      order by r.rolname
    )
    from pg_roles r
    where r.rolname !~ '^pg_'
  ), '[]'::jsonb),

  -- 7. schema_privs_on_public: has_schema_privilege, guarded for named roles
  'schema_privs_on_public', jsonb_build_object(
    'anon_usage',
      case
        when exists (select 1 from pg_roles where rolname = 'anon')
        then has_schema_privilege('anon', 'public', 'USAGE')
        else null
      end,
    'anon_create',
      case
        when exists (select 1 from pg_roles where rolname = 'anon')
        then has_schema_privilege('anon', 'public', 'CREATE')
        else null
      end,
    'authenticated_usage',
      case
        when exists (select 1 from pg_roles where rolname = 'authenticated')
        then has_schema_privilege('authenticated', 'public', 'USAGE')
        else null
      end,
    'public_usage', has_schema_privilege('public', 'public', 'USAGE'),
    'public_create', has_schema_privilege('public', 'public', 'CREATE')
  ),

  -- 8. extensions: pg_extension
  'extensions', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'extname', e.extname,
        'extversion', e.extversion
      )
      order by e.extname
    )
    from pg_extension e
  ), '[]'::jsonb),

  -- 9. publications: pg_publication
  'publications', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'pubname', p.pubname,
        'puballtables', p.puballtables,
        'pubinsert', p.pubinsert,
        'pubupdate', p.pubupdate,
        'pubdelete', p.pubdelete
      )
      order by p.pubname
    )
    from pg_publication p
  ), '[]'::jsonb),

  -- 10. publication_tables: pg_publication_tables
  'publication_tables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'pubname', t.pubname,
        'schemaname', t.schemaname,
        'tablename', t.tablename
      )
      order by t.pubname, t.schemaname, t.tablename
    )
    from pg_publication_tables t
  ), '[]'::jsonb),

  -- 11. realtime_schema_tables: pg_class in schema realtime, relkind ('r','p')
  'realtime_schema_tables', coalesce((
    select jsonb_agg(c.relname order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'realtime'
      and c.relkind in ('r', 'p')
  ), '[]'::jsonb),

  -- 12. gen_random_uuid_available: pg_proc existence only; do not invoke
  'gen_random_uuid_available', exists (
    select 1
    from pg_proc
    where proname = 'gen_random_uuid'
  ),

  -- 13. migration_tracking_tables: pg_class where relname ilike '%migration%'
  'migration_tracking_tables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'relname', c.relname,
        'relkind', c.relkind
      )
      order by n.nspname, c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname ilike '%migration%'
  ), '[]'::jsonb)
)) as recon;
