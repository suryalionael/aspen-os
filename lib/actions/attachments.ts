"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"

export type Attachment = {
  id: string
  fileName: string
  fileSize: number
  contentType: string | null
  createdAt: string
  url: string | null
}

const SIGNED_URL_TTL_SECONDS = 3600
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export async function getAttachments(
  taskId: string
): Promise<{ error: string } | { success: true; attachments: Attachment[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_attachments")
    .select("id, file_name, file_path, file_size, content_type, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  const attachments = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("task-attachments")
        .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS)
      return {
        id: row.id,
        fileName: row.file_name,
        fileSize: row.file_size,
        contentType: row.content_type,
        createdAt: row.created_at,
        url: signed?.signedUrl ?? null,
      }
    })
  )

  return { success: true, attachments }
}

export type UploadAttachmentState =
  | { error: string }
  | { success: true; attachment: Attachment }
  | undefined

export async function uploadAttachment(
  _prevState: UploadAttachmentState,
  formData: FormData
): Promise<UploadAttachmentState> {
  const taskId = String(formData.get("taskId") ?? "")
  const file = formData.get("file")

  if (!taskId) {
    return { error: "Missing task." }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Attachments must be smaller than 10MB." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to upload an attachment." }
  }

  // Unlike the avatar bucket's fixed per-user path, a task can hold many
  // attachments, so each upload gets its own unique path rather than
  // overwriting a previous one at the same key.
  const path = `${taskId}/${crypto.randomUUID()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(path, file, { contentType: file.type })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const { data: row, error: insertError } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      uploaded_by: user.id,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      content_type: file.type || null,
    })
    .select("id, file_name, file_path, file_size, content_type, created_at")
    .single()

  if (insertError || !row) {
    await supabase.storage.from("task-attachments").remove([path])
    return { error: insertError?.message ?? "Could not save attachment." }
  }

  await logActivity(supabase, taskId, user.id, "attachment_added", {
    file_name: file.name,
  })

  const { data: signed } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  revalidatePath("/", "layout")
  return {
    success: true,
    attachment: {
      id: row.id,
      fileName: row.file_name,
      fileSize: row.file_size,
      contentType: row.content_type,
      createdAt: row.created_at,
      url: signed?.signedUrl ?? null,
    },
  }
}

export async function deleteAttachment(
  attachmentId: string,
  taskId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to remove an attachment." }
  }

  const { data: attachment } = await supabase
    .from("task_attachments")
    .select("file_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle()

  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId)

  if (error) {
    return { error: error.message }
  }

  if (attachment) {
    await supabase.storage.from("task-attachments").remove([attachment.file_path])
    await logActivity(supabase, taskId, user.id, "attachment_removed", {
      file_name: attachment.file_name,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}
