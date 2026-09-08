-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260908120000_vcp_initial_schema
-- One statement, one json cell. No BEGIN/COMMIT.
-- Read the verdict before pasting the apply copy.
-- The Supabase CLI is never used.
-- version_unregistered uses to_regclass, not a SELECT from
-- vcp.schema_migrations, because a missing relation is a parse error
-- even inside a CASE branch that would not run. If the tracking
-- relation exists, apply is not safe.

select jsonb_pretty(
  checks
  || jsonb_build_object(
    'verdict',
    case
      when not exists (
        select 1
        from jsonb_each(checks) as e(key, value)
        where e.value ->> 'result' = 'FAIL'
      )
      then 'SAFE TO APPLY'
      else 'DO NOT APPLY: ' || (
        select string_agg(e.key, ', ' order by e.key)
        from jsonb_each(checks) as e(key, value)
        where e.value ->> 'result' = 'FAIL'
      )
    end
  )
) as recon
from (
  select jsonb_build_object(
    'schema_vcp_absent', jsonb_build_object(
      'expected', false,
      'observed', exists (
        select 1 from pg_namespace n where n.nspname = 'vcp'
      ),
      'result', case
        when not exists (select 1 from pg_namespace n where n.nspname = 'vcp')
        then 'PASS'
        else 'FAIL'
      end
    ),
    'vcp_tables_absent', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce((
        select jsonb_agg(wanted.relname order by wanted.relname)
        from (
          values
            ('calibrations'),
            ('distance_events'),
            ('presentations'),
            ('responses'),
            ('schema_migrations'),
            ('session_events'),
            ('sessions'),
            ('test_quality')
        ) as wanted(relname)
        where exists (
          select 1
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'vcp'
            and c.relkind in ('r', 'p')
            and c.relname = wanted.relname
        )
      ), '[]'::jsonb),
      'result', case
        when not exists (
          select 1
          from (
            values
              ('calibrations'),
              ('distance_events'),
              ('presentations'),
              ('responses'),
              ('schema_migrations'),
              ('session_events'),
              ('sessions'),
              ('test_quality')
          ) as wanted(relname)
          join pg_class c on c.relname = wanted.relname
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'vcp'
            and c.relkind in ('r', 'p')
        )
        then 'PASS'
        else 'FAIL'
      end
    ),
    'version_unregistered', jsonb_build_object(
      'expected', false,
      'observed', to_regclass('vcp.schema_migrations') is not null,
      'result', case
        when to_regclass('vcp.schema_migrations') is null then 'PASS'
        else 'FAIL'
      end
    ),
    'role_anon_exists', jsonb_build_object(
      'expected', true,
      'observed', exists (select 1 from pg_roles r where r.rolname = 'anon'),
      'result', case
        when exists (select 1 from pg_roles r where r.rolname = 'anon')
        then 'PASS'
        else 'FAIL'
      end
    ),
    'role_authenticated_exists', jsonb_build_object(
      'expected', true,
      'observed', exists (select 1 from pg_roles r where r.rolname = 'authenticated'),
      'result', case
        when exists (select 1 from pg_roles r where r.rolname = 'authenticated')
        then 'PASS'
        else 'FAIL'
      end
    ),
    'gen_random_uuid_available', jsonb_build_object(
      'expected', true,
      'observed', exists (select 1 from pg_proc p where p.proname = 'gen_random_uuid'),
      'result', case
        when exists (select 1 from pg_proc p where p.proname = 'gen_random_uuid')
        then 'PASS'
        else 'FAIL'
      end
    ),
    'current_user', jsonb_build_object(
      'expected', 'postgres',
      'observed', current_user,
      'result', case
        when current_user = 'postgres' then 'PASS'
        else 'FAIL'
      end
    )
  ) as checks
) as built;
