# UX Review — Sprint 1

**Author:** UX Reviewer
**Status:** Approved for build
**Related:** [`prd-sprint-1.md`](prd-sprint-1.md) · [`technical-plan.md`](technical-plan.md) · `../design-system.md` · `../claude.md`

Reviewed against `design-system.md` (Aspen Green primary actions, generous whitespace, "understand any screen within 30 seconds") and `CLAUDE.md` (desktop-first/mobile-friendly, simplicity over flexibility). Optimized for nonprofit, volunteer-driven, first-time users — not power users.

## 1. User Flow

```
Landing → Sign in / Sign up → (no workspace yet) Create Workspace
   → Workspace home (empty) → Create Project
   → Project Kanban board (empty) → Create first Task → Move Task
```

Every step after sign-in leads directly into the next required action — there is no dead-end screen and no optional detour before the first task exists.

## 2. Onboarding Flow — checked against the ≤ 3-minute target

| Step | Screen | Time-to-value design constraint |
|---|---|---|
| 1 | Sign up / sign in | Single screen, email + password only. No profile setup, no "tell us about your organization" survey. |
| 2 | Create workspace | One field: workspace name. Submitting immediately drops the user into the new (empty) workspace — no confirmation screen. |
| 3 | Create project | One field: project name. Submitting immediately opens the (empty) Kanban board for that project. |
| 4 | Create first task | Inline quick-add at the top of the "To Do" column — type a title, hit Enter. No modal, no required fields beyond title. |

Each step above is deliberately reduced to its single required input. This is what makes the ≤ 3-minute target (`prd-sprint-1.md` AC-6) achievable: the flow has exactly four lightweight actions between landing and first task, with zero optional or blocking steps in between (no invites, no template picker, no tour).

## 3. Workspace Creation Flow

Triggered either from first sign-in (forced, since a brand-new user has none) or later via `WorkspaceSwitcher` → "New workspace" (optional, for a user who already has one). Same single-field form in both cases — consistency matters more than customizing the second case.

## 4. Project Creation Flow

Entry point is the `ProjectSidebar` "New project" action, visible as soon as a user is inside a workspace. Single-field form (name). No project templates, no color/icon pickers in Sprint 1 — those are exactly the kind of "flexibility" `CLAUDE.md`'s product principles say to avoid until proven necessary.

## 5. Task Creation Flow

**Recommendation: inline quick-add, not a modal.** A modal interrupts the board view and adds a close/cancel decision point; an inline input at the top of a column keeps the user's eyes on the board and supports rapid sequential entry (add task, hit Enter, add another) — important for a volunteer coordinator entering a backlog in one sitting.

## 6. Kanban Workflow

- Four fixed columns: Backlog, To Do, In Progress, Done (matches `database-schema.md` status values — no user-configurable columns in Sprint 1).
- New tasks land in "To Do" by default (not "Backlog") so a freshly created task is immediately visible as actionable.
- Drag-and-drop between columns is the only way to change status — no separate "edit status" dropdown needed, keeping the interaction model to one mental model.
- Empty column state: a column with no tasks shows a quiet placeholder ("No tasks yet") rather than blank space, so first-time users don't mistake an empty board for a broken one.

## 7. "My Tasks" deferral — UX rationale

Echoing the Founder/PM evaluation in `prd-sprint-1.md` §6: deferring "My Tasks" to Sprint 2 does not hurt Sprint 1 usability. Sprint 1's target user works within one project at a time (a single nonprofit campaign or program); a cross-project assignee view only becomes valuable once a workspace has multiple active projects running concurrently, which is unlikely in a team's first few sessions. Shipping it now would also add a fifth onboarding decision point ("where do I look for my stuff?") right when the goal is minimizing decisions before first value.

## 8. UX Risks

| Risk | Mitigation |
|---|---|
| Forced workspace creation on first sign-in could feel like a barrier if the form has any friction | Keep it to exactly one field; no validation beyond "not empty" |
| Drag-and-drop discoverability is lower on touch/tablet than desktop | `CLAUDE.md` specifies desktop-first/mobile-friendly — accept reduced drag affordance on small screens for Sprint 1; revisit if pilot feedback flags it |
| Empty Kanban board on first project visit could read as "nothing happened" | Inline quick-add must be visually prominent (not a tiny "+" icon) so the next action is obvious within the 30-second understandability bar |
| Four fixed status columns may not match every workspace's process vocabulary | Acceptable for Sprint 1 (opinionated over configurable, per `CLAUDE.md`); revisit only if validated by real usage |

## 9. Recommendations

- Use Aspen Green as the primary action color for every "create" button (workspace, project, task) — consistent affordance across the whole onboarding path, per `design-system.md`.
- Reserve Aspen Gold for the moment a task is successfully created or moved (e.g. a brief highlight) — sparing use as an accent, not a primary color, per brand guidance.
- Keep all forms single-column, generously spaced — no dense multi-field layouts, consistent with "prioritize whitespace and readability."
- Defer any onboarding "tour" or tooltip overlay — the flow itself should be understandable within 30 seconds without explanation; if it isn't, fix the flow rather than adding a tour.
