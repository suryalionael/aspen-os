import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { KanbanBoard } from "@/components/kanban/kanban-board"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>
}) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  // One indexed query via (project_id, status, position) — see
  // database-schema.md §2 — fetched once here and handed to the client
  // board as its initial, optimistically-managed state.
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("project_id", project.id)
    .order("status", { ascending: true })
    .order("position", { ascending: true })

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">{project.name}</h1>
      </div>
      <KanbanBoard projectId={project.id} initialTasks={tasks ?? []} />
    </div>
  )
}
