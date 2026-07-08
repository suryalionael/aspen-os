-- Sprint 5 Phase: AI Memory System.
-- Persistent conversation storage and workspace memory for Aspen AI.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_workspace_user_idx on public.ai_conversations (workspace_id, user_id);
create index ai_conversations_updated_at_idx on public.ai_conversations (updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'fact',
  entity text not null,
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, user_id, key)
);

create index ai_memories_workspace_user_idx on public.ai_memories (workspace_id, user_id);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_memories enable row level security;

create policy "Users can view their own conversations"
  on public.ai_conversations for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on public.ai_conversations for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.ai_conversations for update to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.ai_conversations for delete to authenticated
  using (auth.uid() = user_id);

create policy "Users can view messages in their conversations"
  on public.ai_messages for select to authenticated
  using (exists (select 1 from ai_conversations where id = conversation_id and user_id = auth.uid()));

create policy "Users can insert messages in their conversations"
  on public.ai_messages for insert to authenticated
  with check (exists (select 1 from ai_conversations where id = conversation_id and user_id = auth.uid()));

create policy "Users can view their own memories"
  on public.ai_memories for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own memories"
  on public.ai_memories for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own memories"
  on public.ai_memories for update to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own memories"
  on public.ai_memories for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant select, insert, update, delete on public.ai_memories to authenticated;
