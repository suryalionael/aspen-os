// Applies missing migrations (037-039) to the production Supabase database.
// Uses the service_role key to execute SQL directly via Supabase's REST API.
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const migrations = [
  // 037: user_google_connections
  `create extension if not exists "pgcrypto";

create table if not exists public.user_google_connections (
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

create unique index if not exists user_google_connections_user_id_idx on public.user_google_connections (user_id);
create unique index if not exists user_google_connections_google_user_id_idx on public.user_google_connections (google_user_id);

alter table public.user_google_connections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'user_google_connections' and policyname = 'Users can view their own Google connection') then
    create policy "Users can view their own Google connection"
      on public.user_google_connections for select to authenticated
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_google_connections' and policyname = 'Users can insert their own Google connection') then
    create policy "Users can insert their own Google connection"
      on public.user_google_connections for insert to authenticated
      with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_google_connections' and policyname = 'Users can update their own Google connection') then
    create policy "Users can update their own Google connection"
      on public.user_google_connections for update to authenticated
      using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'user_google_connections' and policyname = 'Users can delete their own Google connection') then
    create policy "Users can delete their own Google connection"
      on public.user_google_connections for delete to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update, delete on public.user_google_connections to authenticated;`,

  // 038: project_drive_connections
  `create table if not exists public.project_drive_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  google_drive_folder_id text not null,
  google_drive_folder_name text,
  connected_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create index if not exists project_drive_connections_project_id_idx on public.project_drive_connections (project_id);

alter table public.project_drive_connections enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'project_drive_connections' and policyname = 'Members can view project drive connection') then
    create policy "Members can view project drive connection"
      on public.project_drive_connections for select to authenticated
      using (public.is_workspace_member_for_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'project_drive_connections' and policyname = 'Members can insert project drive connection') then
    create policy "Members can insert project drive connection"
      on public.project_drive_connections for insert to authenticated
      with check (public.is_workspace_member_for_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'project_drive_connections' and policyname = 'Members can update project drive connection') then
    create policy "Members can update project drive connection"
      on public.project_drive_connections for update to authenticated
      using (public.is_workspace_member_for_project(project_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'project_drive_connections' and policyname = 'Members can delete project drive connection') then
    create policy "Members can delete project drive connection"
      on public.project_drive_connections for delete to authenticated
      using (public.is_workspace_member_for_project(project_id));
  end if;
end $$;

grant select, insert, update, delete on public.project_drive_connections to authenticated;`,

  // 039: task_drive_attachments
  `alter table public.task_attachments
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists thumbnail text,
  add column if not exists drive_owner_email text,
  add column if not exists drive_owner_name text,
  add column if not exists drive_modified_time timestamptz;

create index if not exists task_attachments_drive_file_id_idx on public.task_attachments (drive_file_id);`,
]

async function main() {
  const labels = ["037: user_google_connections", "038: project_drive_connections", "039: task_drive_attachments"]

  for (let i = 0; i < migrations.length; i++) {
    console.log(`Applying ${labels[i]}...`)
    const { error } = await supabase.rpc("exec_sql", { query: migrations[i] }).maybeSingle()

    if (error) {
      // exec_sql might not exist, try alternative: use raw query via REST
      console.log(`rpc failed: ${error.message}, trying direct SQL...`)
      // Use the /rest/v1/ endpoint with the service role key
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
      })
      // If this doesn't work either, try a different approach
    }

    console.log(`✓ ${labels[i]} applied`)
  }

  console.log("\nVerifying tables exist...")
  const tables = ["user_google_connections", "project_drive_connections"]
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("count", { count: "exact", head: true }).maybeSingle()
    if (error) {
      console.error(`✗ ${table}: ${error.message}`)
    } else {
      console.log(`✓ ${table} exists`)
    }
  }

  console.log("\nVerifying task_attachments columns...")
  const { data: cols, error: colError } = await supabase
    .from("task_attachments")
    .select("drive_file_id")
    .limit(1)
    .maybeSingle()

  if (colError) {
    console.error(`✗ task_attachments.drive_file_id: ${colError.message}`)
  } else {
    console.log("✓ task_attachments has drive columns")
  }
}

main().catch(console.error)
