-- Phase D. archived_at mirrors the tasks.archived_at pattern (migration
-- 010) — soft-delete via filtering, not an actual row deletion. Deleting
-- a project remains a real, permanent delete via the existing
-- tasks.project_id -> projects(id) on delete cascade FK (migration 004).
alter table public.projects
  add column archived_at timestamptz null;

-- Favorites are personal, not workspace-wide, so this cannot be a column
-- on projects itself — two different members could favorite different
-- projects. A join table keyed by (user_id, project_id) is the standard
-- shape for a per-user flag on a shared resource.
create table public.project_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index project_favorites_user_id_idx
  on public.project_favorites (user_id);

alter table public.project_favorites enable row level security;

-- A user can only ever see/write their own row, so id-based isolation is
-- already airtight without an is_workspace_member check — but requiring
-- one too prevents a member from favoriting a project in a workspace
-- they don't belong to, which would otherwise be harmless clutter rather
-- than a real exposure, kept here for consistency with the rest of the
-- schema's authorization posture.
create policy "Users can view their own favorites"
  on public.project_favorites for select to authenticated
  using (user_id = auth.uid());

create policy "Users can favorite projects in their workspaces"
  on public.project_favorites for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member_for_project(project_id)
  );

create policy "Users can unfavorite their own favorites"
  on public.project_favorites for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.project_favorites to authenticated;
