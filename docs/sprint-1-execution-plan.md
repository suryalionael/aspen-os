# Sprint 1 Execution Plan

**Status:** Ready for build
**Source documents:** [`build-order.md`](build-order.md) · [`implementation-roadmap.md`](implementation-roadmap.md) · [`prd-sprint-1.md`](prd-sprint-1.md) · [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md)

This document expands each of the 10 phases in `build-order.md` into an execution-ready spec. It exists so a developer can pick up a single phase and build it without re-reading every planning document — but it introduces **no new features, no architecture changes, and no schema beyond what `database-schema.md` already approves.** Where a roadmap task left an implementation choice open, this document makes one explicit choice (called out per phase) rather than leaving it for the developer to decide mid-build.

**Stack guardrail (unchanged from `architecture.md`):** Next.js App Router + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres/Auth/RLS), Vercel. No new services, no new tables beyond `workspaces` / `workspace_members` / `projects` / `tasks`.

---

## Phase 1 — Foundation & Deploy Pipeline

**1. Objective:** Stand up the Next.js + Supabase + Vercel skeleton and prove the deploy pipeline end-to-end before any feature code exists.

**2. Tasks Included:** T1, T2, T3, T4, T5, T6, T7

**3. Files Expected To Change:**
- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/globals.css` (T1)
- `components/ui/` — shadcn `button.tsx`, `input.tsx`, `card.tsx`, `dialog.tsx`; brand color tokens added to `tailwind.config.ts` (T2)
- `.env.local` (gitignored), `.env.example` (T4)
- `lib/supabase/client.ts`, `lib/supabase/server.ts` (T5)
- `app/page.tsx` (placeholder), `vercel.json` if needed (T6)
- `.eslintrc.json` (or `eslint.config.js`), `.prettierrc` (T7)
- No Supabase migration files yet — T3 is project creation in the Supabase dashboard, not a repo change.

**4. Dependencies:** None — this is the first phase.

**5. Manual Test Cases:**
- Run `next dev`; confirm the app boots with no console errors.
- Visit the placeholder `/` route locally; confirm shadcn `Button` renders with Aspen Green styling.
- Push to `main`; confirm Vercel auto-deploys and the production URL serves the same placeholder page.
- Open browser devtools on the deployed page; confirm no `SUPABASE_SERVICE_ROLE_KEY` (or any non-`NEXT_PUBLIC_*` secret) appears in any loaded JS bundle.

**6. Automated Tests Required:**
- None functional yet — `npm run lint` must pass as the only required automated check for this phase.

**7. Risks:**
- Misconfigured environment variables silently break later phases rather than failing now — mitigated by the devtools check above (resolves audit S-3).
- Low risk overall: no business logic exists yet.

**8. Rollback Plan:** `git revert` the phase's commit(s); Vercel redeploys the prior (blank) state automatically. No data exists yet, so there is no data-loss risk.

**9. Expected Deliverable:** A publicly reachable placeholder page on Vercel, backed by a real Supabase project, with verified-clean secret handling.

**10. Git Commit Message:** `chore(setup): scaffold Next.js app, Supabase project, and Vercel deploy pipeline`

---

## Phase 2 — Data Layer & Security

**1. Objective:** Implement the full, already-approved Sprint 1 schema (`database-schema.md`) with indexes and Row Level Security, and prove it's secure before any UI touches it. This phase implements existing approved schema — it is not a schema *change*.

**2. Tasks Included:** T8, T9, T10, T11, T12, T13, T14, T15, T16

**3. Files Expected To Change:**
- `supabase/migrations/001_create_workspaces.sql`
- `supabase/migrations/002_create_workspace_members.sql` (include code comment: `role` is inert in Sprint 1 — no policy or UI differentiates owner/member yet)
- `supabase/migrations/003_create_projects.sql`
- `supabase/migrations/004_create_tasks.sql` (include code comment: `assignee_id` is unused by any Sprint 1 UI, reserved for a future "My Tasks" feature)
- `supabase/migrations/005_create_indexes.sql`
- `supabase/migrations/006_create_workspace_with_owner_fn.sql`
- `supabase/migrations/007_enable_rls_and_policies.sql`
- `lib/types/database.ts` (generated via `supabase gen types typescript`)
- `scripts/test-rls.ts`

**4. Dependencies:** Phase 1 (Supabase project must exist). No dependency on any UI phase.

**5. Manual Test Cases:**
- Apply all 7 migrations in order against the Supabase project; confirm no errors.
- In the Supabase SQL editor, run `EXPLAIN` on `SELECT * FROM tasks WHERE project_id = '<id>' ORDER BY status, position`; confirm the composite index is used.
- Call `create_workspace_with_owner('Test Org')` as a test user; confirm exactly one `workspaces` row and one `workspace_members` row are created, and that the function is defined `SECURITY DEFINER`.
- As a non-owner test user, attempt a raw `INSERT INTO workspace_members (...)` via the Supabase client for a workspace you don't belong to; confirm it is **rejected** — there must be no client-facing INSERT policy on `workspace_members` at all.

**6. Automated Tests Required:**
- `scripts/test-rls.ts` (T16): create two users (A, B), each with their own workspace/project/task; assert A's client cannot `SELECT` or mutate any of B's rows across all four tables. This script must be re-run before every future schema change, not just once now.

**7. Risks:**
- **[S-1, Critical]** If the `workspace_members` INSERT policy is written too permissively, any signed-in user could self-join any workspace. Mitigation: no INSERT policy on that table at all — the `SECURITY DEFINER` function is the only writer.
- **[T-2, High]** If `create_workspace_with_owner` is not `SECURITY DEFINER`, workspace creation fails under RLS once Phase 4 builds on it.
- **[S-2, High]** Skipping the RLS test script means a future schema change could silently reopen cross-workspace access with no detection.

**8. Rollback Plan:** Before any production data exists (true for the entire build phase), `git revert` the commit and drop/recreate the schema from a clean Supabase project if needed. After Phase 10 (production), schema rollback requires a reviewed down-migration — do not drop tables with live pilot data without a separate, explicit decision.

**9. Expected Deliverable:** A fully migrated, indexed, RLS-secured schema with a passing cross-workspace isolation test — verifiable independent of any UI.

**10. Git Commit Message:** `feat(db): add Sprint 1 schema, indexes, RLS policies, and workspace-creation RPC`

---

## Phase 3 — Authentication

**1. Objective:** Let a user sign up and sign in, with protected routes correctly gated — independent of workspace/project functionality.

**2. Tasks Included:** T17, T18, T19, T20, T22

**3. Files Expected To Change:**
- Supabase Auth settings (dashboard config — disable "Confirm email" under Auth → Providers → Email) (T17)
- `app/(auth)/sign-up/page.tsx` (T18)
- `app/(auth)/sign-in/page.tsx` (T19)
- `middleware.ts` (T20)
- Test file, e.g. `tests/auth.spec.ts` (T22)

**4. Dependencies:** Phase 1 (Supabase client utilities). Does **not** depend on Phase 2's tables — Auth uses Supabase's built-in `auth.users`, not the Sprint 1 schema.

**5. Manual Test Cases:**
- Sign up with a new email/password; confirm a session is established **immediately**, with no "check your email" interstitial (resolves audit C-1).
- Sign in with valid credentials; confirm success.
- Sign in with an invalid password; confirm a clear inline error appears and the user remains on `/sign-in` (matches AC-1 exactly).
- While signed out, visit any `(dashboard)` route directly by URL; confirm redirect to `/sign-in`.
- While signed in, visit `/sign-in` or `/sign-up` directly; confirm redirect away from the auth forms.

**6. Automated Tests Required:**
- `tests/auth.spec.ts`: covers both AC-1 branches — valid sign-in succeeds; invalid sign-in shows inline error and stays on `/sign-in`.

**7. Risks:**
- **[C-1, Critical]** If "Confirm email" is left enabled (Supabase's default), AC-6's ≤3-minute target becomes unmeasurable for every new sign-up. This must be explicitly turned off, not left at default.
- Middleware misconfiguration could either lock out valid users or fail to protect dashboard routes — verify both directions manually before moving on.

**8. Rollback Plan:** `git revert` the phase's commits. No schema or data dependency — safe to roll back at any point without affecting Phase 2's tables.

**9. Expected Deliverable:** A working sign-up/sign-in flow with verified route protection, deployed and manually tested against the live Supabase Auth instance.

**10. Git Commit Message:** `feat(auth): add sign-up/sign-in flow with protected dashboard routes`

---

## Phase 4 — Workspace Creation

**1. Objective:** Take a freshly signed-in user with no workspace all the way to a working dashboard shell inside their first workspace.

**2. Tasks Included:** T21, T23, T24, T25, T26, T27, T28

**3. Files Expected To Change:**
- Redirect logic in `app/(dashboard)/layout.tsx` or a dedicated `app/page.tsx` server check (T21)
- `lib/utils/slug.ts` (T23)
- `lib/actions/workspaces.ts` — `createWorkspace` (T24)
- `app/(dashboard)/workspaces/new/page.tsx`, `components/workspace/workspace-create-form.tsx` (T25)
- `components/workspace/workspace-switcher.tsx` (T26)
- `app/(dashboard)/layout.tsx` (T27)
- Test file, e.g. `tests/workspace.spec.ts` (T28)

**4. Dependencies:** Phase 2 (schema, RLS, `create_workspace_with_owner`), Phase 3 (a signed-in session to act on). This is the first phase where DB and Auth phases converge.

**5. Manual Test Cases:**
- Sign up a brand-new user; confirm automatic redirect to `/workspaces/new`.
- Submit the workspace form with only a name; confirm the workspace is created and the user lands inside it directly with no extra screen (AC-2).
- Create a second workspace with a name that collides with an existing slug (e.g. two workspaces both named "Volunteers"); confirm both succeed with distinct, retried slugs (resolves audit M-4).
- Sign out and back in as the same user; confirm they land in their existing workspace, not `/workspaces/new` again.
- With only one workspace, confirm `WorkspaceSwitcher` renders as a plain label, not an interactive dropdown (resolves audit X-3).

**6. Automated Tests Required:**
- `tests/workspace.spec.ts`: covers AC-2 (workspace creation, zero-extra-fields) and the slug-collision retry path from T23.

**7. Risks:**
- **[M-4, Medium]** Without the retry-suffix logic, a slug collision causes a hard failure exactly inside the timed AC-6 flow. Verify the collision test case explicitly, not just the happy path.
- The `create_workspace_with_owner` RPC must be called transactionally — a partial failure (workspace created, membership insert failed) would leave an orphaned workspace with no member able to access it.

**8. Rollback Plan:** `git revert` the phase's commits. Any test workspaces created during manual testing can be deleted directly in Supabase (cascade delete removes their projects/tasks automatically per `database-schema.md`).

**9. Expected Deliverable:** A new user can go from sign-up to "inside a real workspace dashboard shell" with zero manual steps beyond entering a workspace name.

**10. Git Commit Message:** `feat(workspaces): add workspace creation, switching, and dashboard shell`

---

## Phase 5 — Project & Task Creation (Static Board)

**1. Objective:** Let a user create a project and add tasks to a real Kanban board layout — the first phase where the full PRD loop is visible, short of moving a task.

**2. Tasks Included:** T29, T30, T31, T32, T33, T34, T35, T36, T37, T38, T39

**3. Files Expected To Change:**
- `lib/actions/projects.ts` — `createProject` (T29)
- `components/project/project-sidebar.tsx` (T30)
- `components/project/project-create-form.tsx` (T31)
- `app/(dashboard)/[workspaceSlug]/page.tsx` (T32)
- Test file `tests/project.spec.ts` (T33)
- `lib/actions/tasks.ts` — `createTask` (T34)
- `components/kanban/task-create-inline.tsx` (T35)
- `components/kanban/task-card.tsx` (static) (T36)
- `components/kanban/kanban-column.tsx` (T37)
- `components/kanban/kanban-board.tsx`, `app/(dashboard)/[workspaceSlug]/[projectId]/page.tsx` (T38)
- Test file `tests/task.spec.ts` (T39)

**4. Dependencies:** Phase 4 (a workspace must exist to create a project inside). Internally sequential: project creation (T29–33) must land before the board it redirects to (T34–39) is meaningful — this is exactly why these two roadmap phases are merged here (see `build-order.md` grouping notes).

**5. Manual Test Cases:**
- Inside a workspace, submit the single-field project form; confirm immediate redirect to that project's Kanban board (AC-3).
- Visit a workspace with zero projects; confirm an empty state renders (not a blank page).
- On the Kanban board, confirm all four fixed columns render (Backlog / To Do / In Progress / Done), each showing "No tasks yet" when empty.
- Use the inline quick-add at the top of a column; type a title and press Enter; confirm the task appears in "To Do" immediately with no other required fields (AC-4).
- Add three tasks in rapid succession to the same column; confirm each gets a distinct `position` and they render in creation order.

**6. Automated Tests Required:**
- `tests/project.spec.ts`: AC-3 — project creation redirects to its Kanban board.
- `tests/task.spec.ts`: AC-4 — quick-added task appears in "To Do" with only a title set.

**7. Risks:**
- New tasks must default to `status = 'todo'`, not `'backlog'` — confirm this in code, since `database-schema.md`'s default value matches but it's easy to mis-set in the Server Action.
- Initial `position` spacing (e.g. increments of 1000) must leave room for later drag-and-drop reordering in Phase 6 — verify the spacing strategy here, since Phase 6 builds directly on it (partially resolves audit M-5).

**8. Rollback Plan:** `git revert` the phase's commits. Test projects/tasks can be deleted directly via cascade delete from their parent workspace with no separate cleanup needed.

**9. Expected Deliverable:** A user can create a project and populate it with tasks on a real, navigable Kanban board — the full create-side of the PRD loop, demoable end-to-end.

**10. Git Commit Message:** `feat(projects): add project creation and static Kanban board with quick-add tasks`

---

## Phase 6 — Kanban Drag-and-Drop

**1. Objective:** Make task status changeable by drag-and-drop and by an accessible keyboard fallback, completing the full Sprint 1 user loop.

**2. Tasks Included:** T40, T41, T42, T43, T44, T45

**3. Files Expected To Change:**
- `components/kanban/kanban-board.tsx`, `kanban-column.tsx`, `task-card.tsx` — drag-and-drop wiring (T40). Recommended library: a lightweight React DnD library (e.g. `@dnd-kit/core`) — library choice is an implementation detail, not a scope decision.
- `lib/actions/tasks.ts` — `moveTask` (T41)
- `components/kanban/kanban-board.tsx` — optimistic state + `revalidatePath` reconciliation (T42)
- `lib/utils/position.ts` (or co-located in `lib/actions/tasks.ts`) — rebalance routine (T43)
- `components/kanban/task-card.tsx` — keyboard "Move to…" control (T44)
- Test file `tests/kanban.spec.ts` (T45)

**4. Dependencies:** Phase 5 (a real board with tasks must exist to drag). No dependency on Phases 7–9.

**5. Manual Test Cases:**
- Drag a task from "To Do" to "In Progress"; confirm the column updates immediately.
- Reload the page; confirm the task is still in "In Progress" (AC-5).
- Temporarily disconnect network (or simulate a failed action) during a drag; confirm the UI reverts the optimistic move and shows an error toast.
- Drag the same task back and forth between two columns ~10 times; confirm visible order never breaks (validates the rebalance routine, audit M-5).
- Using only the keyboard (Tab to a task card, activate its "Move to…" control), move a task through all four columns without touching the mouse (resolves audit X-1).

**6. Automated Tests Required:**
- `tests/kanban.spec.ts`: AC-5 for both the drag path and the keyboard-fallback path — task status persists after reload via either input method.

**7. Risks:**
- **[X-1, High]** If the keyboard fallback is skipped, drag-and-drop becomes the *only* way to satisfy US-5, leaving keyboard/screen-reader users with no way to move a task at all.
- **[M-5, Medium]** Without the rebalance routine, heavy reordering in one column can eventually hit numeric precision limits in `position`, causing silent ordering bugs that are hard to reproduce later — test the repeated-reorder case explicitly, not just a single move.

**8. Rollback Plan:** `git revert` the phase's commits. The board still functions in its Phase 5 (static) state — tasks just can't change columns until this phase is reapplied. No data loss risk since `moveTask` only updates existing rows.

**9. Expected Deliverable:** The complete Sprint 1 user loop — sign in → workspace → project → task → move — working via both pointer and keyboard input.

**10. Git Commit Message:** `feat(kanban): add drag-and-drop and keyboard-accessible task status changes`

---

## Phase 7 — Polish (Definition of Done Pass)

**1. Objective:** Bring every Sprint 1 screen up to `CLAUDE.md`'s Definition of Done (loading/empty/error states, responsive, branded) with **zero functional changes**.

**2. Tasks Included:** T46, T47, T48, T49, T50, T51

**3. Files Expected To Change:**
- `components/kanban/kanban-board.tsx`, `project-sidebar.tsx`, `workspace-switcher.tsx` — skeleton loading states (T46)
- `lib/actions/*.ts` (error returns), `components/ui/` toast usage (T47)
- `app/(auth)/*`, `components/workspace/workspace-create-form.tsx`, `components/project/project-create-form.tsx` — responsive CSS (T48)
- `components/kanban/kanban-board.tsx` — narrow-viewport behavior (T49)
- `tailwind.config.ts`, component className updates across the app — brand color application (T50)
- `components/kanban/kanban-column.tsx`, `project-sidebar.tsx`, `app/(dashboard)/[workspaceSlug]/page.tsx` — empty-state copy/visuals (T51)

**4. Dependencies:** Phase 6 (all functionality must exist before it can be polished). No dependency on Phase 8 or later.

**5. Manual Test Cases:**
- Throttle network in devtools; confirm skeletons render for the board, sidebar, and switcher instead of a blank screen.
- Force a mutation to fail (e.g. disconnect network mid-action); confirm a toast appears — no silent failure.
- Resize the browser to a common mobile width (375px); confirm all forms remain usable with no overflow or clipped controls.
- At the same mobile width, confirm the Kanban board's defined narrow-viewport behavior works (e.g. horizontal scroll with visible column headers) — also check on one real mobile device.
- Visually confirm Aspen Green on every primary "create" action and a brief Aspen Gold highlight on successful create/move.
- Visit every empty state (no workspaces — N/A post-Phase 4, no projects, no tasks per column) and confirm none render as blank space.

**6. Automated Tests Required:**
- None new — this phase must not change any existing test's expected behavior. Re-run the full suite from Phases 3–6 and confirm it still passes unmodified.

**7. Risks:**
- **[X-2, Medium]** An undefined mobile Kanban layout was flagged in the audit; verify the chosen behavior (don't leave it to default CSS overflow) on a real device, not just an emulator guess.
- Risk of scope creep: it's tempting to "fix" small UX issues noticed during this pass — any such fix must not alter functional behavior verified in Phases 3–6, or it belongs in a future sprint, not here.

**8. Rollback Plan:** `git revert` the phase's commits. Because this phase changes no business logic, reverting it only removes visual/state polish — the app remains fully functional at the Phase 6 behavior level.

**9. Expected Deliverable:** Every Sprint 1 screen meets `CLAUDE.md`'s Definition of Done with no behavioral regressions versus Phase 6.

**10. Git Commit Message:** `polish(ux): add loading/empty/error states, responsive layout, and brand styling`

---

## Phase 8 — Metrics Instrumentation

**1. Objective:** Make the Sprint Success Metrics already committed to in `prd-sprint-1.md` §7 actually measurable — **without adding any new table**, since this execution plan disallows schema changes.

**2. Tasks Included:** T52, T53

**Implementation choice for this phase (resolving the open option in `implementation-roadmap.md` T52):** use the **existing** `created_at`/`updated_at` columns already in the approved schema, instead of a new `events` table:
- `sign_up` → `auth.users.created_at` (Supabase-managed, already exists)
- `workspace_created` → `workspaces.created_at`
- `project_created` → `projects.created_at`
- `task_created` → `tasks.created_at`
- `task_moved` → `tasks.updated_at` (safe to use as a moved-task proxy because Sprint 1 has no task-edit feature — `updated_at` only changes via `moveTask`)

**3. Files Expected To Change:**
- No migration files — no schema change.
- `supabase/queries/sprint-success-metrics.sql` (T53) — read-only queries against existing columns.

**4. Dependencies:** Phases 2–6 (the columns being queried must already exist and be populated by real usage).

**5. Manual Test Cases:**
- Sign up, create a workspace, create a project, create a task, and move it; confirm each corresponding timestamp column updates exactly once.
- Run each query in `sprint-success-metrics.sql` against this test data; confirm each returns a plausible value (not null, not an error).

**6. Automated Tests Required:**
- None beyond confirming the queries execute without error against a test dataset — these are reporting queries, not application logic.

**7. Risks:**
- **[M-2, High]** `auth.users` is not exposed via the anon key by default — computing `sign_up`-based metrics (e.g. time-to-first-task from account creation) requires the service-role key in a server-only context (a scheduled query or an internal script), never client-side. Confirm this before relying on it for the Phase 10 metrics check.
- Reusing `updated_at` as a "moved" proxy stops being valid the moment any task-edit feature ships in a future sprint — flag this assumption clearly in `sprint-success-metrics.sql` so a future developer doesn't silently misread stale metrics.

**8. Rollback Plan:** `git revert` the phase's commit. Since no schema changed, there is nothing to migrate down — the queries file can simply be removed with no effect on the running application.

**9. Expected Deliverable:** A set of working SQL queries that compute every metric named in `prd-sprint-1.md` §7, using only data the schema already collects.

**10. Git Commit Message:** `feat(metrics): add event logging and Sprint success metric queries`

---

## Phase 9 — Testing & QA Hardening

**1. Objective:** Verify the whole system together — full automated suite, a real timed dry run against the ≤3-minute target, and a cross-device pass — before anything touches production.

**2. Tasks Included:** T54, T55, T56

**3. Files Expected To Change:**
- No new application files expected. At most, a CI workflow file (e.g. `.github/workflows/ci.yml`) if one wasn't already added in Phase 1, to run the full suite on every push.
- Any test fixes surfaced by this phase should land in the same test files created in Phases 3–6 — not new ones.

**4. Dependencies:** All of Phases 1–8 — this phase verifies the complete system, not an isolated slice.

**5. Manual Test Cases:**
- Run the full automated suite locally and in CI on a clean checkout; confirm all tests pass together (not just individually).
- Recruit at least 3 people who have not seen the app before; have each complete sign-up → first task with no guidance, timing each attempt; confirm the median is ≤ 3 minutes (AC-6, the headline Sprint Success Metric).
- Manually run the full flow once on a desktop browser and once on a real mobile device or accurate emulator; confirm both work per `CLAUDE.md`'s "works on desktop / works on mobile" bar.

**6. Automated Tests Required:**
- The combined suite from Phases 3–6 (`auth.spec.ts`, `workspace.spec.ts`, `project.spec.ts`, `task.spec.ts`, `kanban.spec.ts`) plus the Phase 2 RLS script (`scripts/test-rls.ts`), all green together in one CI run.

**7. Risks:**
- **[T-1, High]** If this phase reveals the suite doesn't actually run together cleanly (e.g. shared test-data collisions between specs), that must be fixed here — don't proceed to production with a flaky or order-dependent suite.
- If the timed dry run exceeds 3 minutes, do not proceed to Phase 10 — return to the relevant earlier phase (most likely Phase 3's auth-confirmation setting or Phase 4's workspace form) and fix the flow, per `executive-summary.md` §5's recommendation to treat this as a release gate.

**8. Rollback Plan:** This is a verification-only phase — there is typically nothing functional to roll back. If a fix was required to make the suite pass, that fix's commit follows the rollback plan of whichever earlier phase it belongs to.

**9. Expected Deliverable:** A fully green CI run and documented, real timed evidence that AC-6 is met — the confidence gate before production deployment.

**10. Git Commit Message:** `test(qa): complete automated suite, timed dry run, and cross-device smoke test`

---

## Phase 10 — Production Deployment & Pilot Release

**1. Objective:** Ship Sprint 1 to production and onboard real pilot workspaces, with monitoring in place and metrics confirmed working against real data.

**2. Tasks Included:** T57, T58, T59, T60, T61, T62

**3. Files Expected To Change:**
- No new repo files expected. This phase applies existing migrations to a new (production) Supabase project and triggers a Vercel production deploy — both operational actions, not code changes.

**4. Dependencies:** All of Phases 1–9 must be complete and verified — this is the final phase and has no forward dependents.

**5. Manual Test Cases:**
- Apply all 7 migrations from Phase 2 to the production Supabase project, in order; confirm no errors.
- Re-run `scripts/test-rls.ts` against production; confirm it still passes there, not just in the dev project.
- Deploy to Vercel production; confirm environment variables match the production Supabase project (not the dev one).
- Manually run the full sign-up → workspace → project → task → move flow against the live production URL.
- Confirm Vercel and Supabase dashboards show real request/query logs for the test run above.
- Send access instructions to the named pilot contacts; confirm at least one can sign up and reach their first task unassisted.
- 48–72 hours after pilot invitations go out, re-run the Phase 8 metrics queries against production; confirm they return real, non-null values.

**6. Automated Tests Required:**
- None new — this phase relies on the suite from Phase 9 already having passed. A production smoke test (manual, per above) is the only required check specific to this phase.

**7. Risks:**
- Running migrations against the wrong Supabase project (dev vs. production) — double-check the project URL before applying.
- Mixing up environment variables between dev and production Vercel environments would silently point production traffic at the dev database — verify this explicitly, it's a common and costly mistake.
- Pilot users hitting an undiscovered issue with no support path — have a direct communication channel (email/chat) ready before sending invitations.

**8. Rollback Plan:** Vercel deployments are easy to roll back to the previous production deployment with one click/command if the new deploy misbehaves. Schema rollback in production is **not** a simple `git revert` once pilot data exists — any down-migration must be reviewed separately and is out of scope for a routine rollback.

**9. Expected Deliverable:** A live, verified-secure, verified-functional production instance of Aspen OS Sprint 1, with named pilot workspaces onboarded and Sprint Success Metrics confirmed flowing from real usage — ready for the Go/No-Go review in `executive-summary.md` §9.

**10. Git Commit Message:** `chore(release): deploy Sprint 1 to production and invite pilot workspaces`
