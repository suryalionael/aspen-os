/**
 * Cross-workspace RLS isolation test (resolves pre-implementation-audit.md
 * finding S-2). Run against a real Supabase project — anon key only, no
 * service role — to verify from an actual client's vantage point that:
 *
 *   1. create_workspace_with_owner atomically creates a workspace + owner membership.
 *   2. User A cannot SELECT, UPDATE, or DELETE any row belonging to User B's workspace.
 *   3. No client can INSERT directly into workspace_members (DEC-010 / S-1).
 *
 * Requires DEC-014 (email confirmation disabled) on the target project, so
 * sign-up returns an immediately usable session with no manual step.
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:rls
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

type TestUser = {
  client: SupabaseClient<Database>
  email: string
  workspaceId: string
  projectId: string
  taskId: string
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

async function createSignedInUser(label: string): Promise<TestUser> {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const email = `rls-test-${label}-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
  })
  if (signUpError) throw signUpError
  assert(!!signUpData.session, `${label}: expected an immediate session after sign-up (is email confirmation disabled per DEC-014?)`)

  const { data: workspace, error: workspaceError } = await client.rpc(
    "create_workspace_with_owner",
    {
      workspace_name: `RLS Test Workspace ${label}`,
      workspace_slug: `rls-test-${label}-${Date.now()}`,
    }
  )
  if (workspaceError) throw workspaceError
  if (!workspace) throw new Error(`${label}: create_workspace_with_owner returned no row`)

  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("user_id", signUpData.user!.id)
  if (membershipError) throw membershipError
  assert(
    membership.length === 1 && membership[0].role === "owner",
    `${label}: create_workspace_with_owner should atomically create exactly one 'owner' membership row`
  )

  const { data: project, error: projectError } = await client
    .from("projects")
    .insert({ workspace_id: workspace.id, name: `RLS Test Project ${label}`, created_by: signUpData.user!.id })
    .select()
    .single()
  if (projectError) throw projectError

  const { data: task, error: taskError } = await client
    .from("tasks")
    .insert({
      project_id: project.id,
      title: `RLS Test Task ${label}`,
      position: 1000,
      created_by: signUpData.user!.id,
    })
    .select()
    .single()
  if (taskError) throw taskError

  return {
    client,
    email,
    workspaceId: workspace.id,
    projectId: project.id,
    taskId: task.id,
  }
}

async function main() {
  console.log("Creating User A and User B, each with their own workspace/project/task...")
  const userA = await createSignedInUser("a")
  const userB = await createSignedInUser("b")
  console.log("Setup complete. Running cross-workspace isolation assertions...")

  // --- User A must not be able to SELECT User B's rows ---
  const { data: bWorkspaceViaA } = await userA.client
    .from("workspaces")
    .select("*")
    .eq("id", userB.workspaceId)
  assert(
    (bWorkspaceViaA ?? []).length === 0,
    "User A's client could SELECT User B's workspace row"
  )

  const { data: bProjectViaA } = await userA.client
    .from("projects")
    .select("*")
    .eq("id", userB.projectId)
  assert((bProjectViaA ?? []).length === 0, "User A's client could SELECT User B's project row")

  const { data: bTaskViaA } = await userA.client
    .from("tasks")
    .select("*")
    .eq("id", userB.taskId)
  assert((bTaskViaA ?? []).length === 0, "User A's client could SELECT User B's task row")

  // --- User A must not be able to UPDATE User B's rows ---
  const { data: updatedTask } = await userA.client
    .from("tasks")
    .update({ status: "done" })
    .eq("id", userB.taskId)
    .select()
  assert(
    (updatedTask ?? []).length === 0,
    "User A's client was able to UPDATE User B's task row"
  )

  // --- User A must not be able to DELETE User B's rows ---
  const { data: deletedProject } = await userA.client
    .from("projects")
    .delete()
    .eq("id", userB.projectId)
    .select()
  assert(
    (deletedProject ?? []).length === 0,
    "User A's client was able to DELETE User B's project row"
  )

  // --- No client may INSERT directly into workspace_members (DEC-010 / S-1) ---
  const { error: directInsertError } = await userA.client
    .from("workspace_members")
    .insert({ workspace_id: userB.workspaceId, user_id: userA.email, role: "owner" })
  assert(
    !!directInsertError,
    "User A's client was able to directly INSERT into workspace_members for User B's workspace — S-1 regression"
  )

  console.log("All cross-workspace isolation assertions passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
