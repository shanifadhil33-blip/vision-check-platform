-- READ-ONLY recon for Milestone 2 live state.
-- SELECT only. No writes, no DDL, no SET, no DO, no temp tables, no BEGIN/COMMIT,
-- no calls to any vcp_ function. Privileges come from system catalogues only.
-- Paste into the Supabase SQL editor. The Supabase CLI is never used.
-- The editor shows only the last result set: every check is a CTE feeding one final SELECT.

with
-- E1. Live check constraints on vcp.sessions. Expected: sessions_status_chk,
-- sessions_version_chk, sessions_distance_mm_requested_chk (and pkey).
e1 as (
  select
    'E1'::text as section,
    con.conname::text as item,
    pg_catalog.pg_get_constraintdef(con.oid)::text as observed,
    'check/pkey defs on vcp.sessions'::text as expected
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vcp'
    and c.relname = 'sessions'
    and con.contype in ('c', 'p')
),
-- E2. Sessions by status: count, oldest, newest, older than 24h.
e2 as (
  select
    'E2'::text as section,
    ('status=' || coalesce(s.status, '<null>'))::text as item,
    (
      'count=' || count(*)::text
      || '; oldest=' || coalesce(min(s.created_at)::text, 'none')
      || '; newest=' || coalesce(max(s.created_at)::text, 'none')
      || '; older_than_24h='
      || count(*) filter (where s.created_at < pg_catalog.now() - interval '24 hours')::text
    )::text as observed,
    'per-status aggregates'::text as expected
  from vcp.sessions s
  group by s.status
),
-- E3. Presentations with more than one response. Expected 0.
e3 as (
  select
    'E3'::text as section,
    'presentations_with_gt1_response'::text as item,
    count(*)::text as observed,
    '0'::text as expected
  from (
    select r.presentation_id
    from vcp.responses r
    group by r.presentation_id
    having count(*) > 1
  ) multi
),
-- E4. Every index and unique constraint on vcp.responses, live.
e4_indexes as (
  select
    'E4'::text as section,
    ('index:' || i.relname)::text as item,
    pg_catalog.pg_get_indexdef(i.oid)::text as observed,
    'index on vcp.responses'::text as expected
  from pg_catalog.pg_index x
  join pg_catalog.pg_class i on i.oid = x.indexrelid
  join pg_catalog.pg_class t on t.oid = x.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'vcp'
    and t.relname = 'responses'
),
e4_uniques as (
  select
    'E4'::text as section,
    ('unique:' || con.conname)::text as item,
    pg_catalog.pg_get_constraintdef(con.oid)::text as observed,
    'unique constraint on vcp.responses'::text as expected
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vcp'
    and c.relname = 'responses'
    and con.contype = 'u'
),
-- E5. proacl for each of the ten public vcp_ functions.
-- Expected roles with EXECUTE: postgres, anon, service_role (service_role is the known gap).
e5 as (
  select
    'E5'::text as section,
    (p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')')::text as item,
    case
      when p.proacl is null then 'proacl=null (default ACL applies)'
      else (
        select pg_catalog.string_agg(acl::text, '; ' order by acl::text)
        from pg_catalog.unnest(p.proacl) as acl
      )
    end::text as observed,
    'EXECUTE for postgres, anon, service_role'::text as expected
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'vcp_create_session',
      'vcp_get_session',
      'vcp_pair_session',
      'vcp_set_session_state',
      'vcp_attach_calibration',
      'vcp_record_presentation',
      'vcp_record_rendered',
      'vcp_submit_response',
      'vcp_append_event',
      'vcp_upsert_test_quality'
    )
),
-- E6. Every pg_default_acl row for schema public.
e6 as (
  select
    'E6'::text as section,
    (
      'grantor=' || pg_catalog.pg_get_userbyid(d.defaclrole)::text
      || '; objtype=' || d.defaclobjtype::text
    )::text as item,
    case
      when d.defaclacl is null then 'defaclacl=null'
      else (
        select pg_catalog.string_agg(acl::text, '; ' order by acl::text)
        from pg_catalog.unnest(d.defaclacl) as acl
      )
    end::text as observed,
    'pg_default_acl baseline for public'::text as expected
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
),
-- E7. Columns of sessions, presentations, responses from pg_attribute.
e7 as (
  select
    'E7'::text as section,
    (c.relname || '.' || a.attname)::text as item,
    (
      'type=' || pg_catalog.format_type(a.atttypid, a.atttypmod)
      || '; not_null=' || a.attnotnull::text
    )::text as observed,
    'pg_attribute column'::text as expected
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'vcp'
    and c.relname in ('sessions', 'presentations', 'responses')
    and a.attnum > 0
    and not a.attisdropped
),
-- E8. Every row of vcp.schema_migrations. Expected: the three known versions.
e8 as (
  select
    'E8'::text as section,
    m.version::text as item,
    coalesce(m.applied_at::text, 'null')::text as observed,
    'one of 20260908120000_vcp_initial_schema; 20260908140000_vcp_rpc_surface; 20260908160000_vcp_rpc_coalesce_fix'::text as expected
  from vcp.schema_migrations m
),
-- E9. Distinct session_events.type values with counts.
e9 as (
  select
    'E9'::text as section,
    coalesce(e.type, '<null>')::text as item,
    count(*)::text as observed,
    'event type count'::text as expected
  from vcp.session_events e
  group by e.type
)
select section, item, observed, expected from e1
union all
select section, item, observed, expected from e2
union all
select section, item, observed, expected from e3
union all
select section, item, observed, expected from e4_indexes
union all
select section, item, observed, expected from e4_uniques
union all
select section, item, observed, expected from e5
union all
select section, item, observed, expected from e6
union all
select section, item, observed, expected from e7
union all
select section, item, observed, expected from e8
union all
select section, item, observed, expected from e9
order by section, item;
