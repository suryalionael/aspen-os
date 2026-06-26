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
    .select("id, title, status, due_date, priority, task_labels(labels(id, name, color))")
    .eq("project_id", project.id)
    .is("archived_at", null)
    .order("status", { ascending: true })
    .order("position", { ascending: true })

  const tasksWithLabels = (tasks ?? []).map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    due_date: task.due_date,
    priority: task.priority,
    labels: task.task_labels.flatMap((row) =>
      Array.isArray(row.labels) ? row.labels : row.labels ? [row.labels] : []
    ),
  }))

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">{project.name}</h1>
      </div>
      <KanbanBoard projectId={project.id} initialTasks={tasksWithLabels} />
    </div>
  )
}
