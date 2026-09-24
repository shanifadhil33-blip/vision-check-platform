-- EMERGENCY ONLY. THIS SCRIPT RESTORES:
--   - public.vcp_create_session(integer, text) to the body from
--     supabase/migrations/20260908140000_vcp_rpc_surface.sql lines 24-51
--   - and deletes the tracking row for 20260924120000_vcp_sweep_abandoned_sessions
-- Sessions already set to status 'abandoned' are NOT reopened.
-- Version: 20260924120000_vcp_sweep_abandoned_sessions
-- The Supabase CLI is never used.

BEGIN;

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

revoke all on function public.vcp_create_session(integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.vcp_create_session(integer, text) to anon;

delete from vcp.schema_migrations
where version = '20260924120000_vcp_sweep_abandoned_sessions';

COMMIT;
