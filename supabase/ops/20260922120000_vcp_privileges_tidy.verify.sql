-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260922120000_vcp_privileges_tidy
-- One final result set: check, expected, observed, result, plus a verdict row.
-- The Supabase CLI is never used.
--
-- LIVE ANON EXECUTE TEST
-- SET LOCAL ROLE anon and call public.vcp_get_session with a random uuid.
-- PASS only if PostgreSQL raises SQLSTATE V0001 (session not found), which
-- proves anon still holds EXECUTE. FAIL if the call is denied (42501) or
-- succeeds. RESET ROLE runs after the DO block on both PASS and FAIL paths
-- so the readout always prints.

DO $live_anon_execute$
DECLARE
  live_result text;
  live_sqlstate text;
  live_sqlerrm text;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.vcp_get_session(pg_catalog.gen_random_uuid());
    live_result := 'FAIL';
    live_sqlstate := '';
    live_sqlerrm := 'call succeeded';
  EXCEPTION
    WHEN SQLSTATE 'V0001' THEN
      live_result := 'PASS';
      live_sqlstate := SQLSTATE;
      live_sqlerrm := SQLERRM;
    WHEN OTHERS THEN
      live_result := 'FAIL';
      live_sqlstate := SQLSTATE;
      live_sqlerrm := SQLERRM;
  END;
  PERFORM pg_catalog.set_config('vcp.verify.live_anon_execute_result', live_result, false);
  PERFORM pg_catalog.set_config(
    'vcp.verify.live_anon_execute_sqlstate',
    coalesce(live_sqlstate, ''),
    false
  );
  PERFORM pg_catalog.set_config(
    'vcp.verify.live_anon_execute_sqlerrm',
    coalesce(live_sqlerrm, ''),
    false
  );
END
$live_anon_execute$;

-- On the FAIL path no exception is raised, so the subtransaction commits
-- and SET LOCAL ROLE anon would persist into the following SELECT.
-- RESET ROLE guarantees the readout prints its verdict on both paths.
RESET ROLE;

with
ten(proname, oid) as (
  values
    ('vcp_create_session', to_regprocedure('public.vcp_create_session(integer, text)')),
    ('vcp_get_session', to_regprocedure('public.vcp_get_session(uuid)')),
    ('vcp_pair_session', to_regprocedure('public.vcp_pair_session(uuid, integer)')),
    ('vcp_set_session_state', to_regprocedure('public.vcp_set_session_state(uuid, integer, text, jsonb)')),
    ('vcp_attach_calibration', to_regprocedure('public.vcp_attach_calibration(uuid, jsonb)')),
    ('vcp_record_presentation', to_regprocedure('public.vcp_record_presentation(uuid, jsonb)')),
    ('vcp_record_rendered', to_regprocedure('public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)')),
    ('vcp_submit_response', to_regprocedure('public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)')),
    ('vcp_append_event', to_regprocedure('public.vcp_append_event(uuid, text, jsonb)')),
    ('vcp_upsert_test_quality', to_regprocedure('public.vcp_upsert_test_quality(uuid, text, jsonb)'))
),
ten_missing as (
  select t.proname
  from ten t
  where t.oid is null
),
service_role_still_execute as (
  select o.proname
  from ten o
  where o.oid is null
     or (
       exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role')
       and pg_catalog.has_function_privilege('service_role', o.oid, 'EXECUTE')
     )
),
anon_missing_execute as (
  select o.proname
  from ten o
  where o.oid is null
     or not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'anon')
     or not pg_catalog.has_function_privilege('anon', o.oid, 'EXECUTE')
),
-- Residual default-privilege grantees that must be gone for grantor postgres.
postgres_residual as (
  select
    d.defaclobjtype::text as objtype,
    pg_catalog.pg_get_userbyid(a.grantee)::text as grantee,
    a.privilege_type
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) a
  where n.nspname = 'public'
    and pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
    and pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')
    and d.defaclobjtype in ('r', 'S', 'f')
),
supabase_admin_acl as (
  select
    d.defaclobjtype::text as objtype,
    (
      select pg_catalog.string_agg(acl::text, '; ' order by acl::text)
      from pg_catalog.unnest(d.defaclacl) as acl
    ) as acl_text
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
    and pg_catalog.pg_get_userbyid(d.defaclrole) = 'supabase_admin'
),
version_registered as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260922120000_vcp_privileges_tidy'
    )
  end as is_registered
),
checks as (
  select
    'all_ten_functions_found'::text as check_name,
    'all ten to_regprocedure results not null'::text as expected,
    coalesce(
      (
        select pg_catalog.string_agg(m.proname, ', ' order by m.proname)
        from ten_missing m
      ),
      'all found'
    )::text as observed,
    case
      when not exists (select 1 from ten_missing) then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'service_role_no_execute_on_ten'::text as check_name,
    'service_role has EXECUTE on none of the ten'::text as expected,
    coalesce(
      (
        select pg_catalog.string_agg(s.proname, ', ' order by s.proname)
        from service_role_still_execute s
      ),
      'none'
    )::text as observed,
    case
      when not exists (select 1 from service_role_still_execute) then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'anon_execute_on_ten',
    'anon has EXECUTE on all ten',
    coalesce(
      (
        select pg_catalog.string_agg(a.proname, ', ' order by a.proname)
        from anon_missing_execute a
      ),
      'none missing'
    ),
    case
      when not exists (select 1 from anon_missing_execute) then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'postgres_default_acl_no_anon_authenticated_service_role',
    'no pg_default_acl entry for anon, authenticated or service_role on r, S or f (grantor postgres, schema public)',
    coalesce(
      (
        select pg_catalog.string_agg(
          'objtype=' || p.objtype || ':' || p.grantee || '=' || p.privilege_type,
          ', ' order by p.objtype, p.grantee, p.privilege_type
        )
        from postgres_residual p
      ),
      'none'
    ),
    case
      when not exists (select 1 from postgres_residual) then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'supabase_admin_default_acl_unchanged',
    'supabase_admin pg_default_acl rows for public still present (untouched by this migration)',
    coalesce(
      (
        select pg_catalog.string_agg(
          'objtype=' || s.objtype || '{' || coalesce(s.acl_text, '') || '}',
          '; ' order by s.objtype
        )
        from supabase_admin_acl s
      ),
      'none'
    ),
    case
      when exists (select 1 from supabase_admin_acl) then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'version_registered',
    'true (20260922120000_vcp_privileges_tidy in vcp.schema_migrations)',
    (select is_registered::text from version_registered),
    case
      when (select is_registered from version_registered) is true then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'live_anon_execute_vcp_get_session_raises_V0001',
    'SQLSTATE V0001',
    (
      'result=' || coalesce(pg_catalog.current_setting('vcp.verify.live_anon_execute_result', true), '')
      || '; sqlstate=' || coalesce(pg_catalog.current_setting('vcp.verify.live_anon_execute_sqlstate', true), '')
      || '; sqlerrm=' || coalesce(pg_catalog.current_setting('vcp.verify.live_anon_execute_sqlerrm', true), '')
    ),
    case
      when pg_catalog.current_setting('vcp.verify.live_anon_execute_result', true) = 'PASS'
      then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    'verdict'::text as check_name,
    'MIGRATION VERIFIED'::text as expected,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'MIGRATION VERIFIED'
      else 'VERIFICATION FAILED: ' || (
        select pg_catalog.string_agg(c.check_name, ', ' order by c.check_name)
        from checks c
        where c.result = 'FAIL'
      )
    end::text as observed,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'PASS'
      else 'FAIL'
    end::text as result
)
select "check", expected, observed, result
from (
  select check_name as "check", expected, observed, result from checks
  union all
  select check_name, expected, observed, result from verdict
) readout
order by case when "check" = 'verdict' then 1 else 0 end, "check";
