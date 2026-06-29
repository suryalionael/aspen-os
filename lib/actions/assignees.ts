"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"
import { createNotification, getTaskNotificationContext } from "@/lib/actions/notifications"

export type TaskAssignee = { user_id: string; email: string }

export async function getTaskAssignees(
  taskId: string
): Promise<{ error: string } | { success: true; assignees: TaskAssignee[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId)

  if (error) {
    return { error: error.message }
  }
  if (!data || data.length === 0) {
    return { success: true, assignees: [] }
  }

  const context = await getTaskNotificationContext(supabase, taskId)
  if (!context) {
    return { success: true, assignees: [] }
  }

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: context.workspaceId,
  })
  const emailByUserId = new Map<string, string>(
    (members ?? []).map((member: { user_id: string; email: string }) => [
      member.user_id,
      member.email,
    ])
  )

  return {
    success: true,
    assignees: data.map((row) => ({
      user_id: row.user_id,
      email: emailByUserId.get(row.user_id) ?? "Unknown",
    })),
  }
}

// Keeps the legacy single tasks.assignee_id in sync as "primary
// assignee" — every existing read path (notifications, the dashboard's
// "assigned to you" widget, board sort-by-assignee, the calendar) depends
// on that single column and is out of scope to rewrite for this priority
// (DEC-050). Set to this user if there was no primary assignee yet.
async function ensurePrimaryAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  userId: string
) {
  const { data: task } = await supabase
    .from("tasks")
    .select("assignee_id")
    .eq("id", taskId)
    .maybeSingle()
  if (task && !task.assignee_id) {
    await supabase.from("tasks").update({ assignee_id: userId }).eq("id", taskId)
  }
}

// If the removed user was the legacy primary assignee, hand that role to
// another remaining assignee (or clear it if none are left) — same
// reasoning as ensurePrimaryAssignee above.
async function reassignPrimaryAfterRemoval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  removedUserId: string
) {
  const { data: task } = await supabase
    .from("tasks")
    .select("assignee_id")
    .eq("id", taskId)
    .maybeSingle()
  if (!task || task.assignee_id !== removedUserId) return

  const { data: remaining } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId)
    .limit(1)
    .maybeSingle()

  await supabase
    .from("tasks")
    .update({ assignee_id: remaining?.user_id ?? null })
    .eq("id", taskId)
}

export async function assignUserToTask(
  taskId: string,
  userId: string,
  userEmail: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to assign a task." }
  }

  const { error } = await supabase
    .from("task_assignees")
    .insert({ task_id: taskId, user_id: userId })

  if (error) {
    return {
      error: error.code === "23505" ? "Already assigned." : error.message,
    }
  }

  await ensurePrimaryAssignee(supabase, taskId, userId)
  await logActivity(supabase, taskId, user.id, "assignee_added", {
    email: userEmail,
  })

  const context = await getTaskNotificationContext(supabase, taskId)
  if (context) {
    await createNotification(supabase, {
      userId,
      actorId: user.id,
      workspaceId: context.workspaceId,
      projectId: context.projectId,
      taskId,
      type: "assigned",
      message: `You were assigned to "${context.title}"`,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function unassignUserFromTask(
  taskId: string,
  userId: string,
  userEmail: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to unassign a task." }
  }

  const { error } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId)

  if (error) {
    return { error: error.message }
  }

  await reassignPrimaryAfterRemoval(supabase, taskId, userId)
  await logActivity(supabase, taskId, user.id, "assignee_removed", {
    email: userEmail,
  })

  revalidatePath("/", "layout")
  return { success: true }
}
