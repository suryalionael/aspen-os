-- Indexes per database-schema.md §2.
create index if not exists idx_workspace_members_workspace_id
  on public.workspace_members (workspace_id);

create index if not exists idx_workspace_members_user_id
  on public.workspace_members (user_id);

create index if not exists idx_projects_workspace_id
  on public.projects (workspace_id);

create index if not exists idx_tasks_project_id
  on public.tasks (project_id);

-- Composite index for the Kanban board query: fetch and order tasks per
-- column in one indexed scan.
create index if not exists idx_tasks_project_status_position
  on public.tasks (project_id, status, position);

-- Reserved for the Sprint 2 "My Tasks" feature (see DEC-013) — unused by any
-- Sprint 1 query today.
create index if not exists idx_tasks_assignee_id
  on public.tasks (assignee_id);
