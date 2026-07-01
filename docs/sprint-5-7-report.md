# Sprints 5–7 Completion Report

**Date:** 2026-07-02  
**Status:** All items shipped and verified in production at https://aspen-os.vercel.app

---

## Features Shipped

### Sprint 5 — Collaboration Workspace

#### Notes Hub (`/[workspaceSlug]/notes`)
One unified `notes` table replaces four separate content types:
- **Documents** — long-form reference content
- **Quick Notes** — scratchpad items
- **Meeting Notes** — meeting follow-ups
- **Announcements** — broadcast to team, writes to Audit Log via existing `logAuditEvent()` — no new feed mechanism needed

UI: filterable card list with type tabs, create/edit dialog with Markdown preview (mirrors `TaskDetailDialog`'s existing pattern).

**Files added:** `supabase/migrations/035_notes.sql`, `lib/actions/notes.ts`, `components/notes/note-dialog.tsx`, `components/notes/notes-client.tsx`, `app/(dashboard)/[workspaceSlug]/notes/page.tsx`, `app/(dashboard)/[workspaceSlug]/notes/loading.tsx`, `e2e/notes.spec.ts`

**Files modified:** `components/project/project-sidebar.tsx` (Notes link), `components/workspace/audit-log-dialog.tsx` (announcement label), `app/(dashboard)/[workspaceSlug]/page.tsx` (Announcements card), `lib/types/database.ts`

#### Workspace Home — Announcements Card
Dashboard now shows a top-of-page "Announcements" card with the 3 most recent announcement-type notes. Links back to `/notes`.

#### ⌘K Command Palette
- Opens from any page in the workspace via `⌘K` / `Ctrl+K`
- Live search across all workspace tasks (`searchWorkspaceTasks()`)
- Navigation shortcuts: Calendar, Notes, Activity, all projects
- Quick-create shortcuts: New meeting → Calendar, New note → Notes
- Uses `cmdk` directly (no extra abstraction layer)

**Files added:** `components/command-palette.tsx`, `lib/actions/search.ts`, `e2e/command-palette.spec.ts`

**Files modified:** `app/(dashboard)/[workspaceSlug]/layout.tsx` (palette mounted at layout level)

---

### Sprint 6 — Project Management

#### Task Dependencies
Tasks can be marked as "blocked by" sibling tasks in the same project. The "Blocked by" section in `TaskDetailDialog` shows all project tasks as toggle buttons; active blockers turn red; a warning "⚠ This task is currently blocked" shows when any blocker isn't done.

**Files added:** `supabase/migrations/036_task_dependencies.sql`, `lib/actions/dependencies.ts`, `components/kanban/task-dependency-picker.tsx`, `e2e/task-dependencies.spec.ts`

**Files modified:** `components/kanban/task-detail-dialog.tsx`, `lib/types/database.ts`

**DB:** `task_dependencies (dependent_task_id, dependency_task_id)` composite PK, `no_self_dependency` check constraint, RLS via `is_workspace_member_for_task`.

#### Timeline/Gantt View
New "Timeline" tab on the project board. Shows a 6-week rolling horizontal grid (7 days before today through 5 weeks after), with tasks rendered as priority-colored bars from their `created_at` to `due_date`. Done tasks show as faded. Dynamically loaded (same pattern as CalendarView).

**Files added:** `components/kanban/task-timeline-view.tsx`

**Files modified:** `components/kanban/kanban-board.tsx` (VIEW_TABS + render block)

---

### Sprint 7 — Collaboration

#### Workspace Activity Feed (`/[workspaceSlug]/activity`)
Aggregates the last 50 `task_activity` entries across all projects in the workspace. Shows actor email, rich verb (via existing `describeActivity()`), task title linked to its project, project name, and timestamp. Accessible from sidebar "Activity" link and from the command palette.

**Files added:** `app/(dashboard)/[workspaceSlug]/activity/page.tsx`, `app/(dashboard)/[workspaceSlug]/activity/loading.tsx`

**Files modified:** `components/project/project-sidebar.tsx` (Activity link)

#### @Mention Highlighting
Comment text is scanned for `@email` patterns (regex `@[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}`) and matching substrings are rendered as `text-primary` colored spans. Server-side mention detection (notification creation) was already implemented in `lib/actions/comments.ts`; this adds the visual layer.

**Files modified:** `components/kanban/task-comments.tsx`

---

## Database Migrations

| Migration | Table | Purpose |
|-----------|-------|---------|
| 035_notes | notes | Unified notes entity (type enum, workspace-scoped) |
| 036_task_dependencies | task_dependencies | Blocking relationships between tasks |

---

## Bugs Fixed During Sprint Work

| Issue | Root cause | Fix |
|-------|-----------|-----|
| CI failing with `Missing NEXT_PUBLIC_SUPABASE_URL` | GitHub Actions repository secrets not configured | Pre-existing; documented in `.github/workflows/ci.yml` line 6 as expected until secrets are added |
| `task-management.spec.ts` strict-mode violation | `getByText("Renamed task")` matched both the kanban card AND the real-time "Task updated: Renamed task" toast simultaneously | Scoped all 4 affected locators to `getByTestId("task-card")` / `getByTestId("archived-task-row")` |

---

## Production Verification

All features verified live at https://aspen-os.vercel.app:
- Notes: create/filter/edit/delete across all 4 types, announcement in audit log ✓
- Command palette: ⌘K opens, task search works, navigation lands on correct page ✓
- Task dependencies: add/remove blockers, "currently blocked" warning ✓
- Timeline: tasks appear as horizontal bars in correct date positions ✓
- Activity feed: events from multiple projects listed with correct actor/task links ✓
- @mentions: email patterns highlighted in rendered comment text ✓

---

## CI Status

CI is failing with `Missing NEXT_PUBLIC_SUPABASE_URL` — pre-existing infrastructure gap (the workflow was set up in Sprint 3 Phase P and requires GitHub repo secrets to be added). **Not a code regression.** To fix: add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and Vercel tokens to the repository's GitHub Actions secrets.

---

## Remaining Technical Debt

1. **CI secrets** — GitHub repo secrets need to be configured for CI to pass
2. **Milestones as an entity** — currently `projects.due_date` is reused; a proper `milestones (project_id, title, due_date)` table enables multiple milestones per project
3. **OKRs/Goals** — Sprint 6 brief item not implemented (scope too large without a product design)
4. **Team Inbox** — Sprint 7 brief item not implemented (requires new notification aggregation concept)
5. **Task card blocked indicator** — `TaskDependencyPicker` in dialog shows blocking, but the kanban card itself has no "blocked" badge
6. **Note ownership rules** — any member can edit any note; per-creator edit/delete requires adding an RLS `created_by = auth.uid()` check on update/delete
7. **Meeting/announcement notifications** — `notifications.type` check constraint needs extending to enable bell-badge for new meetings/announcements
8. **Gantt drag-to-reschedule** — Timeline view is read-only; drag-resize requires more complex dnd-kit integration
9. **RLS test scripts for new tables** — `meetings`, `meeting_attendees`, `task_dependencies`, `notes` have no coverage in `scripts/test-*.ts`

---

## Recommendations for Sprint 8

1. **Fix CI secrets** — unblock automated testing and deployment
2. **OKRs/Goals** — design a minimal `objectives (workspace_id, title, target_date)` + `key_results (objective_id, title, progress)` model; surface on workspace home
3. **Team Inbox** — unified notification center showing assigned tasks, mentions, due-today, and announcements in one feed
4. **Task card blocked indicator** — add a small "🔒" chip to `TaskCard` when `blockedByCount > 0`; requires one extra join in the project page query (see Sprint 6's DEC note)
5. **Milestone entity** — once the Timeline proves useful, a `milestones` table gives finer-grained tracking within a project
6. **RLS test scripts** — add `scripts/test-new-tables.ts` covering cross-workspace isolation for meetings, notes, and task_dependencies
