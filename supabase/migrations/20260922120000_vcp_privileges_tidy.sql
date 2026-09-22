-- GIT RECORD. This file is NEVER executed.
-- The ops apply copy is the only file that runs:
--   supabase/ops/20260922120000_vcp_privileges_tidy.apply.sql
-- Version: 20260922120000_vcp_privileges_tidy
-- A human pastes the apply copy by hand into the Supabase SQL editor.
-- The Supabase CLI is never used.
--
-- WHY THIS MIGRATION EXISTS
-- Measured 22 September after "Automatically expose new tables" was turned
-- off: service_role still holds EXECUTE on all ten public vcp_ RPCs, and
-- pg_default_acl for grantor postgres in schema public still grants
-- residual table privileges (Dxtm) and sequence UPDATE (w) to anon,
-- authenticated and service_role. Function defaults are already clean
-- (postgres=X only). This migration revokes service_role EXECUTE on the
-- ten RPCs and clears those residual default privileges. anon keeps
-- EXECUTE on all ten. Function bodies and tables are untouched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Revoke EXECUTE on each of the ten public vcp_ functions from service_role.
--    Signatures from supabase/migrations/20260908140000_vcp_rpc_surface.sql
--    grant block (lines 917-955).
-- ---------------------------------------------------------------------------

revoke execute on function public.vcp_create_session(integer, text)
  from service_role;

revoke execute on function public.vcp_get_session(uuid)
  from service_role;

revoke execute on function public.vcp_pair_session(uuid, integer)
  from service_role;

revoke execute on function public.vcp_set_session_state(uuid, integer, text, jsonb)
  from service_role;

revoke execute on function public.vcp_attach_calibration(uuid, jsonb)
  from service_role;

revoke execute on function public.vcp_record_presentation(uuid, jsonb)
  from service_role;

revoke execute on function public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)
  from service_role;

revoke execute on function public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)
  from service_role;

revoke execute on function public.vcp_append_event(uuid, text, jsonb)
  from service_role;

revoke execute on function public.vcp_upsert_test_quality(uuid, text, jsonb)
  from service_role;

-- ---------------------------------------------------------------------------
-- 2. Default privileges on tables: revoke residual Dxtm from the three roles.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Default privileges on sequences: revoke residual UPDATE (w).
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Default privileges on functions: already clean (postgres=X only).
--    Stated so the file does not depend on the dashboard setting remaining off.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

COMMIT;
