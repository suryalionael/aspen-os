-- Sprint 5 Phase 1: Google OAuth integration.
-- Each user can connect a Google account for Drive access.
-- Tokens are encrypted at rest using pgcrypto (pgp_sym_encrypt / pgp_sym_decrypt).
create extension if not exists "pgcrypto";

create table public.user_google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_user_id text not null,
  google_email text not null,
  google_display_name text,
  google_photo_url text,
  refresh_token text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Google connection per user
create unique index user_google_connections_user_id_idx on public.user_google_connections (user_id);

-- One user per Google account
create unique index user_google_connections_google_user_id_idx on public.user_google_connections (google_user_id);

alter table public.user_google_connections enable row level security;

-- Each user can only see/manage their own connection
create policy "Users can view their own Google connection"
  on public.user_google_connections for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own Google connection"
  on public.user_google_connections for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own Google connection"
  on public.user_google_connections for update to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own Google connection"
  on public.user_google_connections for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_google_connections to authenticated;
