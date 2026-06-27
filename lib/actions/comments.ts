"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"
import { createNotification, getTaskNotificationContext } from "@/lib/actions/notifications"

export type Comment = {
  id: string
  content: string
  created_at: string
  updated_at: string
  author_id: string | null
}

export async function getComments(taskId: string): Promise<
  | { error: string }
  | { success: true; comments: Comment[]; currentUserId: string | null }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, updated_at, author_id")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  return { success: true, comments: data ?? [], currentUserId: user?.id ?? null }
}

export async function addComment(
  taskId: string,
  content: string
): Promise<{ error: string } | { success: true; comment: Comment }> {
  const trimmed = content.trim()
  if (!trimmed) {
    return { error: "Comment text is required." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to comment." }
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({ task_id: taskId, author_id: user.id, content: trimmed })
    .select("id, content, created_at, updated_at, author_id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not add comment." }
  }

  await logActivity(supabase, taskId, user.id, "commented", {
    content: trimmed,
  })

  const context = await getTaskNotificationContext(supabase, taskId)
  if (context) {
    // Notify whoever isn't the commenter: the assignee and/or creator.
    // createNotification already no-ops when userId === actorId, so no
    // extra de-duping is needed beyond not notifying twice for the same
    // person being both assignee and creator.
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
        type: "commented",
        message: `New comment on "${context.title}"`,
      })
    }

    // Minimal viable @mention: scan for any workspace member's exact
    // email address typed directly in the comment (no autocomplete UI —
    // see DEC-030) — skip anyone already notified above to avoid a
    // double notification for the same comment.
    const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
      p_workspace_id: context.workspaceId,
    })
    for (const member of members ?? []) {
      if (
        member.user_id !== user.id &&
        !recipients.has(member.user_id) &&
        trimmed.includes(member.email)
      ) {
        await createNotification(supabase, {
          userId: member.user_id,
          actorId: user.id,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          taskId,
          type: "mentioned",
          message: `You were mentioned on "${context.title}"`,
        })
      }
    }
  }

  revalidatePath("/", "layout")
  return { success: true, comment: data }
}

export async function editComment(
  commentId: string,
  content: string
): Promise<{ error: string } | { success: true; comment: Comment }> {
  const trimmed = content.trim()
  if (!trimmed) {
    return { error: "Comment text is required." }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from("comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("id, content, created_at, updated_at, author_id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update comment." }
  }

  revalidatePath("/", "layout")
  return { success: true, comment: data }
}

export async function deleteComment(
  commentId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase.from("comments").delete().eq("id", commentId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
