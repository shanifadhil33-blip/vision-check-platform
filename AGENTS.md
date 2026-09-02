# AGENTS.md

**Read `VISION-CHECK-PLATFORM.md` in the project root before writing any code. It is the source of truth for this project. Do not modify it.**

---

## Hard architectural rules, for the whole project

1. Everything under `/lib/acuity` and `/lib/calibration` is pure TypeScript. No imports from react or next, and nothing touching `window`, `document` or `navigator`. These modules take numbers and return numbers so they can be unit tested without a browser. Do not relax this.

2. Every database change is a SQL file under `/supabase/migrations`, reviewed by a human, then pasted and run by hand in the Supabase SQL editor. The Supabase CLI is never used. Never change the schema through the dashboard UI. Two copies of every migration: the file in `/supabase/migrations` is the git record and is NEVER executed; an ops apply copy under `/supabase/ops` carries the same body plus the tracking registration inside the same transaction and is the only one that runs. Every migration is wrapped in BEGIN/COMMIT so a failure rolls back whole.

3. Units are explicit in every variable name. Physical lengths in millimetres, suffix `Mm`. Angles in arcminutes, suffix `Arcmin`. Pixels state which kind, `CssPx` or `DevicePx`. Acuity stored internally as logMAR and converted only at the display layer. Examples: `strokeWidthMm`, `letterHeightArcmin`, `pxPerMm`. No bare numbers passed between modules.

4. Never use CSS physical units anywhere in this codebase. No `mm`, `cm`, `in`, `pt`. They are unreliable across displays and the whole project depends on not using them. Every physical size is computed from a stored calibration value and applied in pixels.

5. No authentication in this phase. No user accounts. Do not add Supabase Auth.

6. The service role key is never used in this project. There is no service-role client. Security rests on row level security and grants at the database layer, never on application-layer checks.

---

## How the rules are enforced

- Rule 1 is enforced by ESLint. `eslint.config.mjs` applies `no-restricted-imports` and `no-restricted-globals` to `lib/acuity/**` and `lib/calibration/**`. Run `npm run lint`.
- Rule 2 is enforced by process. Write the SQL under `/supabase/migrations` as the git record. Write the ops apply copy under `/supabase/ops` with the same body plus tracking registration, wrapped in BEGIN/COMMIT. A human reviews both, then pastes and runs only the ops copy in the Supabase SQL editor. The Supabase CLI is never used. Never edit a migration that has already been applied; add a new one.
- Rule 3 and rule 4 are enforced by review. There is no lint rule for them. Reject any variable name that carries a physical quantity without its unit suffix, and any stylesheet or inline style using `mm`, `cm`, `in` or `pt`.
- Rule 5 is enforced by omission. There is no auth dependency and no `auth` schema usage. The Supabase clients are created with session persistence disabled.
- Rule 6 is enforced by omission and by lint. There is no service-role client and no SUPABASE_SERVICE_ROLE_KEY anywhere in the repo. lib/db contains only the anon-key browser client.

## Folder structure

```
VISION-CHECK-PLATFORM.md   source of truth, do not modify
AGENTS.md                  this file
/app
  /(display)               views rendered on the laptop or monitor
  /(remote)                views rendered on the phone
  /api                     route handlers
/lib
  /acuity                  pure functions, no React, no DOM, no browser APIs
  /calibration             pure functions, same rule
  /db                      Supabase client and typed queries
/supabase
  /migrations              git record, never executed
  /ops                     apply copies, the only files that are ever run
```

`(display)` and `(remote)` are Next.js route groups. The parentheses keep them out of the URL, so the paths stay `/display` and `/remote` as specified in `VISION-CHECK-PLATFORM.md` section 5.2 while the two surfaces keep separate layouts.

## Environment variables

| Name | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Project URL. Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon key. Safe to expose. |

Copy `.env.example` to `.env.local` for local work. The same values must be set in the Vercel project.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run check` | Lint and typecheck, run this before committing |

## Local development

Use `npm run dev` for all building. Run `npm run check` before committing. Deploys happen only when there is something to show the client.
