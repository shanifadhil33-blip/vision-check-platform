-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260923120000_vcp_get_answered_trials
-- One final result set: check, expected, observed, result, plus a verdict row.
-- Look functions up with to_regprocedure; a null oid is FAIL.
-- Cast any "char" or name catalogue column to text before concatenating.
-- The Supabase CLI is never used.

with
new_fn as (
  select to_regprocedure('public.vcp_get_answered_trials(uuid)') as oid
),
new_meta as (
  select
    p.oid,
    p.prosecdef,
    p.provolatile::text as provolatile,
    p.proconfig,
    pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
    pg_catalog.pg_get_function_result(p.oid)::text as return_type
  from pg_catalog.pg_proc p
  where p.oid = (select oid from new_fn)
),
new_search_path_ok as (
  select exists (
    select 1
    from new_meta m
    cross join lateral pg_catalog.unnest(coalesce(m.proconfig, array[]::text[])) as cfg(val)
    where cfg.val = 'search_path='
       or cfg.val = 'search_path=""'
  ) as ok
),
new_acl_grantees as (
  select distinct pg_catalog.pg_get_userbyid(a.grantee)::text as grantee
  from new_meta m
  cross join lateral pg_catalog.aclexplode(coalesce(
    (select p.proacl from pg_catalog.pg_proc p where p.oid = m.oid),
    '{}'::pg_catalog.aclitem[]
  )) a
  where a.privilege_type = 'EXECUTE'
),
new_acl_extra as (
  select g.grantee
  from new_acl_grantees g
  where g.grantee not in ('anon', 'postgres')
),
new_acl_anon_missing as (
  select 1
  where not exists (
    select 1 from new_acl_grantees g where g.grantee = 'anon'
  )
),
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
ten_acl_bad as (
  select t.proname, detail.kind, detail.grantee
  from ten t
  cross join lateral (
    select 'missing_anon'::text as kind, 'anon'::text as grantee
    where t.oid is not null
      and not exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::pg_catalog.aclitem[])) a
        where p.oid = t.oid
          and a.privilege_type = 'EXECUTE'
          and pg_catalog.pg_get_userbyid(a.grantee)::text = 'anon'
      )
    union all
    select 'extra'::text as kind, pg_catalog.pg_get_userbyid(a.grantee)::text as grantee
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, '{}'::pg_catalog.aclitem[])) a
    where p.oid = t.oid
      and a.privilege_type = 'EXECUTE'
      and pg_catalog.pg_get_userbyid(a.grantee)::text not in ('anon', 'postgres')
  ) detail
),
version_registered as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260923120000_vcp_get_answered_trials'
    )
  end as is_registered
),
checks as (
  select
    'function_found'::text as check_name,
    'to_regprocedure(public.vcp_get_answered_trials(uuid)) not null'::text as expected,
    case
      when (select oid from new_fn) is null then 'null'
      else (select oid from new_fn)::text
    end::text as observed,
    case
      when (select oid from new_fn) is not null then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'prosecdef_true',
    'true',
    coalesce((select m.prosecdef::text from new_meta m), 'absent'),
    case
      when (select oid from new_fn) is not null
       and (select m.prosecdef from new_meta m) is true
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'search_path_empty',
    'proconfig contains search_path= or search_path=""',
    coalesce(
      (
        select pg_catalog.array_to_string(m.proconfig, ', ')
        from new_meta m
      ),
      'absent'
    ),
    case
      when (select oid from new_fn) is not null
       and (select ok from new_search_path_ok) is true
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'provolatile_stable',
    's',
    coalesce((select m.provolatile from new_meta m), 'absent'),
    case
      when (select oid from new_fn) is not null
       and (select m.provolatile from new_meta m) = 's'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'owner_postgres',
    'postgres',
    coalesce((select m.owner_name from new_meta m), 'absent'),
    case
      when (select oid from new_fn) is not null
       and (select m.owner_name from new_meta m) = 'postgres'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'return_type_jsonb',
    'jsonb',
    coalesce((select m.return_type from new_meta m), 'absent'),
    case
      when (select oid from new_fn) is not null
       and (select m.return_type from new_meta m) = 'jsonb'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'acl_exactly_anon_and_postgres',
    'EXECUTE ACL grantees subset of {anon, postgres} and includes anon (owner postgres may be implicit)',
    coalesce(
      (
        select pg_catalog.string_agg(g.grantee, ', ' order by g.grantee)
        from new_acl_grantees g
      ),
      case when (select oid from new_fn) is null then 'absent' else 'none' end
    ),
    case
      when (select oid from new_fn) is not null
       and not exists (select 1 from new_acl_extra)
       and not exists (select 1 from new_acl_anon_missing)
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'has_execute_anon_true',
    'true',
    case
      when (select oid from new_fn) is null then 'absent'
      when not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'anon') then 'no_anon_role'
      else pg_catalog.has_function_privilege(
        'anon',
        (select oid from new_fn),
        'EXECUTE'
      )::text
    end,
    case
      when (select oid from new_fn) is not null
       and exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'anon')
       and pg_catalog.has_function_privilege('anon', (select oid from new_fn), 'EXECUTE')
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'has_execute_public_false',
    'false',
    case
      when (select oid from new_fn) is null then 'absent'
      else pg_catalog.has_function_privilege(
        'public',
        (select oid from new_fn),
        'EXECUTE'
      )::text
    end,
    case
      when (select oid from new_fn) is not null
       and not pg_catalog.has_function_privilege('public', (select oid from new_fn), 'EXECUTE')
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'has_execute_authenticated_false',
    'false',
    case
      when (select oid from new_fn) is null then 'absent'
      when not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'authenticated')
      then 'no_authenticated_role'
      else pg_catalog.has_function_privilege(
        'authenticated',
        (select oid from new_fn),
        'EXECUTE'
      )::text
    end,
    case
      when (select oid from new_fn) is not null
       and exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'authenticated')
       and not pg_catalog.has_function_privilege(
         'authenticated',
         (select oid from new_fn),
         'EXECUTE'
       )
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'has_execute_service_role_false',
    'false',
    case
      when (select oid from new_fn) is null then 'absent'
      when not exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role')
      then 'no_service_role'
      else pg_catalog.has_function_privilege(
        'service_role',
        (select oid from new_fn),
        'EXECUTE'
      )::text
    end,
    case
      when (select oid from new_fn) is not null
       and exists (select 1 from pg_catalog.pg_roles r where r.rolname = 'service_role')
       and not pg_catalog.has_function_privilege(
         'service_role',
         (select oid from new_fn),
         'EXECUTE'
       )
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'version_registered',
    'true (20260923120000_vcp_get_answered_trials in vcp.schema_migrations)',
    (select is_registered::text from version_registered),
    case
      when (select is_registered from version_registered) is true then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'ten_functions_found',
    'all ten to_regprocedure results not null',
    coalesce(
      (
        select pg_catalog.string_agg(m.proname, ', ' order by m.proname)
        from ten_missing m
      ),
      'all found'
    ),
    case
      when not exists (select 1 from ten_missing) then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'ten_acl_exactly_anon_and_postgres',
    'EXECUTE grantees exactly anon, postgres on each of the ten',
    coalesce(
      (
        select pg_catalog.string_agg(
          b.proname || ':' || b.kind || ':' || b.grantee,
          ', ' order by b.proname, b.kind, b.grantee
        )
        from ten_acl_bad b
      ),
      'exact match'
    ),
    case
      when not exists (select 1 from ten_missing)
       and not exists (select 1 from ten_acl_bad)
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
