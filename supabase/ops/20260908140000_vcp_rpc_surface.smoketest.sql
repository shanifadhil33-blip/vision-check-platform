-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20260908140000_vcp_rpc_surface
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore an explicit
-- delete scoped to the one session id created by check 1. Child rows
-- follow via on delete cascade. The Supabase CLI is never used.

DO $smoke$
DECLARE
  v_session_id uuid;
  v_presentation_id uuid;
  v_response_id_first uuid;
  v_response_id_second uuid;
  v_quality_id_first uuid;
  v_quality_id_second uuid;
  v_calibration_id uuid;
  v_event_id uuid;
  v_wrong_session_id uuid;
  v_row jsonb;
  v_status text;
  v_version integer;
  v_duplicate boolean;
  v_distance_requested_mm integer;
  v_not_sure_count integer;
  v_reversals integer;
  v_sqlstate text;
  v_sqlerrm text;
BEGIN
  -- Prove EXECUTE grants, not postgres BYPASSRLS.
  SET LOCAL ROLE anon;

  -- 1. create_session_returns_uuid
  BEGIN
    v_session_id := public.vcp_create_session(2000, 'smoketest');
    IF v_session_id IS NULL THEN
      PERFORM set_config('vcp.smoke.create_session_returns_uuid', 'FAIL', false);
    ELSE
      PERFORM set_config('vcp.smoke.create_session_returns_uuid', 'PASS', false);
      PERFORM set_config('vcp.smoke.session_id', v_session_id::text, false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.create_session_returns_uuid', 'FAIL', false);
      PERFORM set_config('vcp.smoke.session_id', '', false);
      v_session_id := NULL;
  END;

  IF v_session_id IS NULL THEN
    -- Remaining checks cannot run without a session; mark them FAIL and exit.
    PERFORM set_config('vcp.smoke.get_session_returns_created', 'FAIL', false);
    PERFORM set_config('vcp.smoke.pair_session_increments_version', 'FAIL', false);
    PERFORM set_config('vcp.smoke.pair_session_stale_version_raises_V0002', 'FAIL', false);
    PERFORM set_config('vcp.smoke.get_session_unknown_id_raises_V0001', 'FAIL', false);
    PERFORM set_config('vcp.smoke.attach_calibration_missing_key_raises_V0004', 'FAIL', false);
    PERFORM set_config('vcp.smoke.attach_calibration_accepts_full_object', 'FAIL', false);
    PERFORM set_config('vcp.smoke.record_presentation_returns_uuid', 'FAIL', false);
    PERFORM set_config('vcp.smoke.record_presentation_rejects_non_sloan_letter', 'FAIL', false);
    PERFORM set_config('vcp.smoke.record_rendered_wrong_session_raises_V0005', 'FAIL', false);
    PERFORM set_config('vcp.smoke.submit_response_first_call', 'FAIL', false);
    PERFORM set_config('vcp.smoke.submit_response_is_idempotent', 'FAIL', false);
    PERFORM set_config('vcp.smoke.submit_response_not_sure_with_letter_rejected', 'FAIL', false);
    PERFORM set_config('vcp.smoke.upsert_test_quality_insert', 'FAIL', false);
    PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'FAIL', false);
    PERFORM set_config('vcp.smoke.append_event_returns_uuid', 'FAIL', false);
    PERFORM set_config('vcp.smoke.anon_still_cannot_read_tables_directly', 'FAIL', false);
    RETURN;
  END IF;

  -- 2. get_session_returns_created
  BEGIN
    v_row := public.vcp_get_session(v_session_id);
    v_status := v_row ->> 'status';
    v_version := (v_row ->> 'version')::integer;
    PERFORM set_config('vcp.smoke.get_session_status', coalesce(v_status, ''), false);
    PERFORM set_config('vcp.smoke.get_session_version', coalesce(v_version::text, ''), false);
    IF v_status = 'created' AND v_version = 0 THEN
      PERFORM set_config('vcp.smoke.get_session_returns_created', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.get_session_returns_created', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.get_session_returns_created', 'FAIL', false);
      PERFORM set_config('vcp.smoke.get_session_status', SQLERRM, false);
      PERFORM set_config('vcp.smoke.get_session_version', SQLSTATE, false);
  END;

  -- 3. pair_session_increments_version
  BEGIN
    v_row := public.vcp_pair_session(v_session_id, 0);
    v_status := v_row ->> 'status';
    v_version := (v_row ->> 'version')::integer;
    PERFORM set_config('vcp.smoke.pair_status', coalesce(v_status, ''), false);
    PERFORM set_config('vcp.smoke.pair_version', coalesce(v_version::text, ''), false);
    IF v_status = 'paired' AND v_version = 1 THEN
      PERFORM set_config('vcp.smoke.pair_session_increments_version', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.pair_session_increments_version', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.pair_session_increments_version', 'FAIL', false);
      PERFORM set_config('vcp.smoke.pair_status', SQLERRM, false);
      PERFORM set_config('vcp.smoke.pair_version', SQLSTATE, false);
  END;

  -- 4. pair_session_stale_version_raises_V0002
  BEGIN
    v_row := public.vcp_pair_session(v_session_id, 0);
    PERFORM set_config('vcp.smoke.pair_session_stale_version_raises_V0002', 'FAIL', false);
    PERFORM set_config('vcp.smoke.pair_stale_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.pair_stale_sqlerrm', coalesce(v_row::text, ''), false);
  EXCEPTION
    WHEN SQLSTATE 'V0002' THEN
      PERFORM set_config('vcp.smoke.pair_session_stale_version_raises_V0002', 'PASS', false);
      PERFORM set_config('vcp.smoke.pair_stale_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.pair_stale_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.pair_session_stale_version_raises_V0002', 'FAIL', false);
      PERFORM set_config('vcp.smoke.pair_stale_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.pair_stale_sqlerrm', SQLERRM, false);
  END;

  -- 5. get_session_unknown_id_raises_V0001
  BEGIN
    v_row := public.vcp_get_session(pg_catalog.gen_random_uuid());
    PERFORM set_config('vcp.smoke.get_session_unknown_id_raises_V0001', 'FAIL', false);
    PERFORM set_config('vcp.smoke.get_unknown_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.get_unknown_sqlerrm', coalesce(v_row::text, ''), false);
  EXCEPTION
    WHEN SQLSTATE 'V0001' THEN
      PERFORM set_config('vcp.smoke.get_session_unknown_id_raises_V0001', 'PASS', false);
      PERFORM set_config('vcp.smoke.get_unknown_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.get_unknown_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.get_session_unknown_id_raises_V0001', 'FAIL', false);
      PERFORM set_config('vcp.smoke.get_unknown_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.get_unknown_sqlerrm', SQLERRM, false);
  END;

  -- 6. attach_calibration_missing_key_raises_V0004
  BEGIN
    v_calibration_id := public.vcp_attach_calibration(
      v_session_id,
      jsonb_build_object(
        'cssPxPerMm', 4.0,
        'cardWidthCssPx', 343.0,
        'devicePixelRatio', 2.0,
        'viewportWidthCssPx', 1280,
        'viewportHeightCssPx', 800,
        'screenWidthCssPx', 1920,
        'screenHeightCssPx', 1080,
        'createdAtIso', '2026-09-08T12:00:00.000Z',
        'method', 'card-id1',
        'verifications', '[]'::jsonb
      )
    );
    PERFORM set_config('vcp.smoke.attach_calibration_missing_key_raises_V0004', 'FAIL', false);
    PERFORM set_config('vcp.smoke.attach_missing_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.attach_missing_sqlerrm', coalesce(v_calibration_id::text, ''), false);
  EXCEPTION
    WHEN SQLSTATE 'V0004' THEN
      IF position('userAgent' in SQLERRM) > 0 THEN
        PERFORM set_config('vcp.smoke.attach_calibration_missing_key_raises_V0004', 'PASS', false);
      ELSE
        PERFORM set_config('vcp.smoke.attach_calibration_missing_key_raises_V0004', 'FAIL', false);
      END IF;
      PERFORM set_config('vcp.smoke.attach_missing_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.attach_missing_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.attach_calibration_missing_key_raises_V0004', 'FAIL', false);
      PERFORM set_config('vcp.smoke.attach_missing_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.attach_missing_sqlerrm', SQLERRM, false);
  END;

  -- 7. attach_calibration_accepts_full_object
  BEGIN
    v_calibration_id := public.vcp_attach_calibration(
      v_session_id,
      jsonb_build_object(
        'cssPxPerMm', 4.0,
        'cardWidthCssPx', 343.0,
        'devicePixelRatio', 2.0,
        'viewportWidthCssPx', 1280,
        'viewportHeightCssPx', 800,
        'screenWidthCssPx', 1920,
        'screenHeightCssPx', 1080,
        'userAgent', 'smoketest',
        'createdAtIso', '2026-09-08T12:00:00.000Z',
        'method', 'card-id1',
        'verifications', '[]'::jsonb
      )
    );
    PERFORM set_config(
      'vcp.smoke.calibration_id',
      coalesce(v_calibration_id::text, ''),
      false
    );
    IF v_calibration_id IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.attach_calibration_accepts_full_object', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.attach_calibration_accepts_full_object', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.attach_calibration_accepts_full_object', 'FAIL', false);
      PERFORM set_config('vcp.smoke.calibration_id', SQLSTATE || ':' || SQLERRM, false);
  END;

  -- 8. record_presentation_returns_uuid
  BEGIN
    v_presentation_id := public.vcp_record_presentation(
      v_session_id,
      jsonb_build_object(
        'trial_index', 0,
        'eye', 'right',
        'logmar_step_index', 0,
        'requested_letter_height_mm', 8.7,
        'requested_stroke_width_mm', 1.74,
        'requested_letter_height_css_px', 34.8,
        'requested_letter_height_device_px', 69.6,
        'optotypes', jsonb_build_array('C', 'H', 'O'),
        'target_index', 1,
        'format', 'flanked-triplet',
        'distance_mm_requested', 2000
      )
    );
    PERFORM set_config(
      'vcp.smoke.presentation_id',
      coalesce(v_presentation_id::text, ''),
      false
    );
    IF v_presentation_id IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.record_presentation_returns_uuid', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.record_presentation_returns_uuid', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.record_presentation_returns_uuid', 'FAIL', false);
      PERFORM set_config('vcp.smoke.presentation_id', SQLSTATE || ':' || SQLERRM, false);
      v_presentation_id := NULL;
  END;

  -- 9. record_presentation_rejects_non_sloan_letter
  BEGIN
    PERFORM public.vcp_record_presentation(
      v_session_id,
      jsonb_build_object(
        'trial_index', 1,
        'eye', 'right',
        'logmar_step_index', 0,
        'requested_letter_height_mm', 8.7,
        'requested_stroke_width_mm', 1.74,
        'requested_letter_height_css_px', 34.8,
        'requested_letter_height_device_px', 69.6,
        'optotypes', jsonb_build_array('A', 'H', 'O'),
        'target_index', 1,
        'format', 'flanked-triplet',
        'distance_mm_requested', 2000
      )
    );
    PERFORM set_config('vcp.smoke.record_presentation_rejects_non_sloan_letter', 'FAIL', false);
    PERFORM set_config('vcp.smoke.non_sloan_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.non_sloan_sqlerrm', '', false);
  EXCEPTION
    WHEN check_violation THEN
      -- SQLSTATE 23514
      PERFORM set_config('vcp.smoke.record_presentation_rejects_non_sloan_letter', 'PASS', false);
      PERFORM set_config('vcp.smoke.non_sloan_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.non_sloan_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.record_presentation_rejects_non_sloan_letter', 'FAIL', false);
      PERFORM set_config('vcp.smoke.non_sloan_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.non_sloan_sqlerrm', SQLERRM, false);
  END;

  -- 10. record_rendered_wrong_session_raises_V0005
  BEGIN
    IF v_presentation_id IS NULL THEN
      PERFORM set_config('vcp.smoke.record_rendered_wrong_session_raises_V0005', 'FAIL', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlstate', 'no_presentation', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlerrm', '', false);
    ELSE
      v_wrong_session_id := pg_catalog.gen_random_uuid();
      PERFORM public.vcp_record_rendered(
        v_wrong_session_id,
        v_presentation_id,
        69.6,
        13.92,
        pg_catalog.now()
      );
      PERFORM set_config('vcp.smoke.record_rendered_wrong_session_raises_V0005', 'FAIL', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlstate', 'succeeded', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlerrm', '', false);
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'V0005' THEN
      PERFORM set_config('vcp.smoke.record_rendered_wrong_session_raises_V0005', 'PASS', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.record_rendered_wrong_session_raises_V0005', 'FAIL', false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.rendered_wrong_sqlerrm', SQLERRM, false);
  END;

  -- 11. submit_response_first_call
  BEGIN
    IF v_presentation_id IS NULL THEN
      PERFORM set_config('vcp.smoke.submit_response_first_call', 'FAIL', false);
      PERFORM set_config('vcp.smoke.response_id_first', '', false);
      PERFORM set_config('vcp.smoke.response_duplicate_first', '', false);
    ELSE
      v_row := public.vcp_submit_response(
        v_session_id,
        v_presentation_id,
        'smoke-request-0001',
        'letter',
        'H',
        pg_catalog.now(),
        250
      );
      v_response_id_first := (v_row ->> 'id')::uuid;
      v_duplicate := (v_row ->> 'duplicate')::boolean;
      PERFORM set_config(
        'vcp.smoke.response_id_first',
        coalesce(v_response_id_first::text, ''),
        false
      );
      PERFORM set_config(
        'vcp.smoke.response_duplicate_first',
        coalesce(v_duplicate::text, ''),
        false
      );
      IF v_response_id_first IS NOT NULL AND v_duplicate IS FALSE THEN
        PERFORM set_config('vcp.smoke.submit_response_first_call', 'PASS', false);
      ELSE
        PERFORM set_config('vcp.smoke.submit_response_first_call', 'FAIL', false);
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.submit_response_first_call', 'FAIL', false);
      PERFORM set_config('vcp.smoke.response_id_first', SQLSTATE || ':' || SQLERRM, false);
      PERFORM set_config('vcp.smoke.response_duplicate_first', '', false);
      v_response_id_first := NULL;
  END;

  -- 12. submit_response_is_idempotent
  BEGIN
    IF v_presentation_id IS NULL OR v_response_id_first IS NULL THEN
      PERFORM set_config('vcp.smoke.submit_response_is_idempotent', 'FAIL', false);
      PERFORM set_config('vcp.smoke.response_id_second', '', false);
      PERFORM set_config('vcp.smoke.response_duplicate_second', '', false);
    ELSE
      v_row := public.vcp_submit_response(
        v_session_id,
        v_presentation_id,
        'smoke-request-0001',
        'letter',
        'H',
        pg_catalog.now(),
        250
      );
      v_response_id_second := (v_row ->> 'id')::uuid;
      v_duplicate := (v_row ->> 'duplicate')::boolean;
      PERFORM set_config(
        'vcp.smoke.response_id_second',
        coalesce(v_response_id_second::text, ''),
        false
      );
      PERFORM set_config(
        'vcp.smoke.response_duplicate_second',
        coalesce(v_duplicate::text, ''),
        false
      );
      -- PASS only if duplicate true AND both ids are equal and non-null.
      IF v_duplicate IS TRUE
         AND v_response_id_second IS NOT NULL
         AND v_response_id_first = v_response_id_second THEN
        PERFORM set_config('vcp.smoke.submit_response_is_idempotent', 'PASS', false);
      ELSE
        PERFORM set_config('vcp.smoke.submit_response_is_idempotent', 'FAIL', false);
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.submit_response_is_idempotent', 'FAIL', false);
      PERFORM set_config('vcp.smoke.response_id_second', SQLSTATE || ':' || SQLERRM, false);
      PERFORM set_config('vcp.smoke.response_duplicate_second', '', false);
  END;

  -- 13. submit_response_not_sure_with_letter_rejected
  BEGIN
    IF v_presentation_id IS NULL THEN
      PERFORM set_config('vcp.smoke.submit_response_not_sure_with_letter_rejected', 'FAIL', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlstate', 'no_presentation', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlerrm', '', false);
    ELSE
      PERFORM public.vcp_submit_response(
        v_session_id,
        v_presentation_id,
        'smoke-request-0002',
        'not_sure',
        'H',
        pg_catalog.now(),
        100
      );
      PERFORM set_config('vcp.smoke.submit_response_not_sure_with_letter_rejected', 'FAIL', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlstate', 'succeeded', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlerrm', '', false);
    END IF;
  EXCEPTION
    WHEN check_violation THEN
      PERFORM set_config('vcp.smoke.submit_response_not_sure_with_letter_rejected', 'PASS', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.not_sure_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.submit_response_not_sure_with_letter_rejected', 'FAIL', false);
      PERFORM set_config('vcp.smoke.not_sure_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.not_sure_sqlerrm', SQLERRM, false);
  END;

  -- 14. upsert_test_quality_insert
  BEGIN
    v_quality_id_first := public.vcp_upsert_test_quality(
      v_session_id,
      'right',
      jsonb_build_object(
        'distance_requested_mm', 2000,
        'not_sure_count', 3
      )
    );
    PERFORM set_config(
      'vcp.smoke.quality_id_first',
      coalesce(v_quality_id_first::text, ''),
      false
    );
    IF v_quality_id_first IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.upsert_test_quality_insert', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.upsert_test_quality_insert', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.upsert_test_quality_insert', 'FAIL', false);
      PERFORM set_config('vcp.smoke.quality_id_first', SQLSTATE || ':' || SQLERRM, false);
      v_quality_id_first := NULL;
  END;

  -- 15. upsert_test_quality_update_without_distance
  -- Catch 23502 (not_null_violation) so a failed fix reports FAIL instead of aborting.
  BEGIN
    IF v_quality_id_first IS NULL THEN
      PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'FAIL', false);
      PERFORM set_config('vcp.smoke.quality_id_second', '', false);
      PERFORM set_config('vcp.smoke.quality_distance_requested_mm', '', false);
      PERFORM set_config('vcp.smoke.quality_not_sure_count', '', false);
      PERFORM set_config('vcp.smoke.quality_reversals', '', false);
      PERFORM set_config('vcp.smoke.quality_update_sqlstate', 'no_prior_insert', false);
    ELSE
      BEGIN
        v_quality_id_second := public.vcp_upsert_test_quality(
          v_session_id,
          'right',
          jsonb_build_object('reversals', 2)
        );
        v_sqlstate := '';
        v_sqlerrm := '';
      EXCEPTION
        WHEN not_null_violation THEN
          -- SQLSTATE 23502: the NOT NULL before ON CONFLICT fix did not work.
          v_quality_id_second := NULL;
          v_sqlstate := SQLSTATE;
          v_sqlerrm := SQLERRM;
        WHEN OTHERS THEN
          v_quality_id_second := NULL;
          v_sqlstate := SQLSTATE;
          v_sqlerrm := SQLERRM;
      END;

      PERFORM set_config(
        'vcp.smoke.quality_id_second',
        coalesce(v_quality_id_second::text, ''),
        false
      );
      PERFORM set_config('vcp.smoke.quality_update_sqlstate', coalesce(v_sqlstate, ''), false);
      PERFORM set_config('vcp.smoke.quality_update_sqlerrm', coalesce(v_sqlerrm, ''), false);

      IF v_quality_id_second IS NULL OR v_quality_id_second <> v_quality_id_first THEN
        PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'FAIL', false);
        PERFORM set_config('vcp.smoke.quality_distance_requested_mm', '', false);
        PERFORM set_config('vcp.smoke.quality_not_sure_count', '', false);
        PERFORM set_config('vcp.smoke.quality_reversals', '', false);
      ELSE
        -- Readback cannot run as anon (no table SELECT). Elevate only for
        -- observation of the rows this smoketest created, then return to anon.
        RESET ROLE;
        SELECT t.distance_requested_mm, t.not_sure_count, t.reversals
        INTO v_distance_requested_mm, v_not_sure_count, v_reversals
        FROM vcp.test_quality t
        WHERE t.id = v_quality_id_second;
        SET LOCAL ROLE anon;

        PERFORM set_config(
          'vcp.smoke.quality_distance_requested_mm',
          coalesce(v_distance_requested_mm::text, ''),
          false
        );
        PERFORM set_config(
          'vcp.smoke.quality_not_sure_count',
          coalesce(v_not_sure_count::text, ''),
          false
        );
        PERFORM set_config(
          'vcp.smoke.quality_reversals',
          coalesce(v_reversals::text, ''),
          false
        );

        IF v_distance_requested_mm = 2000
           AND v_not_sure_count = 3
           AND v_reversals = 2 THEN
          PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'PASS', false);
        ELSE
          PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'FAIL', false);
        END IF;
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.upsert_test_quality_update_without_distance', 'FAIL', false);
      PERFORM set_config('vcp.smoke.quality_update_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.quality_update_sqlerrm', SQLERRM, false);
      BEGIN
        SET LOCAL ROLE anon;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
  END;

  -- 16. append_event_returns_uuid
  BEGIN
    v_event_id := public.vcp_append_event(v_session_id, 'smoketest', '{}'::jsonb);
    PERFORM set_config('vcp.smoke.event_id', coalesce(v_event_id::text, ''), false);
    IF v_event_id IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.append_event_returns_uuid', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.append_event_returns_uuid', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.append_event_returns_uuid', 'FAIL', false);
      PERFORM set_config('vcp.smoke.event_id', SQLSTATE || ':' || SQLERRM, false);
  END;

  -- 17. anon_still_cannot_read_tables_directly
  BEGIN
    PERFORM 1 FROM vcp.sessions LIMIT 1;
    PERFORM set_config('vcp.smoke.anon_still_cannot_read_tables_directly', 'FAIL', false);
    PERFORM set_config('vcp.smoke.anon_select_sqlstate', 'succeeded', false);
    PERFORM set_config('vcp.smoke.anon_select_sqlerrm', 'select succeeded', false);
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM set_config('vcp.smoke.anon_still_cannot_read_tables_directly', 'PASS', false);
      PERFORM set_config('vcp.smoke.anon_select_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.anon_select_sqlerrm', SQLERRM, false);
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.anon_still_cannot_read_tables_directly', 'FAIL', false);
      PERFORM set_config('vcp.smoke.anon_select_sqlstate', SQLSTATE, false);
      PERFORM set_config('vcp.smoke.anon_select_sqlerrm', SQLERRM, false);
  END;
END
$smoke$;

-- anon has no DELETE privilege on any vcp table, so cleanup runs as the
-- session role. RESET ROLE also clears SET LOCAL ROLE anon from the DO
-- block before the delete and the readout.
RESET ROLE;

-- Only delete in this file. Scoped to the one session id from check 1.
-- Every child row goes with it through the existing on delete cascade
-- foreign keys. Guard: do nothing if the GUC is null, empty, or not a uuid.
delete from vcp.sessions
where id in (
  select x.sid
  from (
    select current_setting('vcp.smoke.session_id', true) as raw
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
    'create_session_returns_uuid', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.session_id', true),
      'result', current_setting('vcp.smoke.create_session_returns_uuid', true)
    ),
    'get_session_returns_created', jsonb_build_object(
      'expected', jsonb_build_object('status', 'created', 'version', 0),
      'observed', jsonb_build_object(
        'status', current_setting('vcp.smoke.get_session_status', true),
        'version', current_setting('vcp.smoke.get_session_version', true)
      ),
      'result', current_setting('vcp.smoke.get_session_returns_created', true)
    ),
    'pair_session_increments_version', jsonb_build_object(
      'expected', jsonb_build_object('status', 'paired', 'version', 1),
      'observed', jsonb_build_object(
        'status', current_setting('vcp.smoke.pair_status', true),
        'version', current_setting('vcp.smoke.pair_version', true)
      ),
      'result', current_setting('vcp.smoke.pair_session_increments_version', true)
    ),
    'pair_session_stale_version_raises_V0002', jsonb_build_object(
      'expected', 'V0002',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.pair_stale_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.pair_stale_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.pair_session_stale_version_raises_V0002', true)
    ),
    'get_session_unknown_id_raises_V0001', jsonb_build_object(
      'expected', 'V0001',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.get_unknown_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.get_unknown_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.get_session_unknown_id_raises_V0001', true)
    ),
    'attach_calibration_missing_key_raises_V0004', jsonb_build_object(
      'expected', 'V0004 naming userAgent',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.attach_missing_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.attach_missing_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.attach_calibration_missing_key_raises_V0004', true)
    ),
    'attach_calibration_accepts_full_object', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.calibration_id', true),
      'result', current_setting('vcp.smoke.attach_calibration_accepts_full_object', true)
    ),
    'record_presentation_returns_uuid', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.presentation_id', true),
      'result', current_setting('vcp.smoke.record_presentation_returns_uuid', true)
    ),
    'record_presentation_rejects_non_sloan_letter', jsonb_build_object(
      'expected', '23514',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.non_sloan_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.non_sloan_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.record_presentation_rejects_non_sloan_letter', true)
    ),
    'record_rendered_wrong_session_raises_V0005', jsonb_build_object(
      'expected', 'V0005',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.rendered_wrong_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.rendered_wrong_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.record_rendered_wrong_session_raises_V0005', true)
    ),
    'submit_response_first_call', jsonb_build_object(
      'expected', jsonb_build_object('duplicate', false, 'id', 'non-null uuid'),
      'observed', jsonb_build_object(
        'id', current_setting('vcp.smoke.response_id_first', true),
        'duplicate', current_setting('vcp.smoke.response_duplicate_first', true)
      ),
      'result', current_setting('vcp.smoke.submit_response_first_call', true)
    ),
    'submit_response_is_idempotent', jsonb_build_object(
      'expected', jsonb_build_object(
        'duplicate', true,
        'id_matches_first', true
      ),
      'observed', jsonb_build_object(
        'id_first', current_setting('vcp.smoke.response_id_first', true),
        'id_second', current_setting('vcp.smoke.response_id_second', true),
        'duplicate', current_setting('vcp.smoke.response_duplicate_second', true)
      ),
      'result', current_setting('vcp.smoke.submit_response_is_idempotent', true)
    ),
    'submit_response_not_sure_with_letter_rejected', jsonb_build_object(
      'expected', '23514',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.not_sure_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.not_sure_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.submit_response_not_sure_with_letter_rejected', true)
    ),
    'upsert_test_quality_insert', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.quality_id_first', true),
      'result', current_setting('vcp.smoke.upsert_test_quality_insert', true)
    ),
    'upsert_test_quality_update_without_distance', jsonb_build_object(
      'expected', jsonb_build_object(
        'same_uuid', true,
        'distance_requested_mm', 2000,
        'not_sure_count', 3,
        'reversals', 2
      ),
      'observed', jsonb_build_object(
        'id_first', current_setting('vcp.smoke.quality_id_first', true),
        'id_second', current_setting('vcp.smoke.quality_id_second', true),
        'distance_requested_mm', current_setting('vcp.smoke.quality_distance_requested_mm', true),
        'not_sure_count', current_setting('vcp.smoke.quality_not_sure_count', true),
        'reversals', current_setting('vcp.smoke.quality_reversals', true),
        'sqlstate', current_setting('vcp.smoke.quality_update_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.quality_update_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.upsert_test_quality_update_without_distance', true)
    ),
    'append_event_returns_uuid', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.event_id', true),
      'result', current_setting('vcp.smoke.append_event_returns_uuid', true)
    ),
    'anon_still_cannot_read_tables_directly', jsonb_build_object(
      'expected', '42501',
      'observed', jsonb_build_object(
        'sqlstate', current_setting('vcp.smoke.anon_select_sqlstate', true),
        'sqlerrm', current_setting('vcp.smoke.anon_select_sqlerrm', true)
      ),
      'result', current_setting('vcp.smoke.anon_still_cannot_read_tables_directly', true)
    ),
    'cleanup_removed_session', jsonb_build_object(
      'expected', 'session row absent',
      'observed', case
        when nullif(current_setting('vcp.smoke.session_id', true), '') is null then
          jsonb_build_object(
            'session_id_guc', current_setting('vcp.smoke.session_id', true),
            'row_exists', null,
            'note', 'check 1 never produced a session id'
          )
        when current_setting('vcp.smoke.session_id', true)
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then
          jsonb_build_object(
            'session_id_guc', current_setting('vcp.smoke.session_id', true),
            'row_exists', null,
            'note', 'session id GUC is not a uuid'
          )
        else
          jsonb_build_object(
            'session_id', current_setting('vcp.smoke.session_id', true),
            'row_exists', exists (
              select 1
              from vcp.sessions s
              where s.id = (current_setting('vcp.smoke.session_id', true))::uuid
            )
          )
      end,
      'result', case
        when nullif(current_setting('vcp.smoke.session_id', true), '') is null then
          'PASS'
        when current_setting('vcp.smoke.session_id', true)
          !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then
          'PASS'
        when exists (
          select 1
          from vcp.sessions s
          where s.id = (current_setting('vcp.smoke.session_id', true))::uuid
        ) then
          'FAIL'
        else
          'PASS'
      end
    )
  ) as checks
) as built;
