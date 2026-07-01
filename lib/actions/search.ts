"use server"

import { createClient } from "@/lib/supabase/server"

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
  if (!query.trim()) {
    return { success: true, results: [] }
  }

  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)

  const projectIds = (projects ?? []).map((project) => project.id)
  const projectNameById = new Map((projects ?? []).map((project) => [project.id, project.name]))

  if (projectIds.length === 0) {
    return { success: true, results: [] }
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, project_id")
    .in("project_id", projectIds)
    .ilike("title", `%${query.trim()}%`)
    .is("archived_at", null)
    .limit(10)

  if (error) {
    return { error: error.message }
  }

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
