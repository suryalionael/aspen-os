import { createClient } from "@/lib/supabase/server"
import { KanbanColumn } from "@/components/kanban/kanban-column"

const STATUSES = ["backlog", "todo", "in_progress", "done"] as const

export async function KanbanBoard({ projectId }: { projectId: string }) {
  const supabase = await createClient()
  // One indexed query via (project_id, status, position) — see
  // database-schema.md §2 — fetches and orders every column in one pass.
  const { data } = await supabase
    .from("tasks")
    .select("id, title, status, position")
    .eq("project_id", projectId)
    .order("status", { ascending: true })
    .order("position", { ascending: true })

  const tasks = data ?? []

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto p-6">
      {STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          projectId={projectId}
          tasks={tasks.filter((task) => task.status === status)}
        />
      ))}
    </div>
  )
}
