"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type CreateTaskState = { error: string } | { success: true } | undefined

// Fixed spacing (not 1, 2, 3…) leaves room for Phase 6 drag-and-drop
// reordering without renumbering existing siblings (audit M-5).
const POSITION_SPACING = 1000

export async function createTask(
  _prevState: CreateTaskState,
  formData: FormData
): Promise<CreateTaskState> {
  const title = String(formData.get("title") ?? "").trim()
  const projectId = String(formData.get("projectId") ?? "")

  if (!title) {
    return { error: "Task title is required." }
  }
  if (!projectId) {
    return { error: "Missing project context." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a task." }
  }

  const { data: lastTask } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", projectId)
    .eq("status", "todo")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = lastTask
    ? lastTask.position + POSITION_SPACING
    : POSITION_SPACING

  // `status` is intentionally omitted here — the tasks.status column
  // defaults to 'todo' at the database level (database-schema.md), so this
  // can never drift from the schema's own source of truth by being
  // re-specified (and possibly mis-specified, e.g. as 'backlog') in
  // application code.
  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    title,
    position,
    created_by: user.id,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
