-- EMERGENCY ONLY. THIS SCRIPT REOPENS THE PRIVILEGE SURFACE MEASURED ON
-- 22 SEPTEMBER AFTER THE DASHBOARD SETTING WAS TURNED OFF:
--   - service_role again holds EXECUTE on all ten public vcp_ RPCs
--   - pg_default_acl for grantor postgres in schema public again grants
--     TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables to anon,
--     authenticated and service_role
--   - and again grants UPDATE on sequences to those three roles
-- Function default privileges stay as measured (postgres=X only); this
-- rollback does not re-grant function defaults to anon, authenticated or
-- service_role. Function bodies and tables are not altered.
-- Deletes only the tracking row for 20260922120000_vcp_privileges_tidy.
-- Version: 20260922120000_vcp_privileges_tidy
-- The Supabase CLI is never used.

BEGIN;

-- ---------------------------------------------------------------------------
-- Restore service_role EXECUTE on each of the ten (full signatures).
-- ---------------------------------------------------------------------------

grant execute on function public.vcp_create_session(integer, text)
  to service_role;

grant execute on function public.vcp_get_session(uuid)
  to service_role;

grant execute on function public.vcp_pair_session(uuid, integer)
  to service_role;

grant execute on function public.vcp_set_session_state(uuid, integer, text, jsonb)
  to service_role;

grant execute on function public.vcp_attach_calibration(uuid, jsonb)
  to service_role;

grant execute on function public.vcp_record_presentation(uuid, jsonb)
  to service_role;

grant execute on function public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz)
  to service_role;

grant execute on function public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer)
  to service_role;

grant execute on function public.vcp_append_event(uuid, text, jsonb)
  to service_role;

grant execute on function public.vcp_upsert_test_quality(uuid, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Restore residual table default privileges (Dxtm), not full arwdDxtm.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  grant truncate, references, trigger, maintain on tables
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Restore residual sequence default privilege (UPDATE only).
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  grant update on sequences
  to anon, authenticated, service_role;

-- Function defaults: measured state was already postgres=X only. No restore.

delete from vcp.schema_migrations
where version = '20260922120000_vcp_privileges_tidy';

COMMIT;
