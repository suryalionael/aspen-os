"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"
import { createNotification, getTaskNotificationContext } from "@/lib/actions/notifications"
import { logAuditEvent } from "@/lib/actions/audit"
import { computePosition } from "@/lib/utils/position"

export type ChecklistItem = {
  id: string
  content: string
  completed: boolean
  position: number
}

export async function getChecklistItems(
  taskId: string
): Promise<{ error: string } | { success: true; items: ChecklistItem[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("checklist_items")
    .select("id, content, completed, position")
    .eq("task_id", taskId)
    .order("position", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { success: true, items: data ?? [] }
}

export async function addChecklistItem(
  taskId: string,
  content: string
): Promise<{ error: string } | { success: true; item: ChecklistItem }> {
  const trimmed = content.trim()
  if (!trimmed) {
    return { error: "Checklist item text is required." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to add a checklist item." }
  }

  const { data: lastItem } = await supabase
    .from("checklist_items")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = computePosition(lastItem?.position ?? null, null)

  const { data, error } = await supabase
    .from("checklist_items")
    .insert({ task_id: taskId, content: trimmed, position })
    .select("id, content, completed, position")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not add checklist item." }
  }

  await logActivity(supabase, taskId, user.id, "checklist_item_added", {
    content: trimmed,
  })
  const addContext = await getTaskNotificationContext(supabase, taskId)
  if (addContext) {
    await logAuditEvent(supabase, {
      workspaceId: addContext.workspaceId,
      actorId: user.id,
      action: "task.checklist_updated",
      targetLabel: addContext.title,
      metadata: { change: "added", content: trimmed },
    })
  }
  revalidatePath("/", "layout")
  return { success: true, item: data }
}

export async function toggleChecklistItem(
  itemId: string,
  taskId: string,
  completed: boolean
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to update a checklist item." }
  }

  const { data, error } = await supabase
    .from("checklist_items")
    .update({ completed })
    .eq("id", itemId)
    .select("content")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update checklist item." }
  }

  await logActivity(
    supabase,
    taskId,
    user.id,
    completed ? "checklist_item_completed" : "checklist_item_reopened",
    { content: data.content }
  )

  const toggleContext = await getTaskNotificationContext(supabase, taskId)
  if (toggleContext) {
    await logAuditEvent(supabase, {
      workspaceId: toggleContext.workspaceId,
      actorId: user.id,
      action: "task.checklist_updated",
      targetLabel: toggleContext.title,
      metadata: { change: completed ? "completed" : "reopened", content: data.content },
    })
  }

  if (completed) {
    // Only notify when THIS toggle is the one that completed the whole
    // checklist — checking after the update above means the just-toggled
    // item is already counted as completed in this query.
    const { data: items } = await supabase
      .from("checklist_items")
      .select("completed")
      .eq("task_id", taskId)
    const allCompleted = (items ?? []).length > 0 && (items ?? []).every((item) => item.completed)

    if (allCompleted) {
      const context = toggleContext
      if (context) {
        const recipients = new Set(
          [context.assigneeId, context.createdBy].filter(
            (id): id is string => Boolean(id) && id !== user.id
          )
        )
        for (const recipientId of recipients) {
          await createNotification(supabase, {
            userId: recipientId,
            actorId: user.id,
            workspaceId: context.workspaceId,
            projectId: context.projectId,
            taskId,
            type: "checklist_completed",
            message: `Checklist completed on "${context.title}"`,
          })
        }
      }
    }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function deleteChecklistItem(
  itemId: string,
  taskId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to remove a checklist item." }
  }

  const { data: item } = await supabase
    .from("checklist_items")
    .select("content")
    .eq("id", itemId)
    .maybeSingle()

  const { error } = await supabase.from("checklist_items").delete().eq("id", itemId)

  if (error) {
    return { error: error.message }
  }

  if (item) {
    await logActivity(supabase, taskId, user.id, "checklist_item_removed", {
      content: item.content,
    })
    const context = await getTaskNotificationContext(supabase, taskId)
    if (context) {
      await logAuditEvent(supabase, {
        workspaceId: context.workspaceId,
        actorId: user.id,
        action: "task.checklist_updated",
        targetLabel: context.title,
        metadata: { change: "removed", content: item.content },
      })
    }
  }
  revalidatePath("/", "layout")
  return { success: true }
}
