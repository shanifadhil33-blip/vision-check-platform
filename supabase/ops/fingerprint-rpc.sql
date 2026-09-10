-- THIS FILE IS NEVER EDITED.
-- EDITING IT MAKES EVERY PREVIOUSLY RECORDED BASELINE INCOMPARABLE.
-- IT COVERS THE PUBLIC RPC SURFACE ONLY.
-- supabase/ops/fingerprint.sql COVERS THE vcp TABLE SCHEMA AND MUST NOT BE CHANGED.
-- Read only. Paste into the Supabase SQL editor after a verified RPC apply.
-- Version: 20260908140000_vcp_rpc_surface
-- One statement, one json cell. Catalogues only.
-- The Supabase CLI is never used.

select jsonb_pretty(
  listing
  || jsonb_build_object(
    'fingerprint', md5(listing::text)
  )
) as recon
from (
  select jsonb_build_object(
    'public_functions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', p.proname,
          'arguments', pg_get_function_arguments(p.oid),
          'return_type', pg_get_function_result(p.oid),
          'prosecdef', p.prosecdef,
          'provolatile', p.provolatile,
          'proconfig', to_jsonb(p.proconfig),
          'proacl', case
            when p.proacl is null then null
            else (
              select jsonb_agg(acl::text order by acl::text)
              from unnest(p.proacl) as acl
            )
          end
        )
        order by p.proname, pg_get_function_arguments(p.oid)
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ), '[]'::jsonb),
    'vcp_functions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', p.proname,
          'arguments', pg_get_function_arguments(p.oid),
          'return_type', pg_get_function_result(p.oid),
          'prosecdef', p.prosecdef,
          'provolatile', p.provolatile,
          'proconfig', to_jsonb(p.proconfig),
          'proacl', case
            when p.proacl is null then null
            else (
              select jsonb_agg(acl::text order by acl::text)
              from unnest(p.proacl) as acl
            )
          end
        )
        order by p.proname, pg_get_function_arguments(p.oid)
      )
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'vcp'
    ), '[]'::jsonb)
  ) as listing
) as built;
