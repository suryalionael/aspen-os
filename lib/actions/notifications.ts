"use server"

import { createClient } from "@/lib/supabase/server"

export type Notification = {
  id: string
  workspace_id: string
  project_id: string | null
  task_id: string | null
  type: string
  message: string
  read_at: string | null
  created_at: string
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Shared by every trigger site below (assignment, comments, checklist
// completion, due-today) — mirrors logActivity's shape (lib/actions/
// tasks.ts) but is recipient-scoped rather than task-scoped, and never
// notifies someone about their own action.
export async function createNotification(
  supabase: SupabaseServerClient,
  params: {
    userId: string
    actorId: string
    workspaceId: string
    projectId?: string | null
    taskId?: string | null
    type: "assigned" | "mentioned" | "commented" | "checklist_completed" | "due_today"
    message: string
  }
): Promise<void> {
  if (params.userId === params.actorId) return
  await supabase.from("notifications").insert({
    user_id: params.userId,
    workspace_id: params.workspaceId,
    project_id: params.projectId ?? null,
    task_id: params.taskId ?? null,
    type: params.type,
    message: params.message,
  })
}

// Resolves the context every trigger site needs (workspace/project for
// the notification row, assignee/creator as default notification
// recipients) from just a task id, so callers don't each duplicate this
// join.
export async function getTaskNotificationContext(
  supabase: SupabaseServerClient,
  taskId: string
): Promise<{
  workspaceId: string
  projectId: string
  assigneeId: string | null
  createdBy: string
  title: string
} | null> {
  const { data } = await supabase
    .from("tasks")
    .select("project_id, assignee_id, created_by, title")
    .eq("id", taskId)
    .maybeSingle()

  if (!data) return null

  const { data: project } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", data.project_id)
    .maybeSingle()

  if (!project) return null

  return {
    workspaceId: project.workspace_id,
    projectId: data.project_id,
    assigneeId: data.assignee_id,
    createdBy: data.created_by,
    title: data.title,
  }
}

export async function getNotifications(): Promise<
  { error: string } | { success: true; notifications: Notification[] }
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("notifications")
    .select("id, workspace_id, project_id, task_id, type, message, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return { error: error.message }
  }

  return { success: true, notifications: data ?? [] }
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function markAllNotificationsRead(): Promise<
  { error: string } | { success: true }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in." }
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

// "Due today" has no time-based trigger (no cron infra exists in this
// stack), so it's generated lazily whenever the notification bell loads:
// for each task assigned to the caller, due today, not yet archived, in
// this workspace, insert a due_today notification.
//
// Deliberately does NOT check for an existing notification before
// inserting — that "check, then insert" shape is inherently racy under
// concurrent calls (confirmed directly: React StrictMode's double-
// invoked effects produced two rows for the same task in the same load,
// since both calls could see "no existing row" before either had
// committed its insert). Safety instead comes from a partial unique
// index on (user_id, task_id) where type = 'due_today' (migration 025) —
// every call attempts the insert, and the database itself silently
// rejects whichever one loses the race.
export async function checkDueTodayNotifications(
  workspaceId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in." }
  }

  const today = new Date().toISOString().slice(0, 10)

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
  const projectIds = (projects ?? []).map((project) => project.id)
  if (projectIds.length === 0) return { success: true }

  const { data: dueTodayTasks } = await supabase
    .from("tasks")
    .select("id, title, project_id")
    .in("project_id", projectIds)
    .eq("assignee_id", user.id)
    .eq("due_date", today)
    .is("archived_at", null)
    .neq("status", "done")

  for (const task of dueTodayTasks ?? []) {
    await createNotification(supabase, {
      userId: user.id,
      actorId: "system",
      workspaceId,
      projectId: task.project_id,
      taskId: task.id,
      type: "due_today",
      message: `"${task.title}" is due today`,
    })
  }

  return { success: true }
}
