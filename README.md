# Vision Check Platform

Browser-based online vision check. Phase A — technical feasibility and prototype.

**Read [`VISION-CHECK-PLATFORM.md`](./VISION-CHECK-PLATFORM.md) first. It is the source of truth.**
**Read [`AGENTS.md`](./AGENTS.md) before writing code. It carries the hard architectural rules.**

## Stack

Next.js (App Router) with TypeScript in strict mode, Tailwind for styling, Supabase for Postgres, deployed on Vercel.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the three Supabase values
npm run dev
```

## Database

Every database change is a SQL file. Write two copies: [`supabase/migrations`](./supabase/migrations) is the git record and is never executed; [`supabase/ops`](./supabase/ops) is the apply copy (same body plus tracking registration, wrapped in `BEGIN`/`COMMIT`) and is the only one that runs. A human reviews both, then pastes only the ops copy into the Supabase SQL editor. The Supabase CLI is never used. Never change the schema through the dashboard. Types in [`lib/db/types.ts`](./lib/db/types.ts) are written by hand to match the migration files; they are never generated from a live schema.

## Before committing

```bash
npm run check                # eslint + tsc --noEmit
```
