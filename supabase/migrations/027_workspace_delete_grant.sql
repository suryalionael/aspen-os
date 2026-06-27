-- Migration 026 added the first-ever DELETE policy on public.workspaces
-- but forgot the table-level GRANT DELETE to authenticated — RLS policies
-- only take effect once the underlying GRANT permits the operation at
-- all, so deleting a workspace failed with "permission denied for table
-- workspaces" regardless of policy logic. Same class of oversight as the
-- missing grant on is_workspace_member_for_task (migration 010/014).
grant delete on public.workspaces to authenticated;
