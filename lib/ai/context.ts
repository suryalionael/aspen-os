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
      `Active projects: ${projects.map((p) => `${p.name} (${p.status})`).join(", ")}`
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

  // Load saved memories
  const { data: memories } = await supabase
    .from("ai_memories")
    .select("type, entity, key, value")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(50)

  if (memories && memories.length > 0) {
    const memoryLines = memories.map(
      (m) => `- [${m.type}] ${m.entity}: ${m.key} = ${m.value}`
    )
    sections.push(`Saved memories:\n${memoryLines.join("\n")}`)
  }

  return sections.join("\n\n")
}
