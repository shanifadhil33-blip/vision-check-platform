-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20260923120000_vcp_get_answered_trials
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore an explicit
-- delete scoped to the one session id created by check 1. Child rows
-- follow via on delete cascade. The Supabase CLI is never used.
--
-- Scenario: one session; presentations at trial_index 0, 1, 2; response on
-- trial 0; two responses on trial 2 (different client_request_ids;
-- responded_at differs by one second because created_at is identical inside
-- one transaction); trial 1 unanswered. Then call vcp_get_answered_trials as anon.

DO $smoke$
DECLARE
  v_session_id uuid;
  v_pres_0 uuid;
  v_pres_1 uuid;
  v_pres_2 uuid;
  v_row jsonb;
  v_trials jsonb;
  v_trial0 jsonb;
  v_trial2 jsonb;
  v_sqlstate text;
  v_sqlerrm text;
  v_len integer;
  v_indexes text;
  v_optotypes_blob text;
BEGIN
  -- Prove EXECUTE grants, not postgres BYPASSRLS.
  SET LOCAL ROLE anon;

  -- 1. create_session
  BEGIN
    v_session_id := public.vcp_create_session(2000, 'smoketest-answered-trials');
    IF v_session_id IS NULL THEN
      PERFORM set_config('vcp.smoke.at.create_session', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.session_id', '', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.create_session', 'PASS', false);
      PERFORM set_config('vcp.smoke.at.session_id', v_session_id::text, false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.create_session', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.session_id', '', false);
      v_session_id := NULL;
  END;

  IF v_session_id IS NULL THEN
    PERFORM set_config('vcp.smoke.at.record_presentations', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.submit_responses', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.two_rows_trial_0_then_2', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.trial_1_absent', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.trial_2_earliest_and_count', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.trial_0_count_1', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.unknown_raises_V0001', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.anon_cannot_select_presentations', 'FAIL', false);
    RETURN;
  END IF;

  -- 2. record three presentations (trial_index 0, 1, 2)
  BEGIN
    v_pres_0 := public.vcp_record_presentation(
      v_session_id,
      jsonb_build_object(
        'trial_index', 0,
        'eye', 'right',
        'logmar_step_index', 0,
        'requested_letter_height_mm', 8.7,
        'requested_stroke_width_mm', 1.74,
        'requested_letter_height_css_px', 34.8,
        'requested_letter_height_device_px', 69.6,
        'optotypes', jsonb_build_array('C', 'D', 'H'),
        'target_index', 0,
        'format', 'flanked-triplet',
        'distance_mm_requested', 2000
      )
    );
    v_pres_1 := public.vcp_record_presentation(
      v_session_id,
      jsonb_build_object(
        'trial_index', 1,
        'eye', 'right',
        'logmar_step_index', 1,
        'requested_letter_height_mm', 6.9,
        'requested_stroke_width_mm', 1.38,
        'requested_letter_height_css_px', 27.6,
        'requested_letter_height_device_px', 55.2,
        'optotypes', jsonb_build_array('K', 'N', 'O'),
        'target_index', 1,
        'format', 'flanked-triplet',
        'distance_mm_requested', 2000
      )
    );
    v_pres_2 := public.vcp_record_presentation(
      v_session_id,
      jsonb_build_object(
        'trial_index', 2,
        'eye', 'left',
        'logmar_step_index', 2,
        'requested_letter_height_mm', 5.5,
        'requested_stroke_width_mm', 1.1,
        'requested_letter_height_css_px', 22.0,
        'requested_letter_height_device_px', 44.0,
        'optotypes', jsonb_build_array('R', 'S', 'V'),
        'target_index', 0,
        'format', 'flanked-triplet',
        'distance_mm_requested', 2000
      )
    );
    PERFORM set_config('vcp.smoke.at.pres_0', coalesce(v_pres_0::text, ''), false);
    PERFORM set_config('vcp.smoke.at.pres_1', coalesce(v_pres_1::text, ''), false);
    PERFORM set_config('vcp.smoke.at.pres_2', coalesce(v_pres_2::text, ''), false);
    IF v_pres_0 IS NOT NULL AND v_pres_1 IS NOT NULL AND v_pres_2 IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.at.record_presentations', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.record_presentations', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.record_presentations', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.pres_0', SQLSTATE || ':' || SQLERRM, false);
      v_pres_0 := NULL;
      v_pres_1 := NULL;
      v_pres_2 := NULL;
  END;

  -- 3. submit responses: one on trial 0; two on trial 2; none on 1
  BEGIN
    IF v_pres_0 IS NULL OR v_pres_2 IS NULL THEN
      PERFORM set_config('vcp.smoke.at.submit_responses', 'FAIL', false);
    ELSE
      PERFORM public.vcp_submit_response(
        v_session_id,
        v_pres_0,
        'smoke-ans-t0-01',
        'letter',
        'C',
        '2026-01-01 00:00:00+00',
        200
      );
      PERFORM public.vcp_submit_response(
        v_session_id,
        v_pres_2,
        'smoke-ans-t2-01',
        'letter',
        'R',
        '2026-01-01 00:00:10+00',
        210
      );
      PERFORM public.vcp_submit_response(
        v_session_id,
        v_pres_2,
        'smoke-ans-t2-02',
        'letter',
        'S',
        '2026-01-01 00:00:11+00',
        220
      );
      PERFORM set_config('vcp.smoke.at.submit_responses', 'PASS', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.submit_responses', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.submit_err', SQLSTATE || ':' || SQLERRM, false);
  END;

  -- 4–7. call vcp_get_answered_trials and assert shape
  BEGIN
    v_trials := public.vcp_get_answered_trials(v_session_id);
    PERFORM set_config(
      'vcp.smoke.at.trials_json',
      coalesce(v_trials::text, 'null'),
      false
    );

    v_len := coalesce(pg_catalog.jsonb_array_length(v_trials), -1);
    SELECT coalesce(
      pg_catalog.string_agg(t.elem ->> 'trial_index', ',' order by t.ord),
      ''
    )
    INTO v_indexes
    FROM pg_catalog.jsonb_array_elements(coalesce(v_trials, '[]'::jsonb))
      WITH ORDINALITY AS t(elem, ord);

    PERFORM set_config('vcp.smoke.at.row_count', coalesce(v_len::text, ''), false);
    PERFORM set_config('vcp.smoke.at.trial_indexes', coalesce(v_indexes, ''), false);

    -- Check 1: exactly two rows, trial 0 then trial 2
    IF v_len = 2 AND v_indexes = '0,2' THEN
      PERFORM set_config('vcp.smoke.at.two_rows_trial_0_then_2', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.two_rows_trial_0_then_2', 'FAIL', false);
    END IF;

    -- Check 2: trial 1 absent, including its optotypes K,N,O
    v_optotypes_blob := coalesce(v_trials::text, '');
    IF v_indexes !~ '(^|,)1(,|$)'
       AND position('"K"' in v_optotypes_blob) = 0
       AND position('"N"' in v_optotypes_blob) = 0
       AND position('"trial_index": 1' in v_optotypes_blob) = 0
       AND position('"trial_index":1' in v_optotypes_blob) = 0 THEN
      PERFORM set_config('vcp.smoke.at.trial_1_absent', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.trial_1_absent', 'FAIL', false);
    END IF;

    -- Check 3: trial 2 earliest response is R, response_count = 2
    SELECT t.elem
    INTO v_trial2
    FROM pg_catalog.jsonb_array_elements(coalesce(v_trials, '[]'::jsonb)) AS t(elem)
    WHERE (t.elem ->> 'trial_index')::integer = 2
    LIMIT 1;

    PERFORM set_config(
      'vcp.smoke.at.trial_2_letter',
      coalesce(v_trial2 ->> 'response_letter', ''),
      false
    );
    PERFORM set_config(
      'vcp.smoke.at.trial_2_count',
      coalesce(v_trial2 ->> 'response_count', ''),
      false
    );

    IF v_trial2 IS NOT NULL
       AND v_trial2 ->> 'response_letter' = 'R'
       AND (v_trial2 ->> 'response_count')::integer = 2 THEN
      PERFORM set_config('vcp.smoke.at.trial_2_earliest_and_count', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.trial_2_earliest_and_count', 'FAIL', false);
    END IF;

    -- Check 4: trial 0 response_count = 1
    SELECT t.elem
    INTO v_trial0
    FROM pg_catalog.jsonb_array_elements(coalesce(v_trials, '[]'::jsonb)) AS t(elem)
    WHERE (t.elem ->> 'trial_index')::integer = 0
    LIMIT 1;

    PERFORM set_config(
      'vcp.smoke.at.trial_0_count',
      coalesce(v_trial0 ->> 'response_count', ''),
      false
    );

    IF v_trial0 IS NOT NULL
       AND (v_trial0 ->> 'response_count')::integer = 1 THEN
      PERFORM set_config('vcp.smoke.at.trial_0_count_1', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.at.trial_0_count_1', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.two_rows_trial_0_then_2', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.trial_1_absent', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.trial_2_earliest_and_count', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.trial_0_count_1', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.trials_json', SQLSTATE || ':' || SQLERRM, false);
  END;

  -- Check 5: unknown uuid raises V0001
  BEGIN
    v_row := public.vcp_get_answered_trials(pg_catalog.gen_random_uuid());
    PERFORM set_config('vcp.smoke.at.unknown_raises_V0001', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.unknown_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.at.unknown_sqlerrm', coalesce(v_row::text, ''), false);
  EXCEPTION
    WHEN SQLSTATE 'V0001' THEN
      PERFORM set_config('vcp.smoke.at.unknown_raises_V0001', 'PASS', false);
      PERFORM set_config('vcp.smoke.at.unknown_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.at.unknown_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.unknown_raises_V0001', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.unknown_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.at.unknown_sqlerrm', SQLERRM, false);
  END;

  -- Check 6: anon cannot select from vcp.presentations (42501)
  BEGIN
    PERFORM 1 FROM vcp.presentations LIMIT 1;
    PERFORM set_config('vcp.smoke.at.anon_cannot_select_presentations', 'FAIL', false);
    PERFORM set_config('vcp.smoke.at.anon_select_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.at.anon_select_sqlerrm', 'select succeeded', false);
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM set_config('vcp.smoke.at.anon_cannot_select_presentations', 'PASS', false);
      PERFORM set_config('vcp.smoke.at.anon_select_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.at.anon_select_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.at.anon_cannot_select_presentations', 'FAIL', false);
      PERFORM set_config('vcp.smoke.at.anon_select_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.at.anon_select_sqlerrm', SQLERRM, false);
  END;
END
$smoke$;

-- RESET ROLE before cleanup and readout on both PASS and FAIL paths.
-- SET LOCAL ROLE anon from the DO block must not persist into cleanup.
RESET ROLE;

-- Only delete in this file. Scoped to the one session id from check 1.
-- Every child row goes with it through the existing on delete cascade
-- foreign keys. Guard: do nothing if the GUC is null, empty, or not a uuid.
delete from vcp.sessions
where id in (
  select x.sid
  from (
    select current_setting('vcp.smoke.at.session_id', true) as raw
  ) t
  cross join lateral (
    select t.raw::uuid as sid
    where t.raw is not null
      and t.raw <> ''
      and t.raw ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) x
);

select jsonb_pretty(
  checks
  || jsonb_build_object(
    'verdict',
    case
      when not exists (
        select 1
        from jsonb_each(checks) as e(key, value)
        where e.value ->> 'result' = 'FAIL'
      )
      then 'SMOKE TEST PASSED'
      else 'SMOKE TEST FAILED: ' || (
        select string_agg(e.key, ', ' order by e.key)
        from jsonb_each(checks) as e(key, value)
        where e.value ->> 'result' = 'FAIL'
      )
    end
  )
) as recon
from (
  select jsonb_build_object(
    'create_session', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.at.session_id', true),
      'result', current_setting('vcp.smoke.at.create_session', true)
    ),
    'record_presentations', jsonb_build_object(
      'expected', 'three non-null presentation uuids',
      'observed', jsonb_build_object(
        'pres_0', current_setting('vcp.smoke.at.pres_0', true),
        'pres_1', current_setting('vcp.smoke.at.pres_1', true),
        'pres_2', current_setting('vcp.smoke.at.pres_2', true)
      ),
      'result', current_setting('vcp.smoke.at.record_presentations', true)
    ),
    'submit_responses', jsonb_build_object(
      'expected', 'one response on trial 0; two on trial 2',
      'observed', coalesce(current_setting('vcp.smoke.at.submit_err', true), 'ok'),
      'result', current_setting('vcp.smoke.at.submit_responses', true)
    ),
    'two_rows_trial_0_then_2', jsonb_build_object(
      'expected', jsonb_build_object('row_count', 2, 'trial_indexes', '0,2'),
      'observed', jsonb_build_object(
        'row_count', current_setting('vcp.smoke.at.row_count', true),
        'trial_indexes', current_setting('vcp.smoke.at.trial_indexes', true)
      ),
      'result', current_setting('vcp.smoke.at.two_rows_trial_0_then_2', true)
    ),
    'trial_1_absent', jsonb_build_object(
      'expected', 'no trial_index 1 and no K/N optotypes from unanswered trial',
      'observed', jsonb_build_object(
        'trial_indexes', current_setting('vcp.smoke.at.trial_indexes', true),
        'trials_json', current_setting('vcp.smoke.at.trials_json', true)
      ),
      'result', current_setting('vcp.smoke.at.trial_1_absent', true)
    ),
    'trial_2_earliest_and_count', jsonb_build_object(
      'expected', jsonb_build_object('response_letter', 'R', 'response_count', 2),
      'observed', jsonb_build_object(
        'response_letter', current_setting('vcp.smoke.at.trial_2_letter', true),
        'response_count', current_setting('vcp.smoke.at.trial_2_count', true)
      ),
      'result', current_setting('vcp.smoke.at.trial_2_earliest_and_count', true)
    ),
    'trial_0_count_1', jsonb_build_object(
      'expected', 1,
      'observed', current_setting('vcp.smoke.at.trial_0_count', true),
      'result', current_setting('vcp.smoke.at.trial_0_count_1', true)
    ),
    'unknown_raises_V0001', jsonb_build_object(
      'expected', 'V0001',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.at.unknown_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.at.unknown_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.at.unknown_raises_V0001', true)
    ),
    'anon_cannot_select_presentations', jsonb_build_object(
      'expected', '42501',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.at.anon_select_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.at.anon_select_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.at.anon_cannot_select_presentations', true)
    ),
    'cleanup_removed_session', jsonb_build_object(
      'expected', 'session row absent',
      'observed', case
        when nullif(current_setting('vcp.smoke.at.session_id', true), '') is null then
          jsonb_build_object(
            'session_id_guc', current_setting('vcp.smoke.at.session_id', true),
            'row_exists', null,
            'note', 'check 1 never produced a session id'
          )
        when current_setting('vcp.smoke.at.session_id', true)
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then
          jsonb_build_object(
            'session_id_guc', current_setting('vcp.smoke.at.session_id', true),
            'row_exists', null,
            'note', 'session id GUC is not a uuid'
          )
        else
          jsonb_build_object(
            'session_id', current_setting('vcp.smoke.at.session_id', true),
            'row_exists', exists (
              select 1
              from vcp.sessions s
              where s.id = (current_setting('vcp.smoke.at.session_id', true))::uuid
            )
          )
      end,
      'result', case
        when nullif(current_setting('vcp.smoke.at.session_id', true), '') is null then
          'PASS'
        when current_setting('vcp.smoke.at.session_id', true)
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then
          'PASS'
        when exists (
          select 1
          from vcp.sessions s
          where s.id = (current_setting('vcp.smoke.at.session_id', true))::uuid
        ) then
          'FAIL'
        else
          'PASS'
      end
    )
  ) as checks
) as built;
