-- APPLY COPY. Paste this file only into the Supabase SQL editor.
-- Git record (never executed): supabase/migrations/20260926120000_vcp_calibrations_method_ruler_bar.sql
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- The two ALTER statements are identical to the git record. Tracking
-- insert is in this same transaction so a failure leaves nothing registered.
-- The Supabase CLI is never used.
-- Milestone 3 ruler fallback calibration. Widens vcp.calibrations.method
-- so a ruler calibration can be attached to a session. Postgres cannot
-- alter a check expression in place, so calibrations_method_chk is
-- dropped and re-added under the same name. Nothing else changes: no
-- function body, grant, column, index or other constraint.

BEGIN;

alter table vcp.calibrations drop constraint calibrations_method_chk;
alter table vcp.calibrations add constraint calibrations_method_chk check (method in ('card-id1', 'ruler-bar'));

-- Tracking registration (apply copy only). Same transaction as the ALTERs.
insert into vcp.schema_migrations (version)
  values ('20260926120000_vcp_calibrations_method_ruler_bar');

COMMIT;
