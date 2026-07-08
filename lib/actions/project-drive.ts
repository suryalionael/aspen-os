"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type ProjectDriveConnection = {
  id: string
  projectId: string
  googleDriveFolderId: string
  googleDriveFolderName: string | null
  connectedBy: string
  createdAt: string
}

export async function getProjectDriveConnection(
  projectId: string
): Promise<ProjectDriveConnection | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("project_drive_connections")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    projectId: data.project_id,
    googleDriveFolderId: data.google_drive_folder_id,
    googleDriveFolderName: data.google_drive_folder_name,
    connectedBy: data.connected_by,
    createdAt: data.created_at,
  }
}

export async function connectProjectDrive(
  projectId: string,
  folderId: string,
  folderName: string | null
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) return { error: "Not authenticated" }

  const { error } = await supabase.from("project_drive_connections").upsert(
    {
      project_id: projectId,
      google_drive_folder_id: folderId,
      google_drive_folder_name: folderName,
      connected_by: session.user.id,
    },
    { onConflict: "project_id" }
  )

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}

export async function disconnectProjectDrive(
  projectId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("project_drive_connections")
    .delete()
    .eq("project_id", projectId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return { success: true }
}
