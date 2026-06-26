-- Phase A5: comments are plain text scoped to a task, reusing
-- is_workspace_member_for_task for RLS (same pattern as task_activity,
-- labels, checklist_items). Unlike those, comments are user-authored
-- content that should remain editable/deletable by their own author —
-- update/delete policies additionally require author_id = auth.uid(),
-- distinct from the membership-only gating used elsewhere.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_task_id_created_at_idx
  on public.comments (task_id, created_at);

alter table public.comments enable row level security;

create policy "Members can view comments"
  on public.comments for select to authenticated
  using (public.is_workspace_member_for_task(task_id));

create policy "Members can create comments"
  on public.comments for insert to authenticated
  with check (
    public.is_workspace_member_for_task(task_id)
    and author_id = auth.uid()
  );

create policy "Authors can update their own comments"
  on public.comments for update to authenticated
  using (
    public.is_workspace_member_for_task(task_id)
    and author_id = auth.uid()
  );

create policy "Authors can delete their own comments"
  on public.comments for delete to authenticated
  using (
    public.is_workspace_member_for_task(task_id)
    and author_id = auth.uid()
  );

grant select, insert, update, delete on public.comments to authenticated;
