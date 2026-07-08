"use server"

import { createClient } from "@/lib/supabase/server"
import { searchFiles as searchDriveFiles } from "@/lib/drive/actions"

export type SearchResultItem = {
  id: string
  title: string
  subtitle: string
  type: "task" | "project" | "note" | "person" | "drive_file" | "drive_folder"
  url: string
  metadata?: Record<string, string>
}

export async function unifiedSearch(
  workspaceId: string,
  workspaceSlug: string,
  query: string
): Promise<{ error: string } | { success: true; results: SearchResultItem[] }> {
  if (!query.trim()) return { success: true, results: [] }

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  const trimmed = query.trim()

  const results: SearchResultItem[] = []

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]))

  const [tasksData, projectsData, notesData, peopleData] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("tasks")
          .select("id, title, project_id")
          .in("project_id", projectIds)
          .ilike("title", `%${trimmed}%`)
          .is("archived_at", null)
          .limit(5)
      : { data: null, error: null },

    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .ilike("name", `%${trimmed}%`)
      .is("archived_at", null)
      .limit(5),

    supabase
      .from("notes")
      .select("id, title, type")
      .eq("workspace_id", workspaceId)
      .or(`title.ilike.%${trimmed}%,body.ilike.%${trimmed}%`)
      .limit(5),

    supabase.rpc("get_workspace_members_with_email", {
      p_workspace_id: workspaceId,
    }),
  ])

  if (tasksData.data) {
    for (const task of tasksData.data) {
      results.push({
        id: task.id,
        title: task.title,
        subtitle: projectNameById.get(task.project_id) ?? "Task",
        type: "task",
        url: `/${workspaceSlug}/${task.project_id}`,
      })
    }
  }

  if (projectsData.data) {
    for (const project of projectsData.data) {
      results.push({
        id: project.id,
        title: project.name,
        subtitle: "Project",
        type: "project",
        url: `/${workspaceSlug}/${project.id}`,
      })
    }
  }

  if (notesData.data) {
    for (const note of notesData.data) {
      results.push({
        id: note.id,
        title: note.title,
        subtitle: note.type === "announcement" ? "Announcement" : "Note",
        type: "note",
        url: `/${workspaceSlug}/notes`,
      })
    }
  }

  const people = (peopleData.data ?? []) as { user_id: string; email: string }[]
  for (const person of people) {
    if (person.email.toLowerCase().includes(trimmed.toLowerCase())) {
      results.push({
        id: person.user_id,
        title: person.email,
        subtitle: "Team member",
        type: "person",
        url: `/${workspaceSlug}`,
      })
    }
  }

  try {
    const driveResults = await searchDriveFiles(trimmed, { pageSize: 5 })
    for (const file of driveResults.files) {
      results.push({
        id: file.id,
        title: file.name,
        subtitle: file.fileType === "folder" ? "Drive folder" : "Drive file",
        type: file.fileType === "folder" ? "drive_folder" : "drive_file",
        url: file.webViewLink,
        metadata: { mimeType: file.mimeType },
      })
    }
  } catch {}

  return { success: true, results: results.slice(0, 20) }
}

export type SearchResult = {
  id: string
  title: string
  project_id: string
  project_name: string
}

export async function searchWorkspaceTasks(
  workspaceId: string,
  query: string
): Promise<{ error: string } | { success: true; results: SearchResult[] }> {
  if (!query.trim()) return { success: true, results: [] }

  const supabase = await createClient()
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((p) => p.id)
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]))

  if (projectIds.length === 0) return { success: true, results: [] }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, project_id")
    .in("project_id", projectIds)
    .ilike("title", `%${query.trim()}%`)
    .is("archived_at", null)
    .limit(10)

  if (error) return { error: error.message }

  return {
    success: true,
    results: (data ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      project_id: task.project_id,
      project_name: projectNameById.get(task.project_id) ?? "",
    })),
  }
}
