-- READ-ONLY. Most recent thin-loop session that recorded flanked-triplet presentations.
-- One SELECT. No BEGIN, no writes, no SET ROLE.
-- Paste into the Supabase SQL editor. The Supabase CLI is never used.

select jsonb_build_object(
  'session_id', s.id,
  'status', s.status,
  'created_at', s.created_at,
  'presentations', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'trial_index', p.trial_index,
        'optotypes', to_jsonb(p.optotypes),
        'target_index', p.target_index,
        'format', p.format,
        'crowding_spec', p.crowding_spec,
        'visibility_confirmed', p.visibility_confirmed,
        'actual_letter_height_device_px', p.actual_letter_height_device_px,
        'requested_letter_height_device_px', p.requested_letter_height_device_px,
        'responses_count', (
          select count(*)::integer
          from vcp.responses r
          where r.presentation_id = p.id
        ),
        'distinct_client_request_id_count', (
          select count(distinct r.client_request_id)::integer
          from vcp.responses r
          where r.presentation_id = p.id
        )
      )
      order by p.trial_index
    )
    from vcp.presentations p
    where p.session_id = s.id
  ), '[]'::jsonb),
  'totals', jsonb_build_object(
    'presentations_count', (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = s.id
    ),
    'responses_count', (
      select count(*)::integer
      from vcp.responses r
      where r.session_id = s.id
    ),
    'max_responses_per_presentation', coalesce((
      select max(per_presentation.n)::integer
      from (
        select count(*)::integer as n
        from vcp.responses r
        where r.session_id = s.id
        group by r.presentation_id
      ) as per_presentation
    ), 0),
    'visibility_confirmed_false_count', (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = s.id
        and p.visibility_confirmed is false
    )
  )
) as verify_12_breakage
from (
  select sess.id, sess.status, sess.created_at
  from vcp.sessions sess
  where sess.client_build = 'thin-loop-9-10'
    and exists (
      select 1
      from vcp.presentations p
      where p.session_id = sess.id
        and p.format = 'flanked-triplet'
    )
  order by sess.created_at desc
  limit 1
) as s;
