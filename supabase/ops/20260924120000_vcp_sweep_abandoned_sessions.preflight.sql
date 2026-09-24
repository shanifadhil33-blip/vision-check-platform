-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260924120000_vcp_sweep_abandoned_sessions
-- Confirms 20260923120000 is registered, this version is not, and
-- sessions_status_chk already allows 'abandoned'. Informational row
-- lists how many sessions the first sweep will close (by status,
-- older than 24 hours). One final result set: check, expected,
-- observed, result, plus a verdict row. The Supabase CLI is never
-- used. No BEGIN/COMMIT. Catalogues and to_regprocedure / to_regclass
-- only; never information_schema.

with
version_this as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260924120000_vcp_sweep_abandoned_sessions'
    )
  end as is_registered
),
version_prior as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260923120000_vcp_get_answered_trials'
    )
  end as is_registered
),
status_chk as (
  select pg_catalog.pg_get_constraintdef(c.oid) as def
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class rel on rel.oid = c.conrelid
  join pg_catalog.pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'vcp'
    and rel.relname = 'sessions'
    and c.conname = 'sessions_status_chk'
),
sweep_candidates as (
  select coalesce(
    (
      select pg_catalog.string_agg(
        t.status || ':' || t.cnt::text,
        ', ' order by t.status
      )
      from (
        select s.status, pg_catalog.count(*)::bigint as cnt
        from vcp.sessions s
        where s.status in ('created', 'paired', 'running', 'paused')
          and s.created_at < now() - interval '24 hours'
        group by s.status
      ) t
    ),
    'none'
  ) as summary
),
checks as (
  select
    'prior_version_registered'::text as check_name,
    'true (20260923120000_vcp_get_answered_trials in vcp.schema_migrations)'::text as expected,
    (select is_registered::text from version_prior) as observed,
    case
      when (select is_registered from version_prior) is true then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'version_unregistered',
    'false (20260924120000_vcp_sweep_abandoned_sessions not in vcp.schema_migrations)',
    (select is_registered::text from version_this),
    case
      when (select is_registered from version_this) is false then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'status_chk_allows_abandoned',
    'sessions_status_chk definition includes abandoned',
    coalesce((select def from status_chk), 'absent'),
    case
      when (select def from status_chk) is not null
       and position('abandoned' in (select def from status_chk)) > 0
      then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'sweep_candidates_by_status',
    'informational (count by status, created_at older than 24 hours; not a gate)',
    (select summary from sweep_candidates),
    'INFO'
  union all
  select
    'current_user',
    'postgres',
    current_user,
    case when current_user = 'postgres' then 'PASS' else 'FAIL' end
),
verdict as (
  select
    'verdict'::text as check_name,
    'SAFE TO APPLY'::text as expected,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'SAFE TO APPLY'
      else 'DO NOT APPLY: ' || (
        select pg_catalog.string_agg(c.check_name, ', ' order by c.check_name)
        from checks c
        where c.result = 'FAIL'
      )
    end::text as observed,
    case
      when not exists (select 1 from checks c where c.result = 'FAIL')
      then 'PASS'
      else 'FAIL'
    end::text as result
)
select "check", expected, observed, result
from (
  select check_name as "check", expected, observed, result from checks
  union all
  select check_name, expected, observed, result from verdict
) readout
order by case when "check" = 'verdict' then 1 else 0 end, "check";
