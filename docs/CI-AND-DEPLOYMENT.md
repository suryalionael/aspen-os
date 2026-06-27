# CI and Deployment

Sprint 3 Phase P. This is the operational counterpart to `DECISION-LOG.md`
(why things are built the way they are) — this doc covers how to actually
run and operate what's been built.

## GitHub Actions CI (`.github/workflows/ci.yml`)

Four jobs, run on every push to `main` and every pull request:

1. **verify** — `tsc --noEmit`, `npm run lint`, `npm run build`.
2. **db-tests** — the seven `scripts/test-*.ts` scripts (`npm run
   test:rls`/`workspace`/`project`/`task`/`position`/`move`/`roles`).
   These sign up real, throwaway users against the real Supabase project
   and assert on actual RLS/RPC behavior — not mocks. See
   `docs/DECISION-LOG.md` for why (this project has repeatedly caught
   real bugs — missing GRANTs, RLS gaps — that policy review alone
   missed).
3. **e2e** — the full Playwright suite, `--workers=1` (serial). Parallel
   signups have previously triggered Supabase Auth rate limiting in this
   exact project (an external-service condition, documented in
   DECISION-LOG.md, not an application bug) — running serially in CI
   avoids manufacturing that flakiness.
4. **deploy** — only on a push to `main` (not on pull requests), and only
   after `db-tests` and `e2e` both pass. Uses the Vercel CLI directly
   (`vercel pull` → `vercel build` → `vercel deploy --prebuilt --prod`)
   rather than Vercel's separate GitHub App integration, since this
   project has been deployed via the Vercel CLI throughout its
   development (no GitHub↔Vercel webhook is currently connected — see
   the "Required secrets" section below).

### Required GitHub secrets

CI will fail at its first step needing one of these until they're added
under **Settings → Secrets and variables → Actions** on the GitHub repo.
None of this is optional scaffolding — every job above actually needs
these to do anything.

| Secret | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → `service_role` `secret` key. **Never** expose this to client code — it's only used server-side (`lib/supabase/admin.ts`, account deletion). |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) → Create Token |
| `VERCEL_ORG_ID` | Run `vercel project ls` locally, or read `orgId` from `.vercel/project.json` after running `vercel link` in this repo (that file is gitignored — it won't already exist on a fresh clone) |
| `VERCEL_PROJECT_ID` | Same as above — `projectId` in `.vercel/project.json` |

### What this does *not* do

- It runs the **same** DB tests and E2E suite against the **same** shared
  Supabase project used for manual development and production data —
  there is no separate staging/test database. Test data (throwaway
  users, workspaces, projects) accumulates in that project over time;
  periodic cleanup is a manual operation for now (see "Operational
  follow-ups" below).
- It does not gate deployment on Lighthouse scores. Phase O's Lighthouse
  pass (Performance/Accessibility/Best Practices/SEO, all >95 on
  `/sign-in` and `/sign-up`) was a manual, one-time check — adding it to
  CI would need a `lighthouse-ci` step and a server to run it against,
  which is a reasonable future addition, not included here.

## Backup and disaster recovery

This app's only persistent state is the Supabase Postgres database (plus
two Storage buckets: `avatars`, `workspace-logos`, `task-attachments`).
There is no other database, queue, or stateful service.

### Database

- Supabase's paid plans include automatic daily backups with point-in-time
  recovery (PITR) — **verify which plan this project is on and whether
  PITR is enabled**, since the free tier does not include it. This is the
  single most important thing to check before relying on this section.
- To restore: Supabase project dashboard → Database → Backups. Restoring
  creates a new project or restores in-place depending on plan tier —
  follow Supabase's own current restore flow at the time, since this UI
  changes between plan tiers and over time.
- Schema itself is fully reproducible independent of any backup: every
  migration in `supabase/migrations/` is committed to this repo in order.
  A brand-new Supabase project can be brought to the current schema by
  applying them in filename order (the Supabase CLI's `supabase db push`
  does this automatically if you have the CLI linked to a project).

### Storage buckets

Supabase Storage backups are tied to the same project-level backup
policy as the database — there is no separate backup mechanism for
bucket contents. If point-in-time recovery is enabled for the database,
confirm with Supabase support/docs whether it also covers Storage
objects, since this has varied by plan tier.

### Application code and deployment

- The Vercel deployment is fully reproducible from this Git repository —
  there is no server-side state outside the database/storage above.
- To redeploy from scratch: `vercel link` (link to the existing Vercel
  project) → `vercel --prod`, or via the CI pipeline above once secrets
  are configured.
- Vercel keeps a history of every deployment; rolling back to a previous
  one is a dashboard action (Vercel project → Deployments → "..." →
  Promote to Production) and requires no code changes.

### Recovery scenario walkthrough

1. **Bad deploy (app-level bug shipped to production):** roll back via
   the Vercel dashboard (above) — instant, no database involvement.
2. **Bad migration (schema change breaks something):** there is
   currently no automated down-migration tooling — every migration in
   this repo is forward-only. Recovering from a bad migration means
   either writing and applying a new forward migration that undoes the
   damage, or restoring the database from a backup (above) and accepting
   the data-loss window back to that backup's timestamp. This is a real,
   accepted gap — see "Operational follow-ups."
3. **Accidental data deletion (e.g. a workspace deleted that shouldn't
   have been):** workspace/project deletion in this app is a real,
   cascading hard delete (not a soft-delete-then-purge) — see
   `DECISION-LOG.md` DEC-032/DEC-034 for why archive exists as the
   reversible alternative. Once deleted, recovery is only possible via a
   database backup restore (above), and only back to that backup's
   timestamp.

## Security review (Sprint 3 self-review)

A pass through this codebase's actual security posture, not a generic
checklist:

- **Authorization model:** every table uses Postgres RLS as the sole
  authorization mechanism (DEC-009, carried through every phase since).
  No application-layer "trust the client" checks exist in place of RLS.
- **Service role usage:** `lib/supabase/admin.ts`'s elevated client is
  used in exactly one place (`lib/actions/account.ts`, self-account
  deletion) and the user ID it acts on is always read from the caller's
  own verified session — never from client-supplied input. Grep
  `createAdminClient` before adding a second use of it; each new use is
  a deliberate RLS bypass and needs the same scrutiny.
- **Known, accepted gap — missing GRANTs:** this project has twice found
  (and fixed) migrations that added an RLS policy for a new command
  without also granting that command to `authenticated` at the table
  level (DEC-033, and the earlier `is_workspace_member_for_task` grant
  fix). Both were caught by tests, not by static review — there's no
  automated check that a new policy has a matching grant. Worth adding a
  lint/script for this if it recurs a third time.
- **Secrets:** `.env.local` and `.vercel` are gitignored;
  `SUPABASE_SERVICE_ROLE_KEY` is never `NEXT_PUBLIC_`-prefixed and is only
  read server-side. No secrets are committed in this repo's history as
  of this review.
- **Input handling:** all user-facing mutations go through Server
  Actions with Supabase's parameterized query builder — no raw SQL
  string concatenation anywhere in application code (the only raw SQL is
  in migration files, written by hand, not from user input).
- **File uploads:** size limits enforced server-side (avatars/logos 2MB,
  task attachments 10MB) and content-type checked. Private bucket
  (`task-attachments`) access is gated by signed URLs with a 1-hour TTL,
  re-issued on each load rather than cached indefinitely.
- **Rate limiting:** **not implemented** — see "Operational follow-ups."
  Supabase Auth has its own built-in rate limiting (which this project
  has directly observed firing under heavy parallel test load), but
  there is no application-level rate limiting on, e.g., comment
  creation, invite creation, or other authenticated mutations.
- **Error monitoring:** **not implemented** — see "Operational
  follow-ups." Errors currently surface only via Vercel's own function
  logs (`vercel logs` or the dashboard), with no alerting, aggregation,
  or client-side error capture.

## Operational follow-ups (deliberately not built this sprint)

Two items from the original Phase P ask — Sentry and rate limiting —
were explicitly deferred because both require a third-party account this
assistant cannot create. Documented here so wiring them in later is fast:

### Sentry (error monitoring)

1. Create a free account at [sentry.io](https://sentry.io), create a
   Next.js project, and copy its DSN.
2. `npm install @sentry/nextjs`, then run `npx @sentry/wizard@latest -i
   nextjs` — it auto-generates `sentry.client.config.ts`,
   `sentry.server.config.ts`, `sentry.edge.config.ts`, and wraps
   `next.config.mjs`.
3. Add `SENTRY_DSN` (and `SENTRY_AUTH_TOKEN` for source-map upload during
   build) as both a local `.env.local` entry and a Vercel/GitHub Actions
   secret.
4. No application code changes beyond the wizard's output are strictly
   required to start capturing unhandled errors; consider also wrapping
   `formatAuthError`'s fallback path (`lib/actions/auth.ts`) and each
   Server Action's generic `{ error: ... }` returns with
   `Sentry.captureException` if silent server-side failures (e.g.
   `logActivity`/`logAuditEvent`'s intentionally-best-effort calls) ever
   need visibility.

### Rate limiting

1. Create a free account at [upstash.com](https://upstash.com), create a
   Redis database, copy its REST URL and token.
2. `npm install @upstash/ratelimit @upstash/redis`.
3. Add a shared limiter (e.g. in `lib/rate-limit.ts`) and call it at the
   top of the Server Actions most worth protecting first: invite
   creation (`lib/actions/workspaces.ts`), comment/task creation
   (already implicitly bounded by needing a session, but unbounded in
   volume per session), and the sign-up/sign-in actions (though Supabase
   Auth already rate-limits those itself).
4. Add `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` as secrets
   wherever the app runs (Vercel env vars + GitHub Actions secrets if any
   CI job exercises the limited paths).
