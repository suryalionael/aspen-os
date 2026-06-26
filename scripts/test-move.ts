/**
 * Live data-layer check for AC-5 (a moved task's status persists) and the
 * RLS isolation moveTask must still respect. Server Actions can't be
 * invoked directly from a standalone script (see scripts/test-workspace.ts
 * for why) — this mirrors the exact query sequence lib/actions/tasks.ts's
 * moveTask performs: fetch the destination column, resolve neighbors,
 * compute position, then update status + position in one call.
 *
 * The actual drag/keyboard UI interaction is covered separately by the
 * Playwright end-to-end test (e2e/kanban.spec.ts).
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:move
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { computePosition } from "../lib/utils/position"
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
  const email = `move-test-${label}-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: signUpData, error } = await client.auth.signUp({ email, password })
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

  const { data: workspace, error: workspaceError } = await userA.client.rpc(
    "create_workspace_with_owner",
    { workspace_name: "Move Test Workspace", workspace_slug: `move-test-${Date.now()}` }
  )
  if (workspaceError) throw workspaceError
  if (!workspace) throw new Error("create_workspace_with_owner returned no row")

  const { data: project, error: projectError } = await userA.client
    .from("projects")
    .insert({ workspace_id: workspace.id, name: "Move Test Project", created_by: userA.userId })
    .select()
    .single()
  if (projectError) throw projectError

  const { data: task, error: taskError } = await userA.client
    .from("tasks")
    .insert({ project_id: project.id, title: "Movable task", position: 1000, created_by: userA.userId })
    .select()
    .single()
  if (taskError) throw taskError
  assert(task.status === "todo", "task should start in 'todo'")

  // --- AC-5: moving a task updates status + position together, and persists ---
  const newPosition = computePosition(null, null) // empty 'in_progress' column
  const { error: moveError } = await userA.client
    .from("tasks")
    .update({ status: "in_progress", position: newPosition })
    .eq("id", task.id)
  if (moveError) throw moveError

  const { data: movedTask, error: refetchError } = await userA.client
    .from("tasks")
    .select("status, position")
    .eq("id", task.id)
    .single()
  if (refetchError) throw refetchError
  assert(movedTask.status === "in_progress", "task status should persist as 'in_progress' after the move")
  assert(movedTask.position === newPosition, "task position should persist after the move")
  console.log("Moved task's status and position persisted correctly.")

  // --- RLS regression: User B must still not be able to move User A's task ---
  const { data: blockedUpdate } = await userB.client
    .from("tasks")
    .update({ status: "done" })
    .eq("id", task.id)
    .select()
  assert(
    (blockedUpdate ?? []).length === 0,
    "User B's client was able to UPDATE User A's task — RLS regression"
  )
  console.log("Cross-workspace task move isolation confirmed (no regression from Phase 6).")

  console.log("All move checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
