-- VERIFY. Read only. Paste into the Supabase SQL editor after the apply copy.
-- Version: 20261101120000_vcp_landolt
-- Checks the tracking row, the five new columns (type, not null, default,
-- comment), the eight added or widened checks (present, validated, shape),
-- the two new functions (security definer, empty search_path, owner,
-- comment), grants on all four touched functions, the hashes of the four
-- new or replaced bodies against the migration files, that
-- vcp_submit_response is unchanged, and that every existing row took the
-- letter defaults. Behaviour is exercised by the smoketest file.
-- One final result set: check, expected, observed, result, plus a verdict
-- row. The Supabase CLI is never used. No BEGIN/COMMIT.
-- The probe below only SELECTs. A missing relation leaves the GUC at
-- absent, and the check that needed it FAILs.
-- Run straight after apply, before any Landolt C test is run: the
-- existing_rows check expects no landolt rows yet.

do $probe$
declare
  v_tracking bigint;
  v_sessions bigint;
  v_presentations bigint;
  v_responses bigint;
  v_quality bigint;
begin
  perform set_config('vcp.verify.landolt.tracking_count', 'absent', false);
  perform set_config('vcp.verify.landolt.non_default_rows', 'absent', false);

  if to_regclass('vcp.schema_migrations') is not null then
    execute $q$
      select count(*)::bigint
      from vcp.schema_migrations m
      where m.version = '20261101120000_vcp_landolt'
    $q$ into v_tracking;
    perform set_config('vcp.verify.landolt.tracking_count', v_tracking::text, false);
  end if;

  begin
    execute $q$select count(*)::bigint from vcp.sessions s where s.test_mode <> 'letters'$q$
      into v_sessions;
    execute $q$
      select count(*)::bigint
      from vcp.presentations p
      where p.is_practice or p.landolt_direction is not null or p.format = 'landolt'
    $q$ into v_presentations;
    execute $q$
      select count(*)::bigint
      from vcp.responses r
      where r.response_direction is not null or r.response_kind = 'direction'
    $q$ into v_responses;
    execute $q$select count(*)::bigint from vcp.test_quality q where q.test_mode <> 'letters'$q$
      into v_quality;
    perform set_config(
      'vcp.verify.landolt.non_default_rows',
      'sessions=' || v_sessions || ' presentations=' || v_presentations
        || ' responses=' || v_responses || ' test_quality=' || v_quality,
      false
    );
  exception
    when undefined_column or undefined_table then
      perform set_config('vcp.verify.landolt.non_default_rows', 'absent: ' || SQLERRM, false);
  end;
end
$probe$;

with
col_shapes as (
  select
    c.relname || '.' || a.attname as col,
    pg_catalog.format_type(a.atttypid, a.atttypmod)
      || ' notnull=' || a.attnotnull::text
      || ' default=' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), 'none') as shape,
    pg_catalog.col_description(c.oid, a.attnum) is not null as commented
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
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
expected_columns as (
  select *
  from (
    values
      (1, 'sessions.test_mode', 'text notnull=true default=''letters''::text'),
      (2, 'presentations.is_practice', 'boolean notnull=true default=false'),
      (3, 'presentations.landolt_direction', 'text notnull=false default=none'),
      (4, 'responses.response_direction', 'text notnull=false default=none'),
      (5, 'test_quality.test_mode', 'text notnull=true default=''letters''::text')
  ) as e(ord, col, shape)
),
cons as (
  select
    c.conname,
    pg_catalog.pg_get_constraintdef(c.oid) as def,
    c.convalidated
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_namespace n on n.oid = c.connamespace
  where n.nspname = 'vcp'
),
expected_constraints as (
  select *
  from (
    values
      (
        1,
        'sessions_test_mode_chk',
        'CHECK ((test_mode = ANY (ARRAY[''letters''::text, ''landolt''::text])))'
      ),
      (
        2,
        'test_quality_test_mode_chk',
        'CHECK ((test_mode = ANY (ARRAY[''letters''::text, ''landolt''::text])))'
      ),
      (
        3,
        'presentations_format_chk',
        'CHECK ((format = ANY (ARRAY[''single''::text, ''flanked-triplet''::text, ''row''::text, ''landolt''::text])))'
      ),
      (
        4,
        'responses_response_kind_chk',
        'CHECK ((response_kind = ANY (ARRAY[''letter''::text, ''not_sure''::text, ''direction''::text])))'
      )
  ) as e(ord, conname, def)
),
pattern_constraints as (
  select *
  from (
    values
      (5, 'presentations_landolt_direction_chk', array['landolt_direction IS NULL', '''up''', '''down''', '''left''', '''right''']),
      (6, 'responses_response_direction_chk', array['response_direction IS NULL', '''up''', '''down''', '''left''', '''right''']),
      (7, 'presentations_landolt_shape_chk', array['''landolt''', '''C''', 'target_index = 0', 'landolt_direction IS NOT NULL', 'landolt_direction IS NULL', 'is_practice = false']),
      (8, 'responses_kind_letter_consistency_chk', array['''letter''', '''direction''', '''not_sure''', 'response_letter IS NOT NULL', 'response_direction IS NOT NULL', 'response_direction IS NULL'])
  ) as e(ord, conname, needles)
),
fn_list as (
  select
    f.ord,
    f.name,
    f.sig,
    to_regprocedure(f.sig) as oid,
    f.body_md5
  from (
    values
      (1, 'vcp_set_test_mode', 'public.vcp_set_test_mode(uuid, text)', '16938d959420a5ac26494c87ca17bb3a'),
      (2, 'vcp_submit_direction_response', 'public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)', 'd024a3b1720e0fc1ff465beaedff5ff9'),
      (3, 'vcp_record_presentation', 'public.vcp_record_presentation(uuid, jsonb)', '404716ba164c966adccbc6d818c10dc7'),
      (4, 'vcp_upsert_test_quality', 'public.vcp_upsert_test_quality(uuid, text, jsonb)', 'eb49461a89d9839711d3ebfebea5757e'),
      (5, 'vcp_submit_response', 'public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)', '30052e0eb462b3fae43ed9cf11013b86')
  ) as f(ord, name, sig, body_md5)
),
function_meta as (
  select
    f.ord,
    f.name,
    f.body_md5 as expected_md5,
    case
      when f.oid is null then 'absent'
      else pg_catalog.md5(pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''))
    end as observed_md5,
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
  from fn_list f
  left join pg_catalog.pg_proc p on p.oid = f.oid
),
checks as (
  select
    1 as check_ord,
    'version_registered_once'::text as check_name,
    '1'::text as expected,
    coalesce(current_setting('vcp.verify.landolt.tracking_count', true), 'absent')::text as observed,
    case
      when current_setting('vcp.verify.landolt.tracking_count', true) = '1' then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    10 + e.ord,
    'column_' || pg_catalog.replace(e.col, '.', '_'),
    e.shape || ' commented=true',
    coalesce((select c.shape || ' commented=' || c.commented::text from col_shapes c where c.col = e.col), 'absent'),
    case
      when (select c.shape from col_shapes c where c.col = e.col) = e.shape
       and (select c.commented from col_shapes c where c.col = e.col) is true
      then 'PASS'
      else 'FAIL'
    end
  from expected_columns e
  union all
  select
    20 + e.ord,
    'constraint_' || e.conname,
    e.def || ' validated=true',
    coalesce((select c.def || ' validated=' || c.convalidated::text from cons c where c.conname = e.conname), 'absent'),
    case
      when (select c.def from cons c where c.conname = e.conname) = e.def
       and (select c.convalidated from cons c where c.conname = e.conname) is true
      then 'PASS'
      else 'FAIL'
    end
  from expected_constraints e
  union all
  select
    20 + e.ord,
    'constraint_' || e.conname,
    'validated, definition contains: ' || pg_catalog.array_to_string(e.needles, ' | '),
    coalesce((select c.def || ' validated=' || c.convalidated::text from cons c where c.conname = e.conname), 'absent'),
    case
      when (select c.convalidated from cons c where c.conname = e.conname) is true
       and not exists (
         select 1
         from pg_catalog.unnest(e.needles) as needle(val)
         where pg_catalog.strpos((select c.def from cons c where c.conname = e.conname), needle.val) = 0
       )
      then 'PASS'
      else 'FAIL'
    end
  from pattern_constraints e
  union all
  select
    30 + m.ord,
    'body_' || m.name,
    m.expected_md5,
    m.observed_md5,
    case when m.observed_md5 = m.expected_md5 then 'PASS' else 'FAIL' end
  from function_meta m
  union all
  select
    40 + m.ord,
    'meta_' || m.name,
    'secdef=true owner=postgres search_path_empty=true commented=true',
    m.meta,
    case
      when m.meta = 'secdef=true owner=postgres search_path_empty=true commented=true' then 'PASS'
      else 'FAIL'
    end
  from function_meta m
  where m.ord <= 2
  union all
  select
    50 + m.ord,
    'grants_' || m.name,
    'anon=true authenticated=false service_role=false public=false postgres=true',
    m.grants,
    case
      when m.grants = 'anon=true authenticated=false service_role=false public=false postgres=true' then 'PASS'
      else 'FAIL'
    end
  from function_meta m
  union all
  select
    60,
    'existing_rows_took_letter_defaults',
    'sessions=0 presentations=0 responses=0 test_quality=0',
    coalesce(current_setting('vcp.verify.landolt.non_default_rows', true), 'absent'),
    case
      when current_setting('vcp.verify.landolt.non_default_rows', true)
        = 'sessions=0 presentations=0 responses=0 test_quality=0'
      then 'PASS'
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
