-- APPLY COPY. Paste this file only into the Supabase SQL editor.
-- Git record (never executed): supabase/migrations/20261107120000_vcp_distance_readings.sql
-- Version: 20261107120000_vcp_distance_readings
-- The body is identical to the git record. The tracking insert is in this
-- same transaction so a failure leaves nothing registered.
-- The Supabase CLI is never used.
--
-- WHAT THIS MIGRATION DOES
-- Lets the phone save distance readings (movement detection from the
-- baseline) into vcp.distance_events, which until now had no writer.
--   1. vcp.distance_events.captured_at, timestamptz, nullable: when the
--      phone took the reading, as opposed to created_at, when the row landed.
--   2. New function vcp_record_distance_readings(p_session_id, p_readings):
--      inserts 1 to 50 readings in one call and returns the rows inserted.
--      Every reading is checked before any row is written, so a refused
--      batch writes nothing.
-- No existing function, argument list, check or grant changes. The table
-- checks stay the only value checks: method list, baseline_ratio over 0,
-- absolute_mm over 0, confidence 0 to 1.
--
-- p_readings is a jsonb array of objects. Required keys: method,
-- raw_value, baseline_ratio, absolute_mm, flagged, captured_at (ISO time).
-- Optional keys: confidence, presentation_id.
--
-- Custom SQLSTATE contract (client code depends on these; do not renumber):
--   V0001 session not found
--   V0002 version conflict, expected version did not match
--   V0003 presentation does not belong to that session
--   V0004 required key missing from a jsonb argument
--   V0005 no presentation row updated, id missing or wrong session
--   V0006 concurrent submission in flight, safe to retry
--   V0007 test mode set after the session left status created
--   V0008 new: distance readings batch refused (not an array, empty, over
--         50 readings, or the session status is complete or abandoned)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. vcp.distance_events.captured_at
-- ---------------------------------------------------------------------------

alter table vcp.distance_events
  add column captured_at timestamptz null;

comment on column vcp.distance_events.captured_at is
  'When the phone took the reading. Set by vcp_record_distance_readings from the captured_at key. created_at is when the row was written.';

-- ---------------------------------------------------------------------------
-- 2. public.vcp_record_distance_readings (new)
-- SQLSTATE V0001: session does not exist.
-- SQLSTATE V0008: session complete or abandoned, or p_readings is not an
--                 array, is empty, or has more than 50 elements.
-- SQLSTATE V0004: a reading is not an object or lacks a required key.
-- SQLSTATE V0003: a presentation_id is not a presentation of this session.
-- The session row is locked FOR SHARE, so it cannot be closed between the
-- status check and the insert.
-- Returns the number of rows inserted.
-- ---------------------------------------------------------------------------

create or replace function public.vcp_record_distance_readings(
  p_session_id uuid,
  p_readings jsonb
)
returns integer
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_status text;
  v_count integer;
  v_reading jsonb;
  v_key text;
  v_inserted integer;
  v_required text[] := array[
    'method',
    'raw_value',
    'baseline_ratio',
    'absolute_mm',
    'flagged',
    'captured_at'
  ];
begin
  select s.status
  into v_status
  from vcp.sessions s
  where s.id = p_session_id
  for share;

  if not found then
    raise exception 'Session not found: %', p_session_id
      using errcode = 'V0001';
  end if;

  if v_status in ('complete', 'abandoned') then
    raise exception 'Distance readings refused: session % is %', p_session_id, v_status
      using errcode = 'V0008';
  end if;

  if p_readings is null or pg_catalog.jsonb_typeof(p_readings) <> 'array' then
    raise exception 'Distance readings refused: p_readings is not an array'
      using errcode = 'V0008';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_readings);
  if v_count < 1 or v_count > 50 then
    raise exception 'Distance readings refused: % readings, expected 1 to 50', v_count
      using errcode = 'V0008';
  end if;

  for v_reading in
    select e.value from pg_catalog.jsonb_array_elements(p_readings) as e(value)
  loop
    if pg_catalog.jsonb_typeof(v_reading) <> 'object' then
      raise exception 'Missing required distance reading key: method'
        using errcode = 'V0004';
    end if;

    foreach v_key in array v_required loop
      if not (v_reading ? v_key) then
        raise exception 'Missing required distance reading key: %', v_key
          using errcode = 'V0004';
      end if;
    end loop;

    if v_reading ? 'presentation_id'
      and pg_catalog.jsonb_typeof(v_reading -> 'presentation_id') <> 'null'
      and not exists (
        select 1
        from vcp.presentations p
        where p.id = (v_reading ->> 'presentation_id')::uuid
          and p.session_id = p_session_id
      )
    then
      raise exception
        'Presentation % does not belong to session %',
        v_reading ->> 'presentation_id', p_session_id
        using errcode = 'V0003';
    end if;
  end loop;

  insert into vcp.distance_events (
    session_id,
    presentation_id,
    method,
    raw_value,
    baseline_ratio,
    absolute_mm,
    confidence,
    flagged,
    captured_at
  )
  select
    p_session_id,
    case
      when e.value ? 'presentation_id' then (e.value ->> 'presentation_id')::uuid
      else null
    end,
    e.value ->> 'method',
    (e.value ->> 'raw_value')::double precision,
    (e.value ->> 'baseline_ratio')::double precision,
    (e.value ->> 'absolute_mm')::double precision,
    case
      when e.value ? 'confidence' then (e.value ->> 'confidence')::double precision
      else null
    end,
    (e.value ->> 'flagged')::boolean,
    (e.value ->> 'captured_at')::timestamptz
  from pg_catalog.jsonb_array_elements(p_readings) with ordinality as e(value, ordinality)
  order by e.ordinality;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$fn$;

alter function public.vcp_record_distance_readings(uuid, jsonb) owner to postgres;

comment on function public.vcp_record_distance_readings(uuid, jsonb) is
  'Saves 1 to 50 distance readings for one open session into vcp.distance_events and returns the rows inserted. All readings are checked before any row is written. V0001 no session, V0003 presentation of another session, V0004 missing key, V0008 batch refused.';

-- ---------------------------------------------------------------------------
-- Grants. Same pattern as 20261101120000_vcp_landolt, which follows
-- 20260922120000_vcp_privileges_tidy: revoke from public, anon,
-- authenticated and service_role, then EXECUTE to anon. The owner postgres
-- keeps EXECUTE.
-- ---------------------------------------------------------------------------

revoke all on function public.vcp_record_distance_readings(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_record_distance_readings(uuid, jsonb) to anon;

-- Tracking registration (apply copy only). Same transaction as the body.
insert into vcp.schema_migrations (version)
  values ('20261107120000_vcp_distance_readings');

COMMIT;
