-- PREFLIGHT. Read only. Paste into the Supabase SQL editor.
-- Version: 20260923120000_vcp_get_answered_trials
-- Confirms the new function does not exist yet, this version is not
-- registered, and migration 20260922120000_vcp_privileges_tidy is registered.
-- One final result set: check, expected, observed, result, plus a verdict row.
-- The Supabase CLI is never used. No BEGIN/COMMIT. Catalogues and
-- to_regprocedure / to_regclass only; never information_schema.

with
new_fn as (
  select to_regprocedure('public.vcp_get_answered_trials(uuid)') as oid
),
version_this as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260923120000_vcp_get_answered_trials'
    )
  end as is_registered
),
version_prior as (
  select case
    when to_regclass('vcp.schema_migrations') is null then false
    else exists (
      select 1
      from vcp.schema_migrations m
      where m.version = '20260922120000_vcp_privileges_tidy'
    )
  end as is_registered
),
checks as (
  select
    'function_absent'::text as check_name,
    'to_regprocedure(public.vcp_get_answered_trials(uuid)) is null'::text as expected,
    case
      when (select oid from new_fn) is null then 'null'
      else (select oid from new_fn)::text
    end::text as observed,
    case
      when (select oid from new_fn) is null then 'PASS'
      else 'FAIL'
    end::text as result
  union all
  select
    'version_unregistered',
    'false (20260923120000_vcp_get_answered_trials not in vcp.schema_migrations)',
    (select is_registered::text from version_this),
    case
      when (select is_registered from version_this) is false then 'PASS'
      else 'FAIL'
    end
  union all
  select
    'prior_version_registered',
    'true (20260922120000_vcp_privileges_tidy in vcp.schema_migrations)',
    (select is_registered::text from version_prior),
    case
      when (select is_registered from version_prior) is true then 'PASS'
      else 'FAIL'
    end
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
