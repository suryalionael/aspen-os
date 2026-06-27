"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/actions/audit"

export type WorkspaceSettings = {
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  defaultTimezone: string | null
  archivedAt: string | null
}

export async function getWorkspaceSettings(
  workspaceId: string
): Promise<{ error: string } | { success: true; settings: WorkspaceSettings }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("workspaces")
    .select("id, name, description, logo_url, default_timezone, archived_at")
    .eq("id", workspaceId)
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Workspace not found." }
  }

  return {
    success: true,
    settings: {
      id: data.id,
      name: data.name,
      description: data.description,
      logoUrl: data.logo_url,
      defaultTimezone: data.default_timezone,
      archivedAt: data.archived_at,
    },
  }
}

export type UpdateWorkspaceSettingsState = { error: string } | { success: true } | undefined

export async function updateWorkspaceSettings(
  _prevState: UpdateWorkspaceSettingsState,
  formData: FormData
): Promise<UpdateWorkspaceSettingsState> {
  const workspaceId = String(formData.get("workspaceId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const defaultTimezone = String(formData.get("defaultTimezone") ?? "").trim()

  if (!workspaceId) {
    return { error: "Missing workspace." }
  }
  if (!name) {
    return { error: "Workspace name is required." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: previous } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle()

  const { error } = await supabase
    .from("workspaces")
    .update({
      name,
      description: description || null,
      default_timezone: defaultTimezone || null,
    })
    .eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: previous && previous.name !== name ? "workspace.renamed" : "workspace.updated",
      targetLabel: name,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024

export type UploadWorkspaceLogoState =
  | { error: string }
  | { success: true; logoUrl: string }
  | undefined

export async function uploadWorkspaceLogo(
  _prevState: UploadWorkspaceLogoState,
  formData: FormData
): Promise<UploadWorkspaceLogoState> {
  const workspaceId = String(formData.get("workspaceId") ?? "")
  const file = formData.get("logo")

  if (!workspaceId) {
    return { error: "Missing workspace." }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." }
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Logo must be an image file." }
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be smaller than 2MB." }
  }

  const supabase = await createClient()

  const extension = file.name.split(".").pop()?.toLowerCase() || "png"
  // Fixed filename per workspace, same reasoning as the avatar bucket
  // (DEC-024) — a re-upload replaces the previous logo rather than
  // accumulating objects.
  const path = `${workspaceId}/logo.${extension}`

  const { error: uploadError } = await supabase.storage
    .from("workspace-logos")
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("workspace-logos").getPublicUrl(path)
  const logoUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ logo_url: logoUrl })
    .eq("id", workspaceId)

  if (updateError) {
    return { error: updateError.message }
  }

  revalidatePath("/", "layout")
  return { success: true, logoUrl }
}

export async function removeWorkspaceLogo(
  workspaceId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { data: files } = await supabase.storage.from("workspace-logos").list(workspaceId)
  if (files && files.length > 0) {
    await supabase.storage
      .from("workspace-logos")
      .remove(files.map((file) => `${workspaceId}/${file.name}`))
  }

  const { error } = await supabase
    .from("workspaces")
    .update({ logo_url: null })
    .eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function archiveWorkspace(
  workspaceId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.rpc("archive_workspace", { p_workspace_id: workspaceId })

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, { workspaceId, actorId: user.id, action: "workspace.archived" })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function unarchiveWorkspace(
  workspaceId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.rpc("unarchive_workspace", { p_workspace_id: workspaceId })

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: "workspace.unarchived",
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

// No audit_log entry here, deliberately (DEC-032): audit_log.workspace_id
// cascades with the workspace, so a "workspace.deleted" row would be
// destroyed in the same transaction it's written in — there's no way to
// audit the deletion of the thing the audit trail itself lives in.
export async function deleteWorkspace(workspaceId: string): Promise<{ error: string } | never> {
  const supabase = await createClient()

  const { error } = await supabase.from("workspaces").delete().eq("id", workspaceId)

  if (error) {
    return { error: error.message }
  }

  redirect("/workspaces/new")
}

type ExportTaskRow = {
  project: string
  title: string
  status: string
  priority: string | null
  due_date: string | null
  description: string | null
  created_at: string
}

async function gatherExportData(workspaceId: string) {
  const supabase = await createClient()

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, slug, description, default_timezone, created_at")
    .eq("id", workspaceId)
    .single()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, archived_at, created_at")
    .eq("workspace_id", workspaceId)

  const projectIds = (projects ?? []).map((project) => project.id)
  const projectNameById = new Map((projects ?? []).map((project) => [project.id, project.name]))

  const { data: tasks } =
    projectIds.length > 0
      ? await supabase
          .from("tasks")
          .select("project_id, title, status, priority, due_date, description, created_at")
          .in("project_id", projectIds)
      : { data: [] }

  const rows: ExportTaskRow[] = (tasks ?? []).map((task) => ({
    project: projectNameById.get(task.project_id) ?? "",
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    description: task.description,
    created_at: task.created_at,
  }))

  return { workspace, projects: projects ?? [], rows }
}

export async function exportWorkspaceJson(
  workspaceId: string
): Promise<{ error: string } | { success: true; json: string }> {
  const { workspace, projects, rows } = await gatherExportData(workspaceId)

  if (!workspace) {
    return { error: "Workspace not found." }
  }

  const json = JSON.stringify(
    { workspace, projects, tasks: rows, exportedAt: new Date().toISOString() },
    null,
    2
  )

  return { success: true, json }
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function exportWorkspaceCsv(
  workspaceId: string
): Promise<{ error: string } | { success: true; csv: string }> {
  const { workspace, rows } = await gatherExportData(workspaceId)

  if (!workspace) {
    return { error: "Workspace not found." }
  }

  const header = ["project", "title", "status", "priority", "due_date", "description", "created_at"]
  const lines = [header.join(",")]
  for (const row of rows) {
    lines.push(
      header
        .map((key) => escapeCsvCell(String(row[key as keyof ExportTaskRow] ?? "")))
        .join(",")
    )
  }

  return { success: true, csv: lines.join("\n") }
}
