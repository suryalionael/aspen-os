"use client"

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
}

const STATUS_COLORS: Record<string, string> = {
  backlog: "text-muted-foreground",
  todo: "text-sky-600 dark:text-sky-400",
  in_progress: "text-blue-600 dark:text-blue-400",
  done: "text-emerald-600 dark:text-emerald-400",
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-600 dark:text-blue-400",
  high: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
}

function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function isOverdueDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr < today
}

export function TaskTableView({
  tasks,
  assigneeEmailById,
  onTaskOpen,
}: {
  tasks: {
    id: string
    title: string
    status: string
    due_date: string | null
    priority: string | null
    assigneeIds: string[]
  }[]
  assigneeEmailById: Map<string, string>
  onTaskOpen: (taskId: string) => void
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No tasks yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Switch to Board view to add tasks</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-secondary/60 backdrop-blur-sm text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium w-28">Status</th>
            <th className="px-4 py-2.5 font-medium w-24">Priority</th>
            <th className="px-4 py-2.5 font-medium w-36">Assignees</th>
            <th className="px-4 py-2.5 font-medium w-28">Due date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const assigneeEmails = task.assigneeIds
              .map((id) => assigneeEmailById.get(id))
              .filter(Boolean) as string[]
            const overdue = task.due_date && task.status !== "done" && isOverdueDate(task.due_date)
            return (
              <tr
                key={task.id}
                onClick={() => onTaskOpen(task.id)}
                className="cursor-pointer border-b border-border/40 last:border-0 transition-colors duration-100 hover:bg-secondary/40"
              >
                <td className="max-w-xs px-4 py-2.5">
                  <span className={`block truncate ${task.status === "done" ? "line-through text-muted-foreground/60" : ""}`}>
                    {task.title}
                  </span>
                </td>
                <td className={`px-4 py-2.5 text-xs font-medium ${STATUS_COLORS[task.status] ?? "text-muted-foreground"}`}>
                  {STATUS_LABELS[task.status] ?? task.status}
                </td>
                <td className={`px-4 py-2.5 text-xs font-medium capitalize ${task.priority ? (PRIORITY_COLORS[task.priority] ?? "text-muted-foreground") : "text-muted-foreground/50"}`}>
                  {task.priority ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {assigneeEmails.length > 0
                    ? assigneeEmails.slice(0, 2).join(", ") +
                      (assigneeEmails.length > 2 ? ` +${assigneeEmails.length - 2}` : "")
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {task.due_date ? formatDueDate(task.due_date) : <span className="text-muted-foreground/40">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
