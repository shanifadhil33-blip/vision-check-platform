-- EMERGENCY ONLY. THIS SCRIPT REMOVES:
--   - public.vcp_get_answered_trials(uuid)
--   - the tracking row for 20260923120000_vcp_get_answered_trials
-- It does not touch any table data, the other ten RPCs, or schema vcp.
-- Version: 20260923120000_vcp_get_answered_trials
-- The Supabase CLI is never used.

BEGIN;

drop function if exists public.vcp_get_answered_trials(uuid);

delete from vcp.schema_migrations
where version = '20260923120000_vcp_get_answered_trials';

COMMIT;
