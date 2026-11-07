-- PREFLIGHT. Read only. Paste into the Supabase SQL editor before the apply copy.
-- Version: 20261107120000_vcp_distance_readings
-- Confirms the database is in the state the migration files describe:
-- this version is not registered, the latest registered version is
-- 20261101120000_vcp_landolt, vcp.distance_events exists without a
-- captured_at column, public.vcp_record_distance_readings(uuid, jsonb) does
-- not exist yet, and the four distance_events value checks the new function
-- relies on are present and validated. Also counts the existing rows.
-- SAFE TO APPLY only if every check passes.
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT. Catalogues and
-- to_regclass only; never information_schema.
-- The probe below only SELECTs. A missing relation is a FAIL row, because
-- the table reads are dynamic and skipped when to_regclass returns null.
-- Run as postgres.

do $probe$
declare
  v_registered boolean;
  v_latest text;
  v_rows bigint;
begin
  perform set_config('vcp.preflight.distance.registered', 'absent', false);
  perform set_config('vcp.preflight.distance.latest', 'absent', false);
  perform set_config('vcp.preflight.distance.rows', 'absent', false);

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select exists (
        select 1
        from vcp.schema_migrations m
        where m.version = '20261107120000_vcp_distance_readings'
      )
    $q$ into v_registered;
    perform set_config(
      'vcp.preflight.distance.registered',
      case when v_registered then 'true' else 'false' end,
      false
    );
    execute $q$
      select max(m.version) from vcp.schema_migrations m
    $q$ into v_latest;
    perform set_config('vcp.preflight.distance.latest', coalesce(v_latest, 'none'), false);
  end if;

  if to_regclass('vcp.distance_events') is not null then
    execute 'select count(*)::bigint from vcp.distance_events' into v_rows;
    perform set_config('vcp.preflight.distance.rows', v_rows::text, false);
  end if;
end
$probe$;

with
new_column as (
  select coalesce(pg_catalog.string_agg(a.attname, ', '), 'none') as present
  from pg_catalog.pg_attribute a
  where a.attrelid = to_regclass('vcp.distance_events')
    and a.attname = 'captured_at'
    and not a.attisdropped
),
value_checks as (
  select
    e.ord,
    e.conname,
    (
      select 'present validated=' || c.convalidated::text
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('vcp.distance_events')
        and c.conname = e.conname
    ) as observed
  from (
    values
      (1, 'distance_events_method_chk'),
      (2, 'distance_events_baseline_ratio_chk'),
      (3, 'distance_events_absolute_mm_chk'),
      (4, 'distance_events_confidence_chk')
  ) as e(ord, conname)
),
checks as (
  select
    1 as check_ord,
    'version_not_registered'::text as check_name,
    'false'::text as expected,
    coalesce(current_setting('vcp.preflight.distance.registered', true), 'absent')::text as observed,
    case
      when current_setting('vcp.preflight.distance.registered', true) = 'false' then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    2,
    'latest_registered_version',
    '20261101120000_vcp_landolt',
    coalesce(current_setting('vcp.preflight.distance.latest', true), 'absent'),
    case
      when current_setting('vcp.preflight.distance.latest', true) = '20261101120000_vcp_landolt' then 'PASS'
      else 'FAIL'
    end
  union all
  select
    3,
    'table_distance_events_present',
    'present',
    case when to_regclass('vcp.distance_events') is null then 'absent' else 'present' end,
    case when to_regclass('vcp.distance_events') is null then 'FAIL' else 'PASS' end
  union all
  select
    4,
    'column_captured_at_absent',
    'none',
    (select present from new_column),
    case when (select present from new_column) = 'none' then 'PASS' else 'FAIL' end
  union all
  select
    5,
    'function_vcp_record_distance_readings_absent',
    'absent',
    case
      when to_regprocedure('public.vcp_record_distance_readings(uuid, jsonb)') is null then 'absent'
      else 'present'
    end,
    case
      when to_regprocedure('public.vcp_record_distance_readings(uuid, jsonb)') is null then 'PASS'
      else 'FAIL'
    end
  union all
  select
    5 + v.ord,
    'value_check_' || v.conname,
    'present validated=true',
    coalesce(v.observed, 'absent'),
    case when v.observed = 'present validated=true' then 'PASS' else 'FAIL' end
  from value_checks v
  union all
  select
    10,
    'distance_events_rows_counted',
    'any row count',
    'rows=' || coalesce(current_setting('vcp.preflight.distance.rows', true), 'absent'),
    case
      when current_setting('vcp.preflight.distance.rows', true) ~ '^[0-9]+$' then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    11 as check_ord,
    'verdict'::text as check_name,
    'SAFE TO APPLY'::text as expected,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'SAFE TO APPLY'
      else 'DO NOT APPLY: ' || (
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
