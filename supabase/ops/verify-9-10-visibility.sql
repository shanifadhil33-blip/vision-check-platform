-- READ-ONLY. Two most recent thin-loop sessions that finished complete.
-- One SELECT. No BEGIN, no writes, no SET ROLE.
-- Paste into the Supabase SQL editor. The Supabase CLI is never used.

select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'created_at', s.created_at,
      'presentations_total', s.presentations_total,
      'format_single', s.format_single,
      'target_index_0', s.target_index_0,
      'optotypes_cardinality_1', s.optotypes_cardinality_1,
      'visibility_confirmed_true', s.visibility_confirmed_true,
      'actual_letter_height_device_px_not_null', s.actual_letter_height_not_null,
      'rendered_at_not_null', s.rendered_at_not_null,
      'max_abs_actual_minus_requested_letter_height_device_px',
        s.max_abs_height_diff_device_px,
      'responses_count', s.responses_count,
      'max_responses_per_presentation', s.max_responses_per_presentation
    )
    order by s.created_at desc
  ),
  '[]'::jsonb
) as verify_9_10_visibility
from (
  select
    sess.id,
    sess.created_at,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
    ) as presentations_total,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and p.format = 'single'
    ) as format_single,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and p.target_index = 0
    ) as target_index_0,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and cardinality(p.optotypes) = 1
    ) as optotypes_cardinality_1,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and p.visibility_confirmed is true
    ) as visibility_confirmed_true,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and p.actual_letter_height_device_px is not null
    ) as actual_letter_height_not_null,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = sess.id
        and p.rendered_at is not null
    ) as rendered_at_not_null,
    (
      select max(
        abs(p.actual_letter_height_device_px - p.requested_letter_height_device_px)
      )
      from vcp.presentations p
      where p.session_id = sess.id
        and p.actual_letter_height_device_px is not null
    ) as max_abs_height_diff_device_px,
    (
      select count(*)::integer
      from vcp.responses r
      where r.session_id = sess.id
    ) as responses_count,
    coalesce((
      select max(per_presentation.n)::integer
      from (
        select count(*)::integer as n
        from vcp.responses r
        where r.session_id = sess.id
        group by r.presentation_id
      ) as per_presentation
    ), 0) as max_responses_per_presentation
  from (
    select s.id, s.created_at
    from vcp.sessions s
    where s.client_build = 'thin-loop-9-10'
      and s.status = 'complete'
    order by s.created_at desc
    limit 2
  ) as sess
) as s;
