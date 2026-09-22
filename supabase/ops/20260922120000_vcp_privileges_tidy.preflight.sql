-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260922120000_vcp_privileges_tidy
-- Confirms the live state measured 22 September after the dashboard setting
-- was turned off, and that this version is not yet registered.
-- One final result set: check, expected, observed, result, plus a verdict row.
-- The Supabase CLI is never used. No BEGIN/COMMIT. Catalogues and
-- has_function_privilege only; never information_schema.

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
service_role_execute as (
  select
    o.proname,
    case
      when o.oid is null then false
      when not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role') then null
      else pg_catalog.has_function_privilege('service_role', o.oid, 'EXECUTE')
    end as has_execute
  from ten o
),
service_role_missing as (
  select s.proname
  from service_role_execute s
  where s.has_execute is distinct from true
),
-- Default ACL for grantor postgres in schema public, exploded.
postgres_defacl as (
  select
    d.defaclobjtype::text as objtype,
    pg_catalog.pg_get_userbyid(a.grantee)::text as grantee,
    a.privilege_type
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral pg_catalog.aclexplode(d.defaclacl) a
  where n.nspname = 'public'
    and pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
),
-- Expected table defaults (objtype r): anon/authenticated/service_role = Dxtm;
-- postgres = arwdDxtm.
table_privs_expected(grantee, privilege_type) as (
  values
    ('anon', 'TRUNCATE'), ('anon', 'REFERENCES'), ('anon', 'TRIGGER'), ('anon', 'MAINTAIN'),
    ('authenticated', 'TRUNCATE'), ('authenticated', 'REFERENCES'),
    ('authenticated', 'TRIGGER'), ('authenticated', 'MAINTAIN'),
    ('service_role', 'TRUNCATE'), ('service_role', 'REFERENCES'),
    ('service_role', 'TRIGGER'), ('service_role', 'MAINTAIN'),
    ('postgres', 'INSERT'), ('postgres', 'SELECT'), ('postgres', 'UPDATE'),
    ('postgres', 'DELETE'), ('postgres', 'TRUNCATE'), ('postgres', 'REFERENCES'),
    ('postgres', 'TRIGGER'), ('postgres', 'MAINTAIN')
),
table_privs_observed as (
  select grantee, privilege_type
  from postgres_defacl
  where objtype = 'r'
),
table_mismatch as (
  select 'missing:' || e.grantee || '=' || e.privilege_type as detail
  from table_privs_expected e
  where not exists (
    select 1 from table_privs_observed o
    where o.grantee = e.grantee and o.privilege_type = e.privilege_type
  )
  union all
  select 'extra:' || o.grantee || '=' || o.privilege_type as detail
  from table_privs_observed o
  where not exists (
    select 1 from table_privs_expected e
    where e.grantee = o.grantee and e.privilege_type = o.privilege_type
  )
),
-- Expected sequence defaults (objtype S): anon/authenticated/service_role = UPDATE;
-- postgres = SELECT, UPDATE, USAGE.
seq_privs_expected(grantee, privilege_type) as (
  values
    ('anon', 'UPDATE'),
    ('authenticated', 'UPDATE'),
    ('service_role', 'UPDATE'),
    ('postgres', 'SELECT'),
    ('postgres', 'UPDATE'),
    ('postgres', 'USAGE')
),
seq_privs_observed as (
  select grantee, privilege_type
  from postgres_defacl
  where objtype = 'S'
),
seq_mismatch as (
  select 'missing:' || e.grantee || '=' || e.privilege_type as detail
  from seq_privs_expected e
  where not exists (
    select 1 from seq_privs_observed o
    where o.grantee = e.grantee and o.privilege_type = e.privilege_type
  )
  union all
  select 'extra:' || o.grantee || '=' || o.privilege_type as detail
  from seq_privs_observed o
  where not exists (
    select 1 from seq_privs_expected e
    where e.grantee = o.grantee and e.privilege_type = o.privilege_type
  )
),
-- Expected function defaults (objtype f): postgres = EXECUTE only.
fn_privs_observed as (
  select grantee, privilege_type
  from postgres_defacl
  where objtype = 'f'
),
fn_mismatch as (
  select 'missing:postgres=EXECUTE' as detail
  where not exists (
    select 1 from fn_privs_observed o
    where o.grantee = 'postgres' and o.privilege_type = 'EXECUTE'
  )
  union all
  select 'extra:' || o.grantee || '=' || o.privilege_type as detail
  from fn_privs_observed o
  where not (o.grantee = 'postgres' and o.privilege_type = 'EXECUTE')
),
-- supabase_admin rows: recorded for verify to assert unchanged. Not touched by apply.
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
    'service_role_execute_on_ten'::text as check_name,
    'service_role has EXECUTE on all ten'::text as expected,
    coalesce(
      (
        select pg_catalog.string_agg(
          s.proname || '=' || coalesce(s.has_execute::text, 'null'),
          ', ' order by s.proname
        )
        from service_role_execute s
      ),
      'none'
    )::text as observed,
    case
      when not exists (select 1 from service_role_missing) then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'default_acl_tables_r',
    'anon=Dxtm; authenticated=Dxtm; postgres=arwdDxtm; service_role=Dxtm',
    coalesce(
      (select pg_catalog.string_agg(m.detail, ', ' order by m.detail) from table_mismatch m),
      'exact match'
    ),
    case when not exists (select 1 from table_mismatch) then 'PASS' else 'FAIL' end
  union all
  select
    'default_acl_sequences_S',
    'anon=w; authenticated=w; postgres=rwU; service_role=w',
    coalesce(
      (select pg_catalog.string_agg(m.detail, ', ' order by m.detail) from seq_mismatch m),
      'exact match'
    ),
    case when not exists (select 1 from seq_mismatch) then 'PASS' else 'FAIL' end
  union all
  select
    'default_acl_functions_f',
    'postgres=X only',
    coalesce(
      (select pg_catalog.string_agg(m.detail, ', ' order by m.detail) from fn_mismatch m),
      'exact match'
    ),
    case when not exists (select 1 from fn_mismatch) then 'PASS' else 'FAIL' end
  union all
  select
    'supabase_admin_default_acl_present',
    'at least one pg_default_acl row for grantor supabase_admin in public',
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
    'version_unregistered',
    'false (20260922120000_vcp_privileges_tidy not in vcp.schema_migrations)',
    (select is_registered::text from version_registered),
    case
      when (select is_registered from version_registered) is false then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'current_user',
    'postgres',
    current_user,
    case when current_user = 'postgres' then 'PASS' else 'FAIL' end
),
verdict as (
  select
    'verdict'::text as check_name,
    'SAFE TO APPLY'::text as expected,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'SAFE TO APPLY'
      else 'DO NOT APPLY: ' || (
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
