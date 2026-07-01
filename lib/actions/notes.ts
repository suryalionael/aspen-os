"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/actions/audit"

export type NoteType = "document" | "quick_note" | "meeting_note" | "announcement"

export type Note = {
  id: string
  workspace_id: string
  project_id: string | null
  type: NoteType
  title: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function getWorkspaceNotes(
  workspaceId: string
): Promise<{ error: string } | { success: true; notes: Note[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("notes")
    .select("id, workspace_id, project_id, type, title, body, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }
  return { success: true, notes: (data ?? []) as Note[] }
}

export async function createNote(input: {
  workspaceId: string
  projectId: string | null
  type: NoteType
  title: string
  body: string
}): Promise<{ error: string } | { success: true; note: Note }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a note." }
  }
  if (!input.title.trim()) {
    return { error: "Title is required." }
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      type: input.type,
      title: input.title.trim(),
      body: input.body,
      created_by: user.id,
    })
    .select("id, workspace_id, project_id, type, title, body, created_by, created_at, updated_at")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not create note." }
  }

  // Announcements are a thin wrapper around notes: rather than building a
  // separate broadcast/feed mechanism, posting one also writes to the
  // workspace's existing audit_log, so it shows up in the Audit Log dialog
  // every member can already see.
  if (input.type === "announcement") {
    await logAuditEvent(supabase, {
      workspaceId: input.workspaceId,
      actorId: user.id,
      action: "note.announcement_posted",
      targetLabel: data.title,
    })
  }

  revalidatePath("/", "layout")
  return { success: true, note: data as Note }
}

export async function updateNote(
  noteId: string,
  input: { title: string; body: string; type: NoteType; projectId: string | null }
): Promise<{ error: string } | { success: true; note: Note }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to edit a note." }
  }
  if (!input.title.trim()) {
    return { error: "Title is required." }
  }

  const { data, error } = await supabase
    .from("notes")
    .update({
      title: input.title.trim(),
      body: input.body,
      type: input.type,
      project_id: input.projectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select("id, workspace_id, project_id, type, title, body, created_by, created_at, updated_at")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update note." }
  }

  revalidatePath("/", "layout")
  return { success: true, note: data as Note }
}

export async function deleteNote(noteId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { error } = await supabase.from("notes").delete().eq("id", noteId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}
