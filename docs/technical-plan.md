# Technical Implementation Plan — Sprint 1

**Author:** Senior Product Engineer
**Status:** Approved for build
**Related:** [`architecture.md`](architecture.md) · [`database-schema.md`](database-schema.md) · [`ux-review.md`](ux-review.md)

## 1. Technical Implementation Plan

Build the Workspace → Project → Task → Kanban loop using Next.js Server Components for reads and Server Actions for writes, against Supabase Postgres + Auth + RLS as defined in `architecture.md` and `database-schema.md`. No client-side data-fetching library, no custom API routes beyond what Server Actions provide.

## 2. Folder Structure

```
app/
  (auth)/
    sign-in/page.tsx
    sign-up/page.tsx
  (dashboard)/
    layout.tsx                  # workspace shell: nav, WorkspaceSwitcher
    workspaces/
      new/page.tsx
    [workspaceSlug]/
      page.tsx                  # workspace home: list of projects
      [projectId]/
        page.tsx                # Kanban board for the project
  layout.tsx
  page.tsx                      # marketing/landing → redirects signed-in users
components/
  ui/                            # shadcn/ui primitives
  kanban/
    kanban-board.tsx
    kanban-column.tsx
    task-card.tsx
    task-create-inline.tsx
  workspace/
    workspace-switcher.tsx
    workspace-create-form.tsx
  project/
    project-sidebar.tsx
    project-create-form.tsx
lib/
  supabase/
    client.ts                   # browser client
    server.ts                   # server client (Server Components/Actions)
  actions/
    workspaces.ts                # createWorkspace
    projects.ts                  # createProject
    tasks.ts                     # createTask, moveTask
  types/
    database.ts                  # generated Supabase types
supabase/
  migrations/
```

## 3. Route Structure

| Route | Purpose |
|---|---|
| `/sign-in` | Email/password sign-in |
| `/sign-up` | Account creation |
| `/workspaces/new` | Create-workspace form (name only) |
| `/[workspaceSlug]` | Workspace home — list of projects, "new project" entry point |
| `/[workspaceSlug]/[projectId]` | Kanban board for that project |

No `/organizations/...` routes — consistent with the Workspace-only decision in `architecture.md` §2.

## 4. Component Architecture

- **`KanbanBoard`** — Server Component shell that fetches a project's tasks (one indexed query via `(project_id, status, position)`) and renders columns; passes data to a client boundary for drag interaction.
- **`KanbanColumn`** — renders one status column (`backlog` / `todo` / `in_progress` / `done`) and its `TaskCard`s; owns the empty-state for that column.
- **`TaskCard`** — minimal card (title, optional assignee avatar slot for future use); draggable.
- **`TaskCreateInline`** — quick-add input pinned to the bottom of a column; on submit, calls the `createTask` Server Action and optimistically inserts the card (per UX recommendation in `ux-review.md`).
- **`ProjectSidebar`** — lists a workspace's projects; "new project" entry point.
- **`WorkspaceSwitcher`** — lists the user's workspaces; "new workspace" entry point.
- All built from shadcn/ui primitives (`Button`, `Input`, `Dialog`, `Card`) — no custom design-system components beyond what's needed for Kanban drag visuals.

## 5. State Management Strategy

- **Server Components + Server Actions** for all reads and writes — no Redux/Zustand/React Query needed at this scale.
- **Client state is scoped to the Kanban board only:** drag-and-drop position is held in local component state and applied optimistically, then reconciled with the Server Action result (`moveTask`) and revalidated via `revalidatePath`.
- **No global client store.** Workspace/project navigation relies on the URL (route params) as the single source of truth, not client state.

## 6. Development Order

1. **Auth** — sign-up/sign-in screens, Supabase Auth wiring, session middleware.
2. **Workspace creation** — `create_workspace_with_owner` RPC (per `architecture.md` §5), `/workspaces/new` form, `WorkspaceSwitcher`.
3. **Project creation** — `createProject` Server Action, `ProjectSidebar`, project page shell.
4. **Task CRUD** — `createTask` Server Action, `TaskCreateInline`, static (non-draggable) card rendering.
5. **Kanban drag-and-drop** — `moveTask` Server Action, optimistic client-side reordering.
6. **Polish** — loading states (skeletons for board/sidebar), empty states (no workspaces / no projects / no tasks per column), error states (failed mutation toasts), responsive pass — required by `CLAUDE.md`'s Definition of Done before this sprint is considered complete.

This order is chosen so that after each step, the previous step's feature is fully usable — supporting incremental verification of the ≤ 3-minute time-to-value target as each piece lands.

## 7. Database Migration Plan

Ordered migrations, matching `database-schema.md`:

1. `001_create_workspaces.sql` — `workspaces` table.
2. `002_create_workspace_members.sql` — `workspace_members` table + unique constraint.
3. `003_create_projects.sql` — `projects` table + FK to `workspaces`.
4. `004_create_tasks.sql` — `tasks` table + FK to `projects`, status check constraint.
5. `005_create_indexes.sql` — all indexes from `database-schema.md` §2.
6. `006_create_workspace_with_owner_fn.sql` — the transactional RPC used by the workspace-creation Server Action.
7. `007_enable_rls_and_policies.sql` — enable RLS on all four tables and apply the membership-based policies from `architecture.md` §4. Applied last, after schema and indexes exist, so policy authoring can reference final table shapes.
