-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260908140000_vcp_rpc_surface
-- One statement, one json cell. No BEGIN/COMMIT.
-- Read the verdict before pasting the apply copy.
-- The Supabase CLI is never used.
-- version_unregistered uses to_regclass / catalog only where needed so a
-- missing relation does not abort the statement.

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
  with expected_tables(relname) as (
    values
      ('calibrations'),
      ('distance_events'),
      ('presentations'),
      ('responses'),
      ('schema_migrations'),
      ('session_events'),
      ('sessions'),
      ('test_quality')
  ),
  expected_functions(proname) as (
    values
      ('vcp_append_event'),
      ('vcp_attach_calibration'),
      ('vcp_create_session'),
      ('vcp_get_session'),
      ('vcp_pair_session'),
      ('vcp_record_presentation'),
      ('vcp_record_rendered'),
      ('vcp_set_session_state'),
      ('vcp_submit_response'),
      ('vcp_upsert_test_quality')
  ),
  observed_tables as (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join expected_tables e on e.relname = c.relname
    where n.nspname = 'vcp'
      and c.relkind in ('r', 'p')
  ),
  missing_tables as (
    select e.relname
    from expected_tables e
    where not exists (
      select 1 from observed_tables o where o.relname = e.relname
    )
  ),
  existing_rpc as (
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join expected_functions e on e.proname = p.proname
    where n.nspname = 'public'
  )
  select jsonb_build_object(
    'schema_vcp_and_eight_tables', jsonb_build_object(
      'expected', (select jsonb_agg(e.relname order by e.relname) from expected_tables e),
      'observed', coalesce(
        (select jsonb_agg(o.relname order by o.relname) from observed_tables o),
        '[]'::jsonb
      ),
      'missing', coalesce(
        (select jsonb_agg(m.relname order by m.relname) from missing_tables m),
        '[]'::jsonb
      ),
      'result', case
        when exists (select 1 from pg_namespace n where n.nspname = 'vcp')
         and not exists (select 1 from missing_tables)
        then 'PASS'
        else 'FAIL'
      end
    ),
    'version_rpc_unregistered', jsonb_build_object(
      'expected', false,
      'observed', case
        when to_regclass('vcp.schema_migrations') is null then false
        else exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908140000_vcp_rpc_surface'
        )
      end,
      'result', case
        when to_regclass('vcp.schema_migrations') is null then 'FAIL'
        when exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908140000_vcp_rpc_surface'
        ) then 'FAIL'
        else 'PASS'
      end
    ),
    'version_initial_registered', jsonb_build_object(
      'expected', true,
      'observed', case
        when to_regclass('vcp.schema_migrations') is null then false
        else exists (
          select 1
          from vcp.schema_migrations m
          where m.version = '20260908120000_vcp_initial_schema'
        )
      end,
      'result', case
        when to_regclass('vcp.schema_migrations') is not null
         and exists (
           select 1
           from vcp.schema_migrations m
           where m.version = '20260908120000_vcp_initial_schema'
         )
        then 'PASS'
        else 'FAIL'
      end
    ),
    'public_rpc_functions_absent', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce(
        (select jsonb_agg(r.proname order by r.proname) from existing_rpc r),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from existing_rpc) then 'PASS'
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
