# Sprint 1 Implementation Roadmap

**Status:** Ready for build
**Source documents:** [`prd-sprint-1.md`](prd-sprint-1.md) · [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md) · [`technical-plan.md`](technical-plan.md) · [`ux-review.md`](ux-review.md) · [`executive-summary.md`](executive-summary.md) · [`pre-implementation-audit.md`](pre-implementation-audit.md)

62 tasks across 10 phases, each scoped to under 2 hours and listed in dependency order. Phases follow the Development Order in `technical-plan.md` §6, extended with the setup, testing, instrumentation, and deployment work needed to actually ship. Tasks that resolve a finding from `pre-implementation-audit.md` are marked with the finding ID (e.g. `[C-1]`) — these are corrections to the existing plan, not new scope.

Unless noted otherwise, each task depends on the task immediately before it.

---

## Phase 0 — Environment & Project Setup

### T1 — Initialize Next.js project
**Depends on:** None
**Definition of Done:**
- Next.js (App Router) + TypeScript project created, runs locally with `next dev`.
- Tailwind CSS installed and configured.
- Repo pushed with a base `.gitignore` and README stub.

### T2 — Install and configure shadcn/ui
**Depends on:** T1
**Definition of Done:**
- shadcn/ui CLI initialized; `components/ui/` exists with at least `Button`, `Input`, `Card`, `Dialog` added.
- Theme tokens updated to reflect `design-system.md` (Aspen Green primary, Aspen Gold accent, Geist font).

### T3 — Create Supabase project
**Depends on:** None
**Definition of Done:**
- Supabase project created.
- Project URL, anon key, and service role key recorded in a password manager / secrets store (not committed to the repo).

### T4 — Configure environment variables
**Depends on:** T1, T3 — *resolves [S-3]*
**Definition of Done:**
- `.env.local` (gitignored) holds `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Service role key is documented as server-only and is **not** present in any `NEXT_PUBLIC_*` variable.
- Vercel project environment variables configured to match, scoped to Production/Preview as appropriate.

### T5 — Create Supabase client utilities
**Depends on:** T4
**Definition of Done:**
- `lib/supabase/client.ts` exports a browser client using the anon key.
- `lib/supabase/server.ts` exports a server client for use in Server Components/Actions.
- Both compile and a smoke import from a test page succeeds with no runtime error.

### T6 — Connect Vercel and deploy placeholder
**Depends on:** T1, T4
**Definition of Done:**
- Vercel project linked to the repo, auto-deploy on push to main enabled.
- A placeholder `/` page deploys successfully and is reachable at the Vercel URL — confirms the full pipeline works before any real feature is built.

### T7 — Configure linting/formatting baseline
**Depends on:** T1
**Definition of Done:**
- ESLint + Prettier configured with a Next.js/TypeScript ruleset.
- `npm run lint` passes on the current (placeholder) codebase.
- Pre-commit or CI lint check wired (whichever the team already uses elsewhere; otherwise a simple `npm run lint` CI step).

---

## Phase 1 — Database Schema & Security

### T8 — Migration: `workspaces` table
**Depends on:** T3
**Definition of Done:**
- `001_create_workspaces.sql` creates `workspaces` per `database-schema.md` (id, name, slug unique, created_by, timestamps).
- Migration applies cleanly to the Supabase project via CLI or SQL editor.

### T9 — Migration: `workspace_members` table
**Depends on:** T8 — *role column documented per [C-3]*
**Definition of Done:**
- `002_create_workspace_members.sql` creates the table with the `(workspace_id, user_id)` unique constraint.
- A migration comment notes that `role` is **inert in Sprint 1** (no RLS or UI differentiates owner/member yet) — resolves the ambiguity flagged in audit C-3.

### T10 — Migration: `projects` table
**Depends on:** T8
**Definition of Done:**
- `003_create_projects.sql` creates `projects` with FK to `workspaces`, cascade delete, per `database-schema.md`.

### T11 — Migration: `tasks` table
**Depends on:** T10 — *assignee_id documented per [U-1]*
**Definition of Done:**
- `004_create_tasks.sql` creates `tasks` with FK to `projects`, `status` check constraint (`backlog`/`todo`/`in_progress`/`done`), `position numeric`, and `assignee_id` (nullable FK).
- A migration comment notes `assignee_id` is **unused by any Sprint 1 UI**, reserved for the Sprint 2 "My Tasks" feature — resolves audit U-1 by making the exception explicit instead of silent.

### T12 — Migration: required indexes
**Depends on:** T9, T10, T11
**Definition of Done:**
- `005_create_indexes.sql` creates all indexes listed in `database-schema.md` §2, including the composite `(project_id, status, position)` index.
- `EXPLAIN` on a sample Kanban-board query shows the composite index is used.

### T13 — Migration: `create_workspace_with_owner` function
**Depends on:** T8, T9 — *resolves [T-2]*
**Definition of Done:**
- `006_create_workspace_with_owner_fn.sql` defines the function as **`SECURITY DEFINER`**, scoped to only insert into `workspaces` and `workspace_members`.
- Calling the function as a test user creates exactly one workspace row and one membership row, atomically (rollback on either failing).

### T14 — Migration: enable RLS and policies
**Depends on:** T8–T13 — *resolves [S-1]*
**Definition of Done:**
- `007_enable_rls_and_policies.sql` enables RLS on all four tables.
- `workspaces`/`projects`/`tasks` policies match the membership-check pattern in `architecture.md` §4.
- **`workspace_members` has no client-facing INSERT policy at all** — the only writer is the `SECURITY DEFINER` function from T13. This is verified, not just assumed.

### T15 — Generate Supabase TypeScript types
**Depends on:** T14
**Definition of Done:**
- `lib/types/database.ts` generated from the live schema via Supabase CLI.
- Types import cleanly into a sample Server Component with no `any`.

### T16 — RLS cross-workspace access test
**Depends on:** T14 — *resolves [S-2]*
**Definition of Done:**
- A script (or test) creates two users, each with their own workspace/project/task, and asserts user A's client cannot `SELECT`/`UPDATE` user B's rows in any of the four tables.
- Script is checked into the repo (e.g. `scripts/test-rls.ts`) so it can be re-run before every future schema change.

---

## Phase 2 — Authentication

### T17 — Configure Supabase Auth settings
**Depends on:** T3 — *resolves [C-1]*
**Definition of Done:**
- Email confirmation requirement is **disabled** for Sprint 1 (auto-confirm on sign-up), so AC-6's ≤3-minute target is achievable.
- Decision and rationale recorded as a comment in `architecture.md` §5 (cross-reference back from this task).

### T18 — Build sign-up page
**Depends on:** T5, T17
**Definition of Done:**
- `/sign-up` renders an email + password form using shadcn/ui components.
- Successful sign-up creates a Supabase Auth user and establishes a session with no email-confirmation interstitial.
- Inline validation error shown for malformed email / too-short password.

### T19 — Build sign-in page
**Depends on:** T5, T17 — *implements AC-1*
**Definition of Done:**
- `/sign-in` renders an email + password form.
- Valid credentials sign the user in and redirect onward (per T21).
- Invalid credentials show a clear inline error and the user remains on `/sign-in` — matches AC-1 exactly.

### T20 — Auth session middleware
**Depends on:** T18, T19
**Definition of Done:**
- Middleware protects all `(dashboard)` routes; unauthenticated requests redirect to `/sign-in`.
- Signed-in users hitting `/sign-in` or `/sign-up` are redirected away (not shown the auth forms again).

### T21 — Post-sign-in redirect logic
**Depends on:** T20
**Definition of Done:**
- A signed-in user with zero workspaces is routed to `/workspaces/new`.
- A signed-in user with one or more workspaces is routed to their (most recent or only) workspace home.

### T22 — Automated test: AC-1
**Depends on:** T19
**Definition of Done:**
- Automated test covers both AC-1 branches (valid sign-in succeeds; invalid sign-in shows inline error, stays on page).
- Test passes in CI.

---

## Phase 3 — Workspace Creation

### T23 — Slug generation utility
**Depends on:** T15 — *resolves [M-4]*
**Definition of Done:**
- `lib/utils/slug.ts` slugifies a workspace name (lowercase, hyphenated, stripped of special characters).
- On a uniqueness collision against `workspaces.slug`, the utility appends a short numeric/random suffix and retries.
- Unit test covers the collision-retry path.

### T24 — `createWorkspace` Server Action
**Depends on:** T13, T23
**Definition of Done:**
- Server Action calls the `create_workspace_with_owner` RPC with the name and generated slug.
- Returns the new workspace's slug on success, a typed error on failure.

### T25 — Build `/workspaces/new` page
**Depends on:** T24 — *implements AC-2*
**Definition of Done:**
- Single-field form (workspace name only); submitting redirects straight into the new workspace with no confirmation screen.
- Matches AC-2 exactly: zero additional required fields.

### T26 — Build `WorkspaceSwitcher` component
**Depends on:** T24 — *resolves [X-3]*
**Definition of Done:**
- Lists the signed-in user's workspaces with a "new workspace" entry.
- When the user has exactly one workspace, the switcher renders as a plain label (not an interactive dropdown with a single, pointless entry).

### T27 — Build dashboard shell layout
**Depends on:** T26
**Definition of Done:**
- `(dashboard)/layout.tsx` renders nav + `WorkspaceSwitcher`, wraps all dashboard routes.
- Layout is visually consistent with `design-system.md` (whitespace, Aspen Green accents).

### T28 — Automated test: AC-2 + slug collision
**Depends on:** T25
**Definition of Done:**
- Test covers: workspace creation with a unique name, and creation with a name that collides with an existing slug (asserts the retry-suffix logic from T23 produces a usable, unique slug).

---

## Phase 4 — Project Creation

### T29 — `createProject` Server Action
**Depends on:** T14, T27
**Definition of Done:**
- Server Action inserts a project scoped to the current workspace; rejected by RLS if the user isn't a member (verified manually once).

### T30 — Build `ProjectSidebar` component
**Depends on:** T29
**Definition of Done:**
- Lists all projects in the current workspace with a "new project" entry point.

### T31 — Build project creation form
**Depends on:** T29
**Definition of Done:**
- Single-field form (project name); submitting opens the new project's (empty) Kanban board directly — matches AC-3.

### T32 — Build workspace home page
**Depends on:** T30, T31
**Definition of Done:**
- `/[workspaceSlug]` renders `ProjectSidebar` plus a project list/grid.
- Empty state ("no projects yet") renders correctly for a brand-new workspace.

### T33 — Automated test: AC-3
**Depends on:** T32
**Definition of Done:**
- Test covers project creation and confirms the resulting redirect lands on that project's Kanban board.

---

## Phase 5 — Task Creation (Static Board)

### T34 — `createTask` Server Action
**Depends on:** T14, T29 — *partially resolves [M-5]*
**Definition of Done:**
- Inserts a task with `status = 'todo'` by default and a `position` computed via fixed spacing (e.g. increments of 1000 from the current max in that column) — initial spacing strategy documented in code comments.

### T35 — Build `TaskCreateInline` component
**Depends on:** T34
**Definition of Done:**
- Inline input at the top of a column; Enter submits and clears the input for rapid sequential entry — matches AC-4 (no required fields beyond title).

### T36 — Build static `TaskCard` component
**Depends on:** T34
**Definition of Done:**
- Renders task title (and a reserved, unused slot for a future assignee avatar per audit U-1); not yet draggable.

### T37 — Build `KanbanColumn` component
**Depends on:** T36
**Definition of Done:**
- Renders the four fixed columns (Backlog/To Do/In Progress/Done) with their `TaskCard`s.
- Empty column shows a "No tasks yet" placeholder, not blank space.

### T38 — Build `KanbanBoard` page
**Depends on:** T35, T37
**Definition of Done:**
- `/[workspaceSlug]/[projectId]` renders all four columns via one indexed query on `(project_id, status, position)`.
- New tasks created via T35 appear in "To Do" immediately on the rendered board.

### T39 — Automated test: AC-4
**Depends on:** T38
**Definition of Done:**
- Test confirms a task created via quick-add appears in the "To Do" column with only a title set.

---

## Phase 6 — Kanban Drag-and-Drop

### T40 — Integrate drag-and-drop library
**Depends on:** T38
**Definition of Done:**
- Drag-and-drop library wired into `KanbanBoard`/`KanbanColumn`/`TaskCard`; dragging a card between columns updates local UI state (no persistence yet).

### T41 — `moveTask` Server Action
**Depends on:** T14, T34
**Definition of Done:**
- Updates a task's `status` and `position` in one call; rejected by RLS for non-members.

### T42 — Optimistic reorder + reconciliation
**Depends on:** T40, T41
**Definition of Done:**
- Drag updates the UI immediately, calls `moveTask`, and reconciles via `revalidatePath` on response.
- A failed `moveTask` call reverts the optimistic UI change and surfaces an error (ties into T47).

### T43 — Position rebalance safeguard
**Depends on:** T42 — *completes [M-5]*
**Definition of Done:**
- When two adjacent tasks' `position` values converge below a defined threshold, a rebalance routine re-spaces the whole column's positions.
- Unit test simulates repeated reorders and confirms rebalancing triggers correctly without changing visual order.

### T44 — Keyboard-accessible move fallback
**Depends on:** T40 — *resolves [X-1]*
**Definition of Done:**
- Each `TaskCard` exposes a focusable "Move to…" control (e.g. a small menu) that calls the same `moveTask` action.
- A keyboard-only user can move a task between all four columns without using drag-and-drop.

### T45 — Automated test: AC-5 + keyboard fallback
**Depends on:** T42, T44
**Definition of Done:**
- Test confirms a moved task's status persists after reload (AC-5) via both the drag path and the keyboard-fallback path.

---

## Phase 7 — Polish (Definition of Done Pass)

### T46 — Loading skeletons
**Depends on:** T38
**Definition of Done:**
- Skeleton states render for the Kanban board, project sidebar, and workspace switcher while data is loading.

### T47 — Error-state toasts
**Depends on:** T42
**Definition of Done:**
- Failed `createWorkspace`/`createProject`/`createTask`/`moveTask` calls surface a clear toast notification; no silent failures.

### T48 — Responsive pass: forms and navigation
**Depends on:** T27, T31
**Definition of Done:**
- Sign-in/up, workspace-creation, and project-creation forms render correctly at common mobile widths (e.g. 375px) with no overflow or clipped controls.

### T49 — Responsive Kanban board behavior
**Depends on:** T38 — *resolves [X-2]*
**Definition of Done:**
- On narrow viewports, the four-column board uses a defined, tested behavior (e.g. horizontal scroll with snap points) rather than an unstyled overflow.
- Verified on at least one real mobile device or accurate emulator.

### T50 — Visual pass: brand color application
**Depends on:** T27, T38
**Definition of Done:**
- All primary "create" actions use Aspen Green; a brief Aspen Gold highlight confirms successful task creation/move, per `ux-review.md` §9.

### T51 — Full empty-state audit
**Depends on:** T32, T37
**Definition of Done:**
- Every list view (workspaces, projects, each Kanban column) has a verified, non-blank empty state — checked off against `ux-review.md` §6 and §8.

---

## Phase 8 — Metrics Instrumentation

### T52 — Minimal event logging
**Depends on:** T24, T29, T34, T41 — *resolves [M-2]*
**Definition of Done:**
- `sign_up`, `workspace_created`, `project_created`, `task_created`, and `task_moved` events are logged with a timestamp and user/workspace id (simplest viable approach: an `events` table or existing `created_at` columns plus one lightweight events table — implementer's choice, documented in code).
- Each event fires exactly once per corresponding action in manual testing.

### T53 — Sprint Success Metrics queries
**Depends on:** T52
**Definition of Done:**
- SQL queries exist (checked into `supabase/queries/` or similar) to compute: median time-to-first-task, workspace→project same-session conversion, project→task conversion, and Kanban moves per active project — matching `prd-sprint-1.md` §7 exactly.

---

## Phase 9 — Testing & QA

### T54 — Full automated suite pass
**Depends on:** T22, T28, T33, T39, T45 — *resolves [T-1]*
**Definition of Done:**
- All AC-1 through AC-6 automated tests, plus the T16 RLS test, pass together in CI on a clean checkout.

### T55 — Manual timed dry run
**Depends on:** T54
**Definition of Done:**
- At least 3 first-time (internal, non-team) testers complete sign-up → first task with no guidance, each timed.
- Median time is ≤ 3 minutes, directly validating AC-6; results recorded.

### T56 — Cross-device smoke test
**Depends on:** T49, T54
**Definition of Done:**
- Full flow manually verified on: one desktop browser, one mobile browser (real device or accurate emulator), confirming `CLAUDE.md`'s "works on desktop / works on mobile" bar.

---

## Phase 10 — Deployment & Pilot Release

### T57 — Apply migrations to production
**Depends on:** T16, T54
**Definition of Done:**
- All migrations (T8–T14) applied to the production Supabase project in order; `EXPLAIN` and RLS test (T16) re-run against production and pass.

### T58 — Production deploy
**Depends on:** T6, T57
**Definition of Done:**
- Vercel production deployment succeeds against the production Supabase project with correct environment variables (per T4).

### T59 — Production smoke test
**Depends on:** T58
**Definition of Done:**
- Full flow (sign-up → workspace → project → task → move) manually verified against the live production URL.

### T60 — Basic monitoring setup
**Depends on:** T58
**Definition of Done:**
- Vercel and Supabase dashboards/log views confirmed accessible and showing real request/query data; no dedicated third-party monitoring tool added (out of scope for Sprint 1).

### T61 — Pilot workspace invitations
**Depends on:** T59, T60
**Definition of Done:**
- A small, named set of pilot nonprofit/volunteer contacts have working accounts and access instructions, per `executive-summary.md` §8 step 7.

### T62 — Post-launch metrics check
**Depends on:** T61, T53
**Definition of Done:**
- 48–72 hours after pilot invitations go out, the Sprint Success Metrics queries (T53) are re-run against real pilot data and return sensible, non-null results — confirming instrumentation actually works before the Sprint 1 Go/No-Go review.
