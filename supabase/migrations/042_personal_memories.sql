-- Aspen AI V3.1: Personal Memory System.
-- Replaces the per-user ai_memories with a richer, rankable schema.
-- Workspace-scoped memories survive across conversations and are scored
-- by importance, recency, and workspace relevance so only the most
-- relevant facts are injected into each prompt.
--
-- Memory types:
--   PROFILE       – permanent identity (timezone, language, workspaces)
--   PREFERENCE    – learned preferences (concise, markdown, Kanban, …)
--   WORK_PATTERN  – recurring work styles (sprint planning, async, …)
--   GOAL          – stated objectives
--   DECISION      – past decisions
--   FACT          – durable knowledge
--   PERSON        – key relationships
--   PREFERENCE_SIGNAL – ephemeral signal counter for auto-learning
--
-- Future: pgvector column `embedding vector(1536)` for semantic recall.

create table if not exists public.personal_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  type text not null default 'FACT',
  content text not null,
  importance integer not null default 1 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create index if not exists personal_memories_user_ws_idx
  on public.personal_memories (user_id, workspace_id);

create index if not exists personal_memories_user_type_idx
  on public.personal_memories (user_id, type);

create index if not exists personal_memories_rank_idx
  on public.personal_memories (user_id, importance desc, last_accessed_at desc);

alter table public.personal_memories enable row level security;

create policy "Users own their personal memories"
  on public.personal_memories for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.personal_memories to authenticated;
