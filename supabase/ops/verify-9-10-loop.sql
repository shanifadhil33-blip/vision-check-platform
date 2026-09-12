-- READ-ONLY verification of the Steps 9/10 two-window thin loop.
-- Session: 64cba920-90d1-4a0c-9c73-786c5f2b78b9
-- One SELECT. No BEGIN, no writes, no SET ROLE.
-- Paste into the Supabase SQL editor. The Supabase CLI is never used.

select jsonb_build_object(
  'session_id', '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid,
  'checks', jsonb_build_object(
    '1_status_complete', jsonb_build_object(
      'expected', 'complete',
      'observed', d.session_status,
      'result', case
        when d.session_status = 'complete' then 'PASS'
        else 'FAIL'
      end
    ),
    '2_presentations_count', jsonb_build_object(
      'expected', 6,
      'observed', d.presentations_count,
      'result', case
        when d.presentations_count = 6 then 'PASS'
        else 'FAIL'
      end
    ),
    '3_trial_and_step_order', jsonb_build_object(
      'expected', jsonb_build_object(
        'trial_index', jsonb_build_array(0, 1, 2, 3, 4, 5),
        'logmar_step_index', jsonb_build_array(5, 4, 3, 2, 1, 0)
      ),
      'observed', jsonb_build_object(
        'trial_index', d.trial_indexes,
        'logmar_step_index', d.step_indexes
      ),
      'result', case
        when d.trial_indexes = '[0, 1, 2, 3, 4, 5]'::jsonb
          and d.step_indexes = '[5, 4, 3, 2, 1, 0]'::jsonb
        then 'PASS'
        else 'FAIL'
      end
    ),
    '4_presentation_fields', jsonb_build_object(
      'expected', 'every presentation: format single, target_index 0, cardinality(optotypes)=1, visibility_confirmed true, actual_letter_height_device_px not null, rendered_at not null',
      'observed', jsonb_build_object(
        'presentations_count', d.presentations_count,
        'all_ok_count', d.presentation_fields_ok_count
      ),
      'result', case
        when d.presentations_count = 6
          and d.presentation_fields_ok_count = 6
        then 'PASS'
        else 'FAIL'
      end
    ),
    '5_stroke_width_by_letter', jsonb_build_object(
      'expected', 'null when optotypes[1] <> H; not null when optotypes[1] = H',
      'observed', jsonb_build_object(
        'presentations_count', d.presentations_count,
        'stroke_rule_ok_count', d.stroke_rule_ok_count
      ),
      'result', case
        when d.presentations_count = 6
          and d.stroke_rule_ok_count = 6
        then 'PASS'
        else 'FAIL'
      end
    ),
    '6_responses_one_per_presentation', jsonb_build_object(
      'expected', jsonb_build_object(
        'responses_count', 6,
        'max_per_presentation', 1
      ),
      'observed', jsonb_build_object(
        'responses_count', d.responses_count,
        'max_per_presentation', d.max_responses_per_presentation
      ),
      'result', case
        when d.responses_count = 6
          and d.max_responses_per_presentation = 1
        then 'PASS'
        else 'FAIL'
      end
    ),
    '7_not_sure_on_trial_2', jsonb_build_object(
      'expected', jsonb_build_object(
        'not_sure_count', 1,
        'trial_index', 2
      ),
      'observed', jsonb_build_object(
        'not_sure_count', d.not_sure_count,
        'not_sure_trial_indexes', d.not_sure_trial_indexes
      ),
      'result', case
        when d.not_sure_count = 1
          and d.not_sure_trial_indexes = '[2]'::jsonb
        then 'PASS'
        else 'FAIL'
      end
    ),
    '8_latency_ms_present', jsonb_build_object(
      'expected', 'latency_ms not null on all 6 responses',
      'observed', jsonb_build_object(
        'responses_count', d.responses_count,
        'latency_not_null_count', d.latency_not_null_count
      ),
      'result', case
        when d.responses_count = 6
          and d.latency_not_null_count = 6
        then 'PASS'
        else 'FAIL'
      end
    ),
    '9_choices_offered_events', jsonb_build_object(
      'expected', '6 choices_offered events, one per presentation id, each with 5 distinct letters containing optotypes[1]',
      'observed', jsonb_build_object(
        'choices_offered_count', d.choices_offered_count,
        'matched_presentations', d.choices_matched_presentations,
        'distinct_presentation_ids', d.choices_distinct_presentation_ids
      ),
      'result', case
        when d.choices_offered_count = 6
          and d.choices_distinct_presentation_ids = 6
          and d.choices_matched_presentations = 6
        then 'PASS'
        else 'FAIL'
      end
    ),
    '10_calibration_card_width', jsonb_build_object(
      'expected', jsonb_build_object(
        'exists', true,
        'card_width_css_px', 354
      ),
      'observed', jsonb_build_object(
        'exists', d.calibration_exists,
        'card_width_css_px', d.card_width_css_px
      ),
      'result', case
        when d.calibration_exists
          and d.card_width_css_px = 354::double precision
        then 'PASS'
        else 'FAIL'
      end
    )
  ),
  'trials', d.trials
) as verify_9_10_loop
from (
  select
    (
      select s.status
      from vcp.sessions s
      where s.id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ) as session_status,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ) as presentations_count,
    coalesce((
      select jsonb_agg(p.trial_index order by p.trial_index)
      from vcp.presentations p
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ), '[]'::jsonb) as trial_indexes,
    coalesce((
      select jsonb_agg(p.logmar_step_index order by p.trial_index)
      from vcp.presentations p
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ), '[]'::jsonb) as step_indexes,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and p.format = 'single'
        and p.target_index = 0
        and cardinality(p.optotypes) = 1
        and p.visibility_confirmed is true
        and p.actual_letter_height_device_px is not null
        and p.rendered_at is not null
    ) as presentation_fields_ok_count,
    (
      select count(*)::integer
      from vcp.presentations p
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and (
          (
            p.optotypes[1] = 'H'
            and p.actual_stroke_width_device_px is not null
          )
          or (
            p.optotypes[1] is distinct from 'H'
            and p.actual_stroke_width_device_px is null
          )
        )
    ) as stroke_rule_ok_count,
    (
      select count(*)::integer
      from vcp.responses r
      where r.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ) as responses_count,
    coalesce((
      select max(per_presentation.n)::integer
      from (
        select count(*)::integer as n
        from vcp.responses r
        where r.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        group by r.presentation_id
      ) as per_presentation
    ), 0) as max_responses_per_presentation,
    (
      select count(*)::integer
      from vcp.responses r
      where r.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and r.response_kind = 'not_sure'
    ) as not_sure_count,
    coalesce((
      select jsonb_agg(p.trial_index order by p.trial_index)
      from vcp.responses r
      join vcp.presentations p on p.id = r.presentation_id
      where r.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and r.response_kind = 'not_sure'
    ), '[]'::jsonb) as not_sure_trial_indexes,
    (
      select count(*)::integer
      from vcp.responses r
      where r.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and r.latency_ms is not null
    ) as latency_not_null_count,
    (
      select count(*)::integer
      from vcp.session_events e
      where e.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and e.type = 'choices_offered'
    ) as choices_offered_count,
    (
      select count(distinct e.payload ->> 'presentation_id')::integer
      from vcp.session_events e
      where e.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and e.type = 'choices_offered'
    ) as choices_distinct_presentation_ids,
    (
      select count(*)::integer
      from vcp.session_events e
      join vcp.presentations p
        on p.id = (e.payload ->> 'presentation_id')::uuid
      where e.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and e.type = 'choices_offered'
        and p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and jsonb_typeof(e.payload -> 'choices') = 'array'
        and jsonb_array_length(e.payload -> 'choices') = 5
        and (
          select count(distinct choice_letter)::integer
          from jsonb_array_elements_text(e.payload -> 'choices') as choice_letter
        ) = 5
        and e.payload -> 'choices' @> to_jsonb(p.optotypes[1])
    ) as choices_matched_presentations,
    exists (
      select 1
      from vcp.calibrations c
      where c.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
        and c.card_width_css_px = 354::double precision
    ) as calibration_exists,
    (
      select c.card_width_css_px
      from vcp.calibrations c
      where c.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
      order by c.created_at
      limit 1
    ) as card_width_css_px,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'trial_index', p.trial_index,
          'optotype', p.optotypes[1],
          'response_kind', r.response_kind,
          'response_letter', r.response_letter,
          'latency_ms', r.latency_ms,
          'actual_letter_height_device_px', p.actual_letter_height_device_px,
          'requested_letter_height_device_px', p.requested_letter_height_device_px
        )
        order by p.trial_index
      )
      from vcp.presentations p
      left join vcp.responses r
        on r.presentation_id = p.id
        and r.session_id = p.session_id
      where p.session_id = '64cba920-90d1-4a0c-9c73-786c5f2b78b9'::uuid
    ), '[]'::jsonb) as trials
) as d;
