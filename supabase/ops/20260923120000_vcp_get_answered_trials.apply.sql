-- APPLY COPY. Paste this file only into the Supabase SQL editor.
-- Git record (never executed): supabase/migrations/20260923120000_vcp_get_answered_trials.sql
-- Version: 20260923120000_vcp_get_answered_trials
-- Function body is identical to the git record. Tracking insert is in
-- this same transaction so a failure leaves nothing registered.
-- The Supabase CLI is never used.
-- Adds one SECURITY DEFINER read RPC so the display can rebuild its
-- answered-trials list after a reload. Does not alter any table.
--
-- Custom SQLSTATE contract (client code depends on these; do not renumber):
--   V0001 session not found
--   V0002 version conflict, expected version did not match
--   V0003 presentation does not belong to that session
--   V0004 required key missing from a jsonb argument
--   V0005 no presentation row updated, id missing or wrong session
--   V0006 concurrent submission in flight, safe to retry

BEGIN;

-- ---------------------------------------------------------------------------
-- public.vcp_get_answered_trials
-- SQLSTATE V0001: session does not exist.
-- Returns only presentations that have at least one response. Unanswered
-- presentations (and their targets) are never included. When a presentation
-- has more than one response, the earliest by created_at (tie-break by id)
-- is reported, with response_count so duplicates stay visible. Raw data only;
-- no correctness field. An existing session with no answered presentations
-- returns [] not null.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_get_answered_trials(
  p_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_result jsonb;
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  select coalesce(
    (
      select pg_catalog.jsonb_agg(trial.obj order by trial.trial_index)
      from (
        select
          p.trial_index,
          pg_catalog.jsonb_build_object(
            'presentation_id', p.id,
            'trial_index', p.trial_index,
            'eye', p.eye,
            'logmar_step_index', p.logmar_step_index,
            'format', p.format,
            'optotypes', pg_catalog.to_jsonb(p.optotypes),
            'target_index', p.target_index,
            'requested_letter_height_device_px', p.requested_letter_height_device_px,
            'actual_letter_height_device_px', p.actual_letter_height_device_px,
            'actual_stroke_width_device_px', p.actual_stroke_width_device_px,
            'visibility_confirmed', p.visibility_confirmed,
            'rendered_at', p.rendered_at,
            'response_kind', r.response_kind,
            'response_letter', r.response_letter,
            'responded_at', r.responded_at,
            'latency_ms', r.latency_ms,
            'response_count', cnt.response_count
          ) as obj
        from vcp.presentations p
        inner join lateral (
          select
            r0.response_kind,
            r0.response_letter,
            r0.responded_at,
            r0.latency_ms
          from vcp.responses r0
          where r0.presentation_id = p.id
          order by r0.created_at asc, r0.responded_at asc, r0.id asc
          limit 1
        ) r on true
        inner join lateral (
          select pg_catalog.count(*) as response_count
          from vcp.responses r1
          where r1.presentation_id = p.id
        ) cnt on true
        where p.session_id = p_session_id
      ) trial
    ),
    '[]'::pg_catalog.jsonb
  )
  into v_result;

  return v_result;
end;
$fn$;

alter function public.vcp_get_answered_trials(uuid) owner to postgres;

revoke all on function public.vcp_get_answered_trials(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_get_answered_trials(uuid) to anon;

-- Tracking registration (apply copy only). Same transaction as the function body.
insert into vcp.schema_migrations (version)
  values ('20260923120000_vcp_get_answered_trials');

COMMIT;
