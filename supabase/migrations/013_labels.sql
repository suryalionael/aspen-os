-- Phase A3: labels are scoped per project (like Trello's per-board labels),
-- not per-workspace, so a project's Kanban board has its own label set —
-- consistent with DEC-017's per-project board scope. Reuses the existing
-- is_workspace_member_for_project and is_workspace_member_for_task helpers
-- (migrations 007/010) rather than introducing a new one, exactly the kind
-- of reuse DEC-021 anticipated.
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create index labels_project_id_idx on public.labels (project_id);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create index task_labels_label_id_idx on public.task_labels (label_id);

alter table public.labels enable row level security;
alter table public.task_labels enable row level security;

create policy "Members can view labels"
  on public.labels for select to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can create labels"
  on public.labels for insert to authenticated
  with check (public.is_workspace_member_for_project(project_id));

create policy "Members can update labels"
  on public.labels for update to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can delete labels"
  on public.labels for delete to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can view task labels"
  on public.task_labels for select to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can attach task labels"
  on public.task_labels for insert to authenticated
  with check (public.is_workspace_member_for_task(task_id));

create policy "Members can detach task labels"
  on public.task_labels for delete to authenticated
  using (public.is_workspace_member_for_task(task_id));

grant select, insert, update, delete on public.labels to authenticated;
grant select, insert, delete on public.task_labels to authenticated;
