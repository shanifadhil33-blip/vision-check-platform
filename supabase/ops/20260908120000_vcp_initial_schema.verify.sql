-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260908120000_vcp_initial_schema
-- Read the json cell. Verdict must be MIGRATION VERIFIED before recording
-- a fingerprint baseline.
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
  observed_tables as (
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
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
  rls_failures as (
    select o.relname
    from observed_tables o
    where o.relrowsecurity is not true
       or o.relforcerowsecurity is not true
    union
    select m.relname
    from missing_tables m
  ),
  anon_table_grants as (
    select e.relname as table, p.priv as privilege
    from expected_tables e
    cross join (
      values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
    ) as p(priv)
    where exists (select 1 from pg_roles r where r.rolname = 'anon')
      and to_regclass(format('%I.%I', 'vcp', e.relname)) is not null
      and has_table_privilege('anon', format('%I.%I', 'vcp', e.relname), p.priv)
  ),
  default_acl_grants as (
    select
      pg_get_userbyid(d.defaclrole) as granting_role,
      d.defaclobjtype,
      acl::text as acl
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral unnest(coalesce(d.defaclacl, '{}'::aclitem[])) as acl
    where n.nspname = 'vcp'
      and acl::text ~ '^(anon|authenticated)=[^=/]+/'
  ),
  presentations_logmar as (
    select a.attgenerated
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vcp'
      and c.relname = 'presentations'
      and a.attname = 'logmar'
      and not a.attisdropped
      and a.attnum > 0
  ),
  test_quality_final_logmar as (
    select a.attgenerated
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vcp'
      and c.relname = 'test_quality'
      and a.attname = 'final_logmar'
      and not a.attisdropped
      and a.attnum > 0
  ),
  vcp_policies as (
    select p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'vcp'
  )
  select jsonb_build_object(
    'schema_vcp_exists', jsonb_build_object(
      'expected', true,
      'observed', exists (select 1 from pg_namespace n where n.nspname = 'vcp'),
      'result', case
        when exists (select 1 from pg_namespace n where n.nspname = 'vcp')
        then 'PASS'
        else 'FAIL'
      end
    ),
    'tables_exist', jsonb_build_object(
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
        when not exists (select 1 from missing_tables) then 'PASS'
        else 'FAIL'
      end
    ),
    'rls_enabled_and_forced', jsonb_build_object(
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
    'anon_schema_usage_false', jsonb_build_object(
      'expected', false,
      'observed', case
        when not exists (select 1 from pg_roles r where r.rolname = 'anon') then null
        when not exists (select 1 from pg_namespace n where n.nspname = 'vcp') then null
        else has_schema_privilege('anon', 'vcp', 'USAGE')
      end,
      'result', case
        when exists (select 1 from pg_roles r where r.rolname = 'anon')
         and exists (select 1 from pg_namespace n where n.nspname = 'vcp')
         and has_schema_privilege('anon', 'vcp', 'USAGE') is false
        then 'PASS'
        else 'FAIL'
      end
    ),
    'authenticated_schema_usage_false', jsonb_build_object(
      'expected', false,
      'observed', case
        when not exists (select 1 from pg_roles r where r.rolname = 'authenticated') then null
        when not exists (select 1 from pg_namespace n where n.nspname = 'vcp') then null
        else has_schema_privilege('authenticated', 'vcp', 'USAGE')
      end,
      'result', case
        when exists (select 1 from pg_roles r where r.rolname = 'authenticated')
         and exists (select 1 from pg_namespace n where n.nspname = 'vcp')
         and has_schema_privilege('authenticated', 'vcp', 'USAGE') is false
        then 'PASS'
        else 'FAIL'
      end
    ),
    'anon_table_dml_false', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('table', g.table, 'privilege', g.privilege)
            order by g.table, g.privilege
          )
          from anon_table_grants g
        ),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from anon_table_grants) then 'PASS'
        else 'FAIL'
      end
    ),
    'no_default_acl_to_anon_or_authenticated', jsonb_build_object(
      'expected', '[]'::jsonb,
      'observed', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'granting_role', d.granting_role,
              'defaclobjtype', d.defaclobjtype,
              'acl', d.acl
            )
            order by d.granting_role, d.defaclobjtype, d.acl
          )
          from default_acl_grants d
        ),
        '[]'::jsonb
      ),
      'result', case
        when not exists (select 1 from default_acl_grants) then 'PASS'
        else 'FAIL'
      end
    ),
    'generated_column_presentations_logmar', jsonb_build_object(
      'expected', 's',
      'observed', (select p.attgenerated from presentations_logmar p),
      'result', case
        when (select p.attgenerated from presentations_logmar p) = 's' then 'PASS'
        else 'FAIL'
      end
    ),
    'generated_column_test_quality_final_logmar', jsonb_build_object(
      'expected', 's',
      'observed', (select t.attgenerated from test_quality_final_logmar t),
      'result', case
        when (select t.attgenerated from test_quality_final_logmar t) = 's' then 'PASS'
        else 'FAIL'
      end
    ),
    'version_registered', jsonb_build_object(
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
    'zero_policies', jsonb_build_object(
      'expected', 0,
      'observed', (select count(*)::integer from vcp_policies),
      'result', case
        when (select count(*) from vcp_policies) = 0 then 'PASS'
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
