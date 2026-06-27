-- Sprint 3 Phase K: a persisted, per-recipient notification center.
-- DEC-023 (Sprint 2) deferred this exact feature, reasoning that it would
-- duplicate task_activity — Phase K explicitly asks for it now, so
-- DEC-029 revisits and supersedes that deferral. The two stay genuinely
-- distinct: task_activity is an append-only, task-scoped audit trail
-- visible to every workspace member; notifications are recipient-scoped,
-- carry read/unread state, and exist to be acted on by one specific user.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Who sees this notification — not the actor who caused it.
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  type text not null
    check (type in ('assigned', 'mentioned', 'commented', 'checklist_completed', 'due_today')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

-- Lets checkDueTodayNotifications() check "have I already notified this
-- user about this task being due today, today" without a full table scan.
create index notifications_due_today_lookup_idx
  on public.notifications (user_id, task_id, type, created_at);

create function public.is_workspace_member_user(p_workspace_id uuid, p_user_id uuid)
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
      and user_id = p_user_id
  );
$$;

revoke all on function public.is_workspace_member_user(uuid, uuid) from public;
grant execute on function public.is_workspace_member_user(uuid, uuid) to authenticated;

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- The inserting client is the actor (e.g. whoever assigned/commented),
-- not the recipient, so this can't simply check user_id = auth.uid() —
-- instead it checks the actor is a member of the same workspace as the
-- recipient, which is true for every trigger site (assignment, comments,
-- checklist completion, due-today) since all of them already require
-- task access.
create policy "Workspace members can create notifications for each other"
  on public.notifications for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and public.is_workspace_member_user(workspace_id, user_id)
  );

create policy "Users can mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid());

grant select, insert, update on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;
