-- READ-ONLY. Milestone 2: visibility_change events for the most recent session.
-- SELECT only. No writes, no DDL, no SET, no DO blocks, no calls to any vcp_ function.
-- Paste into the Supabase SQL editor after a test. The Supabase CLI is never used.
-- The editor shows only the last result set: every check is a CTE feeding one final SELECT.

with
latest as (
  select
    s.id,
    s.created_at,
    s.status
  from vcp.sessions s
  order by s.created_at desc
  limit 1
),

-- Check 1. Should show the most recently created session's id, created_at and status.
c1 as (
  select
    '1'::text as section,
    'session'::text as item,
    (
      'id=' || l.id::text
      || '; created_at=' || l.created_at::text
      || '; status=' || l.status
    )::text as observed,
    'most recently created session id, created_at, status'::text as expected
  from latest l
),

-- Check 2. For each presentation (ordered by trial_index): visibility_confirmed and
-- how many visibility_change events match that presentation_id. Count may be 0 if the
-- tab never hid/showed during that trial; visibility_confirmed is the draw-time snapshot.
c2 as (
  select
    '2'::text as section,
    ('trial_index=' || lpad(p.trial_index::text, 4, '0'))::text as item,
    (
      'visibility_confirmed=' || p.visibility_confirmed::text
      || '; visibility_change_count='
      || (
        select count(*)::text
        from vcp.session_events e
        where e.session_id = p.session_id
          and e.type = 'visibility_change'
          and e.payload ->> 'presentation_id' = p.id::text
      )
    )::text as observed,
    'draw-time visibility_confirmed; count of visibility_change events for this presentation'::text as expected
  from vcp.presentations p
  join latest l on l.id = p.session_id
),

-- Check 3. Every visibility_change event in the session (ordered by created_at): trial_index
-- and state from payload, ms_since_trial_start, and whether presentation_id is a presentation
-- in the same session. presentation_in_session should be true for each row.
c3 as (
  select
    '3'::text as section,
    (
      e.created_at::text
      || ' trial_index='
      || coalesce(e.payload ->> 'trial_index', '<null>')
    )::text as item,
    (
      'state=' || coalesce(e.payload ->> 'state', '<null>')
      || '; ms_since_trial_start='
      || coalesce(e.payload ->> 'ms_since_trial_start', '<null>')
      || '; presentation_in_session='
      || case
        when exists (
          select 1
          from vcp.presentations p
          where p.session_id = e.session_id
            and p.id::text = e.payload ->> 'presentation_id'
        ) then 'true'
        else 'false'
      end
    )::text as observed,
    'state hidden|visible; ms_since_trial_start; presentation_in_session=true'::text as expected
  from vcp.session_events e
  join latest l on l.id = e.session_id
  where e.type = 'visibility_change'
),

-- Check 4. Count of visibility_change events whose presentation_id matches no presentation
-- in the session. Expected 0.
c4 as (
  select
    '4'::text as section,
    'orphan_visibility_change_count'::text as item,
    count(*)::text as observed,
    '0'::text as expected
  from vcp.session_events e
  join latest l on l.id = e.session_id
  where e.type = 'visibility_change'
    and not exists (
      select 1
      from vcp.presentations p
      where p.session_id = e.session_id
        and p.id::text = e.payload ->> 'presentation_id'
    )
)

select section, item, observed, expected from c1
union all
select section, item, observed, expected from c2
union all
select section, item, observed, expected from c3
union all
select section, item, observed, expected from c4
order by section, item;
