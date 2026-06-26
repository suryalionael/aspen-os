import { TaskCard } from "@/components/kanban/task-card"
import { TaskCreateInline } from "@/components/kanban/task-create-inline"

const COLUMN_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
}

export function KanbanColumn({
  status,
  projectId,
  tasks,
}: {
  status: string
  projectId: string
  tasks: { id: string; title: string }[]
}) {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-lg bg-secondary/50 p-3">
      <h3 className="px-1 text-sm font-semibold">
        {COLUMN_LABELS[status] ?? status}
      </h3>
      {/* Per ux-review.md §6: quick-add lives only in "To Do" — new tasks
          should be immediately actionable, not buried in the backlog. */}
      {status === "todo" && <TaskCreateInline projectId={projectId} />}
      {tasks.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No tasks yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} title={task.title} />
          ))}
        </div>
      )}
    </div>
  )
}
