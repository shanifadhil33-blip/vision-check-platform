-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- Confirms vcp.calibrations exists, this version is not registered,
-- calibrations_method_chk is still the card-id1 equality, the constraint
-- set is the 11 named constraints from 20260908120000, and every stored
-- method is card-id1. Check calibrations_methods_and_row_count reports
-- row_count: copy that integer into the verify file before running verify.
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT. Catalogues and
-- to_regclass only; never information_schema.
-- The probe below only SELECTs. A missing relation is a FAIL row, because
-- the table reads are dynamic and skipped when to_regclass returns null.
-- Run as postgres.

do $probe$
declare
  v_row_count bigint;
  v_bad bigint;
  v_distinct text;
  v_registered boolean;
begin
  perform set_config('vcp.preflight.ruler.row_count', 'absent', false);
  perform set_config('vcp.preflight.ruler.bad', 'absent', false);
  perform set_config('vcp.preflight.ruler.distinct', 'absent', false);
  perform set_config('vcp.preflight.ruler.registered', 'absent', false);

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select exists (
        select 1
        from vcp.schema_migrations m
        where m.version = '20260926120000_vcp_calibrations_method_ruler_bar'
      )
    $q$ into v_registered;
    perform set_config(
      'vcp.preflight.ruler.registered',
      case when v_registered then 'true' else 'false' end,
      false
    );
  end if;

  if to_regclass('vcp.calibrations') is null then
    return;
  end if;

  execute 'select count(*)::bigint from vcp.calibrations'
    into v_row_count;

  execute $q$
    select count(*)::bigint
    from vcp.calibrations c
    where c.method is distinct from 'card-id1'
  $q$ into v_bad;

  execute $q$
    select coalesce(string_agg(d.method, ', ' order by d.method), 'none')
    from (
      select distinct c.method
      from vcp.calibrations c
    ) d
  $q$ into v_distinct;

  perform set_config('vcp.preflight.ruler.row_count', v_row_count::text, false);
  perform set_config('vcp.preflight.ruler.bad', v_bad::text, false);
  perform set_config(
    'vcp.preflight.ruler.distinct',
    coalesce(v_distinct, 'none'),
    false
  );
end
$probe$;

with
method_rows as (
  select
    current_setting('vcp.preflight.ruler.row_count', true) as row_count,
    current_setting('vcp.preflight.ruler.bad', true) as bad_method_count,
    current_setting('vcp.preflight.ruler.distinct', true) as distinct_methods
),
method_chk as (
  select pg_catalog.pg_get_constraintdef(c.oid) as def
  from pg_catalog.pg_constraint c
  where c.conrelid = to_regclass('vcp.calibrations')
    and c.conname = 'calibrations_method_chk'
),
constraint_set as (
  select
    count(*)::bigint as constraint_count,
    coalesce(
      pg_catalog.string_agg(c.conname, ', ' order by c.conname),
      'none'
    ) as constraint_names
  from pg_catalog.pg_constraint c
  where c.conrelid = to_regclass('vcp.calibrations')
),
checks as (
  select
    1 as check_ord,
    'calibrations_table_present'::text as check_name,
    'to_regclass(vcp.calibrations) not null'::text as expected,
    case
      when to_regclass('vcp.calibrations') is null then 'null'
      else to_regclass('vcp.calibrations')::text
    end::text as observed,
    case
      when to_regclass('vcp.calibrations') is not null then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    2,
    'version_unregistered',
    'false (20260926120000_vcp_calibrations_method_ruler_bar not in vcp.schema_migrations)',
    coalesce(current_setting('vcp.preflight.ruler.registered', true), 'absent'),
    case
      when current_setting('vcp.preflight.ruler.registered', true) = 'false'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    3,
    'method_chk_is_card_id1_only',
    'CHECK ((method = ''card-id1''::text))',
    coalesce((select def from method_chk), 'absent'),
    case
      when (select def from method_chk) = 'CHECK ((method = ''card-id1''::text))'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    4,
    'calibrations_constraint_count',
    '11: calibrations_card_width_css_px_chk, calibrations_css_px_per_mm_chk, calibrations_device_pixel_ratio_chk, calibrations_method_chk, calibrations_pkey, calibrations_screen_height_css_px_chk, calibrations_screen_width_css_px_chk, calibrations_session_id_fkey, calibrations_verifications_is_array_chk, calibrations_viewport_height_css_px_chk, calibrations_viewport_width_css_px_chk',
    (select constraint_count::text || ': ' || constraint_names from constraint_set),
    case
      when (select constraint_count::text || ': ' || constraint_names from constraint_set)
        = '11: calibrations_card_width_css_px_chk, calibrations_css_px_per_mm_chk, calibrations_device_pixel_ratio_chk, calibrations_method_chk, calibrations_pkey, calibrations_screen_height_css_px_chk, calibrations_screen_width_css_px_chk, calibrations_session_id_fkey, calibrations_verifications_is_array_chk, calibrations_viewport_height_css_px_chk, calibrations_viewport_width_css_px_chk'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    5,
    'calibrations_methods_and_row_count',
    'bad=0 (every distinct method is card-id1; an empty table is allowed). Copy row_count into the verify literal.',
    (
      select
        'row_count=' || coalesce(m.row_count, 'absent')
        || '; distinct=' || coalesce(m.distinct_methods, 'absent')
        || '; bad=' || coalesce(m.bad_method_count, 'absent')
      from method_rows m
    ),
    case
      when (select bad_method_count from method_rows) = '0'
       and (select row_count from method_rows) is not null
       and (select row_count from method_rows) <> 'absent'
      then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    6 as check_ord,
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
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'PASS'
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
