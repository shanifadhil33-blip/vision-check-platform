-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260908140000_vcp_rpc_surface
-- Read the json cell. Verdict must be MIGRATION VERIFIED before recording
-- an RPC fingerprint baseline.
-- The Supabase CLI is never used.
--
-- LIVE DENY TEST
-- The SQL editor runs as postgres, which has BYPASSRLS. Catalog checks of
-- relrowsecurity / relforcerowsecurity prove the flags were set; they do
-- not prove that a non-bypass role is actually denied at query time. The
-- DO block below SET LOCAL ROLE anon and attempts select 1 from
-- vcp.sessions. PASS only if PostgreSQL raises insufficient_privilege.
-- FAIL if the select succeeds, including succeeding with zero rows.
-- SET ROLE cannot run inside a SELECT, so the DO block stores the outcome
-- in session GUCs that the json SELECT reads.

DO $live_deny$
DECLARE
  deny_result text;
  deny_sqlstate text;
  deny_sqlerrm text;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM vcp.sessions LIMIT 1;
    deny_result := 'FAIL';
    deny_sqlstate := '';
    deny_sqlerrm := 'select succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      deny_result := 'PASS';
      deny_sqlstate := SQLSTATE;
      deny_sqlerrm := SQLERRM;
    WHEN OTHERS THEN
      deny_result := 'FAIL';
      deny_sqlstate := SQLSTATE;
      deny_sqlerrm := SQLERRM;
  END;
  PERFORM set_config('vcp.verify.live_deny_result', deny_result, false);
  PERFORM set_config('vcp.verify.live_deny_sqlstate', coalesce(deny_sqlstate, ''), false);
  PERFORM set_config('vcp.verify.live_deny_sqlerrm', coalesce(deny_sqlerrm, ''), false);
END
$live_deny$;

-- On the FAIL path no exception is raised, so the subtransaction commits
-- and SET LOCAL ROLE anon would persist into the following SELECT, which
-- reads vcp.schema_migrations and would abort with a permission error
-- instead of reporting the failure. RESET ROLE guarantees the readout
-- prints its verdict on both paths.
RESET ROLE;

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
      then 'MIGRATION VERIFIED'
      else 'VERIFICATION FAILED: ' || (
        select string_agg(e.key, ', ' order by e.key)
        from jsonb_each(checks) as e(key, value)
        where e.value ->> 'result' = 'FAIL'
      )
    end
  )
) as recon
from (
  with expected_functions(proname) as (
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
  expected_tables(relname) as (
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
  public_rpc as (
    select
      p.oid,
      p.proname,
      p.prosecdef,
      p.proconfig,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join expected_functions e on e.proname = p.proname
    where n.nspname = 'public'
  ),
  missing_functions as (
    select e.proname
    from expected_functions e
    where not exists (
      select 1 from public_rpc r where r.proname = e.proname
    )
  ),
  not_security_definer as (
    select r.proname
    from public_rpc r
    where r.prosecdef is not true
  ),
  missing_search_path as (
    select r.proname, r.proconfig
    from public_rpc r
    where r.proconfig is null
       or not exists (
         select 1
         from unnest(r.proconfig) as cfg(val)
         where cfg.val like 'search_path=%'
       )
  ),
  anon_execute_missing as (
    select r.proname
    from public_rpc r
    where exists (select 1 from pg_roles where rolname = 'anon')
      and not has_function_privilege('anon', r.oid, 'EXECUTE')
  ),
  extra_public_anon_execute as (
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and exists (select 1 from pg_roles where rolname = 'anon')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from expected_functions e where e.proname = p.proname
      )
  ),
  vcp_anon_execute as (
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'vcp'
      and exists (select 1 from pg_roles where rolname = 'anon')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  rls_failures as (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join expected_tables e on e.relname = c.relname
    where n.nspname = 'vcp'
      and c.relkind in ('r', 'p')
      and (c.relrowsecurity is not true or c.relforcerowsecurity is not true)
    union
    select e.relname
    from expected_tables e
    where not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vcp'
        and c.relkind in ('r', 'p')
        and c.relname = e.relname
    )
  ),
  vcp_policies as (
    select p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vcp'
  ),
  proconfig_report as (
    select jsonb_agg(
      jsonb_build_object(
        'name', r.proname,
        'proconfig', to_jsonb(r.proconfig)
      )
      order by r.proname
    ) as listing
    from public_rpc r
  )
  select jsonb_build_object(
    'functions_exist', jsonb_build_object(
      'expected', (select jsonb_agg(e.proname order by e.proname) from expected_functions e),
      'observed', coalesce(
        (select jsonb_agg(r.proname order by r.proname) from public_rpc r),
        '[]'::jsonb
      ),
      'missing', coalesce(
        (select jsonb_agg(m.proname order by m.proname) from missing_functions m),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_functions) then 'PASS'
        else 'FAIL'
      end
    ),
    'security_definer', jsonb_build_object(
      'expected', 'every listed function has prosecdef true',
      'observed_failures', coalesce(
        (select jsonb_agg(f.proname order by f.proname) from not_security_definer f),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_functions)
         and not exists (select 1 from not_security_definer)
        then 'PASS'
        else 'FAIL'
      end
    ),
    'search_path_set', jsonb_build_object(
      'expected', 'every listed function has search_path in proconfig',
      'observed_proconfig', coalesce((select listing from proconfig_report), '[]'::jsonb),
      'observed_failures', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('name', f.proname, 'proconfig', to_jsonb(f.proconfig))
            order by f.proname
          )
          from missing_search_path f
        ),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_functions)
         and not exists (select 1 from missing_search_path)
        then 'PASS'
        else 'FAIL'
      end
    ),
    'anon_execute_on_ten', jsonb_build_object(
      'expected', 'anon has EXECUTE on all ten',
      'observed_missing', coalesce(
        (select jsonb_agg(f.proname order by f.proname) from anon_execute_missing f),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from missing_functions)
         and not exists (select 1 from anon_execute_missing)
        then 'PASS'
        else 'FAIL'
      end
    ),
    'no_extra_public_anon_execute', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce(
        (select jsonb_agg(f.proname order by f.proname) from extra_public_anon_execute f),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from extra_public_anon_execute) then 'PASS'
        else 'FAIL'
      end
    ),
    'no_vcp_function_anon_execute', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce(
        (select jsonb_agg(f.proname order by f.proname) from vcp_anon_execute f),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from vcp_anon_execute) then 'PASS'
        else 'FAIL'
      end
    ),
    'regression_anon_no_vcp_usage_or_select', jsonb_build_object(
      'expected', jsonb_build_object(
        'schema_usage', false,
        'sessions_select', false
      ),
      'observed', jsonb_build_object(
        'schema_usage', case
          when not exists (select 1 from pg_roles where rolname = 'anon') then null
          when not exists (select 1 from pg_namespace where nspname = 'vcp') then null
          else has_schema_privilege('anon', 'vcp', 'USAGE')
        end,
        'sessions_select', case
          when not exists (select 1 from pg_roles where rolname = 'anon') then null
          when to_regclass('vcp.sessions') is null then null
          else has_table_privilege('anon', 'vcp.sessions', 'SELECT')
        end
      ),
      'result', case
        when exists (select 1 from pg_roles where rolname = 'anon')
         and exists (select 1 from pg_namespace where nspname = 'vcp')
         and to_regclass('vcp.sessions') is not null
         and has_schema_privilege('anon', 'vcp', 'USAGE') is false
         and has_table_privilege('anon', 'vcp.sessions', 'SELECT') is false
        then 'PASS'
        else 'FAIL'
      end
    ),
    'regression_rls_enabled_and_forced', jsonb_build_object(
      'expected', 'every vcp table has relrowsecurity true and relforcerowsecurity true',
      'observed_failures', coalesce(
        (select jsonb_agg(f.relname order by f.relname) from rls_failures f),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from rls_failures) then 'PASS'
        else 'FAIL'
      end
    ),
    'zero_policies', jsonb_build_object(
      'expected', 0,
      'observed', (select count(*)::integer from vcp_policies),
      'result', case
        when (select count(*) from vcp_policies) = 0 then 'PASS'
        else 'FAIL'
      end
    ),
    'both_versions_registered', jsonb_build_object(
      'expected', jsonb_build_array(
        '20260908120000_vcp_initial_schema',
        '20260908140000_vcp_rpc_surface'
      ),
      'observed', case
        when to_regclass('vcp.schema_migrations') is null then '[]'::jsonb
        else coalesce(
          (
            select jsonb_agg(m.version order by m.version)
            from vcp.schema_migrations m
            where m.version in (
              '20260908120000_vcp_initial_schema',
              '20260908140000_vcp_rpc_surface'
            )
          ),
          '[]'::jsonb
        )
      end,
      'result', case
        when to_regclass('vcp.schema_migrations') is not null
         and exists (
           select 1 from vcp.schema_migrations m
           where m.version = '20260908120000_vcp_initial_schema'
         )
         and exists (
           select 1 from vcp.schema_migrations m
           where m.version = '20260908140000_vcp_rpc_surface'
         )
        then 'PASS'
        else 'FAIL'
      end
    ),
    'live_deny_anon_select_sessions', jsonb_build_object(
      'expected', 'insufficient_privilege',
      'observed', jsonb_build_object(
        'result', current_setting('vcp.verify.live_deny_result', true),
        'sqlstate', current_setting('vcp.verify.live_deny_sqlstate', true),
        'sqlerrm', current_setting('vcp.verify.live_deny_sqlerrm', true)
      ),
      'result', case
        when current_setting('vcp.verify.live_deny_result', true) = 'PASS'
        then 'PASS'
        else 'FAIL'
      end
    )
  ) as checks
) as built;
