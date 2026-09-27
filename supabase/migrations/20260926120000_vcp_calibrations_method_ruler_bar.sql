-- GIT RECORD. This file is NEVER executed.
-- The ops apply copy is the only file that runs:
--   supabase/ops/20260926120000_vcp_calibrations_method_ruler_bar.apply.sql
-- Version: 20260926120000_vcp_calibrations_method_ruler_bar
-- A human pastes the apply copy by hand into the Supabase SQL editor.
-- The Supabase CLI is never used.
-- Milestone 3 ruler fallback calibration. Widens vcp.calibrations.method
-- so a ruler calibration can be attached to a session. Postgres cannot
-- alter a check expression in place, so calibrations_method_chk is
-- dropped and re-added under the same name. Nothing else changes: no
-- function body, grant, column, index or other constraint.

BEGIN;

alter table vcp.calibrations drop constraint calibrations_method_chk;
alter table vcp.calibrations add constraint calibrations_method_chk check (method in ('card-id1', 'ruler-bar'));

COMMIT;
