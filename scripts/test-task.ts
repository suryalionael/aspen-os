/**
 * Automated check for AC-4 (quick-added task needs only a title and
 * defaults to 'todo') plus the position-spacing strategy createTask relies
 * on (partially resolves audit M-5). Data-layer check, same rationale as
 * scripts/test-project.ts for why this isn't a direct Server Action call.
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:task
 */

import { createClient } from "@supabase/supabase-js"

import type { Database } from "../lib/types/database"

try {
  process.loadEnvFile?.(".env.local")
} catch {
  // see scripts/test-project.ts for why this is intentionally swallowed
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

const POSITION_SPACING = 1000

async function main() {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const email = `task-test-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
  })
  if (signUpError) throw signUpError
  assert(
    !!signUpData.session,
    "expected an immediate session after sign-up (is email confirmation disabled per DEC-014?)"
  )
  const userId = signUpData.user!.id

  const { data: workspace, error: workspaceError } = await client.rpc(
    "create_workspace_with_owner",
    {
      workspace_name: "Task Test Workspace",
      workspace_slug: `task-test-${Date.now()}`,
    }
  )
  if (workspaceError) throw workspaceError
  if (!workspace) throw new Error("create_workspace_with_owner returned no row")

  const { data: project, error: projectError } = await client
    .from("projects")
    .insert({
      workspace_id: workspace.id,
      name: "Test Project",
      created_by: userId,
    })
    .select()
    .single()
  if (projectError) throw projectError

  // Quick-add: only a title and position are set, no status — the column
  // default must apply 'todo' (this is the literal risk called out in
  // sprint-1-execution-plan.md Phase 5: "easy to mis-set in the Server
  // Action").
  const { data: firstTask, error: firstTaskError } = await client
    .from("tasks")
    .insert({
      project_id: project.id,
      title: "First task",
      position: POSITION_SPACING,
      created_by: userId,
    })
    .select()
    .single()
  if (firstTaskError) throw firstTaskError
  assert(
    firstTask.status === "todo",
    "a task created with no status should default to 'todo', not 'backlog'"
  )
  console.log("Task defaults to 'todo' without the app setting it explicitly.")

  // Mirrors the Server Action's spacing query: next position = max + 1000.
  const { data: lastTask } = await client
    .from("tasks")
    .select("position")
    .eq("project_id", project.id)
    .eq("status", "todo")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = lastTask
    ? lastTask.position + POSITION_SPACING
    : POSITION_SPACING

  const { data: secondTask, error: secondTaskError } = await client
    .from("tasks")
    .insert({
      project_id: project.id,
      title: "Second task",
      position: nextPosition,
      created_by: userId,
    })
    .select()
    .single()
  if (secondTaskError) throw secondTaskError
  assert(
    secondTask.position === firstTask.position + POSITION_SPACING,
    "second task should be spaced 1000 apart from the first, leaving room for Phase 6 reordering"
  )
  console.log("Position spacing leaves room for future reordering.")

  console.log("All task checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
