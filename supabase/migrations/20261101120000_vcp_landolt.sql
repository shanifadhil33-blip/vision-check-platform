-- GIT RECORD. This file is NEVER executed.
-- The ops apply copy is the only file that runs:
--   supabase/ops/20261101120000_vcp_landolt.apply.sql
-- Version: 20261101120000_vcp_landolt
-- A human pastes the apply copy by hand into the Supabase SQL editor.
-- The Supabase CLI is never used.
--
-- WHAT THIS MIGRATION DOES
-- Landolt C comparison test, staff only. Stores the test mode of a session,
-- every C shown (direction and practice flag) and every direction answer as
-- real columns. The letter test keeps writing exactly the rows it writes today.
--   1. vcp.sessions.test_mode, letters or landolt, default letters.
--   2. vcp.presentations.is_practice and landolt_direction; format landolt.
--      A landolt row is one C at index 0 with a direction; any other format
--      has no direction and is never practice.
--   3. vcp.responses.response_direction and response kind direction, with a
--      consistency check: letter needs a letter only, direction needs a
--      direction only, not_sure needs neither.
--   4. vcp.test_quality.test_mode, letters or landolt, default letters.
--   5. New functions vcp_set_test_mode and vcp_submit_direction_response.
--   6. vcp_record_presentation reads two new optional keys, landolt_direction
--      and is_practice. vcp_upsert_test_quality reads one new optional key,
--      test_mode. With the keys absent each writes exactly the row it writes
--      today. Argument lists are unchanged.
-- vcp_submit_response is not changed. No existing argument list changes.
-- Postgres cannot alter a check expression in place, so the three widened
-- checks are dropped and re-added under the same names.
--
-- Custom SQLSTATE contract (client code depends on these; do not renumber):
--   V0001 session not found
--   V0002 version conflict, expected version did not match
--   V0003 presentation does not belong to that session
--   V0004 required key missing from a jsonb argument
--   V0005 no presentation row updated, id missing or wrong session
--   V0006 concurrent submission in flight, safe to retry
--   V0007 new: test mode set after the session left status created

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. vcp.sessions.test_mode
-- ---------------------------------------------------------------------------

alter table vcp.sessions
  add column test_mode text not null default 'letters';

alter table vcp.sessions
  add constraint sessions_test_mode_chk check (test_mode in ('letters', 'landolt'));

comment on column vcp.sessions.test_mode is
  'Which test this session runs: letters (the letter test) or landolt (the staff Landolt C comparison test). Set only by vcp_set_test_mode while the session is created.';

-- ---------------------------------------------------------------------------
-- 2. vcp.presentations: is_practice, landolt_direction, format landolt
-- ---------------------------------------------------------------------------

alter table vcp.presentations
  add column is_practice boolean not null default false;

alter table vcp.presentations
  add column landolt_direction text null;

alter table vcp.presentations
  add constraint presentations_landolt_direction_chk check (
    landolt_direction is null
    or landolt_direction in ('up', 'down', 'left', 'right')
  );

alter table vcp.presentations drop constraint presentations_format_chk;
alter table vcp.presentations
  add constraint presentations_format_chk check (
    format in ('single', 'flanked-triplet', 'row', 'landolt')
  );

alter table vcp.presentations
  add constraint presentations_landolt_shape_chk check (
    (
      format = 'landolt'
      and optotypes = array['C']::text[]
      and target_index = 0
      and landolt_direction is not null
    )
    or (
      format <> 'landolt'
      and landolt_direction is null
      and is_practice = false
    )
  );

comment on column vcp.presentations.is_practice is
  'Landolt C only. True for the two practice Cs shown before scoring. Practice Cs are never scored. Always false for any other format.';

comment on column vcp.presentations.landolt_direction is
  'Landolt C only. The gap direction drawn: up, down, left or right. Null for any other format.';

-- ---------------------------------------------------------------------------
-- 3. vcp.responses: response_direction, kind direction, consistency
-- ---------------------------------------------------------------------------

alter table vcp.responses
  add column response_direction text null;

alter table vcp.responses
  add constraint responses_response_direction_chk check (
    response_direction is null
    or response_direction in ('up', 'down', 'left', 'right')
  );

alter table vcp.responses drop constraint responses_response_kind_chk;
alter table vcp.responses
  add constraint responses_response_kind_chk check (
    response_kind in ('letter', 'not_sure', 'direction')
  );

alter table vcp.responses drop constraint responses_kind_letter_consistency_chk;
alter table vcp.responses
  add constraint responses_kind_letter_consistency_chk check (
    (response_kind = 'letter' and response_letter is not null and response_direction is null)
    or (response_kind = 'direction' and response_direction is not null and response_letter is null)
    or (response_kind = 'not_sure' and response_letter is null and response_direction is null)
  );

comment on column vcp.responses.response_direction is
  'Landolt C only. The gap direction answered: up, down, left or right. Set only with response_kind direction. Null for letter and not_sure answers.';

-- ---------------------------------------------------------------------------
-- 4. vcp.test_quality.test_mode
-- ---------------------------------------------------------------------------

alter table vcp.test_quality
  add column test_mode text not null default 'letters';

alter table vcp.test_quality
  add constraint test_quality_test_mode_chk check (test_mode in ('letters', 'landolt'));

comment on column vcp.test_quality.test_mode is
  'Which test produced this quality row: letters or landolt. Written by vcp_upsert_test_quality from the optional test_mode key; absent means letters.';

-- ---------------------------------------------------------------------------
-- 5. public.vcp_set_test_mode (new)
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0007: the session is no longer in status created.
-- A value other than letters or landolt fails sessions_test_mode_chk (23514).
-- ---------------------------------------------------------------------------

create or replace function public.vcp_set_test_mode(
  p_session_id uuid,
  p_test_mode text
)
returns text
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_status text;
  v_test_mode text;
begin
  select s.status
  into v_status
  from vcp.sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  if v_status <> 'created' then
    raise exception
      'Test mode can only be set while session % is created, status is %',
      p_session_id, v_status
      using errcode = 'V0007';
  end if;

  -- version is not bumped: the test mode is not loop state, and the display
  -- keeps writing loop state at the version it already holds.
  update vcp.sessions s
  set
    test_mode = p_test_mode,
    updated_at = pg_catalog.now()
  where s.id = p_session_id
  returning s.test_mode into v_test_mode;

  return v_test_mode;
end;
$fn$;

alter function public.vcp_set_test_mode(uuid, text) owner to postgres;

comment on function public.vcp_set_test_mode(uuid, text) is
  'Sets vcp.sessions.test_mode while the session status is created. Called by the staff Landolt C page straight after vcp_create_session. Does not change version.';

-- ---------------------------------------------------------------------------
-- 6. public.vcp_submit_direction_response (new)
-- Copy of vcp_submit_response with p_response_letter replaced by
-- p_response_direction. p_response_kind is direction or not_sure; the table
-- checks enforce it. IDEMPOTENT on (presentation_id, client_request_id).
-- SQLSTATE V0003: presentation missing, in another session, or not landolt.
-- SQLSTATE V0006: concurrent submission in flight, safe to retry.
-- Returns id, response_kind, response_direction, duplicate.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_submit_direction_response(
  p_session_id uuid,
  p_presentation_id uuid,
  p_client_request_id text,
  p_response_kind text,
  p_response_direction text,
  p_responded_at timestamptz,
  p_latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
  v_kind text;
  v_direction text;
  v_duplicate boolean;
begin
  if not exists (
    select 1
    from vcp.presentations p
    where p.id = p_presentation_id
      and p.session_id = p_session_id
      and p.format = 'landolt'
  ) then
    raise exception
      'Landolt C presentation % not found for session %',
      p_presentation_id, p_session_id
      using errcode = 'V0003';
  end if;

  insert into vcp.responses (
    presentation_id,
    session_id,
    client_request_id,
    response_kind,
    response_direction,
    responded_at,
    latency_ms
  ) values (
    p_presentation_id,
    p_session_id,
    p_client_request_id,
    p_response_kind,
    p_response_direction,
    p_responded_at,
    p_latency_ms
  )
  on conflict on constraint responses_presentation_id_client_request_id_key
  do nothing
  returning id, response_kind, response_direction
  into v_id, v_kind, v_direction;

  if v_id is null then
    select r.id, r.response_kind, r.response_direction
    into v_id, v_kind, v_direction
    from vcp.responses r
    where r.presentation_id = p_presentation_id
      and r.client_request_id = p_client_request_id;

    -- Concurrent in-flight duplicate: ON CONFLICT DO NOTHING does not wait
    -- for an uncommitted conflicting row, so both insert and select can miss.
    -- Safe to retry. Returning a null id would be worse than raising.
    if v_id is null then
      raise exception
        'Concurrent submission in flight for presentation % and request %, retry',
        p_presentation_id, p_client_request_id
        using errcode = 'V0006';
    end if;

    v_duplicate := true;
  else
    v_duplicate := false;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'response_kind', v_kind,
    'response_direction', v_direction,
    'duplicate', v_duplicate
  );
end;
$fn$;

alter function public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)
  owner to postgres;

comment on function public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer) is
  'Landolt C answer. Same arguments, checks, SQLSTATEs and return shape as vcp_submit_response, with a direction in place of a letter. Accepts only presentations of format landolt.';

-- ---------------------------------------------------------------------------
-- 7. public.vcp_record_presentation (body replaced, arguments unchanged)
-- Previous body: supabase/migrations/20260908160000_vcp_rpc_coalesce_fix.sql
-- Adds the optional keys landolt_direction and is_practice. Nothing else changes.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_record_presentation(
  p_session_id uuid,
  p_presentation jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
  v_key text;
  v_required text[] := array[
    'trial_index',
    'eye',
    'logmar_step_index',
    'requested_letter_height_mm',
    'requested_stroke_width_mm',
    'requested_letter_height_css_px',
    'requested_letter_height_device_px',
    'optotypes',
    'target_index',
    'format',
    'distance_mm_requested'
  ];
  v_optotypes text[];
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  if p_presentation is null or pg_catalog.jsonb_typeof(p_presentation) <> 'object' then
    raise exception 'Missing required presentation key: trial_index'
      using errcode = 'V0004';
  end if;

  foreach v_key in array v_required loop
    if not (p_presentation ? v_key) then
      raise exception 'Missing required presentation key: %', v_key
        using errcode = 'V0004';
    end if;
  end loop;

  select coalesce(pg_catalog.array_agg(t.value order by t.ordinality), array[]::pg_catalog.text[])
  into v_optotypes
  from pg_catalog.jsonb_array_elements_text(p_presentation -> 'optotypes')
    with ordinality as t(value, ordinality);

  insert into vcp.presentations (
    session_id,
    trial_index,
    eye,
    logmar_step_index,
    requested_letter_height_mm,
    requested_stroke_width_mm,
    requested_letter_height_css_px,
    requested_letter_height_device_px,
    actual_letter_height_device_px,
    actual_stroke_width_device_px,
    optotypes,
    target_index,
    format,
    crowding_spec,
    distance_mm_requested,
    distance_mm_observed,
    rendered_at,
    visibility_confirmed,
    landolt_direction,
    is_practice
  ) values (
    p_session_id,
    (p_presentation ->> 'trial_index')::integer,
    p_presentation ->> 'eye',
    (p_presentation ->> 'logmar_step_index')::smallint,
    (p_presentation ->> 'requested_letter_height_mm')::double precision,
    (p_presentation ->> 'requested_stroke_width_mm')::double precision,
    (p_presentation ->> 'requested_letter_height_css_px')::double precision,
    (p_presentation ->> 'requested_letter_height_device_px')::double precision,
    case
      when p_presentation ? 'actual_letter_height_device_px'
      then (p_presentation ->> 'actual_letter_height_device_px')::double precision
      else null
    end,
    case
      when p_presentation ? 'actual_stroke_width_device_px'
      then (p_presentation ->> 'actual_stroke_width_device_px')::double precision
      else null
    end,
    v_optotypes,
    (p_presentation ->> 'target_index')::smallint,
    p_presentation ->> 'format',
    case
      when p_presentation ? 'crowding_spec' then p_presentation -> 'crowding_spec'
      else '{}'::pg_catalog.jsonb
    end,
    (p_presentation ->> 'distance_mm_requested')::integer,
    case
      when p_presentation ? 'distance_mm_observed'
      then (p_presentation ->> 'distance_mm_observed')::double precision
      else null
    end,
    case
      when p_presentation ? 'rendered_at'
      then (p_presentation ->> 'rendered_at')::timestamptz
      else null
    end,
    case
      when p_presentation ? 'visibility_confirmed'
      then (p_presentation ->> 'visibility_confirmed')::boolean
      else false
    end,
    -- Landolt C keys. Both absent writes the column defaults, so a letter row is as before.
    case
      when p_presentation ? 'landolt_direction'
      then p_presentation ->> 'landolt_direction'
      else null
    end,
    case
      when p_presentation ? 'is_practice'
      then (p_presentation ->> 'is_practice')::boolean
      else false
    end
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_record_presentation(uuid, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- 8. public.vcp_upsert_test_quality (body replaced, arguments unchanged)
-- Previous body: supabase/migrations/20260908160000_vcp_rpc_coalesce_fix.sql
-- Adds the optional key test_mode. Nothing else changes.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_upsert_test_quality(
  p_session_id uuid,
  p_eye text,
  p_quality jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
  v_exists boolean;
  v_existing_distance_requested_mm integer;
  v_modes text[];
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  if p_quality is null or pg_catalog.jsonb_typeof(p_quality) <> 'object' then
    p_quality := '{}'::pg_catalog.jsonb;
  end if;

  select true, t.distance_requested_mm
  into v_exists, v_existing_distance_requested_mm
  from vcp.test_quality t
  where t.session_id = p_session_id
    and t.eye = p_eye;

  if not found then
    v_exists := false;
    v_existing_distance_requested_mm := null;
  end if;

  if not v_exists and not (p_quality ? 'distance_requested_mm') then
    raise exception 'Missing required test quality key: distance_requested_mm'
      using errcode = 'V0004';
  end if;

  if p_quality ? 'monitoring_modes_active' then
    select coalesce(pg_catalog.array_agg(t.value order by t.ordinality), array[]::pg_catalog.text[])
    into v_modes
    from pg_catalog.jsonb_array_elements_text(p_quality -> 'monitoring_modes_active')
      with ordinality as t(value, ordinality);
  else
    v_modes := null;
  end if;

  insert into vcp.test_quality (
    session_id,
    eye,
    calibration_id,
    distance_requested_mm,
    distance_observed_min_mm,
    distance_observed_max_mm,
    distance_confidence,
    monitoring_modes_active,
    renderable_finest_logmar,
    renderable_coarsest_logmar,
    finest_limited_by,
    coarsest_limited_by,
    screen_limited,
    bounded_result_reason,
    response_consistency,
    not_sure_count,
    reversals,
    retries,
    interruptions,
    ambient_light_estimate,
    distance_recommended_mm,
    distance_chosen_mm,
    final_logmar_step_index,
    final_snellen_label,
    test_mode
  ) values (
    p_session_id,
    p_eye,
    case
      when p_quality ? 'calibration_id'
      then (p_quality ->> 'calibration_id')::uuid
      else null
    end,
    -- NOT NULL is checked before ON CONFLICT, so the existing value must be
    -- supplied here rather than only in the DO UPDATE branch.
    coalesce(
      (p_quality ->> 'distance_requested_mm')::integer,
      v_existing_distance_requested_mm
    ),
    case
      when p_quality ? 'distance_observed_min_mm'
      then (p_quality ->> 'distance_observed_min_mm')::double precision
      else null
    end,
    case
      when p_quality ? 'distance_observed_max_mm'
      then (p_quality ->> 'distance_observed_max_mm')::double precision
      else null
    end,
    case
      when p_quality ? 'distance_confidence'
      then (p_quality ->> 'distance_confidence')::double precision
      else null
    end,
    coalesce(v_modes, array[]::pg_catalog.text[]),
    case
      when p_quality ? 'renderable_finest_logmar'
      then (p_quality ->> 'renderable_finest_logmar')::numeric(4, 2)
      else null
    end,
    case
      when p_quality ? 'renderable_coarsest_logmar'
      then (p_quality ->> 'renderable_coarsest_logmar')::numeric(4, 2)
      else null
    end,
    case
      when p_quality ? 'finest_limited_by' then p_quality ->> 'finest_limited_by'
      else null
    end,
    case
      when p_quality ? 'coarsest_limited_by' then p_quality ->> 'coarsest_limited_by'
      else null
    end,
    case
      when p_quality ? 'screen_limited'
      then (p_quality ->> 'screen_limited')::boolean
      else false
    end,
    case
      when p_quality ? 'bounded_result_reason'
      then p_quality ->> 'bounded_result_reason'
      else null
    end,
    case
      when p_quality ? 'response_consistency'
      then (p_quality ->> 'response_consistency')::double precision
      else null
    end,
    case
      when p_quality ? 'not_sure_count'
      then (p_quality ->> 'not_sure_count')::integer
      else 0
    end,
    case
      when p_quality ? 'reversals' then (p_quality ->> 'reversals')::integer
      else 0
    end,
    case
      when p_quality ? 'retries' then (p_quality ->> 'retries')::integer
      else 0
    end,
    case
      when p_quality ? 'interruptions'
      then (p_quality ->> 'interruptions')::integer
      else 0
    end,
    case
      when p_quality ? 'ambient_light_estimate'
      then (p_quality ->> 'ambient_light_estimate')::double precision
      else null
    end,
    case
      when p_quality ? 'distance_recommended_mm'
      then (p_quality ->> 'distance_recommended_mm')::integer
      else null
    end,
    case
      when p_quality ? 'distance_chosen_mm'
      then (p_quality ->> 'distance_chosen_mm')::integer
      else null
    end,
    case
      when p_quality ? 'final_logmar_step_index'
      then (p_quality ->> 'final_logmar_step_index')::smallint
      else null
    end,
    case
      when p_quality ? 'final_snellen_label'
      then p_quality ->> 'final_snellen_label'
      else null
    end,
    -- Landolt C key. Absent writes letters, the column default, as before.
    case
      when p_quality ? 'test_mode'
      then p_quality ->> 'test_mode'
      else 'letters'
    end
  )
  on conflict on constraint test_quality_session_id_eye_key
  do update set
    calibration_id = case
      when p_quality ? 'calibration_id'
      then (p_quality ->> 'calibration_id')::uuid
      else vcp.test_quality.calibration_id
    end,
    distance_requested_mm = case
      when p_quality ? 'distance_requested_mm'
      then (p_quality ->> 'distance_requested_mm')::integer
      else vcp.test_quality.distance_requested_mm
    end,
    distance_observed_min_mm = case
      when p_quality ? 'distance_observed_min_mm'
      then (p_quality ->> 'distance_observed_min_mm')::double precision
      else vcp.test_quality.distance_observed_min_mm
    end,
    distance_observed_max_mm = case
      when p_quality ? 'distance_observed_max_mm'
      then (p_quality ->> 'distance_observed_max_mm')::double precision
      else vcp.test_quality.distance_observed_max_mm
    end,
    distance_confidence = case
      when p_quality ? 'distance_confidence'
      then (p_quality ->> 'distance_confidence')::double precision
      else vcp.test_quality.distance_confidence
    end,
    monitoring_modes_active = case
      when p_quality ? 'monitoring_modes_active' then v_modes
      else vcp.test_quality.monitoring_modes_active
    end,
    renderable_finest_logmar = case
      when p_quality ? 'renderable_finest_logmar'
      then (p_quality ->> 'renderable_finest_logmar')::numeric(4, 2)
      else vcp.test_quality.renderable_finest_logmar
    end,
    renderable_coarsest_logmar = case
      when p_quality ? 'renderable_coarsest_logmar'
      then (p_quality ->> 'renderable_coarsest_logmar')::numeric(4, 2)
      else vcp.test_quality.renderable_coarsest_logmar
    end,
    finest_limited_by = case
      when p_quality ? 'finest_limited_by'
      then p_quality ->> 'finest_limited_by'
      else vcp.test_quality.finest_limited_by
    end,
    coarsest_limited_by = case
      when p_quality ? 'coarsest_limited_by'
      then p_quality ->> 'coarsest_limited_by'
      else vcp.test_quality.coarsest_limited_by
    end,
    screen_limited = case
      when p_quality ? 'screen_limited'
      then (p_quality ->> 'screen_limited')::boolean
      else vcp.test_quality.screen_limited
    end,
    bounded_result_reason = case
      when p_quality ? 'bounded_result_reason'
      then p_quality ->> 'bounded_result_reason'
      else vcp.test_quality.bounded_result_reason
    end,
    response_consistency = case
      when p_quality ? 'response_consistency'
      then (p_quality ->> 'response_consistency')::double precision
      else vcp.test_quality.response_consistency
    end,
    not_sure_count = case
      when p_quality ? 'not_sure_count'
      then (p_quality ->> 'not_sure_count')::integer
      else vcp.test_quality.not_sure_count
    end,
    reversals = case
      when p_quality ? 'reversals'
      then (p_quality ->> 'reversals')::integer
      else vcp.test_quality.reversals
    end,
    retries = case
      when p_quality ? 'retries'
      then (p_quality ->> 'retries')::integer
      else vcp.test_quality.retries
    end,
    interruptions = case
      when p_quality ? 'interruptions'
      then (p_quality ->> 'interruptions')::integer
      else vcp.test_quality.interruptions
    end,
    ambient_light_estimate = case
      when p_quality ? 'ambient_light_estimate'
      then (p_quality ->> 'ambient_light_estimate')::double precision
      else vcp.test_quality.ambient_light_estimate
    end,
    distance_recommended_mm = case
      when p_quality ? 'distance_recommended_mm'
      then (p_quality ->> 'distance_recommended_mm')::integer
      else vcp.test_quality.distance_recommended_mm
    end,
    distance_chosen_mm = case
      when p_quality ? 'distance_chosen_mm'
      then (p_quality ->> 'distance_chosen_mm')::integer
      else vcp.test_quality.distance_chosen_mm
    end,
    final_logmar_step_index = case
      when p_quality ? 'final_logmar_step_index'
      then (p_quality ->> 'final_logmar_step_index')::smallint
      else vcp.test_quality.final_logmar_step_index
    end,
    final_snellen_label = case
      when p_quality ? 'final_snellen_label'
      then p_quality ->> 'final_snellen_label'
      else vcp.test_quality.final_snellen_label
    end,
    test_mode = case
      when p_quality ? 'test_mode'
      then p_quality ->> 'test_mode'
      else vcp.test_quality.test_mode
    end
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_upsert_test_quality(uuid, text, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- Grants. Same pattern as 20260923120000 and 20260924120000, which follow
-- 20260922120000_vcp_privileges_tidy: revoke from public, anon,
-- authenticated and service_role, then EXECUTE to anon. The owner postgres
-- keeps EXECUTE. Restated for the two replaced functions.
-- ---------------------------------------------------------------------------

revoke all on function public.vcp_set_test_mode(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_set_test_mode(uuid, text) to anon;

revoke all on function public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer) to anon;

revoke all on function public.vcp_record_presentation(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_record_presentation(uuid, jsonb) to anon;

revoke all on function public.vcp_upsert_test_quality(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_upsert_test_quality(uuid, text, jsonb) to anon;

COMMIT;
