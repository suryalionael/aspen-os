-- Sprint 3 Phase O: Supabase's advisor flags every policy below for
-- re-evaluating auth.uid() once per row instead of once per query.
-- Wrapping it as (select auth.uid()) lets Postgres treat it as a stable
-- subquery the planner can evaluate a single time and reuse — same
-- logical result, meaningfully cheaper at scale. Purely mechanical:
-- every qual/with_check expression is otherwise byte-for-byte identical.

alter policy "Authors can delete their own comments" on public.comments
  using (is_workspace_member_for_task(task_id) and (author_id = (select auth.uid())));

alter policy "Authors can update their own comments" on public.comments
  using (is_workspace_member_for_task(task_id) and (author_id = (select auth.uid())));

alter policy "Members can create comments" on public.comments
  with check (is_workspace_member_for_task(task_id) and (author_id = (select auth.uid())));

alter policy "Users can mark their own notifications read" on public.notifications
  using (user_id = (select auth.uid()));

alter policy "Users can view their own notifications" on public.notifications
  using (user_id = (select auth.uid()));

alter policy "Users can favorite projects in their workspaces" on public.project_favorites
  with check ((user_id = (select auth.uid())) and is_workspace_member_for_project(project_id));

alter policy "Users can unfavorite their own favorites" on public.project_favorites
  using (user_id = (select auth.uid()));

alter policy "Users can view their own favorites" on public.project_favorites
  using (user_id = (select auth.uid()));

alter policy "Admins and owners can create invites" on public.workspace_invites
  with check (is_workspace_admin_or_owner(workspace_id) and (created_by = (select auth.uid())));

alter policy "Owners can remove members, members can leave" on public.workspace_members
  using (is_workspace_owner(workspace_id) or (user_id = (select auth.uid())));

alter policy "Authenticated users can create a workspace for themselves" on public.workspaces
  with check (created_by = (select auth.uid()));
