-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20261107120000_vcp_distance_readings
-- Checks the tracking row, the new column vcp.distance_events.captured_at
-- (type, nullable, no default, comment), the new function (arguments,
-- return type, security definer, empty search_path, owner postgres,
-- comment), its grants, the hash of its body against the migration file,
-- that the four distance_events value checks are unchanged, and that every
-- existing row has captured_at null. Behaviour is exercised by the
-- smoketest file.
-- Expected body hash computed from the migration file, carriage returns
-- removed: 34c3b0fbead16d641962dab994c2c74b
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT.
-- The probe below only SELECTs. A missing relation leaves the GUC at
-- absent, and the check that needed it FAILs.
-- Run straight after apply, before any reading is saved: the
-- existing_rows check expects no row with captured_at set yet.

do $probe$
declare
  v_tracking bigint;
  v_with_captured bigint;
begin
  perform set_config('vcp.verify.distance.tracking_count', 'absent', false);
  perform set_config('vcp.verify.distance.with_captured_at', 'absent', false);

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select count(*)::bigint
      from vcp.schema_migrations m
      where m.version = '20261107120000_vcp_distance_readings'
    $q$ into v_tracking;
    perform set_config('vcp.verify.distance.tracking_count', v_tracking::text, false);
  end if;

  begin
    execute $q$
      select count(*)::bigint from vcp.distance_events d where d.captured_at is not null
    $q$ into v_with_captured;
    perform set_config('vcp.verify.distance.with_captured_at', v_with_captured::text, false);
  exception
    when undefined_column or undefined_table then
      perform set_config('vcp.verify.distance.with_captured_at', 'absent: ' || SQLERRM, false);
  end;
end
$probe$;

with
col_shape as (
  select
    pg_catalog.format_type(a.atttypid, a.atttypmod)
      || ' notnull=' || a.attnotnull::text
      || ' default=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), 'none') as shape,
    pg_catalog.col_description(a.attrelid, a.attnum) is not null as commented
  from pg_catalog.pg_attribute a
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = to_regclass('vcp.distance_events')
    and a.attname = 'captured_at'
    and not a.attisdropped
),
fn as (
  select to_regprocedure('public.vcp_record_distance_readings(uuid, jsonb)') as oid
),
function_meta as (
  select
    case
      when f.oid is null then 'absent'
      else pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''))
    end as observed_md5,
    case
      when f.oid is null then 'absent'
      else
        'args=' || pg_catalog.pg_get_function_identity_arguments(f.oid)
        || ' returns=' || pg_catalog.pg_get_function_result(f.oid)
    end as signature,
    case
      when f.oid is null then 'absent'
      else
        'secdef=' || p.prosecdef::text
        || ' owner=' || pg_catalog.pg_get_userbyid(p.proowner)::text
        || ' search_path_empty=' || (
          exists (
            select 1
            from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) as cfg(val)
            where cfg.val = 'search_path=' or cfg.val = 'search_path=""'
          )
        )::text
        || ' commented=' || (pg_catalog.obj_description(f.oid, 'pg_proc') is not null)::text
    end as meta,
    case
      when f.oid is null then 'absent'
      else
        'anon=' || pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')::text
        || ' authenticated=' || pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE')::text
        || ' service_role=' || pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE')::text
        || ' public=' || (
          exists (
            select 1
            from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'
          )
        )::text
        || ' postgres=' || pg_catalog.has_function_privilege('postgres', f.oid, 'EXECUTE')::text
    end as grants
  from fn f
  left join pg_catalog.pg_proc p on p.oid = f.oid
),
expected_checks as (
  select *
  from (
    values
      (1, 'distance_events_method_chk', 'CHECK ((method = ANY (ARRAY[''marker-camera''::text, ''motion-sensor''::text, ''webcam-ipd''::text, ''catch-trial''::text, ''manual-setup''::text])))'),
      (2, 'distance_events_baseline_ratio_chk', 'CHECK ((baseline_ratio > (0)::double precision))'),
      (3, 'distance_events_absolute_mm_chk', 'CHECK ((absolute_mm > (0)::double precision))'),
      (4, 'distance_events_confidence_chk', 'CHECK (((confidence >= (0)::double precision) AND (confidence <= (1)::double precision)))')
  ) as e(ord, conname, def)
),
cons as (
  select c.conname, pg_catalog.pg_get_constraintdef(c.oid) as def, c.convalidated
  from pg_catalog.pg_constraint c
  where c.conrelid = to_regclass('vcp.distance_events')
),
checks as (
  select
    1 as check_ord,
    'version_registered_once'::text as check_name,
    '1'::text as expected,
    coalesce(current_setting('vcp.verify.distance.tracking_count', true), 'absent')::text as observed,
    case
      when current_setting('vcp.verify.distance.tracking_count', true) = '1' then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    11,
    'column_distance_events_captured_at',
    'timestamp with time zone notnull=false default=none commented=true',
    coalesce((select c.shape || ' commented=' || c.commented::text from col_shape c), 'absent'),
    case
      when (select c.shape from col_shape c) = 'timestamp with time zone notnull=false default=none'
       and (select c.commented from col_shape c) is true
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    20 + e.ord,
    'value_check_' || e.conname,
    e.def || ' validated=true',
    coalesce((select c.def || ' validated=' || c.convalidated::text from cons c where c.conname = e.conname), 'absent'),
    case
      when (select c.def from cons c where c.conname = e.conname) = e.def
       and (select c.convalidated from cons c where c.conname = e.conname) is true
      then 'PASS'
      else 'FAIL'
    end
  from expected_checks e
  union all
  select
    31,
    'body_vcp_record_distance_readings',
    '34c3b0fbead16d641962dab994c2c74b',
    (select m.observed_md5 from function_meta m),
    case when (select m.observed_md5 from function_meta m) = '34c3b0fbead16d641962dab994c2c74b' then 'PASS' else 'FAIL' end
  union all
  select
    32,
    'signature_vcp_record_distance_readings',
    'args=p_session_id uuid, p_readings jsonb returns=integer',
    (select m.signature from function_meta m),
    case
      when (select m.signature from function_meta m) = 'args=p_session_id uuid, p_readings jsonb returns=integer'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    41,
    'meta_vcp_record_distance_readings',
    'secdef=true owner=postgres search_path_empty=true commented=true',
    (select m.meta from function_meta m),
    case
      when (select m.meta from function_meta m) = 'secdef=true owner=postgres search_path_empty=true commented=true'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    51,
    'grants_vcp_record_distance_readings',
    'anon=true authenticated=false service_role=false public=false postgres=true',
    (select m.grants from function_meta m),
    case
      when (select m.grants from function_meta m)
        = 'anon=true authenticated=false service_role=false public=false postgres=true'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    60,
    'existing_rows_have_no_captured_at',
    '0',
    coalesce(current_setting('vcp.verify.distance.with_captured_at', true), 'absent'),
    case
      when current_setting('vcp.verify.distance.with_captured_at', true) = '0' then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    99 as check_ord,
    'verdict'::text as check_name,
    'MIGRATION VERIFIED'::text as expected,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'MIGRATION VERIFIED'
      else 'VERIFICATION FAILED: ' || (
        select pg_catalog.string_agg(c.check_name, ', ' order by c.check_ord)
        from checks c
        where c.result = 'FAIL'
      )
    end::text as observed,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL') then 'PASS'
      else 'FAIL'
    end::text as result
)
select "check", expected, observed, result
from (
  select check_ord, check_name as "check", expected, observed, result from checks
  union all
  select check_ord, check_name, expected, observed, result from verdict
) readout
order by check_ord;
