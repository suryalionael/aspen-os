-- Sprint 5 Phase 3: Project Drive Mapping.
-- Each project can optionally connect to a Google Drive folder.
create table public.project_drive_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  google_drive_folder_id text not null,
  google_drive_folder_name text,
  connected_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index project_drive_connections_project_id_idx on public.project_drive_connections (project_id);

alter table public.project_drive_connections enable row level security;

create policy "Members can view project drive connection"
  on public.project_drive_connections for select to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can insert project drive connection"
  on public.project_drive_connections for insert to authenticated
  with check (public.is_workspace_member_for_project(project_id));

create policy "Members can update project drive connection"
  on public.project_drive_connections for update to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can delete project drive connection"
  on public.project_drive_connections for delete to authenticated
  using (public.is_workspace_member_for_project(project_id));

grant select, insert, update, delete on public.project_drive_connections to authenticated;
