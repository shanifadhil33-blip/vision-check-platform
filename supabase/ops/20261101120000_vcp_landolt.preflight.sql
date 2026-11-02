-- PREFLIGHT. Read only. Paste into the Supabase SQL editor before the apply copy.
-- Version: 20261101120000_vcp_landolt
-- Confirms the database is in the state the migration files describe:
-- this version is not registered, the five new columns, five new constraint
-- names and two new functions do not exist yet, the three checks that will
-- be widened still hold their 20260908120000 definitions, the live bodies of
-- vcp_record_presentation, vcp_upsert_test_quality and vcp_submit_response
-- hash to the bodies in the migration files (carriage returns removed), and
-- those three functions are executable by anon only. Also counts the rows
-- the new checks will validate.
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT. Catalogues and
-- to_regclass only; never information_schema.
-- The probe below only SELECTs. A missing relation is a FAIL row, because
-- the table reads are dynamic and skipped when to_regclass returns null.
-- Expected body hashes were computed from the migration files:
--   vcp_record_presentation   20260908160000_vcp_rpc_coalesce_fix.sql
--   vcp_upsert_test_quality   20260908160000_vcp_rpc_coalesce_fix.sql
--   vcp_submit_response       20260908140000_vcp_rpc_surface.sql
-- A FAIL on a body hash means the live function differs from the git record.
-- Do not apply; send the observed value back for comparison.
-- Run as postgres.

do $probe$
declare
  v_registered boolean;
  v_bad_formats bigint;
  v_bad_kinds bigint;
  v_presentations bigint;
  v_responses bigint;
begin
  perform set_config('vcp.preflight.landolt.registered', 'absent', false);
  perform set_config('vcp.preflight.landolt.bad_formats', 'absent', false);
  perform set_config('vcp.preflight.landolt.bad_kinds', 'absent', false);
  perform set_config('vcp.preflight.landolt.presentations', 'absent', false);
  perform set_config('vcp.preflight.landolt.responses', 'absent', false);

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select exists (
        select 1
        from vcp.schema_migrations m
        where m.version = '20261101120000_vcp_landolt'
      )
    $q$ into v_registered;
    perform set_config(
      'vcp.preflight.landolt.registered',
      case when v_registered then 'true' else 'false' end,
      false
    );
  end if;

  if to_regclass('vcp.presentations') is not null then
    execute 'select count(*)::bigint from vcp.presentations' into v_presentations;
    execute $q$
      select count(*)::bigint
      from vcp.presentations p
      where p.format not in ('single', 'flanked-triplet', 'row')
    $q$ into v_bad_formats;
    perform set_config('vcp.preflight.landolt.presentations', v_presentations::text, false);
    perform set_config('vcp.preflight.landolt.bad_formats', v_bad_formats::text, false);
  end if;

  if to_regclass('vcp.responses') is not null then
    execute 'select count(*)::bigint from vcp.responses' into v_responses;
    execute $q$
      select count(*)::bigint
      from vcp.responses r
      where r.response_kind not in ('letter', 'not_sure')
         or (r.response_kind = 'letter' and r.response_letter is null)
         or (r.response_kind = 'not_sure' and r.response_letter is not null)
    $q$ into v_bad_kinds;
    perform set_config('vcp.preflight.landolt.responses', v_responses::text, false);
    perform set_config('vcp.preflight.landolt.bad_kinds', v_bad_kinds::text, false);
  end if;
end
$probe$;

with
new_columns as (
  select coalesce(
    pg_catalog.string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname),
    'none'
  ) as present
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vcp'
    and not a.attisdropped
    and (c.relname, a.attname) in (
      ('sessions', 'test_mode'),
      ('presentations', 'is_practice'),
      ('presentations', 'landolt_direction'),
      ('responses', 'response_direction'),
      ('test_quality', 'test_mode')
    )
),
new_constraints as (
  select coalesce(pg_catalog.string_agg(c.conname, ', ' order by c.conname), 'none') as present
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'vcp'
    and c.conname in (
      'sessions_test_mode_chk',
      'presentations_landolt_direction_chk',
      'presentations_landolt_shape_chk',
      'responses_response_direction_chk',
      'test_quality_test_mode_chk'
    )
),
widened as (
  select
    (
      select pg_catalog.pg_get_constraintdef(c.oid)
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('vcp.presentations')
        and c.conname = 'presentations_format_chk'
    ) as format_def,
    (
      select pg_catalog.pg_get_constraintdef(c.oid)
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('vcp.responses')
        and c.conname = 'responses_response_kind_chk'
    ) as kind_def,
    (
      select pg_catalog.pg_get_constraintdef(c.oid)
      from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('vcp.responses')
        and c.conname = 'responses_kind_letter_consistency_chk'
    ) as consistency_def
),
bodies as (
  select
    (
      select pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''))
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.vcp_record_presentation(uuid, jsonb)')
    ) as record_md5,
    (
      select pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''))
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure('public.vcp_upsert_test_quality(uuid, text, jsonb)')
    ) as quality_md5,
    (
      select pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''))
      from pg_catalog.pg_proc p
      where p.oid = to_regprocedure(
        'public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)'
      )
    ) as submit_md5
),
grants as (
  select
    f.sig,
    to_regprocedure(f.sig) as oid,
    case
      when to_regprocedure(f.sig) is null then 'absent'
      else
        'anon=' || pg_catalog.has_function_privilege('anon', to_regprocedure(f.sig), 'EXECUTE')::text
        || ' authenticated=' || pg_catalog.has_function_privilege('authenticated', to_regprocedure(f.sig), 'EXECUTE')::text
        || ' service_role=' || pg_catalog.has_function_privilege('service_role', to_regprocedure(f.sig), 'EXECUTE')::text
        || ' public=' || (
          exists (
            select 1
            from pg_catalog.pg_proc p
            cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
            where p.oid = to_regprocedure(f.sig)
              and a.grantee = 0
              and a.privilege_type = 'EXECUTE'
          )
        )::text
    end as observed
  from (
    values
      ('public.vcp_record_presentation(uuid, jsonb)'),
      ('public.vcp_upsert_test_quality(uuid, text, jsonb)'),
      ('public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)')
  ) as f(sig)
),
checks as (
  select
    1 as check_ord,
    'version_unregistered'::text as check_name,
    'false (20261101120000_vcp_landolt not in vcp.schema_migrations)'::text as expected,
    coalesce(current_setting('vcp.preflight.landolt.registered', true), 'absent')::text as observed,
    case
      when current_setting('vcp.preflight.landolt.registered', true) = 'false' then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    2,
    'tables_present',
    'vcp.sessions, vcp.presentations, vcp.responses, vcp.test_quality all present',
    concat_ws(
      ', ',
      coalesce(to_regclass('vcp.sessions')::text, 'sessions absent'),
      coalesce(to_regclass('vcp.presentations')::text, 'presentations absent'),
      coalesce(to_regclass('vcp.responses')::text, 'responses absent'),
      coalesce(to_regclass('vcp.test_quality')::text, 'test_quality absent')
    ),
    case
      when to_regclass('vcp.sessions') is not null
       and to_regclass('vcp.presentations') is not null
       and to_regclass('vcp.responses') is not null
       and to_regclass('vcp.test_quality') is not null
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    3,
    'new_columns_absent',
    'none',
    (select present from new_columns),
    case when (select present from new_columns) = 'none' then 'PASS' else 'FAIL' end
  union all
  select
    4,
    'new_constraint_names_absent',
    'none',
    (select present from new_constraints),
    case when (select present from new_constraints) = 'none' then 'PASS' else 'FAIL' end
  union all
  select
    5,
    'new_functions_absent',
    'vcp_set_test_mode absent; vcp_submit_direction_response absent',
    'vcp_set_test_mode '
      || case when to_regprocedure('public.vcp_set_test_mode(uuid, text)') is null then 'absent' else 'present' end
      || '; vcp_submit_direction_response '
      || case
        when to_regprocedure(
          'public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)'
        ) is null then 'absent'
        else 'present'
      end,
    case
      when to_regprocedure('public.vcp_set_test_mode(uuid, text)') is null
       and to_regprocedure(
         'public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)'
       ) is null
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    6,
    'presentations_format_chk_is_three_formats',
    'CHECK ((format = ANY (ARRAY[''single''::text, ''flanked-triplet''::text, ''row''::text])))',
    coalesce((select format_def from widened), 'absent'),
    case
      when (select format_def from widened)
        = 'CHECK ((format = ANY (ARRAY[''single''::text, ''flanked-triplet''::text, ''row''::text])))'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    7,
    'responses_response_kind_chk_is_letter_not_sure',
    'CHECK ((response_kind = ANY (ARRAY[''letter''::text, ''not_sure''::text])))',
    coalesce((select kind_def from widened), 'absent'),
    case
      when (select kind_def from widened)
        = 'CHECK ((response_kind = ANY (ARRAY[''letter''::text, ''not_sure''::text])))'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    8,
    'responses_kind_letter_consistency_chk_is_letter_only',
    'present, names letter, not_sure and response_letter, no direction',
    coalesce((select consistency_def from widened), 'absent'),
    case
      when (select consistency_def from widened) like '%''letter''%'
       and (select consistency_def from widened) like '%''not_sure''%'
       and (select consistency_def from widened) like '%response_letter IS NOT NULL%'
       and (select consistency_def from widened) like '%response_letter IS NULL%'
       and (select consistency_def from widened) not like '%direction%'
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    9,
    'live_body_vcp_record_presentation_matches_file',
    '6230495bb5ec30ce5c8527d0a9dc0aec',
    coalesce((select record_md5 from bodies), 'absent'),
    case when (select record_md5 from bodies) = '6230495bb5ec30ce5c8527d0a9dc0aec' then 'PASS' else 'FAIL' end
  union all
  select
    10,
    'live_body_vcp_upsert_test_quality_matches_file',
    '3d2b05778b024a47f2444331213fb98f',
    coalesce((select quality_md5 from bodies), 'absent'),
    case when (select quality_md5 from bodies) = '3d2b05778b024a47f2444331213fb98f' then 'PASS' else 'FAIL' end
  union all
  select
    11,
    'live_body_vcp_submit_response_matches_file',
    '30052e0eb462b3fae43ed9cf11013b86',
    coalesce((select submit_md5 from bodies), 'absent'),
    case when (select submit_md5 from bodies) = '30052e0eb462b3fae43ed9cf11013b86' then 'PASS' else 'FAIL' end
  union all
  select
    12 + (row_number() over (order by g.sig))::integer - 1,
    'grants_' || pg_catalog.split_part(pg_catalog.split_part(g.sig, '(', 1), '.', 2),
    'anon=true authenticated=false service_role=false public=false',
    g.observed,
    case
      when g.observed = 'anon=true authenticated=false service_role=false public=false' then 'PASS'
      else 'FAIL'
    end
  from grants g
  union all
  select
    15,
    'presentations_rows_fit_new_checks',
    'bad_formats=0 (any row count)',
    'rows=' || coalesce(current_setting('vcp.preflight.landolt.presentations', true), 'absent')
      || '; bad_formats=' || coalesce(current_setting('vcp.preflight.landolt.bad_formats', true), 'absent'),
    case
      when current_setting('vcp.preflight.landolt.bad_formats', true) = '0' then 'PASS'
      else 'FAIL'
    end
  union all
  select
    16,
    'responses_rows_fit_new_checks',
    'bad_kinds=0 (any row count)',
    'rows=' || coalesce(current_setting('vcp.preflight.landolt.responses', true), 'absent')
      || '; bad_kinds=' || coalesce(current_setting('vcp.preflight.landolt.bad_kinds', true), 'absent'),
    case
      when current_setting('vcp.preflight.landolt.bad_kinds', true) = '0' then 'PASS'
      else 'FAIL'
    end
),
verdict as (
  select
    17 as check_ord,
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
