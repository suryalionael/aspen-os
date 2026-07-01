# Sprint 4 Completion Report

**Date:** 2026-06-29  
**Status:** All items shipped and verified in production

---

## Bugs Fixed

### Bug 1 — Task Progress Always 0%
**Root cause (two independent bugs, both needed):**
1. `getTaskProgress()` (`lib/utils/task-progress.ts`) ignored `task.status`. A task moved to the Done column with no checklist correctly read as 0% — the status flag was never checked. Fix: return 100 immediately when `status === "done"`.
2. `TaskCard` duplicated progress logic inline rather than calling the shared helper, so the DEC-046 fix to `task-progress.ts` never reached the kanban card chips. Fix: switched `TaskCard` to call `getTaskProgress()`.
3. `moveTask` skips `revalidatePath` (by documented design — it's called directly, not via a form action). This was fine when only the kanban board consumed its results, but `ProjectHeader` and `ProjectCompletionSidebar` (added in Sprint 3) read project-wide aggregates as server-rendered props that `moveTask` never refreshed. Fix: `commitMove` in `kanban-board.tsx` now calls `router.refresh()` after a successful move.

**Files modified:** `lib/utils/task-progress.ts`, `components/kanban/task-card.tsx`, `components/kanban/kanban-board.tsx`

### Bug 2 — Attachments
Re-verified in production. All upload/preview/download/delete flows confirmed working after recent UI changes. No fix needed.

---

## Features Shipped

### Priority 9 — Multiple Assignees
- New `task_assignees (task_id, user_id)` join table, RLS via `is_workspace_member_for_task`, mirrors `task_labels` exactly.
- `lib/actions/assignees.ts`: `getTaskAssignees`, `assignUserToTask`, `unassignUserFromTask`, with `tasks.assignee_id` kept in sync as "primary assignee" for backward compat with 12 existing consumers.
- `TaskAssigneePicker` component (mirrors `TaskLabelPicker`), replaces the old single-select in the task edit form.
- Stacked initials avatar group in `TaskCard` (up to 3 visible + +N overflow).

### Priority 10 — Auto-Close Task Dialog on Save
- `handleEditSubmit` in `task-detail-dialog.tsx` calls `onOpenChange(false)` immediately on `editTask` success.
- No `router.refresh()` added here — `editTask` already calls `revalidatePath("/", "layout")` which self-corrects server-rendered siblings.

### Priority 12 — Workspace Calendar
- `CalendarView` generalized to render tasks, meetings, and milestones (month/week/day), with drag-to-reschedule extended to meetings via dnd-kit `data` field.
- New `meetings`/`meeting_attendees` tables (migration 034), workspace-scoped RLS.
- `lib/actions/meetings.ts`: full CRUD + reschedule.
- New `/[workspaceSlug]/calendar` page aggregating tasks from every project, meetings, and project due dates as milestone chips.
- "Calendar" link in workspace sidebar.

**Bug caught during verification:** Migration 034 was missing `grant ... to authenticated` statements. `permission denied for table meetings` confirmed via production-shaped repro. Fixed in 034b_meetings_grants + amended source file. Grant step now explicitly documented in DEC-052 and DEC-053 for future migrations.

### Priority 13 / Sprint 5 — Notes Hub
- Unified `notes` table (`type`: document/quick_note/meeting_note/announcement), migration 035.
- `lib/actions/notes.ts`: CRUD, announcements also write to `audit_log` via existing `logAuditEvent()`.
- `/[workspaceSlug]/notes`: filterable list + create/edit dialog with markdown preview.
- "Notes" link in workspace sidebar.
- Announcements card on workspace home dashboard.

---

## Database Migrations

| # | Name | Contents |
|---|------|----------|
| 033 | task_assignees | Many-to-many assignees join table |
| 034 | meetings | Meetings + meeting_attendees, RLS, `is_workspace_member_for_meeting()` |
| 034b | meetings_grants | Missing GRANT fix (table-level privileges for authenticated role) |
| 035 | notes | Unified notes entity with type enum, RLS, grants |

---

## Production Verification

All features verified live at `https://aspen-os.vercel.app` via throwaway Playwright scripts:
- Bug 1: progress shows correctly at 0%, partial, and 100%; moves update immediately.
- Bug 2: file upload/preview/download/delete all working.
- P9: multiple assignees render as stacked avatars, persist correctly.
- P10: task edit dialog closes automatically on successful save.
- P12: workspace calendar shows task chips, milestone chips, meeting chips; create meeting works live.
- P13: notes create/filter/edit/delete; announcement appears in audit log; announcements card on home.

---

## Playwright Tests Added/Modified

| File | Change |
|------|--------|
| `e2e/task-management.spec.ts` | Added `exact: true` to "Comment" button to avoid assignee-picker collision |
| `e2e/board-power-features.spec.ts` | Updated for P9 assignee picker + P10 auto-close |
| `e2e/dashboard.spec.ts` | Updated for P10 auto-close (reopen dialog for assign step) |
| `e2e/notifications.spec.ts` | Updated for P9 (`assignee_added` activity text) + P10 auto-close |
| `e2e/calendar.spec.ts` | Regression test — passes unchanged after CalendarView generalization |
| `e2e/workspace-calendar.spec.ts` | **New** — P12 workspace calendar full flow |
| `e2e/notes.spec.ts` | **New** — P13 notes create/filter/edit/announce/dashboard |

---

## Technical Debt

1. **`tasks.assignee_id` as "primary assignee"** — 12 files still read only the primary; `TaskTableView`/calendar chips show only one. Needs a broader refactor when multi-assignee visibility is wanted everywhere.
2. **Meeting notifications** — creating a meeting or adding an attendee fires no notification. The `notifications.type` check constraint would need a new value (`meeting_invited`) to enable this.
3. **Announcement notifications** — announcements appear in Audit Log but don't trigger the bell. Same constraint.
4. **CalendarView drag-to-reschedule for milestones** — milestone chips are intentionally read-only (click → navigate to project). Project due date editing feels wrong from a workspace calendar; consider a proper milestone dialog if requested.
5. **Note ownership** — any workspace member can edit/delete any note. Per-creator ownership check deferred per DEC-053.
6. **`git stash` from Bug 1 investigation** — one stash remains in the repo from an A/B test during the progress bug investigation (priority: low, contains only a discarded `router.refresh()` hypothesis).

---

## Recommendations for Sprint 5/6/7

### Sprint 5 (now partially done)
- **Better Workspace Home**: add Upcoming Meetings widget (next 5 meetings from the workspace calendar), Recent Notes widget.
- **Quick Actions**: floating ⌘K command palette combining task create, meeting create, note create, and search — reuse `cmdk` (already in shadcn).

### Sprint 6
- **Task Dependencies**: `task_dependencies (dependent_task_id, dependency_task_id)` join table. UI: "blocks/blocked by" chip on task card, prevents moving a blocked task to Done. Minimal new schema.
- **Timeline/Gantt View**: horizontal date-range view tab on project board. Render tasks as bars between `created_at` and `due_date`. Reuse existing CalendarView grid infrastructure.
- **True Milestones**: separate `milestones (project_id, title, due_date)` entity if project-level granularity proves insufficient.

### Sprint 7
- **Global Command Palette (⌘K)**: `cmdk` component, shortcuts for create task/meeting/note, jump to project, search across all task titles.
- **@Mentions in Comments**: parse `@email` in comment body, create `mentioned` notification, highlight in rendered output.
- **Workspace Activity Feed**: aggregate all `task_activity` entries across every project on a new `/[workspaceSlug]/activity` page, with actor/task links.
