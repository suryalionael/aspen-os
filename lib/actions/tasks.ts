"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  computePosition,
  needsRebalance,
  rebalancePositions,
} from "@/lib/utils/position"

export type CreateTaskState =
  | { error: string }
  | { success: true; task: { id: string; title: string; status: string } }
  | undefined

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

  const position = computePosition(lastTask?.position ?? null, null)

  // `status` is intentionally omitted here — the tasks.status column
  // defaults to 'todo' at the database level (database-schema.md), so this
  // can never drift from the schema's own source of truth by being
  // re-specified (and possibly mis-specified, e.g. as 'backlog') in
  // application code.
  const { data: newTask, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title,
      position,
      created_by: user.id,
    })
    .select("id, title, status")
    .single()

  if (error || !newTask) {
    return { error: error?.message ?? "Could not create task." }
  }

  // KanbanBoard owns its own client-side task state for drag-and-drop
  // (Phase 6) rather than re-rendering directly from server props, so this
  // revalidation alone would not make the new task appear — TaskCreateInline
  // adds it to that state explicitly via the returned task below.
  revalidatePath("/", "layout")
  return { success: true, task: newTask }
}

export type MoveTaskInput = {
  taskId: string
  projectId: string
  status: string
  // Explicit ids pin the drop precisely between two known siblings (the
  // drag-and-drop path). Omitting both means "append to the end of the
  // destination column" (the keyboard fallback path) — the column is
  // fetched either way, so the server can resolve either case from the
  // same query.
  beforeTaskId?: string | null
  afterTaskId?: string | null
}

export type MoveTaskResult = { error: string } | { success: true }

export async function moveTask(input: MoveTaskInput): Promise<MoveTaskResult> {
  const supabase = await createClient()

  const { data: columnTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id, position")
    .eq("project_id", input.projectId)
    .eq("status", input.status)
    .neq("id", input.taskId)
    .order("position", { ascending: true })

  if (fetchError) {
    return { error: fetchError.message }
  }

  const tasks = columnTasks ?? []

  // Priority: an explicit afterTaskId (insert before it) takes precedence
  // over an explicit beforeTaskId (insert after it); if neither is given,
  // default to appending after the current last item.
  let beforeTask: { id: string; position: number } | undefined
  let afterTask: { id: string; position: number } | undefined

  if (input.afterTaskId) {
    const index = tasks.findIndex((task) => task.id === input.afterTaskId)
    afterTask = index === -1 ? undefined : tasks[index]
    beforeTask = index > 0 ? tasks[index - 1] : undefined
  } else if (input.beforeTaskId) {
    const index = tasks.findIndex((task) => task.id === input.beforeTaskId)
    beforeTask = index === -1 ? undefined : tasks[index]
    afterTask = index !== -1 && index < tasks.length - 1 ? tasks[index + 1] : undefined
  } else {
    beforeTask = tasks.length > 0 ? tasks[tasks.length - 1] : undefined
  }

  let newPosition: number

  if (needsRebalance(beforeTask?.position ?? null, afterTask?.position ?? null)) {
    // needsRebalance only ever returns true when afterTask exists (see
    // lib/utils/position.ts) — appending past the last item is pure
    // addition and never needs rebalancing.
    const targetIndex = tasks.findIndex((task) => task.id === afterTask!.id)
    const rebalanced = rebalancePositions(tasks.length + 1)

    const updates = tasks.map((task, index) => ({
      id: task.id,
      position: rebalanced[index < targetIndex ? index : index + 1],
    }))

    const results = await Promise.all(
      updates.map(({ id, position }) =>
        supabase.from("tasks").update({ position }).eq("id", id)
      )
    )
    const rebalanceError = results.find((result) => result.error)?.error
    if (rebalanceError) {
      return { error: rebalanceError.message }
    }

    newPosition = rebalanced[targetIndex]
  } else {
    newPosition = computePosition(
      beforeTask?.position ?? null,
      afterTask?.position ?? null
    )
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: input.status, position: newPosition })
    .eq("id", input.taskId)

  if (error) {
    return { error: error.message }
  }

  // No revalidatePath here: moveTask is called directly from client event
  // handlers (drag end, the keyboard "move to" control), not a <form>
  // action, so Next.js does not auto-refresh the route — and the caller's
  // own optimistic state is already the source of truth for this view. A
  // full reload re-fetches fresh data from the database regardless (AC-5).
  return { success: true }
}
