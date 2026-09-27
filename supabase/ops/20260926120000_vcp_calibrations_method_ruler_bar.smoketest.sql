-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore an explicit
-- delete scoped to the one session id created below. Child rows follow
-- via on delete cascade. The Supabase CLI is never used.
--
-- NOTE: calling vcp_create_session also closes any real stuck sessions
-- (status in created/paired/running/paused, older than 24 hours) and
-- inserts abandoned_by_sweep events for those sessions. That is the
-- function's live behaviour. Cleanup below deletes only the session id
-- this script created.
--
-- Required vcp_attach_calibration keys (explicit literal on every call):
-- cssPxPerMm, cardWidthCssPx, devicePixelRatio, viewportWidthCssPx,
-- viewportHeightCssPx, screenWidthCssPx, screenHeightCssPx, userAgent,
-- createdAtIso, method, verifications.

DO $smoke$
DECLARE
  v_session_id uuid;
  v_calibration_id uuid;
BEGIN
  PERFORM set_config('vcp.smoke.ruler.session_id', '', false);
  PERFORM set_config('vcp.smoke.ruler.ruler_bar', 'FAIL', false);
  PERFORM set_config('vcp.smoke.ruler.ruler_bar_obs', 'not run', false);
  PERFORM set_config('vcp.smoke.ruler.bogus', 'FAIL', false);
  PERFORM set_config('vcp.smoke.ruler.bogus_obs', 'not run', false);
  PERFORM set_config('vcp.smoke.ruler.card_id1', 'FAIL', false);
  PERFORM set_config('vcp.smoke.ruler.card_id1_obs', 'not run', false);

  -- Prove EXECUTE grants, not postgres BYPASSRLS.
  SET LOCAL ROLE anon;

  BEGIN
    v_session_id := public.vcp_create_session(2000, 'smoketest-ruler-bar');
    IF v_session_id IS NULL THEN
      PERFORM set_config('vcp.smoke.ruler.session_id', '', false);
      PERFORM set_config('vcp.smoke.ruler.ruler_bar_obs', 'no session', false);
      PERFORM set_config('vcp.smoke.ruler.bogus_obs', 'no session', false);
      PERFORM set_config('vcp.smoke.ruler.card_id1_obs', 'no session', false);
      RETURN;
    END IF;
    PERFORM set_config('vcp.smoke.ruler.session_id', v_session_id::text, false);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.ruler.session_id', '', false);
      PERFORM set_config('vcp.smoke.ruler.ruler_bar_obs', SQLSTATE || ':' || SQLERRM, false);
      PERFORM set_config('vcp.smoke.ruler.bogus_obs', 'no session', false);
      PERFORM set_config('vcp.smoke.ruler.card_id1_obs', 'no session', false);
      RETURN;
  END;

  -- 1. method ruler-bar is accepted.
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
        'userAgent', 'smoketest-ruler-bar',
        'createdAtIso', '2026-09-08T12:00:00.000Z',
        'method', 'ruler-bar',
        'verifications', '[]'::jsonb
      )
    );
    PERFORM set_config(
      'vcp.smoke.ruler.ruler_bar_obs',
      coalesce(v_calibration_id::text, 'null'),
      false
    );
    IF v_calibration_id IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.ruler.ruler_bar', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.ruler.ruler_bar', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.ruler.ruler_bar', 'FAIL', false);
      PERFORM set_config(
        'vcp.smoke.ruler.ruler_bar_obs',
        SQLSTATE || ':' || SQLERRM,
        false
      );
  END;

  -- 2. method bogus is rejected with check_violation.
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
        'userAgent', 'smoketest-ruler-bar',
        'createdAtIso', '2026-09-08T12:00:00.000Z',
        'method', 'bogus',
        'verifications', '[]'::jsonb
      )
    );
    PERFORM set_config('vcp.smoke.ruler.bogus', 'FAIL', false);
    PERFORM set_config(
      'vcp.smoke.ruler.bogus_obs',
      'succeeded:' || coalesce(v_calibration_id::text, 'null'),
      false
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      PERFORM set_config(
        'vcp.smoke.ruler.bogus_obs',
        SQLSTATE || ':' || SQLERRM,
        false
      );
      IF position('calibrations_method_chk' in SQLERRM) > 0 THEN
        PERFORM set_config('vcp.smoke.ruler.bogus', 'PASS', false);
      ELSE
        PERFORM set_config('vcp.smoke.ruler.bogus', 'FAIL', false);
      END IF;
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.ruler.bogus', 'FAIL', false);
      PERFORM set_config(
        'vcp.smoke.ruler.bogus_obs',
        SQLSTATE || ':' || SQLERRM,
        false
      );
  END;

  -- 3. method card-id1 is still accepted.
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
        'userAgent', 'smoketest-ruler-bar',
        'createdAtIso', '2026-09-08T12:00:00.000Z',
        'method', 'card-id1',
        'verifications', '[]'::jsonb
      )
    );
    PERFORM set_config(
      'vcp.smoke.ruler.card_id1_obs',
      coalesce(v_calibration_id::text, 'null'),
      false
    );
    IF v_calibration_id IS NOT NULL THEN
      PERFORM set_config('vcp.smoke.ruler.card_id1', 'PASS', false);
    ELSE
      PERFORM set_config('vcp.smoke.ruler.card_id1', 'FAIL', false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.ruler.card_id1', 'FAIL', false);
      PERFORM set_config(
        'vcp.smoke.ruler.card_id1_obs',
        SQLSTATE || ':' || SQLERRM,
        false
      );
  END;
END
$smoke$;

-- anon has no DELETE privilege on any vcp table, so cleanup runs as the
-- session role. RESET ROLE also clears SET LOCAL ROLE anon from the DO
-- block before the delete and the readout.
RESET ROLE;

-- This delete leaves zero rows from this script's session. Every child
-- row of that session goes with it through the existing on delete cascade
-- foreign keys. Guard: do nothing if the GUC is null, empty, or not a uuid.
delete from vcp.sessions
where id in (
  select x.sid
  from (
    select current_setting('vcp.smoke.ruler.session_id', true) as raw
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
        where coalesce(e.value ->> 'result', 'FAIL') <> 'PASS'
      )
      then 'SMOKE TEST PASSED'
      else 'SMOKE TEST FAILED: ' || (
        select string_agg(e.key, ', ' order by e.key)
        from jsonb_each(checks) as e(key, value)
        where coalesce(e.value ->> 'result', 'FAIL') <> 'PASS'
      )
    end
  )
) as recon
from (
  select jsonb_build_object(
    'attach_ruler_bar', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.ruler.ruler_bar_obs', true),
      'result', coalesce(current_setting('vcp.smoke.ruler.ruler_bar', true), 'FAIL')
    ),
    'attach_bogus', jsonb_build_object(
      'expected', '23514 calibrations_method_chk',
      'observed', current_setting('vcp.smoke.ruler.bogus_obs', true),
      'result', coalesce(current_setting('vcp.smoke.ruler.bogus', true), 'FAIL')
    ),
    'attach_card_id1', jsonb_build_object(
      'expected', 'non-null uuid',
      'observed', current_setting('vcp.smoke.ruler.card_id1_obs', true),
      'result', coalesce(current_setting('vcp.smoke.ruler.card_id1', true), 'FAIL')
    ),
    'cleanup_removed_session', jsonb_build_object(
      'expected', 'session and its child rows absent',
      'observed', current_setting('vcp.smoke.ruler.session_id', true),
      'result', case
        when nullif(current_setting('vcp.smoke.ruler.session_id', true), '') is null
          or current_setting('vcp.smoke.ruler.session_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then 'PASS'
        when exists (
          select 1
          from vcp.sessions s
          where s.id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.calibrations c
          where c.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.presentations p
          where p.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.responses r
          where r.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.distance_events d
          where d.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.test_quality q
          where q.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        or exists (
          select 1
          from vcp.session_events e
          where e.session_id = (current_setting('vcp.smoke.ruler.session_id', true))::uuid
        )
        then 'FAIL'
        else 'PASS'
      end
    )
  ) as checks
) as built;
