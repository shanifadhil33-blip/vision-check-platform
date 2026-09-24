-- SMOKETEST. Paste into the Supabase SQL editor after apply and verify pass.
-- Version: 20260924120000_vcp_sweep_abandoned_sessions
-- THIS SCRIPT WRITES TO THE LIVE DATABASE AND THEN DELETES WHAT IT WROTE.
-- NOTE: calling vcp_create_session also closes any real stuck sessions
-- (status in created/paired/running/paused, older than 24 hours). That is
-- intended. Cleanup below only deletes the three ids this script created.
-- The writes cannot be rolled back: a ROLLBACK would also discard the
-- session GUCs the readout reads. Cleanup is therefore explicit deletes
-- scoped to those three ids, each guarded by a uuid regex. The Supabase
-- CLI is never used.
--
-- Scenario: as postgres, insert OLD (running, version 3, created_at =
-- now() - 25 hours) and FRESH (running, version 3, created_at = now()).
-- Then as anon call vcp_create_session. Assert OLD was swept, FRESH was
-- not, and the new session is created. Then delete all three by id.

DO $smoke$
DECLARE
  v_old_id uuid;
  v_fresh_id uuid;
  v_new_id uuid;
BEGIN
  -- Insert fixtures as postgres (before SET LOCAL ROLE anon).
  -- created_at is set explicitly. now() is stable for the transaction, so
  -- OLD is always 25 hours older than FRESH without relying on wall-clock
  -- advancing between statements.
  INSERT INTO vcp.sessions (
    status,
    version,
    created_at,
    distance_mm_requested,
    client_build
  ) VALUES (
    'running',
    3,
    now() - interval '25 hours',
    2000,
    'smoketest-sweep-old'
  )
  RETURNING id INTO v_old_id;

  INSERT INTO vcp.sessions (
    status,
    version,
    created_at,
    distance_mm_requested,
    client_build
  ) VALUES (
    'running',
    3,
    now(),
    2000,
    'smoketest-sweep-fresh'
  )
  RETURNING id INTO v_fresh_id;

  PERFORM set_config('vcp.smoke.sweep.old_id', v_old_id::text, false);
  PERFORM set_config('vcp.smoke.sweep.fresh_id', v_fresh_id::text, false);

  -- Prove EXECUTE grants, not postgres BYPASSRLS.
  SET LOCAL ROLE anon;

  BEGIN
    v_new_id := public.vcp_create_session(2000, 'smoketest-sweep');
    IF v_new_id IS NULL THEN
      PERFORM set_config('vcp.smoke.sweep.create_session', 'FAIL', false);
      PERFORM set_config('vcp.smoke.sweep.new_id', '', false);
    ELSE
      PERFORM set_config('vcp.smoke.sweep.create_session', 'PASS', false);
      PERFORM set_config('vcp.smoke.sweep.new_id', v_new_id::text, false);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('vcp.smoke.sweep.create_session', 'FAIL', false);
      PERFORM set_config('vcp.smoke.sweep.new_id', SQLSTATE || ':' || SQLERRM, false);
      v_new_id := NULL;
  END;
END
$smoke$;

-- RESET ROLE before checks and cleanup on both PASS and FAIL paths.
RESET ROLE;

-- Checks as postgres.
DO $assert$
DECLARE
  v_old_id text := current_setting('vcp.smoke.sweep.old_id', true);
  v_fresh_id text := current_setting('vcp.smoke.sweep.fresh_id', true);
  v_new_id text := current_setting('vcp.smoke.sweep.new_id', true);
  v_uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_old uuid;
  v_fresh uuid;
  v_new uuid;
  v_new_status text;
  v_old_status text;
  v_old_version integer;
  v_fresh_status text;
  v_fresh_version integer;
  v_event_count integer;
  v_event_prev text;
  v_event_swept_by text;
  v_fresh_event_count integer;
  v_stale_count integer;
BEGIN
  IF v_old_id IS NULL OR v_old_id = '' OR v_old_id !~ v_uuid_re
     OR v_fresh_id IS NULL OR v_fresh_id = '' OR v_fresh_id !~ v_uuid_re
     OR v_new_id IS NULL OR v_new_id = '' OR v_new_id !~ v_uuid_re THEN
    PERFORM set_config('vcp.smoke.sweep.new_created', 'FAIL', false);
    PERFORM set_config('vcp.smoke.sweep.old_abandoned', 'FAIL', false);
    PERFORM set_config('vcp.smoke.sweep.fresh_untouched', 'FAIL', false);
    PERFORM set_config('vcp.smoke.sweep.old_event', 'FAIL', false);
    PERFORM set_config('vcp.smoke.sweep.fresh_no_event', 'FAIL', false);
    PERFORM set_config('vcp.smoke.sweep.no_stale_active', 'FAIL', false);
    PERFORM set_config(
      'vcp.smoke.sweep.assert_note',
      'missing or invalid fixture/new ids',
      false
    );
    RETURN;
  END IF;

  v_old := v_old_id::uuid;
  v_fresh := v_fresh_id::uuid;
  v_new := v_new_id::uuid;

  -- 1. new session exists with status 'created'
  SELECT s.status INTO v_new_status
  FROM vcp.sessions s
  WHERE s.id = v_new;

  PERFORM set_config(
    'vcp.smoke.sweep.new_status',
    coalesce(v_new_status, 'absent'),
    false
  );
  IF v_new_status = 'created' THEN
    PERFORM set_config('vcp.smoke.sweep.new_created', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.new_created', 'FAIL', false);
  END IF;

  -- 2. OLD now abandoned, version 4
  SELECT s.status, s.version INTO v_old_status, v_old_version
  FROM vcp.sessions s
  WHERE s.id = v_old;

  PERFORM set_config(
    'vcp.smoke.sweep.old_obs',
    coalesce(v_old_status, 'absent') || '/v' || coalesce(v_old_version::text, '?'),
    false
  );
  IF v_old_status = 'abandoned' AND v_old_version = 4 THEN
    PERFORM set_config('vcp.smoke.sweep.old_abandoned', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.old_abandoned', 'FAIL', false);
  END IF;

  -- 3. FRESH still running, version 3
  SELECT s.status, s.version INTO v_fresh_status, v_fresh_version
  FROM vcp.sessions s
  WHERE s.id = v_fresh;

  PERFORM set_config(
    'vcp.smoke.sweep.fresh_obs',
    coalesce(v_fresh_status, 'absent') || '/v' || coalesce(v_fresh_version::text, '?'),
    false
  );
  IF v_fresh_status = 'running' AND v_fresh_version = 3 THEN
    PERFORM set_config('vcp.smoke.sweep.fresh_untouched', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.fresh_untouched', 'FAIL', false);
  END IF;

  -- 4. exactly one abandoned_by_sweep event for OLD
  SELECT
    count(*)::integer,
    max(e.payload ->> 'previous_status'),
    max(e.payload ->> 'swept_by_session_id')
  INTO v_event_count, v_event_prev, v_event_swept_by
  FROM vcp.session_events e
  WHERE e.session_id = v_old
    AND e.type = 'abandoned_by_sweep';

  PERFORM set_config(
    'vcp.smoke.sweep.old_event_obs',
    'count=' || coalesce(v_event_count::text, '0')
      || '; previous_status=' || coalesce(v_event_prev, '')
      || '; swept_by=' || coalesce(v_event_swept_by, ''),
    false
  );
  IF v_event_count = 1
     AND v_event_prev = 'running'
     AND v_event_swept_by = v_new_id THEN
    PERFORM set_config('vcp.smoke.sweep.old_event', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.old_event', 'FAIL', false);
  END IF;

  -- 5. no sweep event for FRESH
  SELECT count(*)::integer INTO v_fresh_event_count
  FROM vcp.session_events e
  WHERE e.session_id = v_fresh
    AND e.type = 'abandoned_by_sweep';

  PERFORM set_config(
    'vcp.smoke.sweep.fresh_event_count',
    coalesce(v_fresh_event_count::text, '0'),
    false
  );
  IF v_fresh_event_count = 0 THEN
    PERFORM set_config('vcp.smoke.sweep.fresh_no_event', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.fresh_no_event', 'FAIL', false);
  END IF;

  -- 6. no active session older than 24 hours remains
  SELECT count(*)::integer INTO v_stale_count
  FROM vcp.sessions s
  WHERE s.status in ('created', 'paired', 'running', 'paused')
    AND s.created_at < now() - interval '24 hours';

  PERFORM set_config(
    'vcp.smoke.sweep.stale_count',
    coalesce(v_stale_count::text, '0'),
    false
  );
  IF v_stale_count = 0 THEN
    PERFORM set_config('vcp.smoke.sweep.no_stale_active', 'PASS', false);
  ELSE
    PERFORM set_config('vcp.smoke.sweep.no_stale_active', 'FAIL', false);
  END IF;
END
$assert$;

-- Cleanup: delete OLD, FRESH and the new session by id, each guarded by a
-- uuid regex. Child rows follow via on delete cascade.
delete from vcp.sessions
where id in (
  select x.sid
  from (
    select current_setting('vcp.smoke.sweep.old_id', true) as raw
  ) t
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
  from (
    select current_setting('vcp.smoke.sweep.fresh_id', true) as raw
  ) t
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
  from (
    select current_setting('vcp.smoke.sweep.new_id', true) as raw
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
      'observed', current_setting('vcp.smoke.sweep.new_id', true),
      'result', current_setting('vcp.smoke.sweep.create_session', true)
    ),
    'new_created', jsonb_build_object(
      'expected', 'status=created',
      'observed', current_setting('vcp.smoke.sweep.new_status', true),
      'result', current_setting('vcp.smoke.sweep.new_created', true)
    ),
    'old_abandoned', jsonb_build_object(
      'expected', 'abandoned/v4',
      'observed', current_setting('vcp.smoke.sweep.old_obs', true),
      'result', current_setting('vcp.smoke.sweep.old_abandoned', true)
    ),
    'fresh_untouched', jsonb_build_object(
      'expected', 'running/v3',
      'observed', current_setting('vcp.smoke.sweep.fresh_obs', true),
      'result', current_setting('vcp.smoke.sweep.fresh_untouched', true)
    ),
    'old_event', jsonb_build_object(
      'expected', 'one abandoned_by_sweep; previous_status=running; swept_by=new id',
      'observed', current_setting('vcp.smoke.sweep.old_event_obs', true),
      'result', current_setting('vcp.smoke.sweep.old_event', true)
    ),
    'fresh_no_event', jsonb_build_object(
      'expected', '0 abandoned_by_sweep events',
      'observed', current_setting('vcp.smoke.sweep.fresh_event_count', true),
      'result', current_setting('vcp.smoke.sweep.fresh_no_event', true)
    ),
    'no_stale_active', jsonb_build_object(
      'expected', '0 sessions in created/paired/running/paused older than 24 hours',
      'observed', current_setting('vcp.smoke.sweep.stale_count', true),
      'result', current_setting('vcp.smoke.sweep.no_stale_active', true)
    ),
    'cleanup_removed_three', jsonb_build_object(
      'expected', 'old, fresh and new session rows absent',
      'observed', jsonb_build_object(
        'old_id', current_setting('vcp.smoke.sweep.old_id', true),
        'old_exists', case
          when nullif(current_setting('vcp.smoke.sweep.old_id', true), '') is null then null
          when current_setting('vcp.smoke.sweep.old_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then null
          else exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.old_id', true))::uuid
          )
        end,
        'fresh_id', current_setting('vcp.smoke.sweep.fresh_id', true),
        'fresh_exists', case
          when nullif(current_setting('vcp.smoke.sweep.fresh_id', true), '') is null then null
          when current_setting('vcp.smoke.sweep.fresh_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then null
          else exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.fresh_id', true))::uuid
          )
        end,
        'new_id', current_setting('vcp.smoke.sweep.new_id', true),
        'new_exists', case
          when nullif(current_setting('vcp.smoke.sweep.new_id', true), '') is null then null
          when current_setting('vcp.smoke.sweep.new_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then null
          else exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.new_id', true))::uuid
          )
        end
      ),
      'result', case
        when (
          nullif(current_setting('vcp.smoke.sweep.old_id', true), '') is null
          or current_setting('vcp.smoke.sweep.old_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          or not exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.old_id', true))::uuid
          )
        )
        and (
          nullif(current_setting('vcp.smoke.sweep.fresh_id', true), '') is null
          or current_setting('vcp.smoke.sweep.fresh_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          or not exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.fresh_id', true))::uuid
          )
        )
        and (
          nullif(current_setting('vcp.smoke.sweep.new_id', true), '') is null
          or current_setting('vcp.smoke.sweep.new_id', true)
            !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          or not exists (
            select 1 from vcp.sessions s
            where s.id = (current_setting('vcp.smoke.sweep.new_id', true))::uuid
          )
        )
        then 'PASS'
        else 'FAIL'
      end
    )
  ) as checks
) as built;
