-- GIT RECORD. This file is NEVER executed.
-- The ops apply copy is the only file that runs:
--   supabase/ops/20260908140000_vcp_rpc_surface.apply.sql
-- Version: 20260908140000_vcp_rpc_surface
-- A human pastes the apply copy by hand into the Supabase SQL editor.
-- The Supabase CLI is never used.
-- Adds SECURITY DEFINER RPCs in schema public only. Does not alter any table.
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
-- 1. public.vcp_create_session
-- SQLSTATE: none for the happy path (creates the capability id).
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
begin
  insert into vcp.sessions (
    status,
    version,
    distance_mm_requested,
    client_build
  ) values (
    'created',
    0,
    p_distance_mm_requested,
    p_client_build
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_create_session(integer, text) owner to postgres;

-- ---------------------------------------------------------------------------
-- 2. public.vcp_get_session
-- SQLSTATE V0001: session does not exist.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_get_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_row jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'version', s.version,
    'current_state', s.current_state,
    'distance_mm_requested', s.distance_mm_requested,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  )
  into v_row
  from vcp.sessions s
  where s.id = p_session_id;

  if v_row is null then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  return v_row;
end;
$fn$;

alter function public.vcp_get_session(uuid) owner to postgres;

-- ---------------------------------------------------------------------------
-- 3. public.vcp_pair_session
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0002: version conflict (expected version did not match).
-- ---------------------------------------------------------------------------

create or replace function public.vcp_pair_session(
  p_session_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_status text;
  v_version integer;
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  update vcp.sessions s
  set
    status = 'paired',
    version = s.version + 1,
    updated_at = pg_catalog.now()
  where s.id = p_session_id
    and s.version = p_expected_version
  returning s.status, s.version into v_status, v_version;

  if v_status is null then
    raise exception
      'Version conflict for session %: expected version %',
      p_session_id, p_expected_version
      using errcode = 'V0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'version', v_version
  );
end;
$fn$;

alter function public.vcp_pair_session(uuid, integer) owner to postgres;

-- ---------------------------------------------------------------------------
-- 4. public.vcp_set_session_state
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0002: version conflict (expected version did not match).
-- p_status must satisfy sessions_status_chk; the table constraint enforces it.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_set_session_state(
  p_session_id uuid,
  p_expected_version integer,
  p_status text,
  p_current_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_status text;
  v_version integer;
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  update vcp.sessions s
  set
    status = p_status,
    current_state = p_current_state,
    version = s.version + 1,
    updated_at = pg_catalog.now()
  where s.id = p_session_id
    and s.version = p_expected_version
  returning s.status, s.version into v_status, v_version;

  if v_status is null then
    raise exception
      'Version conflict for session %: expected version %',
      p_session_id, p_expected_version
      using errcode = 'V0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'version', v_version
  );
end;
$fn$;

alter function public.vcp_set_session_state(uuid, integer, text, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- 5. public.vcp_attach_calibration
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0004: required Calibration jsonb key missing (message names the key).
-- Keys match lib/calibration/types.ts Calibration exactly (camelCase).
-- createdAtIso maps to calibrated_at. verifications stored whole.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_attach_calibration(
  p_session_id uuid,
  p_calibration jsonb
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
    'cssPxPerMm',
    'cardWidthCssPx',
    'devicePixelRatio',
    'viewportWidthCssPx',
    'viewportHeightCssPx',
    'screenWidthCssPx',
    'screenHeightCssPx',
    'userAgent',
    'createdAtIso',
    'method',
    'verifications'
  ];
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  if p_calibration is null or pg_catalog.jsonb_typeof(p_calibration) <> 'object' then
    raise exception 'Missing required calibration key: cssPxPerMm'
      using errcode = 'V0004';
  end if;

  foreach v_key in array v_required loop
    if not (p_calibration ? v_key) then
      raise exception 'Missing required calibration key: %', v_key
        using errcode = 'V0004';
    end if;
  end loop;

  insert into vcp.calibrations (
    session_id,
    css_px_per_mm,
    card_width_css_px,
    device_pixel_ratio,
    viewport_width_css_px,
    viewport_height_css_px,
    screen_width_css_px,
    screen_height_css_px,
    user_agent,
    method,
    calibrated_at,
    verifications
  ) values (
    p_session_id,
    (p_calibration ->> 'cssPxPerMm')::double precision,
    (p_calibration ->> 'cardWidthCssPx')::double precision,
    (p_calibration ->> 'devicePixelRatio')::double precision,
    (p_calibration ->> 'viewportWidthCssPx')::integer,
    (p_calibration ->> 'viewportHeightCssPx')::integer,
    (p_calibration ->> 'screenWidthCssPx')::integer,
    (p_calibration ->> 'screenHeightCssPx')::integer,
    p_calibration ->> 'userAgent',
    p_calibration ->> 'method',
    (p_calibration ->> 'createdAtIso')::timestamptz,
    p_calibration -> 'verifications'
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_attach_calibration(uuid, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- 6. public.vcp_record_presentation
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0004: required presentation jsonb key missing (message names the key).
-- Jsonb keys match vcp.presentations column names (snake_case).
-- Table check constraints validate letters, format, ranges; not restated here.
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

  select pg_catalog.coalesce(pg_catalog.array_agg(t.value order by t.ordinality), array[]::pg_catalog.text[])
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
    visibility_confirmed
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
    end
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_record_presentation(uuid, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- 7. public.vcp_record_rendered
-- SQLSTATE V0005: no presentation row updated (id missing or wrong session).
-- Holding a presentation id alone is not enough: session_id must also match.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_record_rendered(
  p_session_id uuid,
  p_presentation_id uuid,
  p_actual_letter_height_device_px double precision,
  p_actual_stroke_width_device_px double precision,
  p_rendered_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_updated integer;
begin
  update vcp.presentations p
  set
    actual_letter_height_device_px = p_actual_letter_height_device_px,
    actual_stroke_width_device_px = p_actual_stroke_width_device_px,
    rendered_at = p_rendered_at
  where p.id = p_presentation_id
    and p.session_id = p_session_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception
      'Presentation % not found for session %',
      p_presentation_id, p_session_id
      using errcode = 'V0005';
  end if;

  return true;
end;
$fn$;

alter function public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)
  owner to postgres;

-- ---------------------------------------------------------------------------
-- 8. public.vcp_submit_response
-- IDEMPOTENT. Calling twice with the same (presentation_id, client_request_id)
-- must return the same response id, with duplicate false the first time and
-- duplicate true the second time. The unique constraint
-- responses_presentation_id_client_request_id_key makes that true.
-- SQLSTATE V0003: presentation does not belong to p_session_id (or missing).
-- ---------------------------------------------------------------------------

create or replace function public.vcp_submit_response(
  p_session_id uuid,
  p_presentation_id uuid,
  p_client_request_id text,
  p_response_kind text,
  p_response_letter text,
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
  v_letter text;
  v_duplicate boolean;
begin
  if not exists (
    select 1
    from vcp.presentations p
    where p.id = p_presentation_id
      and p.session_id = p_session_id
  ) then
    raise exception
      'Presentation % not found for session %',
      p_presentation_id, p_session_id
      using errcode = 'V0003';
  end if;

  insert into vcp.responses (
    presentation_id,
    session_id,
    client_request_id,
    response_kind,
    response_letter,
    responded_at,
    latency_ms
  ) values (
    p_presentation_id,
    p_session_id,
    p_client_request_id,
    p_response_kind,
    p_response_letter,
    p_responded_at,
    p_latency_ms
  )
  on conflict on constraint responses_presentation_id_client_request_id_key
  do nothing
  returning id, response_kind, response_letter
  into v_id, v_kind, v_letter;

  if v_id is null then
    select r.id, r.response_kind, r.response_letter
    into v_id, v_kind, v_letter
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
    'response_letter', v_letter,
    'duplicate', v_duplicate
  );
end;
$fn$;

alter function public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)
  owner to postgres;

-- ---------------------------------------------------------------------------
-- 9. public.vcp_append_event
-- SQLSTATE V0001: session does not exist.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_append_event(
  p_session_id uuid,
  p_type text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from vcp.sessions s where s.id = p_session_id
  ) then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  insert into vcp.session_events (
    session_id,
    type,
    payload
  ) values (
    p_session_id,
    p_type,
    pg_catalog.coalesce(p_payload, '{}'::pg_catalog.jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_append_event(uuid, text, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- 10. public.vcp_upsert_test_quality
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0004: distance_requested_mm missing on first insert.
-- Jsonb keys match vcp.test_quality column names (snake_case).
-- Missing keys leave existing column values untouched on update.
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
    select pg_catalog.coalesce(pg_catalog.array_agg(t.value order by t.ordinality), array[]::pg_catalog.text[])
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
    final_snellen_label
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
    pg_catalog.coalesce(
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
    pg_catalog.coalesce(v_modes, array[]::pg_catalog.text[]),
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
    end
  returning id into v_id;

  return v_id;
end;
$fn$;

alter function public.vcp_upsert_test_quality(uuid, text, jsonb) owner to postgres;

-- ---------------------------------------------------------------------------
-- Grants. Explicit revoke then grant for every function. No loops.
-- ---------------------------------------------------------------------------

revoke all on function public.vcp_create_session(integer, text)
  from public, anon, authenticated;
grant execute on function public.vcp_create_session(integer, text) to anon;

revoke all on function public.vcp_get_session(uuid)
  from public, anon, authenticated;
grant execute on function public.vcp_get_session(uuid) to anon;

revoke all on function public.vcp_pair_session(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.vcp_pair_session(uuid, integer) to anon;

revoke all on function public.vcp_set_session_state(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.vcp_set_session_state(uuid, integer, text, jsonb) to anon;

revoke all on function public.vcp_attach_calibration(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.vcp_attach_calibration(uuid, jsonb) to anon;

revoke all on function public.vcp_record_presentation(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.vcp_record_presentation(uuid, jsonb) to anon;

revoke all on function public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)
  from public, anon, authenticated;
grant execute on function public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz) to anon;

revoke all on function public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer) to anon;

revoke all on function public.vcp_append_event(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.vcp_append_event(uuid, text, jsonb) to anon;

revoke all on function public.vcp_upsert_test_quality(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.vcp_upsert_test_quality(uuid, text, jsonb) to anon;

COMMIT;
