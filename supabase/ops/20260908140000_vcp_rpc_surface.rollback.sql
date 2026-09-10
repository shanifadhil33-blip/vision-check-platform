-- EMERGENCY ONLY. THIS SCRIPT DESTROYS THE TEN public.vcp_* RPC FUNCTIONS
-- AND THE TRACKING ROW FOR 20260908140000_vcp_rpc_surface.
-- It exists for a failed apply and nothing else.
-- It reopens the pre-RPC state: schema vcp and all tables remain intact.
-- It does NOT drop schema vcp and does NOT touch any table.
-- Version: 20260908140000_vcp_rpc_surface
-- The Supabase CLI is never used.

BEGIN;

drop function if exists public.vcp_create_session(integer, text);
drop function if exists public.vcp_get_session(uuid);
drop function if exists public.vcp_pair_session(uuid, integer);
drop function if exists public.vcp_set_session_state(uuid, integer, text, jsonb);
drop function if exists public.vcp_attach_calibration(uuid, jsonb);
drop function if exists public.vcp_record_presentation(uuid, jsonb);
drop function if exists public.vcp_record_rendered(uuid, uuid, double precision, double precision, timestamptz);
drop function if exists public.vcp_submit_response(uuid, uuid, text, text, text, timestamptz, integer);
drop function if exists public.vcp_append_event(uuid, text, jsonb);
drop function if exists public.vcp_upsert_test_quality(uuid, text, jsonb);

delete from vcp.schema_migrations
where version = '20260908140000_vcp_rpc_surface';

COMMIT;
