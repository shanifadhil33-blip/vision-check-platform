-- EMERGENCY ONLY. THIS SCRIPT RESTORES:
--   - vcp.calibrations constraint calibrations_method_chk to
--     check (method in ('card-id1'))
--   - and deletes the tracking row for
--     20260926120000_vcp_calibrations_method_ruler_bar
-- It reopens the narrower method list: a ruler calibration can no longer
-- be stored. It does not delete or rewrite any calibration row.
-- If any row has method 'ruler-bar', this script raises and changes nothing.
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- The Supabase CLI is never used.

BEGIN;

do $guard$
begin
  if exists (
    select 1
    from vcp.calibrations c
    where c.method = 'ruler-bar'
  ) then
    raise exception
      'Rollback refused: vcp.calibrations contains method ruler-bar. No rows were changed or deleted.';
  end if;
end
$guard$;

alter table vcp.calibrations drop constraint calibrations_method_chk;
alter table vcp.calibrations add constraint calibrations_method_chk check (method in ('card-id1'));

delete from vcp.schema_migrations
where version = '20260926120000_vcp_calibrations_method_ruler_bar';

COMMIT;
