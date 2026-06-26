-- Resolves pre-implementation-audit.md finding H-1 and the Sprint 1
-- release-readiness review's Blocker B-2: deleting a user was previously
-- impossible the moment they owned any workspace/project/task, since these
-- foreign keys had no ON DELETE behavior (Postgres default NO ACTION).
--
-- Strategy, given DEC-011 (workspaces are single-member in Sprint 1 — no
-- invite flow exists, and no path other than create_workspace_with_owner
-- ever inserts a workspace_members row):
--
--   - workspaces.created_by -> CASCADE. Today "the creator" and "the only
--     member" are the same person, by construction — there is no way for
--     a workspace to have a second member yet. Deleting that one member
--     is therefore equivalent to abandoning the workspace entirely:
--     nothing could ever access it again regardless, since every RLS
--     policy on workspaces/projects/tasks is gated on workspace
--     membership. Leaving the row behind would itself be an orphaned
--     record. Cascading removes it, and its projects/tasks, in one atomic
--     operation via the workspace_id/project_id cascades already in place
--     (migrations 003/004).
--     MUST BE REVISITED the moment a multi-member/invite feature ships:
--     once a workspace can have a member who isn't its creator, deleting
--     the creator must no longer destroy the workspace out from under
--     other members — ownership transfer or a deletion block becomes the
--     correct behavior instead.
--
--   - workspace_members.user_id -> CASCADE. A member's own row should
--     disappear when they do, independent of who created the workspace.
--     This one is already correct for a future multi-member world: a
--     non-owner member being deleted only removes their own membership,
--     not the workspace.
--
--   - projects.created_by / tasks.created_by -> CASCADE, for consistency
--     and defense-in-depth. In every row that exists today these always
--     equal the same single workspace owner (no one else has ever been
--     able to create a project or task in Sprint 1), so in practice these
--     rows are already removed via the workspace cascade above before
--     this FK is ever the active trigger — it only matters if that
--     invariant is ever violated.
--
--   - tasks.assignee_id -> SET NULL, not CASCADE. Unlike created_by, this
--     is a soft "who is this assigned to" reference, not an
--     ownership/access-control one — and is unused by any Sprint 1 UI
--     (DEC-013). Deleting the assigned user should unassign the task, not
--     delete it; the task still belongs to its project regardless of who
--     it was ever assigned to.

alter table public.workspaces
  drop constraint workspaces_created_by_fkey,
  add constraint workspaces_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete cascade;

alter table public.workspace_members
  drop constraint workspace_members_user_id_fkey,
  add constraint workspace_members_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.projects
  drop constraint projects_created_by_fkey,
  add constraint projects_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete cascade;

alter table public.tasks
  drop constraint tasks_created_by_fkey,
  add constraint tasks_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete cascade,
  drop constraint tasks_assignee_id_fkey,
  add constraint tasks_assignee_id_fkey
    foreign key (assignee_id) references auth.users (id) on delete set null;
