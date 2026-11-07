-- EMERGENCY ONLY. Do not run unless told to.
-- Version: 20261107120000_vcp_distance_readings
-- THIS SCRIPT RESTORES the state before 20261107120000_vcp_distance_readings:
--   - drops public.vcp_record_distance_readings(uuid, jsonb)
--   - drops the column vcp.distance_events.captured_at
--   - deletes the tracking row for 20261107120000_vcp_distance_readings
-- WHAT IT REOPENS: the phone can no longer save distance readings.
-- vcp.distance_events goes back to having no writer. The letter test and
-- the Landolt C test are not affected.
-- If any distance_events row has captured_at set (any reading saved through
-- the new function), this script raises and changes nothing, because
-- dropping the column would destroy that data. Export it first and get
-- explicit approval before removing it by hand.
-- One transaction: a failure rolls back the whole script.
-- The Supabase CLI is never used.

BEGIN;

do $guard$
begin
  if exists (select 1 from vcp.distance_events d where d.captured_at is not null) then
    raise exception
      'Rollback refused: saved distance readings exist. No rows or objects were changed.';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 1. New function
-- ---------------------------------------------------------------------------

drop function public.vcp_record_distance_readings(uuid, jsonb);

-- ---------------------------------------------------------------------------
-- 2. Column
-- ---------------------------------------------------------------------------

alter table vcp.distance_events drop column captured_at;

-- ---------------------------------------------------------------------------
-- 3. Tracking row
-- ---------------------------------------------------------------------------

delete from vcp.schema_migrations
where version = '20261107120000_vcp_distance_readings';

COMMIT;
