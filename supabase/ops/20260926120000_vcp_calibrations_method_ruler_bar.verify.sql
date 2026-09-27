-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- DEVELOPER: before pasting, replace the sentinel -1 in developer_input
-- below with the row_count integer from preflight check
-- calibrations_methods_and_row_count (the text after row_count=).
-- Leaving -1 makes calibrations_row_count_unchanged FAIL.
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT.
-- The probe below only SELECTs. A missing relation leaves the GUC at
-- 'absent', and the check that needed it FAILs.

do $probe$
declare
  v_row_count bigint;
  v_tracking bigint;
begin
  perform set_config('vcp.verify.ruler.row_count', 'absent', false);
  perform set_config('vcp.verify.ruler.tracking_count', 'absent', false);

  if to_regclass('vcp.calibrations') is not null then
    execute 'select count(*)::bigint from vcp.calibrations'
      into v_row_count;
    perform set_config('vcp.verify.ruler.row_count', v_row_count::text, false);
  end if;

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select count(*)::bigint
      from vcp.schema_migrations m
      where m.version = '20260926120000_vcp_calibrations_method_ruler_bar'
    $q$ into v_tracking;
    perform set_config('vcp.verify.ruler.tracking_count', v_tracking::text, false);
  end if;
end
$probe$;

with
developer_input as (
  -- REPLACE -1 WITH THE PREFLIGHT row_count.
  select -1::bigint as expected_calibrations_row_count
),
method_chk as (
  select
    pg_catalog.pg_get_constraintdef(c.oid) as def,
    c.convalidated as convalidated
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
    'method_chk_allows_card_id1_and_ruler_bar'::text as check_name,
    'CHECK ((method = ANY (ARRAY[''card-id1''::text, ''ruler-bar''::text])))'::text as expected,
    coalesce((select def from method_chk), 'absent') as observed,
    case
      when (select def from method_chk)
        = 'CHECK ((method = ANY (ARRAY[''card-id1''::text, ''ruler-bar''::text])))'
      then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    2,
    'version_registered_once',
    '1',
    coalesce(current_setting('vcp.verify.ruler.tracking_count', true), 'absent'),
    case
      when current_setting('vcp.verify.ruler.tracking_count', true) = '1'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    3,
    'calibrations_constraint_count_unchanged',
    '11: calibrations_card_width_css_px_chk, calibrations_css_px_per_mm_chk, calibrations_device_pixel_ratio_chk, calibrations_method_chk, calibrations_pkey, calibrations_screen_height_css_px_chk, calibrations_screen_width_css_px_chk, calibrations_session_id_fkey, calibrations_verifications_is_array_chk, calibrations_viewport_height_css_px_chk, calibrations_viewport_width_css_px_chk',
    coalesce(
      (select constraint_count::text || ': ' || constraint_names from constraint_set),
      'absent'
    ),
    case
      when (select constraint_count::text || ': ' || constraint_names from constraint_set)
        = '11: calibrations_card_width_css_px_chk, calibrations_css_px_per_mm_chk, calibrations_device_pixel_ratio_chk, calibrations_method_chk, calibrations_pkey, calibrations_screen_height_css_px_chk, calibrations_screen_width_css_px_chk, calibrations_session_id_fkey, calibrations_verifications_is_array_chk, calibrations_viewport_height_css_px_chk, calibrations_viewport_width_css_px_chk'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    4,
    'method_chk_convalidated',
    'true',
    case
      when (select convalidated from method_chk) is true then 'true'
      when (select convalidated from method_chk) is false then 'false'
      else 'absent'
    end,
    case
      when (select convalidated from method_chk) is true then 'PASS'
      else 'FAIL'
    end
  union all
  select
    5,
    'calibrations_row_count_unchanged',
    (select expected_calibrations_row_count::text from developer_input),
    coalesce(current_setting('vcp.verify.ruler.row_count', true), 'absent'),
    case
      when (select expected_calibrations_row_count from developer_input) >= 0
       and current_setting('vcp.verify.ruler.row_count', true)
         = (select expected_calibrations_row_count::text from developer_input)
      then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    6 as check_ord,
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
