create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  -- DEC-012: `role` is retained but inert in Sprint 1 — no RLS policy or UI
  -- differentiates 'owner' from 'member' yet. Do not assume it is enforced
  -- anywhere until that is built; see DECISION-LOG.md DEC-012.
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
