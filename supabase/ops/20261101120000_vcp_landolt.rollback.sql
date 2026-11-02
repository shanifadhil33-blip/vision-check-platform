-- EMERGENCY ONLY. Do not run unless told to.
-- Version: 20261101120000_vcp_landolt
-- THIS SCRIPT RESTORES the state before 20261101120000_vcp_landolt:
--   - drops public.vcp_set_test_mode(uuid, text)
--   - drops public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer)
--   - restores the bodies of public.vcp_record_presentation(uuid, jsonb) and
--     public.vcp_upsert_test_quality(uuid, text, jsonb) verbatim from
--     supabase/migrations/20260908160000_vcp_rpc_coalesce_fix.sql, with their grants
--   - restores presentations_format_chk, responses_response_kind_chk and
--     responses_kind_letter_consistency_chk to their 20260908120000 definitions
--   - drops the five new checks and the five new columns:
--     vcp.sessions.test_mode, vcp.presentations.is_practice,
--     vcp.presentations.landolt_direction, vcp.responses.response_direction,
--     vcp.test_quality.test_mode
--   - deletes the tracking row for 20261101120000_vcp_landolt
-- WHAT IT REOPENS: the database can no longer store a Landolt C session,
-- presentation or direction answer, and the staff Landolt C page stops
-- working. The letter test is not affected.
-- If any Landolt C data exists (a landolt session, presentation, direction
-- answer or quality row), this script raises and changes nothing, because
-- dropping the columns would destroy that data. Export it first and get
-- explicit approval before removing it by hand.
-- One transaction: a failure rolls back the whole script.
-- The Supabase CLI is never used.

BEGIN;

do $guard$
begin
  if exists (select 1 from vcp.sessions s where s.test_mode <> 'letters')
    or exists (
      select 1
      from vcp.presentations p
      where p.format = 'landolt' or p.landolt_direction is not null or p.is_practice
    )
    or exists (
      select 1
      from vcp.responses r
      where r.response_kind = 'direction' or r.response_direction is not null
    )
    or exists (select 1 from vcp.test_quality q where q.test_mode <> 'letters')
  then
    raise exception
      'Rollback refused: Landolt C data exists. No rows or objects were changed.';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 1. New functions
-- ---------------------------------------------------------------------------

drop function public.vcp_set_test_mode(uuid, text);
drop function public.vcp_submit_direction_response(uuid, uuid, text, text, text, timestamptz, integer);

-- ---------------------------------------------------------------------------
-- 2. Previous bodies, verbatim from 20260908160000_vcp_rpc_coalesce_fix.sql.
--    Restored before the columns are dropped, so no function is left naming
--    a column that no longer exists.
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

revoke all on function public.vcp_record_presentation(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_record_presentation(uuid, jsonb) to anon;

revoke all on function public.vcp_upsert_test_quality(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_upsert_test_quality(uuid, text, jsonb) to anon;

-- ---------------------------------------------------------------------------
-- 3. Checks back to their 20260908120000 definitions
-- ---------------------------------------------------------------------------

alter table vcp.presentations drop constraint presentations_landolt_shape_chk;
alter table vcp.presentations drop constraint presentations_landolt_direction_chk;
alter table vcp.presentations drop constraint presentations_format_chk;
alter table vcp.presentations
  add constraint presentations_format_chk check (format in ('single', 'flanked-triplet', 'row'));

alter table vcp.responses drop constraint responses_kind_letter_consistency_chk;
alter table vcp.responses
  add constraint responses_kind_letter_consistency_chk check (
    (response_kind = 'letter' and response_letter is not null)
    or (response_kind = 'not_sure' and response_letter is null)
  );
alter table vcp.responses drop constraint responses_response_kind_chk;
alter table vcp.responses
  add constraint responses_response_kind_chk check (response_kind in ('letter', 'not_sure'));
alter table vcp.responses drop constraint responses_response_direction_chk;

alter table vcp.sessions drop constraint sessions_test_mode_chk;
alter table vcp.test_quality drop constraint test_quality_test_mode_chk;

-- ---------------------------------------------------------------------------
-- 4. Columns
-- ---------------------------------------------------------------------------

alter table vcp.sessions drop column test_mode;
alter table vcp.presentations drop column is_practice;
alter table vcp.presentations drop column landolt_direction;
alter table vcp.responses drop column response_direction;
alter table vcp.test_quality drop column test_mode;

-- ---------------------------------------------------------------------------
-- 5. Tracking row
-- ---------------------------------------------------------------------------

delete from vcp.schema_migrations
where version = '20261101120000_vcp_landolt';

COMMIT;
