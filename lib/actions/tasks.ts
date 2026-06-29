"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createNotification, getTaskNotificationContext } from "@/lib/actions/notifications"
import { logAuditEvent } from "@/lib/actions/audit"
import {
  computePosition,
  needsRebalance,
  rebalancePositions,
} from "@/lib/utils/position"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function getWorkspaceIdForProject(
  supabase: SupabaseServerClient,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle()
  return data?.workspace_id ?? null
}

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

  await logActivity(supabase, newTask.id, user.id, "created")

  const workspaceId = await getWorkspaceIdForProject(supabase, projectId)
  if (workspaceId) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: "task.created",
      targetLabel: newTask.title,
    })
  }

  // KanbanBoard owns its own client-side task state for drag-and-drop
  // (Phase 6) rather than re-rendering directly from server props, so this
  // revalidation alone would not make the new task appear — TaskCreateInline
  // adds it to that state explicitly via the returned task below.
  revalidatePath("/", "layout")
  return { success: true, task: newTask }
}

// Shared by every mutation below — DEC-021 resolves DEC-006 by routing all
// task history through this one table instead of overloading updated_at.
// Best-effort: a logging failure should never roll back or surface as an
// error on top of an otherwise-successful mutation.
export async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  actorId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  await supabase
    .from("task_activity")
    .insert({ task_id: taskId, actor_id: actorId, event_type: eventType, metadata })
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  if (user) {
    await logActivity(supabase, input.taskId, user.id, "moved", {
      to: input.status,
    })

    const workspaceId = await getWorkspaceIdForProject(supabase, input.projectId)
    if (workspaceId) {
      const { data: movedTask } = await supabase
        .from("tasks")
        .select("title")
        .eq("id", input.taskId)
        .maybeSingle()
      await logAuditEvent(supabase, {
        workspaceId,
        actorId: user.id,
        action: "task.moved",
        targetLabel: movedTask?.title ?? null,
        metadata: { to: input.status },
      })
    }
  }

  // No revalidatePath here: moveTask is called directly from client event
  // handlers (drag end, the keyboard "move to" control), not a <form>
  // action, so Next.js does not auto-refresh the route — and the caller's
  // own optimistic state is already the source of truth for this view. A
  // full reload re-fetches fresh data from the database regardless (AC-5).
  return { success: true }
}

export type EditedTask = {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: string | null
  assignee_id: string | null
}

export type EditTaskState =
  | { error: string }
  | { success: true; task: EditedTask }
  | undefined

const PRIORITY_VALUES = ["low", "medium", "high", "urgent"]

export async function editTask(
  _prevState: EditTaskState,
  formData: FormData
): Promise<EditTaskState> {
  const taskId = String(formData.get("taskId") ?? "")
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const dueDate = String(formData.get("dueDate") ?? "").trim()
  const priority = String(formData.get("priority") ?? "").trim()
  const assigneeId = String(formData.get("assigneeId") ?? "").trim()

  if (!taskId) {
    return { error: "Missing task." }
  }
  if (!title) {
    return { error: "Task title is required." }
  }
  if (priority && !PRIORITY_VALUES.includes(priority)) {
    return { error: "Invalid priority." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to edit a task." }
  }

  const { data: previousTask } = await supabase
    .from("tasks")
    .select("title, description, due_date, priority, assignee_id, project_id")
    .eq("id", taskId)
    .maybeSingle()

  const { data: updatedTask, error } = await supabase
    .from("tasks")
    .update({
      title,
      description: description || null,
      due_date: dueDate || null,
      priority: priority || null,
      assignee_id: assigneeId || null,
    })
    .eq("id", taskId)
    .select("id, title, description, due_date, priority, assignee_id")
    .single()

  if (error || !updatedTask) {
    return { error: error?.message ?? "Could not update task." }
  }

  if (previousTask) {
    const changes: Array<{ field: string; from: unknown; to: unknown }> = [
      { field: "title", from: previousTask.title, to: updatedTask.title },
      {
        field: "description",
        from: previousTask.description,
        to: updatedTask.description,
      },
      { field: "due_date", from: previousTask.due_date, to: updatedTask.due_date },
      { field: "priority", from: previousTask.priority, to: updatedTask.priority },
      {
        field: "assignee_id",
        from: previousTask.assignee_id,
        to: updatedTask.assignee_id,
      },
    ].filter((change) => change.from !== change.to)

    for (const change of changes) {
      await logActivity(supabase, taskId, user.id, "edited", change)
    }

    if (changes.length > 0) {
      const workspaceId = await getWorkspaceIdForProject(supabase, previousTask.project_id)
      if (workspaceId) {
        await logAuditEvent(supabase, {
          workspaceId,
          actorId: user.id,
          action: "task.edited",
          targetLabel: updatedTask.title,
          metadata: { fields: changes.map((change) => change.field) },
        })
      }
    }

    // Notify the new assignee — not on every edit, only when assignee_id
    // actually changed to a new, non-null value (already guaranteed by
    // the `changes` filter above finding it in the diff).
    const assigneeChange = changes.find((change) => change.field === "assignee_id")
    if (assigneeChange && updatedTask.assignee_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("workspace_id")
        .eq("id", previousTask.project_id)
        .maybeSingle()
      if (project) {
        await createNotification(supabase, {
          userId: updatedTask.assignee_id,
          actorId: user.id,
          workspaceId: project.workspace_id,
          projectId: previousTask.project_id,
          taskId,
          type: "assigned",
          message: `You were assigned to "${updatedTask.title}"`,
        })
      }
    }
  }

  revalidatePath("/", "layout")
  return { success: true, task: updatedTask }
}

export type ArchiveTaskResult = { error: string } | { success: true }

export async function archiveTask(taskId: string): Promise<ArchiveTaskResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to archive a task." }
  }

  const context = await getTaskNotificationContext(supabase, taskId)

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", taskId)

  if (error) {
    return { error: error.message }
  }

  await logActivity(supabase, taskId, user.id, "archived")
  if (context) {
    await logAuditEvent(supabase, {
      workspaceId: context.workspaceId,
      actorId: user.id,
      action: "task.archived",
      targetLabel: context.title,
    })
  }
  revalidatePath("/", "layout")
  return { success: true }
}

export async function unarchiveTask(taskId: string): Promise<ArchiveTaskResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to unarchive a task." }
  }

  const context = await getTaskNotificationContext(supabase, taskId)

  const { error } = await supabase
    .from("tasks")
    .update({ archived_at: null })
    .eq("id", taskId)

  if (error) {
    return { error: error.message }
  }

  await logActivity(supabase, taskId, user.id, "unarchived")
  if (context) {
    await logAuditEvent(supabase, {
      workspaceId: context.workspaceId,
      actorId: user.id,
      action: "task.unarchived",
      targetLabel: context.title,
    })
  }
  revalidatePath("/", "layout")
  return { success: true }
}

export type DeleteTaskResult = { error: string } | { success: true }

export async function deleteTask(taskId: string): Promise<DeleteTaskResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to delete a task." }
  }

  // No task_activity entry: the row (and its task_activity history) is
  // cascade-deleted together, so there is nothing left to attach a
  // "deleted" entry to — this is exactly why Phase N's audit_log
  // (migration 028) exists: it's workspace-scoped, not tied to the task
  // by foreign key, so it survives the row it describes being gone.
  const context = await getTaskNotificationContext(supabase, taskId)

  const { error } = await supabase.from("tasks").delete().eq("id", taskId)

  if (error) {
    return { error: error.message }
  }

  if (context) {
    await logAuditEvent(supabase, {
      workspaceId: context.workspaceId,
      actorId: user.id,
      action: "task.deleted",
      targetLabel: context.title,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export type UpdateTaskDueDateResult =
  | { error: string }
  | { success: true; dueDate: string | null }

// Dedicated, single-field action for Phase L's Calendar view drag-and-drop
// (drop a card on a different day -> update just due_date) — mirrors why
// moveTask is separate from the full editTask form: a drag gesture should
// not also resubmit every other field's current value.
export async function updateTaskDueDate(
  taskId: string,
  dueDate: string | null
): Promise<UpdateTaskDueDateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to move a task." }
  }

  const { data: previousTask } = await supabase
    .from("tasks")
    .select("due_date")
    .eq("id", taskId)
    .maybeSingle()

  const { data, error } = await supabase
    .from("tasks")
    .update({ due_date: dueDate })
    .eq("id", taskId)
    .select("due_date")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update due date." }
  }

  if (previousTask && previousTask.due_date !== data.due_date) {
    await logActivity(supabase, taskId, user.id, "edited", {
      field: "due_date",
      from: previousTask.due_date,
      to: data.due_date,
    })
  }

  revalidatePath("/", "layout")
  return { success: true, dueDate: data.due_date }
}

export type TaskDetail = {
  id: string
  project_id: string
  title: string
  status: string
  description: string | null
  due_date: string | null
  priority: string | null
  assignee_id: string | null
  archived_at: string | null
}

export async function getTask(
  taskId: string
): Promise<{ error: string } | { success: true; task: TaskDetail }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, project_id, title, status, description, due_date, priority, assignee_id, archived_at"
    )
    .eq("id", taskId)
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Task not found." }
  }

  return { success: true, task: data }
}

export type TaskActivityEntry = {
  id: string
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
  actor_id: string | null
}

export async function getTaskActivity(
  taskId: string
): Promise<{ error: string } | { success: true; activity: TaskActivityEntry[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_activity")
    .select("id, event_type, metadata, created_at, actor_id")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { success: true, activity: (data ?? []) as TaskActivityEntry[] }
}

export type ProjectActivityEntry = TaskActivityEntry & {
  task_id: string
  task_title: string
}

// Sprint 4 Priority 4's project-wide "Activity" tab: task_activity is
// per-task (DEC-021), so this reaches it through tasks.project_id rather
// than a new project-scoped log table — the same data getTaskActivity
// already reads, just joined across every task in the project instead of
// one. Like getTaskActivity, this disappears along with a deleted task
// (the FK cascade), unlike the durable workspace-wide audit_log.
export async function getProjectActivity(
  projectId: string
): Promise<{ error: string } | { success: true; activity: ProjectActivityEntry[] }> {
  const supabase = await createClient()

  const { data: projectTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId)

  if (tasksError) {
    return { error: tasksError.message }
  }

  const titleByTaskId = new Map((projectTasks ?? []).map((task) => [task.id, task.title]))
  const taskIds = Array.from(titleByTaskId.keys())
  if (taskIds.length === 0) {
    return { success: true, activity: [] }
  }

  const { data, error } = await supabase
    .from("task_activity")
    .select("id, event_type, metadata, created_at, actor_id, task_id")
    .in("task_id", taskIds)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    return { error: error.message }
  }

  const activity = (data ?? []).map((row) => ({
    id: row.id,
    event_type: row.event_type,
    metadata: row.metadata as Record<string, unknown> | null,
    created_at: row.created_at,
    actor_id: row.actor_id,
    task_id: row.task_id,
    task_title: titleByTaskId.get(row.task_id) ?? "Untitled task",
  }))

  return { success: true, activity }
}

export type ArchivedTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
}

export async function getArchivedTasks(
  projectId: string
): Promise<{ error: string } | { success: true; tasks: ArchivedTask[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, due_date, priority")
    .eq("project_id", projectId)
    .not("archived_at", "is", null)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { success: true, tasks: data ?? [] }
}
