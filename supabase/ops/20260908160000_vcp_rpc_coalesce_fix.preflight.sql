-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260908160000_vcp_rpc_coalesce_fix
-- One statement, one json cell. No BEGIN/COMMIT.
-- Read the verdict before pasting the apply copy.
-- The Supabase CLI is never used.
-- Confirms the broken 20260908140000 bodies are still live (prosrc contains
-- pg_catalog.coalesce) so this fix is applied to the known-bad version.

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
  with affected_functions(proname) as (
    values
      ('vcp_append_event'),
      ('vcp_record_presentation'),
      ('vcp_upsert_test_quality')
  ),
  existing_affected as (
    select p.proname, p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join affected_functions a on a.proname = p.proname
    where n.nspname = 'public'
  ),
  missing_affected as (
    select a.proname
    from affected_functions a
    where not exists (
      select 1 from existing_affected e where e.proname = a.proname
    )
  ),
  broken_coalesce as (
    select e.proname
    from existing_affected e
    where position('pg_catalog.coalesce' in e.prosrc) > 0
  ),
  missing_broken_marker as (
    select a.proname
    from affected_functions a
    where not exists (
      select 1 from broken_coalesce b where b.proname = a.proname
    )
  )
  select jsonb_build_object(
    'version_rpc_surface_registered', jsonb_build_object(
      'expected', true,
      'observed', case
        when to_regclass('vcp.schema_migrations') is null then false
        else exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908140000_vcp_rpc_surface'
        )
      end,
      'result', case
        when to_regclass('vcp.schema_migrations') is not null
         and exists (
           select 1
           from vcp.schema_migrations m
           where m.version = '20260908140000_vcp_rpc_surface'
         )
        then 'PASS'
        else 'FAIL'
      end
    ),
    'version_coalesce_fix_unregistered', jsonb_build_object(
      'expected', false,
      'observed', case
        when to_regclass('vcp.schema_migrations') is null then false
        else exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908160000_vcp_rpc_coalesce_fix'
        )
      end,
      'result', case
        when to_regclass('vcp.schema_migrations') is null then 'FAIL'
        when exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908160000_vcp_rpc_coalesce_fix'
        ) then 'FAIL'
        else 'PASS'
      end
    ),
    'affected_functions_exist', jsonb_build_object(
      'expected', (select jsonb_agg(a.proname order by a.proname) from affected_functions a),
      'observed', coalesce(
        (select jsonb_agg(e.proname order by e.proname) from existing_affected e),
        '[]'::jsonb
      ),
      'missing', coalesce(
        (select jsonb_agg(m.proname order by m.proname) from missing_affected m),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_affected) then 'PASS'
        else 'FAIL'
      end
    ),
    'affected_prosrc_contains_pg_catalog_coalesce', jsonb_build_object(
      'expected', (select jsonb_agg(a.proname order by a.proname) from affected_functions a),
      'observed_containing', coalesce(
        (select jsonb_agg(b.proname order by b.proname) from broken_coalesce b),
        '[]'::jsonb
      ),
      'missing_marker', coalesce(
        (select jsonb_agg(m.proname order by m.proname) from missing_broken_marker m),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_affected)
         and not exists (select 1 from missing_broken_marker)
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
