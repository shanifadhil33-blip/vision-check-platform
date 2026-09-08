-- EMERGENCY ONLY. THIS SCRIPT DESTROYS ALL DATA IN THE vcp SCHEMA.
-- It exists for a failed apply and nothing else.
-- It reopens nothing: schema vcp did not exist before this migration.
-- Version: 20260908120000_vcp_initial_schema
-- The Supabase CLI is never used.

BEGIN;

drop schema vcp cascade;

COMMIT;
