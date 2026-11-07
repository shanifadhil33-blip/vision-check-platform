-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20261107120000_vcp_distance_readings
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- It creates two test sessions of its own: the main one, and an other one
-- that holds a presentation of another session and is then closed.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore an explicit delete
-- of each of the two session ids created below, and nothing else. Child
-- rows follow via the existing on delete cascade foreign keys.
-- The Supabase CLI is never used.
--
-- NOTE: calling vcp_create_session also closes any real stuck sessions
-- (status created, paired, running or paused, older than 24 hours) and
-- inserts abandoned_by_sweep events for them. That is the live behaviour of
-- that function. Cleanup below deletes only the sessions this script created.
--
-- Setup runs as anon and outside any exception block. If a setup call
-- fails, the whole block fails, nothing it wrote is kept, the script stops
-- with that error, and no check reads PASS.
--
-- Every call in block 1 runs as anon, so it proves the EXECUTE grants and
-- the table checks, not postgres privileges. Block 2 reads the rows back as
-- the session role. Each check records expected, observed and PASS or FAIL.
-- One check per refusal code; V0008 has one check per refusal reason.
--
-- EXPECTED RESULTS (one final result set, every row PASS):
--   c01  2, two readings saved into the open main session
--   c02  V0001, unknown session id
--   c03  V0003, presentation_id of the other session
--   c04  V0004, a reading without captured_at
--   c05  V0008, p_readings is an object, not an array
--   c06  V0008, empty array
--   c07  V0008, 51 readings
--   c08  V0008, the other session is complete
--   c09  23514 distance_events_baseline_ratio_chk, baseline_ratio 0
--   r1   2, only the c01 rows exist for the main session
--   r2   the two c01 rows with their link, confidence, method and time
--   r3   0, nothing was written for the other session
--   cleanup  both sessions and their child rows absent
--   verdict  SMOKE TEST PASSED

do $smoke$
declare
  v_session_id uuid;
  v_other_id uuid;
  v_presentation_id uuid;
  v_other_presentation_id uuid;
  v_count integer;
  v_json jsonb;
  v_key text;
  v_reading jsonb := jsonb_build_object(
    'method', 'marker-camera',
    'raw_value', 50.2,
    'baseline_ratio', 1.02,
    'absolute_mm', 3060,
    'flagged', false,
    'captured_at', '2026-11-07T12:00:00Z'
  );
  v_letter jsonb := jsonb_build_object(
    'eye', 'both',
    'logmar_step_index', 3,
    'requested_letter_height_mm', 8.7,
    'requested_stroke_width_mm', 1.74,
    'requested_letter_height_css_px', 34.8,
    'requested_letter_height_device_px', 69.6,
    'optotypes', jsonb_build_array('D', 'H', 'K'),
    'target_index', 1,
    'format', 'flanked-triplet',
    'distance_mm_requested', 3000,
    'trial_index', 0
  );
begin
  foreach v_key in array array[
    'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09'
  ] loop
    perform set_config('vcp.smoke.distance.' || v_key, 'FAIL', false);
    perform set_config('vcp.smoke.distance.' || v_key || '_obs', 'not run', false);
  end loop;
  perform set_config('vcp.smoke.distance.session_id', '', false);
  perform set_config('vcp.smoke.distance.other_id', '', false);
  perform set_config('vcp.smoke.distance.presentation_id', '', false);

  -- Prove EXECUTE grants, not postgres privileges.
  SET LOCAL ROLE anon;

  -- Setup, outside any exception block.
  v_session_id := public.vcp_create_session(3000, 'smoketest-distance');
  perform set_config('vcp.smoke.distance.session_id', v_session_id::text, false);
  v_other_id := public.vcp_create_session(3000, 'smoketest-distance-other');
  perform set_config('vcp.smoke.distance.other_id', v_other_id::text, false);
  v_presentation_id := public.vcp_record_presentation(v_session_id, v_letter);
  perform set_config('vcp.smoke.distance.presentation_id', v_presentation_id::text, false);
  v_other_presentation_id := public.vcp_record_presentation(v_other_id, v_letter);
  v_json := public.vcp_set_session_state(v_other_id, 0, 'complete', '{}'::jsonb);

  -- c01. Two readings into the open main session return 2. The first links
  --      a presentation of this session and has a confidence; the second has
  --      neither optional key.
  begin
    v_count := public.vcp_record_distance_readings(
      v_session_id,
      jsonb_build_array(
        v_reading || jsonb_build_object('presentation_id', v_presentation_id, 'confidence', 0.9),
        v_reading || jsonb_build_object('captured_at', '2026-11-07T12:00:01Z')
      )
    );
    perform set_config('vcp.smoke.distance.c01_obs', coalesce(v_count::text, 'null'), false);
    if v_count = 2 then
      perform set_config('vcp.smoke.distance.c01', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.distance.c01_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c02. An unknown session id fails with V0001.
  begin
    v_count := public.vcp_record_distance_readings(gen_random_uuid(), jsonb_build_array(v_reading));
    perform set_config('vcp.smoke.distance.c02_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0001' then
      perform set_config('vcp.smoke.distance.c02_obs', SQLSTATE || ':' || SQLERRM, false);
      perform set_config('vcp.smoke.distance.c02', 'PASS', false);
    when others then
      perform set_config('vcp.smoke.distance.c02_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c03. A presentation of the other session fails with V0003. The first
  --      reading is valid, so r1 also proves nothing of this batch was written.
  begin
    v_count := public.vcp_record_distance_readings(
      v_session_id,
      jsonb_build_array(
        v_reading,
        v_reading || jsonb_build_object('presentation_id', v_other_presentation_id)
      )
    );
    perform set_config('vcp.smoke.distance.c03_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0003' then
      perform set_config('vcp.smoke.distance.c03_obs', SQLSTATE || ':' || SQLERRM, false);
      perform set_config('vcp.smoke.distance.c03', 'PASS', false);
    when others then
      perform set_config('vcp.smoke.distance.c03_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c04. A reading without captured_at fails with V0004 naming the key.
  begin
    v_count := public.vcp_record_distance_readings(
      v_session_id,
      jsonb_build_array(v_reading, v_reading - 'captured_at')
    );
    perform set_config('vcp.smoke.distance.c04_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0004' then
      perform set_config('vcp.smoke.distance.c04_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('captured_at' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c04', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c04_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c05. An object in place of an array fails with V0008.
  begin
    v_count := public.vcp_record_distance_readings(v_session_id, v_reading);
    perform set_config('vcp.smoke.distance.c05_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0008' then
      perform set_config('vcp.smoke.distance.c05_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('not an array' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c05', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c05_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c06. An empty array fails with V0008.
  begin
    v_count := public.vcp_record_distance_readings(v_session_id, '[]'::jsonb);
    perform set_config('vcp.smoke.distance.c06_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0008' then
      perform set_config('vcp.smoke.distance.c06_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('0 readings' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c06', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c06_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c07. 51 readings fail with V0008.
  begin
    v_count := public.vcp_record_distance_readings(
      v_session_id,
      (select jsonb_agg(v_reading) from generate_series(1, 51))
    );
    perform set_config('vcp.smoke.distance.c07_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0008' then
      perform set_config('vcp.smoke.distance.c07_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('51 readings' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c07', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c07_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c08. A valid reading into the completed other session fails with V0008.
  begin
    v_count := public.vcp_record_distance_readings(v_other_id, jsonb_build_array(v_reading));
    perform set_config('vcp.smoke.distance.c08_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE 'V0008' then
      perform set_config('vcp.smoke.distance.c08_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('complete' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c08', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c08_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c09. baseline_ratio 0 is refused by the table check, not by the function.
  begin
    v_count := public.vcp_record_distance_readings(
      v_session_id,
      jsonb_build_array(v_reading || jsonb_build_object('baseline_ratio', 0))
    );
    perform set_config('vcp.smoke.distance.c09_obs', 'succeeded:' || coalesce(v_count::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.distance.c09_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('distance_events_baseline_ratio_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.distance.c09', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.distance.c09_obs', SQLSTATE || ':' || SQLERRM, false);
  end;
end
$smoke$;

-- anon has no SELECT or DELETE on any vcp table, so the read back and the
-- cleanup run as the session role. RESET ROLE also clears SET LOCAL ROLE anon.
RESET ROLE;

do $readback$
declare
  v_session_id uuid := nullif(current_setting('vcp.smoke.distance.session_id', true), '')::uuid;
  v_other_id uuid := nullif(current_setting('vcp.smoke.distance.other_id', true), '')::uuid;
  v_presentation_id uuid := nullif(current_setting('vcp.smoke.distance.presentation_id', true), '')::uuid;
  v_text text;
begin
  foreach v_text in array array['r1', 'r2', 'r3'] loop
    perform set_config('vcp.smoke.distance.' || v_text, 'FAIL', false);
    perform set_config('vcp.smoke.distance.' || v_text || '_obs', 'not run', false);
  end loop;

  -- r1. Only the two c01 rows exist for the main session.
  select count(*)::text into v_text from vcp.distance_events d where d.session_id = v_session_id;
  perform set_config('vcp.smoke.distance.r1_obs', coalesce(v_text, 'null'), false);
  if v_text = '2' then
    perform set_config('vcp.smoke.distance.r1', 'PASS', false);
  end if;

  -- r2. The two rows, oldest captured first.
  select string_agg(
    'linked=' || (d.presentation_id is not distinct from v_presentation_id)::text
      || ' confidence=' || coalesce(d.confidence::text, 'null')
      || ' method=' || d.method
      || ' flagged=' || d.flagged::text
      || ' epoch=' || extract(epoch from d.captured_at)::bigint::text,
    ' | ' order by d.captured_at
  )
  into v_text
  from vcp.distance_events d
  where d.session_id = v_session_id;
  perform set_config('vcp.smoke.distance.r2_obs', coalesce(v_text, 'null'), false);
  if v_text = 'linked=true confidence=0.9 method=marker-camera flagged=false epoch=1794052800'
    || ' | linked=false confidence=null method=marker-camera flagged=false epoch=1794052801'
  then
    perform set_config('vcp.smoke.distance.r2', 'PASS', false);
  end if;

  -- r3. Nothing was written for the other session.
  select count(*)::text into v_text from vcp.distance_events d where d.session_id = v_other_id;
  perform set_config('vcp.smoke.distance.r3_obs', coalesce(v_text, 'null'), false);
  if v_text = '0' then
    perform set_config('vcp.smoke.distance.r3', 'PASS', false);
  end if;
end
$readback$;

-- Cleanup. Each delete removes exactly one session this script created, by
-- its id. Every child row goes with it through the existing on delete
-- cascade foreign keys. Guard: do nothing if the GUC is null, empty, or not
-- a uuid.
delete from vcp.sessions
where id in (
  select x.sid
  from (select current_setting('vcp.smoke.distance.session_id', true) as raw) t
  cross join lateral (
    select t.raw::uuid as sid
    where t.raw is not null
      and t.raw <> ''
      and t.raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) x
);

delete from vcp.sessions
where id in (
  select x.sid
  from (select current_setting('vcp.smoke.distance.other_id', true) as raw) t
  cross join lateral (
    select t.raw::uuid as sid
    where t.raw is not null
      and t.raw <> ''
      and t.raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) x
);

with
expected(key, expected) as (
  values
    ('c01', '2'),
    ('c02', 'V0001 session not found'),
    ('c03', 'V0003 presentation of another session'),
    ('c04', 'V0004 naming captured_at'),
    ('c05', 'V0008 not an array'),
    ('c06', 'V0008 0 readings'),
    ('c07', 'V0008 51 readings'),
    ('c08', 'V0008 session complete'),
    ('c09', '23514 distance_events_baseline_ratio_chk'),
    ('r1', '2'),
    ('r2', 'linked=true confidence=0.9 method=marker-camera flagged=false epoch=1794052800 | linked=false confidence=null method=marker-camera flagged=false epoch=1794052801'),
    ('r3', '0')
),
own(sid) as (
  select nullif(current_setting('vcp.smoke.distance.session_id', true), '')
  union all
  select nullif(current_setting('vcp.smoke.distance.other_id', true), '')
),
results as (
  select
    e.key,
    e.expected,
    coalesce(current_setting('vcp.smoke.distance.' || e.key || '_obs', true), 'not run') as observed,
    coalesce(current_setting('vcp.smoke.distance.' || e.key, true), 'FAIL') as result
  from expected e
  union all
  select
    'cleanup',
    'both sessions and their child rows absent',
    (select string_agg(coalesce(o.sid, 'null'), ' ') from own o),
    case
      when exists (select 1 from own o where o.sid is null) then 'FAIL'
      when exists (
        select 1 from vcp.sessions s where s.id in (select o.sid::uuid from own o)
      )
      or exists (
        select 1 from vcp.presentations p where p.session_id in (select o.sid::uuid from own o)
      )
      or exists (
        select 1 from vcp.distance_events d where d.session_id in (select o.sid::uuid from own o)
      )
      or exists (
        select 1 from vcp.session_events v where v.session_id in (select o.sid::uuid from own o)
      )
      then 'FAIL'
      else 'PASS'
    end
)
select key as "check", expected, observed, result
from results
union all
select
  'verdict',
  'SMOKE TEST PASSED',
  case
    when not exists (select 1 from results r where r.result <> 'PASS') then 'SMOKE TEST PASSED'
    else 'SMOKE TEST FAILED: ' || (
      select string_agg(r.key, ', ' order by r.key) from results r where r.result <> 'PASS'
    )
  end,
  case when not exists (select 1 from results r where r.result <> 'PASS') then 'PASS' else 'FAIL' end
order by 1;
