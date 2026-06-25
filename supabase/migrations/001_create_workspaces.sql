-- Workspace-first data model (DEC-001 / DEC-002): workspaces is the top-level
-- container for Sprint 1. No organizations table exists above it.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
