-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260924120000_vcp_sweep_abandoned_sessions
-- One final result set: check, expected, observed, result, plus a verdict row.
-- Look functions up with to_regprocedure; a null oid is FAIL.
-- Cast any "char" or name catalogue column to text before concatenating.
-- The Supabase CLI is never used.

with
target_fn as (
  select to_regprocedure('public.vcp_create_session(integer, text)') as oid
),
target_meta as (
  select
    p.oid,
    p.prosecdef,
    p.prosrc,
    p.proconfig,
    pg_catalog.pg_get_userbyid(p.proowner)::text as owner_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid)::text as identity_args,
    pg_catalog.pg_get_function_result(p.oid)::text as return_type
  from pg_catalog.pg_proc p
  where p.oid = (select oid from target_fn)
),
target_search_path_ok as (
  select exists (
    select 1
    from target_meta m
    cross join lateral pg_catalog.unnest(coalesce(m.proconfig, array[]::text[])) as cfg(val)
    where cfg.val = 'search_path='
       or cfg.val = 'search_path=""'
  ) as ok
),
target_acl_grantees as (
  select distinct pg_catalog.pg_get_userbyid(a.grantee)::text as grantee
  from target_meta m
  cross join lateral pg_catalog.aclexplode(coalesce(
    (select p.proacl from pg_catalog.pg_proc p where p.oid = m.oid),
    '{}'::pg_catalog.aclitem[]
  )) a
  where a.privilege_type = 'EXECUTE'
),
target_acl_extra as (
  select g.grantee
  from target_acl_grantees g
  where g.grantee not in ('anon', 'postgres')
),
target_acl_anon_missing as (
  select 1
  where not exists (
    select 1 from target_acl_grantees g where g.grantee = 'anon'
  )
),
other_ten(proname, oid) as (
  values
    ('vcp_get_session', to_regprocedure('public.vcp_get_session(uuid)')),
    ('vcp_pair_session', to_regprocedure('public.vcp_pair_session(uuid, integer)')),
    ('vcp_set_session_state', to_regprocedure('public.vcp_set_session_state(uuid, integer, text, jsonb)')),
    ('vcp_attach_calibration', to_regprocedure('public.vcp_attach_calibration(uuid, jsonb)')),
    ('vcp_record_presentation', to_regprocedure('public.vcp_record_presentation(uuid, jsonb)')),
    ('vcp_record_rendered', to_regprocedure('public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)')),
    ('vcp_submit_response', to_regprocedure('public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)')),
    ('vcp_append_event', to_regprocedure('public.vcp_append_event(uuid, text, jsonb)')),
    ('vcp_upsert_test_quality', to_regprocedure('public.vcp_upsert_test_quality(uuid, text, jsonb)')),
    ('vcp_get_answered_trials', to_regprocedure('public.vcp_get_answered_trials(uuid)'))
),
other_ten_missing as (
  select t.proname
  from other_ten t
  where t.oid is null
),
other_ten_acl_bad as (
  select t.proname, detail.kind, detail.grantee
  from other_ten t
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
      where m.version = '20260924120000_vcp_sweep_abandoned_sessions'
    )
  end as is_registered
),
checks as (
  select
    'function_found'::text as check_name,
    'to_regprocedure(public.vcp_create_session(integer, text)) not null'::text as expected,
    case
      when (select oid from target_fn) is null then 'null'
      else (select oid from target_fn)::text
    end::text as observed,
    case
      when (select oid from target_fn) is not null then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'identity_signature',
    'p_distance_mm_requested integer, p_client_build text',
    coalesce((select m.identity_args from target_meta m), 'absent'),
    case
      when (select oid from target_fn) is not null
       and (select m.identity_args from target_meta m) = 'p_distance_mm_requested integer, p_client_build text'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'return_type_uuid',
    'uuid',
    coalesce((select m.return_type from target_meta m), 'absent'),
    case
      when (select oid from target_fn) is not null
       and (select m.return_type from target_meta m) = 'uuid'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'prosecdef_true',
    'true',
    coalesce((select m.prosecdef::text from target_meta m), 'absent'),
    case
      when (select oid from target_fn) is not null
       and (select m.prosecdef from target_meta m) is true
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
        from target_meta m
      ),
      'absent'
    ),
    case
      when (select oid from target_fn) is not null
       and (select ok from target_search_path_ok) is true
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'owner_postgres',
    'postgres',
    coalesce((select m.owner_name from target_meta m), 'absent'),
    case
      when (select oid from target_fn) is not null
       and (select m.owner_name from target_meta m) = 'postgres'
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
        from target_acl_grantees g
      ),
      case when (select oid from target_fn) is null then 'absent' else 'none' end
    ),
    case
      when (select oid from target_fn) is not null
       and not exists (select 1 from target_acl_extra)
       and not exists (select 1 from target_acl_anon_missing)
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'prosrc_contains_abandoned_by_sweep',
    'prosrc mentions abandoned_by_sweep',
    case
      when (select oid from target_fn) is null then 'absent'
      when position(
        'abandoned_by_sweep' in coalesce((select m.prosrc from target_meta m), '')
      ) > 0 then 'present'
      else 'missing'
    end,
    case
      when (select oid from target_fn) is not null
       and position(
         'abandoned_by_sweep' in coalesce((select m.prosrc from target_meta m), '')
       ) > 0
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'version_registered',
    'true (20260924120000_vcp_sweep_abandoned_sessions in vcp.schema_migrations)',
    (select is_registered::text from version_registered),
    case
      when (select is_registered from version_registered) is true then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'other_ten_functions_found',
    'all ten to_regprocedure results not null',
    coalesce(
      (
        select pg_catalog.string_agg(m.proname, ', ' order by m.proname)
        from other_ten_missing m
      ),
      'all found'
    ),
    case
      when not exists (select 1 from other_ten_missing) then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'other_ten_acl_exactly_anon_and_postgres',
    'EXECUTE grantees exactly anon, postgres on each of the other ten',
    coalesce(
      (
        select pg_catalog.string_agg(
          b.proname || ':' || b.kind || ':' || b.grantee,
          ', ' order by b.proname, b.kind, b.grantee
        )
        from other_ten_acl_bad b
      ),
      'exact match'
    ),
    case
      when not exists (select 1 from other_ten_missing)
       and not exists (select 1 from other_ten_acl_bad)
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
