"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"

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
