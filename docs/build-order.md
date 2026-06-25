# Sprint 1 Build Order

**Status:** Ready for build
**Source documents:** [`implementation-roadmap.md`](implementation-roadmap.md) · [`prd-sprint-1.md`](prd-sprint-1.md) · [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md) · [`technical-plan.md`](technical-plan.md)

This document regroups the 62 tasks (T1–T62) from `implementation-roadmap.md` into 10 shippable phases. **No new tasks, scope, or features are introduced** — every task ID below maps exactly to its definition in `implementation-roadmap.md`; this document only changes the grouping and commit boundaries.

Each phase below is designed to leave the application in a working, independently testable state, so the team gets fast feedback, can ship incrementally, and can roll back a single phase's commit without breaking a previously working state.

### Grouping notes (where this differs from the roadmap's phase numbers)

- **T21** (post-sign-in redirect) is moved from the roadmap's Auth phase into **Phase 4** here, because its redirect targets (`/workspaces/new` and the workspace home page) don't exist until that phase — grouping it with Auth would make Phase 3 untestable end-to-end.
- The roadmap's "Project Creation" (T29–T33) and "Task Creation" (T34–T39) phases are merged into a single **Phase 5** here, because project creation's own Definition of Done (T31) requires landing on the project's Kanban board page — which is built in T38. Splitting them would leave an intermediate phase with a dead-end route.
- All other phases map 1:1 to the roadmap's phase boundaries.

---

## Phase 1 — Foundation & Deploy Pipeline

**Tasks Included:** T1, T2, T3, T4, T5, T6, T7

**Goal:** Stand up the Next.js + Supabase + Vercel skeleton and prove the full deploy pipeline works before any real feature is built.

**Expected User Outcome:** No product-facing functionality yet. A placeholder page is publicly reachable at the production URL.

**Test Checklist:**
- [ ] `next dev` runs locally with no errors.
- [ ] `npm run lint` passes.
- [ ] shadcn/ui components render on a test page with Aspen brand theme tokens applied.
- [ ] Supabase client utilities import and initialize with no runtime error.
- [ ] Placeholder page is live and reachable at the Vercel production URL.
- [ ] Service role key is confirmed absent from any client bundle (inspect built output / browser network tab).

**Definition of Done:** Repo, Supabase project, and Vercel project all exist and are connected; a push to main auto-deploys; lint is clean.

**Recommended Git Commit Message:**
`chore(setup): scaffold Next.js app, Supabase project, and Vercel deploy pipeline`

---

## Phase 2 — Data Layer & Security

**Tasks Included:** T8, T9, T10, T11, T12, T13, T14, T15, T16

**Goal:** Establish the complete Sprint 1 schema, indexes, and Row Level Security before any UI touches the database — so every later phase builds on a verified-secure foundation.

**Expected User Outcome:** No visible user-facing change. This phase is verified at the database/script level, not through the UI.

**Test Checklist:**
- [ ] All four tables (`workspaces`, `workspace_members`, `projects`, `tasks`) exist with the exact columns/constraints in `database-schema.md`.
- [ ] All required indexes exist; `EXPLAIN` on a sample Kanban query uses the composite index.
- [ ] `create_workspace_with_owner` runs as `SECURITY DEFINER` and atomically creates a workspace + membership row.
- [ ] RLS is enabled on all four tables.
- [ ] `workspace_members` has **no** client-facing INSERT policy.
- [ ] The RLS cross-workspace test script (T16) passes — user A cannot read or write user B's rows on any table.
- [ ] Generated TypeScript types compile against a sample query with no `any`.

**Definition of Done:** Schema, indexes, RPC, and RLS policies are all applied and the RLS test script passes against the live Supabase project.

**Recommended Git Commit Message:**
`feat(db): add Sprint 1 schema, indexes, RLS policies, and workspace-creation RPC`

---

## Phase 3 — Authentication

**Tasks Included:** T17, T18, T19, T20, T22

**Goal:** Let a user create an account and sign in, with protected routes correctly gated — independent of any workspace/project functionality.

**Expected User Outcome:** A visitor can sign up, sign in, see a clear error on invalid credentials, and is blocked from any protected route while signed out.

**Test Checklist:**
- [ ] Email confirmation is disabled; sign-up establishes a session immediately with no email step.
- [ ] Sign-up creates a Supabase Auth user.
- [ ] Sign-in with valid credentials succeeds.
- [ ] Sign-in with invalid credentials shows an inline error and stays on `/sign-in` (AC-1).
- [ ] Visiting any `(dashboard)` route while signed out redirects to `/sign-in`.
- [ ] Visiting `/sign-in` or `/sign-up` while already signed in redirects away from the auth forms.
- [ ] Automated AC-1 test passes in CI.

**Definition of Done:** A user can complete sign-up and sign-in end-to-end; protected-route gating is verified; AC-1 automated test is green.

**Recommended Git Commit Message:**
`feat(auth): add sign-up/sign-in flow with protected dashboard routes`

---

## Phase 4 — Workspace Creation

**Tasks Included:** T21, T23, T24, T25, T26, T27, T28

**Goal:** Take a freshly signed-in user with no workspace all the way to a working dashboard shell inside their first workspace.

**Expected User Outcome:** A new user signs up, is automatically routed to create a workspace, creates it with a single field, and lands inside a real dashboard shell with a working workspace switcher.

**Test Checklist:**
- [ ] A signed-in user with zero workspaces is auto-routed to `/workspaces/new`.
- [ ] A signed-in user with one or more workspaces is routed straight to their workspace home.
- [ ] Submitting the single-field workspace form creates the workspace and lands the user inside it with no confirmation screen (AC-2).
- [ ] Creating a workspace with a name that collides with an existing slug still succeeds, with a unique suffixed slug.
- [ ] `WorkspaceSwitcher` renders as a plain label (not a dropdown) when the user has exactly one workspace.
- [ ] Dashboard shell layout renders nav + switcher consistently across dashboard routes.
- [ ] Automated AC-2 + slug-collision test passes in CI.

**Definition of Done:** End-to-end flow from sign-up to "inside a workspace" works with no manual intervention; AC-2 automated test is green.

**Recommended Git Commit Message:**
`feat(workspaces): add workspace creation, switching, and dashboard shell`

---

## Phase 5 — Project & Task Creation (Static Board)

**Tasks Included:** T29, T30, T31, T32, T33, T34, T35, T36, T37, T38, T39

**Goal:** Let a user create a project and add tasks to it on a real (non-draggable) Kanban board — the first phase where the core PRD loop becomes visible end-to-end, short of moving a task.

**Expected User Outcome:** A user inside a workspace can create a project, see it listed, land on its Kanban board, and quick-add tasks that appear immediately in the "To Do" column.

**Test Checklist:**
- [ ] Creating a project with just a name redirects directly to that project's (empty) Kanban board (AC-3).
- [ ] `ProjectSidebar` lists all projects in the workspace with a working "new project" entry point.
- [ ] Workspace home page shows an empty state when a workspace has no projects yet.
- [ ] All four fixed Kanban columns render; an empty column shows "No tasks yet," not blank space.
- [ ] Quick-adding a task via inline input requires only a title and appears immediately in "To Do" (AC-4).
- [ ] Repeated quick-adds in the same column each get a distinct `position` value.
- [ ] Automated AC-3 and AC-4 tests pass in CI.

**Definition of Done:** A user can go from "inside a workspace" to "a project with tasks on a real Kanban board" with no manual data seeding; AC-3 and AC-4 automated tests are green.

**Recommended Git Commit Message:**
`feat(projects): add project creation and static Kanban board with quick-add tasks`

---

## Phase 6 — Kanban Drag-and-Drop

**Tasks Included:** T40, T41, T42, T43, T44, T45

**Goal:** Make task status changeable — by drag-and-drop and by an accessible keyboard fallback — completing the full Sprint 1 user loop.

**Expected User Outcome:** A user can drag a task between columns and see the change persist after reload; a keyboard-only user can achieve the same result without dragging.

**Test Checklist:**
- [ ] Dragging a task to a different column updates its status immediately in the UI.
- [ ] The change persists after a full page reload (AC-5).
- [ ] A failed `moveTask` call reverts the optimistic UI change and shows an error.
- [ ] Repeated reorders within one column eventually trigger the position-rebalance routine without changing visible order.
- [ ] Each task card exposes a keyboard-focusable "Move to…" control that moves the task between all four columns without drag.
- [ ] Automated AC-5 test passes for both the drag path and the keyboard-fallback path.

**Definition of Done:** The full Sprint 1 loop (sign in → workspace → project → task → move) works end-to-end via both pointer and keyboard input; AC-5 automated test is green.

**Recommended Git Commit Message:**
`feat(kanban): add drag-and-drop and keyboard-accessible task status changes`

---

## Phase 7 — Polish (Definition of Done Pass)

**Tasks Included:** T46, T47, T48, T49, T50, T51

**Goal:** Bring every screen up to `CLAUDE.md`'s Definition of Done — loading, empty, and error states; responsive layout; brand styling — with zero behavioral/functional changes. This makes the phase low-risk to roll back independently if a visual regression slips through, since no business logic changes here.

**Expected User Outcome:** Same functionality as Phase 6, now polished — visible loading states while data fetches, clear error toasts on failure, a usable layout on mobile, and consistent Aspen brand styling.

**Test Checklist:**
- [ ] Loading skeletons appear for the board, sidebar, and switcher during data fetches.
- [ ] A failed create/move action shows a toast — no silent failures.
- [ ] Auth, workspace-creation, and project-creation forms render correctly at common mobile widths.
- [ ] The Kanban board has a defined, tested narrow-viewport behavior (verified on a real device or accurate emulator).
- [ ] Primary actions use Aspen Green; a brief Aspen Gold highlight confirms a successful create/move.
- [ ] Every list/board empty state (workspaces, projects, each Kanban column) has been visually verified.

**Definition of Done:** All states from `CLAUDE.md`'s Definition of Done (loading/empty/error/responsive) are present on every Sprint 1 screen, with no functional regressions versus Phase 6.

**Recommended Git Commit Message:**
`polish(ux): add loading/empty/error states, responsive layout, and brand styling`

---

## Phase 8 — Metrics Instrumentation

**Tasks Included:** T52, T53

**Goal:** Add the event logging and queries needed to actually measure the Sprint Success Metrics already committed to in `prd-sprint-1.md`, without changing any user-facing behavior.

**Expected User Outcome:** No visible change. Every core action now silently records an event in the background.

**Test Checklist:**
- [ ] `sign_up`, `workspace_created`, `project_created`, `task_created`, and `task_moved` each fire exactly once per corresponding action in manual testing.
- [ ] Sprint Success Metrics queries run successfully and return plausible (even if zero/placeholder) values against test data.

**Definition of Done:** Every action named in `prd-sprint-1.md` §7 is logged, and the metrics queries that depend on those logs run without error.

**Recommended Git Commit Message:**
`feat(metrics): add event logging and Sprint success metric queries`

---

## Phase 9 — Testing & QA Hardening

**Tasks Included:** T54, T55, T56

**Goal:** Verify the whole system together — automated suite, a real timed dry run against the ≤3-minute target, and a cross-device pass — before anything touches production. This is a verification-only phase: no code changes beyond fixes surfaced by the checks below.

**Expected User Outcome:** No new functionality. This phase is the confidence gate before deployment.

**Test Checklist:**
- [ ] All automated tests (AC-1 through AC-5, plus the Phase 2 RLS test) pass together in CI on a clean checkout.
- [ ] At least 3 first-time testers complete sign-up → first task with no guidance; median time is ≤ 3 minutes (AC-6).
- [ ] Full flow manually verified on one desktop browser and one mobile browser/device.

**Definition of Done:** CI is green end-to-end, AC-6 is empirically validated with real timed runs, and the app has been confirmed working on both desktop and mobile.

**Recommended Git Commit Message:**
`test(qa): complete automated suite, timed dry run, and cross-device smoke test`

---

## Phase 10 — Production Deployment & Pilot Release

**Tasks Included:** T57, T58, T59, T60, T61, T62

**Goal:** Ship Sprint 1 to production and get it in front of real pilot workspaces, with monitoring in place and metrics confirmed working against real data.

**Expected User Outcome:** Invited pilot nonprofit/volunteer workspaces can sign up and use the live product at its production URL.

**Test Checklist:**
- [ ] All migrations applied to the production Supabase project, in order.
- [ ] The Phase 2 RLS test re-run and passing against production.
- [ ] Production deploy succeeds with correct environment variables.
- [ ] Full flow manually verified against the live production URL.
- [ ] Vercel and Supabase dashboards/logs are accessible and show real traffic.
- [ ] Pilot contacts have working accounts and access instructions.
- [ ] 48–72 hours post-launch, the metrics queries from Phase 8 return real, non-null pilot data.

**Definition of Done:** Production is live, verified secure and functional, pilot workspaces are onboarded, and Sprint Success Metrics are confirmed flowing from real usage — ready for the Sprint 1 Go/No-Go review in `executive-summary.md`.

**Recommended Git Commit Message:**
`chore(release): deploy Sprint 1 to production and invite pilot workspaces`

---

## Rollback Strategy

Because each phase is its own commit (or small commit series) and leaves the app in a working state, rolling back any single phase means reverting to the previous phase's commit — the app remains fully functional at that point, just without the rolled-back phase's capability. Phase 7 (Polish) and Phase 8 (Metrics) are the lowest-risk to roll back independently, since neither changes core functional behavior from the phase before it.
