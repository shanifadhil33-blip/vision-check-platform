-- GIT RECORD. This file is NEVER executed.
-- The ops apply copy is the only file that runs:
--   supabase/ops/20260924120000_vcp_sweep_abandoned_sessions.apply.sql
-- Version: 20260924120000_vcp_sweep_abandoned_sessions
-- A human pastes the apply copy by hand into the Supabase SQL editor.
-- The Supabase CLI is never used.
-- Replaces public.vcp_create_session so that, before creating the new
-- session, it lazily abandons sessions stuck in created/paired/running/
-- paused for more than 24 hours. No table change. Status value
-- 'abandoned' is already allowed by sessions_status_chk.

BEGIN;

-- ---------------------------------------------------------------------------
-- public.vcp_create_session
-- Signature unchanged: (integer, text) returns uuid.
-- Sweep runs before the insert. A sweep failure aborts the whole call.
-- Previous body: supabase/migrations/20260908140000_vcp_rpc_surface.sql
-- lines 24-51 (insert logic preserved; id pre-allocated for the sweep).
-- ---------------------------------------------------------------------------

create or replace function public.vcp_create_session(
  p_distance_mm_requested integer,
  p_client_build text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
  r record;
begin
  -- Pre-allocate so abandoned_by_sweep events can name the new session
  -- before its row exists. Payload has no FK; session_events.session_id
  -- points at the swept (already existing) session.
  v_id := pg_catalog.gen_random_uuid();

  for r in
    select s.id, s.status as previous_status, s.created_at
    from vcp.sessions s
    where s.status in ('created', 'paired', 'running', 'paused')
      and s.created_at < pg_catalog.now() - interval '24 hours'
    for update of s skip locked
  loop
    update vcp.sessions s
    set
      status = 'abandoned',
      version = s.version + 1,
      updated_at = pg_catalog.now()
    where s.id = r.id
      and s.status in ('created', 'paired', 'running', 'paused');

    insert into vcp.session_events (
      session_id,
      type,
      payload
    ) values (
      r.id,
      'abandoned_by_sweep',
      pg_catalog.jsonb_build_object(
        'previous_status', r.previous_status,
        'created_at', r.created_at,
        'swept_by_session_id', v_id
      )
    );
  end loop;

  insert into vcp.sessions (
    id,
    status,
    version,
    distance_mm_requested,
    client_build
  ) values (
    v_id,
    'created',
    0,
    p_distance_mm_requested,
    p_client_build
  );

  return v_id;
end;
$fn$;

alter function public.vcp_create_session(integer, text) owner to postgres;

revoke all on function public.vcp_create_session(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_create_session(integer, text) to anon;

COMMIT;
