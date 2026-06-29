"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/actions/audit"

export type CreateProjectState = { error: string } | undefined

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const name = String(formData.get("name") ?? "").trim()
  const workspaceId = String(formData.get("workspaceId") ?? "")
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "")

  if (!name) {
    return { error: "Project name is required." }
  }
  if (!workspaceId || !workspaceSlug) {
    return { error: "Missing workspace context." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a project." }
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ workspace_id: workspaceId, name, created_by: user.id })
    .select("id")
    .single()

  if (error || !project) {
    return { error: error?.message ?? "Could not create project." }
  }

  redirect(`/${workspaceSlug}/${project.id}`)
}

export async function renameProject(
  projectId: string,
  name: string
): Promise<{ error: string } | { success: true; name: string }> {
  const trimmed = name.trim()
  if (!trimmed) {
    return { error: "Project name is required." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("projects")
    .update({ name: trimmed })
    .eq("id", projectId)
    .select("name, workspace_id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not rename project." }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "project.renamed",
      targetLabel: data.name,
    })
  }

  revalidatePath("/", "layout")
  return { success: true, name: data.name }
}

const PROJECT_STATUSES = ["active", "on_hold", "completed"] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export type ProjectDetails = {
  description: string | null
  due_date: string | null
  status: ProjectStatus
}

export async function updateProjectDetails(
  projectId: string,
  details: { description: string; dueDate: string; status: string }
): Promise<{ error: string } | { success: true; details: ProjectDetails }> {
  if (!PROJECT_STATUSES.includes(details.status as ProjectStatus)) {
    return { error: "Invalid project status." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("projects")
    .update({
      description: details.description.trim() || null,
      due_date: details.dueDate || null,
      status: details.status,
    })
    .eq("id", projectId)
    .select("name, workspace_id, description, due_date, status")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update project details." }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "project.updated",
      targetLabel: data.name,
    })
  }

  revalidatePath("/", "layout")
  return {
    success: true,
    details: {
      description: data.description,
      due_date: data.due_date,
      status: data.status as ProjectStatus,
    },
  }
}

export async function archiveProject(
  projectId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("name, workspace_id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not archive project." }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "project.archived",
      targetLabel: data.name,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function unarchiveProject(
  projectId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("projects")
    .update({ archived_at: null })
    .eq("id", projectId)
    .select("name, workspace_id")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not restore project." }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "project.unarchived",
      targetLabel: data.name,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export type ArchivedProject = { id: string; name: string }

export async function getArchivedProjects(
  workspaceId: string
): Promise<{ error: string } | { success: true; projects: ArchivedProject[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .not("archived_at", "is", null)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { success: true, projects: data ?? [] }
}

export async function deleteProject(
  projectId: string,
  workspaceSlug: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetched before deleting — same reasoning as deleteTask: once the row
  // is gone there's nothing left to read its name/workspace_id from.
  const { data: project } = await supabase
    .from("projects")
    .select("name, workspace_id")
    .eq("id", projectId)
    .maybeSingle()

  const { error } = await supabase.from("projects").delete().eq("id", projectId)

  if (error) {
    return { error: error.message }
  }

  if (user && project) {
    await logAuditEvent(supabase, {
      workspaceId: project.workspace_id,
      actorId: user.id,
      action: "project.deleted",
      targetLabel: project.name,
    })
  }

  redirect(`/${workspaceSlug}`)
}

export async function toggleFavoriteProject(
  projectId: string,
  isFavorite: boolean
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to favorite a project." }
  }

  const { error } = isFavorite
    ? await supabase
        .from("project_favorites")
        .insert({ user_id: user.id, project_id: projectId })
    : await supabase
        .from("project_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("project_id", projectId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export type ProjectMember = { user_id: string; email: string }

// The assignee picker needs the task's workspace members, but a task only
// carries project_id — this resolves workspace_id first, then reuses the
// same get_workspace_members_with_email RPC the Members dialog uses
// (DEC-022), rather than duplicating its membership-authorization logic.
export async function getProjectMembers(
  projectId: string
): Promise<{ error: string } | { success: true; members: ProjectMember[] }> {
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .single()

  if (projectError || !project) {
    return { error: projectError?.message ?? "Project not found." }
  }

  const { data, error } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: project.workspace_id,
  })

  if (error) {
    return { error: error.message }
  }

  return {
    success: true,
    members: (data ?? []).map((member: { user_id: string; email: string }) => ({
      user_id: member.user_id,
      email: member.email,
    })),
  }
}
