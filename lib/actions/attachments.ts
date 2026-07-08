"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/actions/tasks"
import { getTaskNotificationContext } from "@/lib/actions/notifications"
import { logAuditEvent } from "@/lib/actions/audit"

export type Attachment = {
  id: string
  fileName: string
  fileSize: number
  contentType: string | null
  createdAt: string
  url: string | null
  driveFileId: string | null
  driveUrl: string | null
  thumbnail: string | null
  driveOwnerEmail: string | null
  driveOwnerName: string | null
  driveModifiedTime: string | null
}

const SIGNED_URL_TTL_SECONDS = 3600
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export async function getAttachments(
  taskId: string
): Promise<{ error: string } | { success: true; attachments: Attachment[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("task_attachments")
    .select(
      "id, file_name, file_path, file_size, content_type, created_at, drive_file_id, drive_url, thumbnail, drive_owner_email, drive_owner_name, drive_modified_time"
    )
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  const attachments = await Promise.all(
    (data ?? []).map(async (row) => {
      const isDriveAttachment = !!row.drive_file_id
      let url: string | null = null

      if (isDriveAttachment) {
        url = row.drive_url
      } else if (row.file_path) {
        const { data: signed } = await supabase.storage
          .from("task-attachments")
          .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS)
        url = signed?.signedUrl ?? null
      }

      return {
        id: row.id,
        fileName: row.file_name,
        fileSize: row.file_size,
        contentType: row.content_type,
        createdAt: row.created_at,
        url,
        driveFileId: row.drive_file_id,
        driveUrl: row.drive_url,
        thumbnail: row.thumbnail,
        driveOwnerEmail: row.drive_owner_email,
        driveOwnerName: row.drive_owner_name,
        driveModifiedTime: row.drive_modified_time,
      }
    })
  )

  return { success: true, attachments }
}

export type UploadAttachmentState =
  | { error: string }
  | { success: true; attachment: Attachment }
  | undefined

// The file-upload half runs on the client (the Supabase browser client uploads
// directly to Storage), then this server action creates the DB record, logs the
// activity, and returns the signed URL — server actions with file FormData
// silently never reach the server from Radix Portal dialogs in production.
export async function createAttachmentRecord(
  taskId: string,
  fileName: string,
  filePath: string,
  fileSize: number,
  contentType: string | null,
): Promise<UploadAttachmentState> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) {
    return { error: "You must be signed in to save an attachment." }
  }

  if (fileSize > MAX_ATTACHMENT_BYTES) {
    return { error: "Attachments must be smaller than 10MB." }
  }

  const { data: row, error: insertError } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      uploaded_by: user.id,
      file_name: fileName,
      file_path: filePath,
      file_size: fileSize,
      content_type: contentType,
    })
    .select("id, file_name, file_path, file_size, content_type, created_at, drive_file_id, drive_url, thumbnail, drive_owner_email, drive_owner_name, drive_modified_time")
    .single()

  if (insertError || !row) {
    await supabase.storage.from("task-attachments").remove([filePath]).catch(() => {})
    return { error: insertError?.message ?? "Could not save attachment." }
  }

  await logActivity(supabase, taskId, user.id, "attachment_added", {
    file_name: fileName,
  })
  const uploadContext = await getTaskNotificationContext(supabase, taskId)
  if (uploadContext) {
    await logAuditEvent(supabase, {
      workspaceId: uploadContext.workspaceId,
      actorId: user.id,
      action: "task.attachment_added",
      targetLabel: uploadContext.title,
      metadata: { file_name: fileName },
    })
  }

  const { data: signed } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

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
      driveFileId: null,
      driveUrl: null,
      thumbnail: null,
      driveOwnerEmail: null,
      driveOwnerName: null,
      driveModifiedTime: null,
    },
  }
}

export type DriveAttachment = {
  id: string
  fileName: string
  fileSize: number
  contentType: string | null
  createdAt: string
  url: string | null
  driveFileId: string | null
  driveUrl: string | null
  thumbnail: string | null
  driveOwnerEmail: string | null
  driveOwnerName: string | null
  driveModifiedTime: string | null
}

export async function addDriveAttachment(
  taskId: string,
  driveFile: {
    id: string
    name: string
    mimeType: string
    size: number | null
    webViewLink: string
    thumbnailLink: string | null
    owners: { displayName: string; email: string }[]
    modifiedTime: string
  }
): Promise<{ error: string } | { success: true; attachment: DriveAttachment }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) return { error: "You must be signed in." }

  const { data: row, error: insertError } = await supabase
    .from("task_attachments")
    .insert({
      task_id: taskId,
      uploaded_by: user.id,
      file_name: driveFile.name,
      file_path: "",
      file_size: driveFile.size ?? 0,
      content_type: driveFile.mimeType,
      drive_file_id: driveFile.id,
      drive_url: driveFile.webViewLink,
      thumbnail: driveFile.thumbnailLink,
      drive_owner_email: driveFile.owners[0]?.email ?? null,
      drive_owner_name: driveFile.owners[0]?.displayName ?? null,
      drive_modified_time: driveFile.modifiedTime,
    })
    .select("id, file_name, file_size, content_type, created_at, drive_file_id, drive_url, thumbnail, drive_owner_email, drive_owner_name, drive_modified_time")
    .single()

  if (insertError || !row) {
    return { error: insertError?.message ?? "Could not save attachment." }
  }

  await logActivity(supabase, taskId, user.id, "attachment_added", {
    file_name: driveFile.name,
    drive_file_id: driveFile.id,
  })
  const context = await getTaskNotificationContext(supabase, taskId)
  if (context) {
    await logAuditEvent(supabase, {
      workspaceId: context.workspaceId,
      actorId: user.id,
      action: "task.attachment_added",
      targetLabel: context.title,
      metadata: { file_name: driveFile.name, drive: true },
    })
  }

  revalidatePath("/", "layout")
  return {
    success: true,
    attachment: {
      id: row.id,
      fileName: row.file_name,
      fileSize: row.file_size,
      contentType: row.content_type,
      createdAt: row.created_at,
      url: row.drive_url,
      driveFileId: row.drive_file_id,
      driveUrl: row.drive_url,
      thumbnail: row.thumbnail,
      driveOwnerEmail: row.drive_owner_email,
      driveOwnerName: row.drive_owner_name,
      driveModifiedTime: row.drive_modified_time,
    },
  }
}

export async function deleteAttachment(
  attachmentId: string,
  taskId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

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
    const deleteContext = await getTaskNotificationContext(supabase, taskId)
    if (deleteContext) {
      await logAuditEvent(supabase, {
        workspaceId: deleteContext.workspaceId,
        actorId: user.id,
        action: "task.attachment_removed",
        targetLabel: deleteContext.title,
        metadata: { file_name: attachment.file_name },
      })
    }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
