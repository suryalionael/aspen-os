-- DEC-009: Row Level Security is the sole authorization layer in Sprint 1.
-- Every policy below follows the same membership-check pattern: a user may
-- read/write a row only if they belong to the workspace that row traces
-- back to (directly, or transitively through project_id -> workspace_id).
--
-- Membership checks are routed through SECURITY DEFINER helper functions
-- rather than inlined as EXISTS subqueries against workspace_members
-- directly. This is required, not stylistic: a policy on workspace_members
-- that queries workspace_members from within its own USING clause causes
-- Postgres to recurse into that same policy indefinitely ("infinite
-- recursion detected in policy for relation workspace_members") — this was
-- caught by actually running these migrations against a live Postgres
-- instance during Phase 2 verification, not by inspection. Routing the
-- check through a SECURITY DEFINER function breaks the recursion because
-- the function's internal query runs as its owner, bypassing RLS, instead
-- of re-triggering the policy being evaluated.

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
  )
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create or replace function public.is_workspace_member_for_project(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where p.id = p_project_id
      and wm.user_id = auth.uid()
  )
$$;

revoke all on function public.is_workspace_member_for_project(uuid) from public;
grant execute on function public.is_workspace_member_for_project(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- ===== workspaces =====

create policy "Members can view their workspaces"
  on public.workspaces
  for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "Members can update their workspaces"
  on public.workspaces
  for update
  to authenticated
  using (public.is_workspace_member(id));

-- Per architecture.md §4: INSERT is allowed for any authenticated user (not
-- gated on existing membership, since none exists yet for a new workspace).
create policy "Authenticated users can create a workspace for themselves"
  on public.workspaces
  for insert
  to authenticated
  with check (created_by = auth.uid());

-- ===== workspace_members =====

create policy "Members can view fellow members of their workspaces"
  on public.workspace_members
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- DEC-010 / DEC-011: deliberately NO insert/update/delete policy on
-- workspace_members. The only writer is the SECURITY DEFINER function
-- create_workspace_with_owner (migration 006), which bypasses RLS by
-- design. Do not add a client-facing write policy here without re-reading
-- pre-implementation-audit.md finding S-1 — doing so re-opens the
-- cross-workspace membership-injection vulnerability that finding
-- identified, and removes the only enforcement point for "no invite flow
-- in Sprint 1" (DEC-011).

-- ===== projects =====

create policy "Members can view projects in their workspaces"
  on public.projects
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can create projects in their workspaces"
  on public.projects
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update projects in their workspaces"
  on public.projects
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can delete projects in their workspaces"
  on public.projects
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- ===== tasks =====
-- Gated the same way as projects, joined through projects.workspace_id.

create policy "Members can view tasks in their workspaces"
  on public.tasks
  for select
  to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can create tasks in their workspaces"
  on public.tasks
  for insert
  to authenticated
  with check (public.is_workspace_member_for_project(project_id));

create policy "Members can update tasks in their workspaces"
  on public.tasks
  for update
  to authenticated
  using (public.is_workspace_member_for_project(project_id));

create policy "Members can delete tasks in their workspaces"
  on public.tasks
  for delete
  to authenticated
  using (public.is_workspace_member_for_project(project_id));
