/**
 * Automated check for AC-3 (project creation, scoped to its workspace) at
 * the data layer. Server Actions can't be invoked directly from a
 * standalone script (see scripts/test-workspace.ts for why) — this
 * exercises the same insert lib/actions/projects.ts performs, plus the
 * cross-workspace RLS isolation a project must inherit from its parent
 * workspace.
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:project
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "../lib/types/database"

try {
  process.loadEnvFile?.(".env.local")
} catch {
  // .env.local may not exist yet (e.g. in CI) — fall through and let the
  // missing-env-var check below fail loudly instead.
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in a real Supabase project before running this script."
  )
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

async function createSignedInUser(
  label: string
): Promise<{ client: SupabaseClient<Database>; userId: string }> {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const email = `project-test-${label}-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: signUpData, error } = await client.auth.signUp({
    email,
    password,
  })
  if (error) throw error
  assert(
    !!signUpData.session,
    `${label}: expected an immediate session after sign-up (is email confirmation disabled per DEC-014?)`
  )

  return { client, userId: signUpData.user!.id }
}

async function main() {
  const userA = await createSignedInUser("a")
  const userB = await createSignedInUser("b")

  const { data: workspaceA, error: workspaceError } = await userA.client.rpc(
    "create_workspace_with_owner",
    {
      workspace_name: "Project Test Workspace",
      workspace_slug: `project-test-${Date.now()}`,
    }
  )
  if (workspaceError) throw workspaceError
  if (!workspaceA) throw new Error("create_workspace_with_owner returned no row")

  const { data: project, error: projectError } = await userA.client
    .from("projects")
    .insert({
      workspace_id: workspaceA.id,
      name: "Test Project",
      created_by: userA.userId,
    })
    .select()
    .single()
  if (projectError) throw projectError
  assert(
    project.workspace_id === workspaceA.id,
    "project should be scoped to the creating user's workspace"
  )
  console.log("Project created successfully within its workspace.")

  // User B is not a member of workspace A — projects must inherit
  // workspace-level RLS isolation, not just tables that directly reference
  // workspace_members.
  const { data: viaB } = await userB.client
    .from("projects")
    .select("*")
    .eq("id", project.id)
  assert(
    (viaB ?? []).length === 0,
    "User B's client could SELECT User A's project"
  )
  console.log("Cross-workspace project isolation confirmed.")

  console.log("All project checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
