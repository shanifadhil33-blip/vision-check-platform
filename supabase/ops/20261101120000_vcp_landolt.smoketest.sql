-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20261101120000_vcp_landolt
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore an explicit delete
-- scoped to the one session id created below. Child rows follow via the
-- existing on delete cascade foreign keys. The Supabase CLI is never used.
--
-- NOTE: calling vcp_create_session also closes any real stuck sessions
-- (status created, paired, running or paused, older than 24 hours) and
-- inserts abandoned_by_sweep events for them. That is the live behaviour of
-- that function. Cleanup below deletes only the session this script created.
--
-- Every call in block 1 runs as anon, so it proves the EXECUTE grants and
-- the table checks, not postgres privileges. Block 2 reads the rows back as
-- the session role. Each check records expected, observed and PASS or FAIL.
-- Negative checks assert the exact SQLSTATE and the constraint name or the
-- error text.

do $smoke$
declare
  v_session_id uuid;
  v_practice_id uuid;
  v_c_id uuid;
  v_letter_id uuid;
  v_id uuid;
  v_text text;
  v_json jsonb;
  v_first jsonb;
  v_key text;
  v_c_base jsonb := jsonb_build_object(
    'eye', 'left',
    'logmar_step_index', 10,
    'requested_letter_height_mm', 43.6335,
    'requested_stroke_width_mm', 8.7267,
    'requested_letter_height_css_px', 174.534,
    'requested_letter_height_device_px', 349.068,
    'optotypes', jsonb_build_array('C'),
    'target_index', 0,
    'format', 'landolt',
    'distance_mm_requested', 3000
  );
  v_letter_base jsonb := jsonb_build_object(
    'eye', 'both',
    'logmar_step_index', 3,
    'requested_letter_height_mm', 8.7,
    'requested_stroke_width_mm', 1.74,
    'requested_letter_height_css_px', 34.8,
    'requested_letter_height_device_px', 69.6,
    'optotypes', jsonb_build_array('D', 'H', 'K'),
    'target_index', 1,
    'format', 'flanked-triplet',
    'distance_mm_requested', 3000
  );
begin
  foreach v_key in array array[
    'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10',
    'c11', 'c12', 'c13', 'c14', 'c15', 'c16', 'c17', 'c18', 'c19', 'c20',
    'c21', 'c22'
  ] loop
    perform set_config('vcp.smoke.landolt.' || v_key, 'FAIL', false);
    perform set_config('vcp.smoke.landolt.' || v_key || '_obs', 'not run', false);
  end loop;
  perform set_config('vcp.smoke.landolt.session_id', '', false);
  perform set_config('vcp.smoke.landolt.practice_id', '', false);
  perform set_config('vcp.smoke.landolt.c_id', '', false);
  perform set_config('vcp.smoke.landolt.letter_id', '', false);

  -- Prove EXECUTE grants, not postgres privileges.
  SET LOCAL ROLE anon;

  -- c01. A new session starts as letters and can be created by anon.
  begin
    v_session_id := public.vcp_create_session(3000, 'smoketest-landolt');
    perform set_config('vcp.smoke.landolt.session_id', coalesce(v_session_id::text, ''), false);
    perform set_config('vcp.smoke.landolt.c01_obs', coalesce(v_session_id::text, 'null'), false);
    if v_session_id is not null then
      perform set_config('vcp.smoke.landolt.c01', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c01_obs', SQLSTATE || ':' || SQLERRM, false);
    return;
  end;
  if v_session_id is null then
    return;
  end if;

  -- c02. vcp_set_test_mode landolt while created returns landolt.
  begin
    v_text := public.vcp_set_test_mode(v_session_id, 'landolt');
    perform set_config('vcp.smoke.landolt.c02_obs', coalesce(v_text, 'null'), false);
    if v_text = 'landolt' then
      perform set_config('vcp.smoke.landolt.c02', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c02_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c03. An unknown test mode fails sessions_test_mode_chk.
  begin
    v_text := public.vcp_set_test_mode(v_session_id, 'bogus');
    perform set_config('vcp.smoke.landolt.c03_obs', 'succeeded:' || coalesce(v_text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c03_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('sessions_test_mode_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c03', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c03_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c04. A practice C is recorded with is_practice and a direction.
  begin
    v_practice_id := public.vcp_record_presentation(
      v_session_id,
      v_c_base || jsonb_build_object('trial_index', 0, 'landolt_direction', 'up', 'is_practice', true)
    );
    perform set_config('vcp.smoke.landolt.practice_id', coalesce(v_practice_id::text, ''), false);
    perform set_config('vcp.smoke.landolt.c04_obs', coalesce(v_practice_id::text, 'null'), false);
    if v_practice_id is not null then
      perform set_config('vcp.smoke.landolt.c04', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c04_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c05. A scored C with no is_practice key is recorded (is_practice false).
  begin
    v_c_id := public.vcp_record_presentation(
      v_session_id,
      v_c_base || jsonb_build_object('trial_index', 1, 'landolt_direction', 'right')
    );
    perform set_config('vcp.smoke.landolt.c_id', coalesce(v_c_id::text, ''), false);
    perform set_config('vcp.smoke.landolt.c05_obs', coalesce(v_c_id::text, 'null'), false);
    if v_c_id is not null then
      perform set_config('vcp.smoke.landolt.c05', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c05_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c06. A landolt row with no direction fails presentations_landolt_shape_chk.
  begin
    v_id := public.vcp_record_presentation(v_session_id, v_c_base || jsonb_build_object('trial_index', 2));
    perform set_config('vcp.smoke.landolt.c06_obs', 'succeeded:' || coalesce(v_id::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c06_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('presentations_landolt_shape_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c06', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c06_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c07. A landolt row whose optotype is not C fails presentations_landolt_shape_chk.
  begin
    v_id := public.vcp_record_presentation(
      v_session_id,
      v_c_base || jsonb_build_object(
        'trial_index', 3, 'landolt_direction', 'up', 'optotypes', jsonb_build_array('D')
      )
    );
    perform set_config('vcp.smoke.landolt.c07_obs', 'succeeded:' || coalesce(v_id::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c07_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('presentations_landolt_shape_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c07', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c07_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c08. A letter row with neither new key is recorded exactly as before.
  begin
    v_letter_id := public.vcp_record_presentation(v_session_id, v_letter_base || jsonb_build_object('trial_index', 4));
    perform set_config('vcp.smoke.landolt.letter_id', coalesce(v_letter_id::text, ''), false);
    perform set_config('vcp.smoke.landolt.c08_obs', coalesce(v_letter_id::text, 'null'), false);
    if v_letter_id is not null then
      perform set_config('vcp.smoke.landolt.c08', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c08_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c09. A letter row with a direction fails presentations_landolt_shape_chk.
  begin
    v_id := public.vcp_record_presentation(
      v_session_id,
      v_letter_base || jsonb_build_object('trial_index', 5, 'landolt_direction', 'up')
    );
    perform set_config('vcp.smoke.landolt.c09_obs', 'succeeded:' || coalesce(v_id::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c09_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('presentations_landolt_shape_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c09', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c09_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c10. A letter row marked practice fails presentations_landolt_shape_chk.
  begin
    v_id := public.vcp_record_presentation(
      v_session_id,
      v_letter_base || jsonb_build_object('trial_index', 6, 'is_practice', true)
    );
    perform set_config('vcp.smoke.landolt.c10_obs', 'succeeded:' || coalesce(v_id::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c10_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('presentations_landolt_shape_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c10', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c10_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c11. A direction answer is stored and returned, duplicate false.
  begin
    v_first := public.vcp_submit_direction_response(
      v_session_id, v_c_id, 'smoke-landolt-0001', 'direction', 'up',
      '2026-11-01T12:00:00Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c11_obs', v_first::text, false);
    if v_first ->> 'response_kind' = 'direction'
      and v_first ->> 'response_direction' = 'up'
      and (v_first ->> 'duplicate')::boolean = false
      and v_first ->> 'id' is not null
      and not (v_first ? 'response_letter') then
      perform set_config('vcp.smoke.landolt.c11', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c11_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c12. The same request again returns the same id, duplicate true.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_c_id, 'smoke-landolt-0001', 'direction', 'up',
      '2026-11-01T12:00:00Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c12_obs', v_json::text, false);
    if v_json ->> 'id' = v_first ->> 'id' and (v_json ->> 'duplicate')::boolean = true then
      perform set_config('vcp.smoke.landolt.c12', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c12_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c13. A not_sure answer to the practice C is stored with no direction.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_practice_id, 'smoke-landolt-0002', 'not_sure', null,
      '2026-11-01T12:00:01Z'::timestamptz, null
    );
    perform set_config('vcp.smoke.landolt.c13_obs', v_json::text, false);
    if v_json ->> 'response_kind' = 'not_sure'
      and v_json -> 'response_direction' = 'null'::jsonb
      and (v_json ->> 'duplicate')::boolean = false then
      perform set_config('vcp.smoke.landolt.c13', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c13_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c14. Kind direction with no direction fails responses_kind_letter_consistency_chk.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_c_id, 'smoke-landolt-0003', 'direction', null,
      '2026-11-01T12:00:02Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c14_obs', 'succeeded:' || coalesce(v_json::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c14_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('responses_kind_letter_consistency_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c14', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c14_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c15. Kind letter through the direction function fails responses_kind_letter_consistency_chk.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_c_id, 'smoke-landolt-0004', 'letter', 'up',
      '2026-11-01T12:00:03Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c15_obs', 'succeeded:' || coalesce(v_json::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c15_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('responses_kind_letter_consistency_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c15', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c15_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c16. An unknown direction fails responses_response_direction_chk.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_c_id, 'smoke-landolt-0005', 'direction', 'north',
      '2026-11-01T12:00:04Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c16_obs', 'succeeded:' || coalesce(v_json::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c16_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('responses_response_direction_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c16', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c16_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c17. A direction answer to a letter presentation fails with V0003.
  begin
    v_json := public.vcp_submit_direction_response(
      v_session_id, v_letter_id, 'smoke-landolt-0006', 'direction', 'up',
      '2026-11-01T12:00:05Z'::timestamptz, 900
    );
    perform set_config('vcp.smoke.landolt.c17_obs', 'succeeded:' || coalesce(v_json::text, 'null'), false);
  exception
    when SQLSTATE 'V0003' then
      perform set_config('vcp.smoke.landolt.c17_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('Landolt C presentation' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c17', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c17_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c18. The letter function is unchanged: a letter answer still works.
  begin
    v_json := public.vcp_submit_response(
      v_session_id, v_letter_id, 'smoke-landolt-0007', 'letter', 'H',
      '2026-11-01T12:00:06Z'::timestamptz, 800
    );
    perform set_config('vcp.smoke.landolt.c18_obs', v_json::text, false);
    if v_json ->> 'response_kind' = 'letter'
      and v_json ->> 'response_letter' = 'H'
      and (v_json ->> 'duplicate')::boolean = false
      and not (v_json ? 'response_direction') then
      perform set_config('vcp.smoke.landolt.c18', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c18_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c19. A quality row for the left eye with test_mode landolt.
  begin
    v_id := public.vcp_upsert_test_quality(
      v_session_id, 'left',
      jsonb_build_object('distance_requested_mm', 3000, 'test_mode', 'landolt', 'bounded_result_reason', 'inconsistent')
    );
    perform set_config('vcp.smoke.landolt.c19_obs', coalesce(v_id::text, 'null'), false);
    if v_id is not null then
      perform set_config('vcp.smoke.landolt.c19', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c19_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c20. A quality row with no test_mode key, as the letter page sends it.
  begin
    v_id := public.vcp_upsert_test_quality(
      v_session_id, 'both', jsonb_build_object('distance_requested_mm', 3000)
    );
    perform set_config('vcp.smoke.landolt.c20_obs', coalesce(v_id::text, 'null'), false);
    if v_id is not null then
      perform set_config('vcp.smoke.landolt.c20', 'PASS', false);
    end if;
  exception when others then
    perform set_config('vcp.smoke.landolt.c20_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c21. An unknown quality test_mode fails test_quality_test_mode_chk.
  begin
    v_id := public.vcp_upsert_test_quality(
      v_session_id, 'right', jsonb_build_object('distance_requested_mm', 3000, 'test_mode', 'bogus')
    );
    perform set_config('vcp.smoke.landolt.c21_obs', 'succeeded:' || coalesce(v_id::text, 'null'), false);
  exception
    when SQLSTATE '23514' then
      perform set_config('vcp.smoke.landolt.c21_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('test_quality_test_mode_chk' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c21', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c21_obs', SQLSTATE || ':' || SQLERRM, false);
  end;

  -- c22. After pairing, vcp_set_test_mode fails with V0007.
  --      vcp_set_test_mode did not bump version, so the session is still at 0.
  begin
    v_json := public.vcp_pair_session(v_session_id, 0);
    v_text := public.vcp_set_test_mode(v_session_id, 'letters');
    perform set_config('vcp.smoke.landolt.c22_obs', 'succeeded:' || coalesce(v_text, 'null'), false);
  exception
    when SQLSTATE 'V0007' then
      perform set_config('vcp.smoke.landolt.c22_obs', SQLSTATE || ':' || SQLERRM, false);
      if position('paired' in SQLERRM) > 0 then
        perform set_config('vcp.smoke.landolt.c22', 'PASS', false);
      end if;
    when others then
      perform set_config('vcp.smoke.landolt.c22_obs', SQLSTATE || ':' || SQLERRM, false);
  end;
end
$smoke$;

-- anon has no SELECT or DELETE on any vcp table, so the read back and the
-- cleanup run as the session role. RESET ROLE also clears SET LOCAL ROLE anon.
RESET ROLE;

do $readback$
declare
  v_session_id uuid;
  v_text text;
begin
  foreach v_text in array array['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] loop
    perform set_config('vcp.smoke.landolt.' || v_text, 'FAIL', false);
    perform set_config('vcp.smoke.landolt.' || v_text || '_obs', 'not run', false);
  end loop;
  if current_setting('vcp.smoke.landolt.session_id', true) !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return;
  end if;
  v_session_id := current_setting('vcp.smoke.landolt.session_id', true)::uuid;

  -- r1. The session row holds test_mode landolt.
  select s.test_mode into v_text from vcp.sessions s where s.id = v_session_id;
  perform set_config('vcp.smoke.landolt.r1_obs', coalesce(v_text, 'null'), false);
  if v_text = 'landolt' then
    perform set_config('vcp.smoke.landolt.r1', 'PASS', false);
  end if;

  -- r2. Rows in trial order: practice C, scored C, letter row.
  select string_agg(
    p.trial_index || ':' || p.format || ':' || array_to_string(p.optotypes, '') || ':'
      || p.target_index || ':' || coalesce(p.landolt_direction, 'null') || ':' || p.is_practice::text,
    ' ' order by p.trial_index
  )
  into v_text
  from vcp.presentations p
  where p.session_id = v_session_id;
  perform set_config('vcp.smoke.landolt.r2_obs', coalesce(v_text, 'null'), false);
  if v_text = '0:landolt:C:0:up:true 1:landolt:C:0:right:false 4:flanked-triplet:DHK:1:null:false' then
    perform set_config('vcp.smoke.landolt.r2', 'PASS', false);
  end if;

  -- r3. Responses: one direction answer up, one not_sure, one letter H, nothing else.
  select string_agg(
    r.client_request_id || ':' || r.response_kind || ':' || coalesce(r.response_direction, 'null')
      || ':' || coalesce(r.response_letter, 'null'),
    ' ' order by r.client_request_id
  )
  into v_text
  from vcp.responses r
  where r.session_id = v_session_id;
  perform set_config('vcp.smoke.landolt.r3_obs', coalesce(v_text, 'null'), false);
  if v_text = 'smoke-landolt-0001:direction:up:null smoke-landolt-0002:not_sure:null:null smoke-landolt-0007:letter:null:H' then
    perform set_config('vcp.smoke.landolt.r3', 'PASS', false);
  end if;

  -- r4. Quality rows: left is landolt, both is letters.
  select string_agg(q.eye || ':' || q.test_mode, ' ' order by q.eye)
  into v_text
  from vcp.test_quality q
  where q.session_id = v_session_id;
  perform set_config('vcp.smoke.landolt.r4_obs', coalesce(v_text, 'null'), false);
  if v_text = 'both:letters left:landolt' then
    perform set_config('vcp.smoke.landolt.r4', 'PASS', false);
  end if;

  -- r5. vcp_set_test_mode did not change version. The pairing in c22 is undone with its caught exception, so the session stays at version 0, status created.
  select s.version::text || ':' || s.status into v_text from vcp.sessions s where s.id = v_session_id;
  perform set_config('vcp.smoke.landolt.r5_obs', coalesce(v_text, 'null'), false);
  if v_text = '0:created' then
    perform set_config('vcp.smoke.landolt.r5', 'PASS', false);
  end if;

  -- r6. The session was created with distance 3000 and the smoketest build.
  select s.distance_mm_requested::text || ':' || s.client_build into v_text
  from vcp.sessions s where s.id = v_session_id;
  perform set_config('vcp.smoke.landolt.r6_obs', coalesce(v_text, 'null'), false);
  if v_text = '3000:smoketest-landolt' then
    perform set_config('vcp.smoke.landolt.r6', 'PASS', false);
  end if;
end
$readback$;

-- This delete leaves zero rows from this script. Every child row of the
-- session goes with it through the existing on delete cascade foreign keys.
-- Guard: do nothing if the GUC is null, empty, or not a uuid.
delete from vcp.sessions
where id in (
  select x.sid
  from (
    select current_setting('vcp.smoke.landolt.session_id', true) as raw
  ) t
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
    ('c01', 'non-null session uuid'),
    ('c02', 'landolt'),
    ('c03', '23514 sessions_test_mode_chk'),
    ('c04', 'non-null presentation uuid'),
    ('c05', 'non-null presentation uuid'),
    ('c06', '23514 presentations_landolt_shape_chk'),
    ('c07', '23514 presentations_landolt_shape_chk'),
    ('c08', 'non-null presentation uuid'),
    ('c09', '23514 presentations_landolt_shape_chk'),
    ('c10', '23514 presentations_landolt_shape_chk'),
    ('c11', 'response_kind direction, response_direction up, duplicate false, no response_letter key'),
    ('c12', 'same id as c11, duplicate true'),
    ('c13', 'response_kind not_sure, response_direction null, duplicate false'),
    ('c14', '23514 responses_kind_letter_consistency_chk'),
    ('c15', '23514 responses_kind_letter_consistency_chk'),
    ('c16', '23514 responses_response_direction_chk'),
    ('c17', 'V0003 Landolt C presentation not found'),
    ('c18', 'response_kind letter, response_letter H, duplicate false, no response_direction key'),
    ('c19', 'non-null quality uuid'),
    ('c20', 'non-null quality uuid'),
    ('c21', '23514 test_quality_test_mode_chk'),
    ('c22', 'V0007 naming status paired'),
    ('r1', 'landolt'),
    ('r2', '0:landolt:C:0:up:true 1:landolt:C:0:right:false 4:flanked-triplet:DHK:1:null:false'),
    ('r3', 'smoke-landolt-0001:direction:up:null smoke-landolt-0002:not_sure:null:null smoke-landolt-0007:letter:null:H'),
    ('r4', 'both:letters left:landolt'),
    ('r5', '0:created'),
    ('r6', '3000:smoketest-landolt')
),
results as (
  select
    e.key,
    e.expected,
    coalesce(current_setting('vcp.smoke.landolt.' || e.key || '_obs', true), 'not run') as observed,
    coalesce(current_setting('vcp.smoke.landolt.' || e.key, true), 'FAIL') as result
  from expected e
  union all
  select
    'cleanup',
    'session and its child rows absent',
    current_setting('vcp.smoke.landolt.session_id', true),
    case
      when nullif(current_setting('vcp.smoke.landolt.session_id', true), '') is null then 'FAIL'
      when exists (
        select 1 from vcp.sessions s
        where s.id = current_setting('vcp.smoke.landolt.session_id', true)::uuid
      )
      or exists (
        select 1 from vcp.presentations p
        where p.session_id = current_setting('vcp.smoke.landolt.session_id', true)::uuid
      )
      or exists (
        select 1 from vcp.responses r
        where r.session_id = current_setting('vcp.smoke.landolt.session_id', true)::uuid
      )
      or exists (
        select 1 from vcp.test_quality q
        where q.session_id = current_setting('vcp.smoke.landolt.session_id', true)::uuid
      )
      or exists (
        select 1 from vcp.session_events v
        where v.session_id = current_setting('vcp.smoke.landolt.session_id', true)::uuid
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
