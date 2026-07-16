-- Aspen AI V3.2 — Semantic Workspace Memory.
-- Enables hybrid (SQL + vector) retrieval over tasks, notes, comments,
-- meetings, activity summaries, decisions, and memories.
-- Powered by pgvector.

create extension if not exists vector with schema public;

create table if not exists public.ai_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  source_type text not null check (source_type in (
    'task', 'note', 'comment', 'meeting',
    'activity_summary', 'decision', 'memory'
  )),
  source_id uuid not null,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_embeddings_ws_idx
  on public.ai_embeddings (workspace_id);

create index if not exists ai_embeddings_ws_source_idx
  on public.ai_embeddings (workspace_id, source_type);

create index if not exists ai_embeddings_vec_idx
  on public.ai_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.ai_embeddings enable row level security;

create policy "Members can view workspace embeddings"
  on public.ai_embeddings for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can manage workspace embeddings"
  on public.ai_embeddings for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy "Members can update workspace embeddings"
  on public.ai_embeddings for update to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Members can delete workspace embeddings"
  on public.ai_embeddings for delete to authenticated
  using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.ai_embeddings to authenticated;

-- ---------------------------------------------------------------------------
-- Match function for hybrid (SQL + vector) retrieval.
-- Used by lib/ai/embeddings.ts → searchSimilar().
-- ---------------------------------------------------------------------------

create or replace function match_embeddings(
  query_embedding vector(1536),
  filter_workspace_id uuid,
  filter_project_id uuid default null,
  filter_source_type text default null,
  match_count int default 5,
  match_threshold float default 0.5
)
returns table(
  id uuid, workspace_id uuid, project_id uuid,
  source_type text, source_id uuid, content text,
  similarity float, created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    e.id, e.workspace_id, e.project_id,
    e.source_type, e.source_id, e.content,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.created_at
  from ai_embeddings e
  where e.workspace_id = filter_workspace_id
    and (filter_project_id is null or e.project_id = filter_project_id)
    and (filter_source_type is null or e.source_type = filter_source_type)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;
