"use client"

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-secondary text-secondary-foreground",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
}

function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

export function TaskListView({
  tasks,
  emptyMessage,
  onTaskOpen,
}: {
  tasks: {
    id: string
    title: string
    status: string
    due_date: string | null
    priority: string | null
  }[]
  emptyMessage: string
  onTaskOpen: (taskId: string) => void
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <li key={task.id}>
          <button
            type="button"
            onClick={() => onTaskOpen(task.id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 text-left text-sm shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            <span className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5">
                {STATUS_LABELS[task.status] ?? task.status}
              </span>
              {task.priority && (
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    PRIORITY_STYLES[task.priority] ?? "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {task.priority}
                </span>
              )}
              {task.due_date && <span>Due {formatDueDate(task.due_date)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
