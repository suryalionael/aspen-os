# Product Requirements Document — Sprint 1

**Author:** Founder / PM
**Status:** Approved for build
**Related:** [`ROADMAP.md`](../ROADMAP.md) · [`architecture.md`](architecture.md) · [`ux-review.md`](ux-review.md)

## 1. Problem

Nonprofit, volunteer-driven, and community organizations currently coordinate projects through spreadsheets, email threads, and fragmented tools. None of these give a small, often part-time or volunteer team a shared, visual, low-friction view of what needs to happen and who's doing it. Aspen OS's MVP must prove that a deliberately simple project OS — not a scaled-down enterprise tool — solves this for these teams.

## 2. Goal

Ship the smallest end-to-end loop that delivers real value: **sign in, create a workspace, create a project, create tasks, and move tasks across a Kanban board.** This sprint validates the core value loop before any additional view (Calendar, Table, List) or dashboard is built.

## 3. Scope (MVP feature set for this sprint)

- Authentication (sign up / sign in)
- Workspaces (create, switch)
- Projects (create, within a workspace)
- Tasks (create, within a project)
- Kanban View (the only view shipped this sprint; drag tasks between status columns)

No Organization layer above Workspace — see `architecture.md` Strategic Evaluation §1 for the analysis and rationale. Workspace is the top-level container for Sprint 1.

## 4. User Stories

**US-1 — Sign in**
As a nonprofit team member, I want to sign in with my email, so that I can securely access my organization's work.

**US-2 — Create a workspace**
As a first-time user, I want to create a workspace in a single step, so that I have a place to organize my team's projects without setup friction.

**US-3 — Create a project**
As a workspace member, I want to create a project with just a name, so that I can start organizing tasks immediately.

**US-4 — Create a task**
As a project member, I want to quickly add a task with a title, so that I can capture work without filling out a long form.

**US-5 — Move a task on the Kanban board**
As a project member, I want to drag a task between status columns, so that I can reflect its progress at a glance for the whole team.

**US-6 — Fast time-to-value**
As a brand-new user, I want to get from signing in to having my first task on the board in just a few minutes, so that I experience the product's value immediately instead of abandoning setup.

## 5. Acceptance Criteria

**AC-1 (Sign in)**
- Given a user has a valid account, When they enter correct credentials, Then they are signed in and redirected to their workspace.
- Given a user enters invalid credentials, When they submit, Then they see a clear inline error and remain on the sign-in screen.

**AC-2 (Create workspace)**
- Given a signed-in user with no workspace, When they submit a workspace name, Then a workspace is created and they land inside it with zero additional required fields.

**AC-3 (Create project)**
- Given a user inside a workspace, When they submit a project name, Then the project is created and they are taken directly to its (empty) Kanban board.

**AC-4 (Create task)**
- Given a user viewing a project's Kanban board, When they enter a task title via quick-add and confirm, Then the task appears in the default column (e.g. "To Do") immediately, with no required fields beyond the title.

**AC-5 (Move task)**
- Given a task card on the Kanban board, When a user drags it to a different column, Then its status updates immediately and persists on reload.

**AC-6 (End-to-end time-to-value)**
- Given a brand-new user with an account, When they sign in and proceed through workspace creation, project creation, and task creation without any guidance, Then they reach a created first task in **3 minutes or less**.

## 6. Out-of-Scope Features (Sprint 1)

| Feature | Reason |
|---|---|
| Calendar View | Not part of the core create-and-move loop; sequenced for a later sprint per `CLAUDE.md` MVP feature list. |
| Table View | Same as above. |
| List View | Same as above. |
| **My Work Dashboard / "My Tasks" view** | Evaluated explicitly this sprint (see below) — deferred. |
| Organization layer (above Workspace) | Evaluated explicitly this sprint (see `architecture.md`) — rejected as premature for MVP. |
| CRM, AI Assistant, Time Tracking, Payroll, Billing, Complex Automations, Advanced Reporting, Mobile App | Explicit non-goals per `CLAUDE.md` until MVP adoption is validated. |

### "My Tasks" deferral — evaluated, not assumed

- **Arguments for including it now:** high daily-use value (one place to see everything assigned to you across projects); low marginal build cost once tasks have an `assignee_id`, since it's just a filtered view over existing data.
- **Arguments against:** `CLAUDE.md` already lists "My Work Dashboard" as its own distinct MVP feature, separate from Kanban View — building it in Sprint 1 means shipping two roadmap items in one sprint instead of validating one. The current sprint goal (sign in → workspace → project → tasks → Kanban) never mentions it. It adds a route and component before the single-project core flow is even validated with real users.
- **Recommendation: defer to Sprint 2.** Scope discipline outweighs the feature's standalone value at this stage — we ship it once the core loop is proven, not in parallel with proving it.

## 7. Sprint Success Metrics

- **Time-to-first-task ≤ 3 minutes** (median, new user, sign-in to first task created) — headline metric, see AC-6.
- ≥ 90% of users who create a workspace also create a project in the same session.
- ≥ 80% of users who create a project also create at least one task.
- ≥ 1 successful Kanban drag-and-drop move per active project within the first session.
- Zero critical bugs (data loss, broken auth, broken drag-and-drop) in the core flow during pilot use.
