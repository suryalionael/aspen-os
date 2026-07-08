"use server"

import { createClient } from "@/lib/supabase/server"

export async function buildContext(
  workspaceId: string,
  userId: string
): Promise<string> {
  const supabase = await createClient()

  const sections: string[] = []

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .limit(10)

  if (projects && projects.length > 0) {
    sections.push(
      `Projects: ${projects.map((p) => `${p.name} (${p.status})`).join(", ")}`
    )
  }

  const projectIds = (projects ?? []).map((p) => p.id)

  if (projectIds.length > 0) {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, assignee_id, priority")
      .in("project_id", projectIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(15)

    if (tasks && tasks.length > 0) {
      const taskLines = tasks.map((t) => {
        const parts = [`"${t.title}"`, `status: ${t.status}`]
        if (t.due_date) parts.push(`due: ${t.due_date}`)
        if (t.priority) parts.push(`priority: ${t.priority}`)
        return parts.join(", ")
      })
      sections.push(`Recent tasks:\n${taskLines.map((l) => `- ${l}`).join("\n")}`)
    }
  }

  const { data: members } = await supabase
    .rpc("get_workspace_members_with_email", {
      p_workspace_id: workspaceId,
    })

  if (members && Array.isArray(members)) {
    sections.push(
      `Team members: ${(members as { email: string }[]).map((m) => m.email).join(", ")}`
    )
  }

  if (sections.length === 0) {
    sections.push("No workspace data available.")
  }

  return sections.join("\n\n")
}
