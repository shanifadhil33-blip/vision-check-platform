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

Open <http://localhost:3000/api/health>. It should return `ok: true` with a row from Postgres.

## Database

The schema is owned by the numbered migrations under [`supabase/migrations`](./supabase/migrations). Nothing is ever changed through the Supabase dashboard.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run db:new -- <name>     # create a migration
npm run db:push              # apply pending migrations
npm run db:types             # regenerate lib/db/types.ts
```

## Before committing

```bash
npm run check                # eslint + tsc --noEmit
```
