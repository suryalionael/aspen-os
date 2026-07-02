"use client"

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
      <p className="py-8 text-center text-sm text-muted-foreground">
        No tasks yet — add one from the Board view.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Assignees</th>
            <th className="px-3 py-2 font-medium">Due date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const assigneeEmails = task.assigneeIds
              .map((id) => assigneeEmailById.get(id))
              .filter(Boolean) as string[]
            return (
              <tr
                key={task.id}
                onClick={() => onTaskOpen(task.id)}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-secondary/30"
              >
                <td className="max-w-xs truncate px-3 py-2">{task.title}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {STATUS_LABELS[task.status] ?? task.status}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{task.priority ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {assigneeEmails.length > 0
                    ? assigneeEmails.slice(0, 2).join(", ") +
                      (assigneeEmails.length > 2 ? ` +${assigneeEmails.length - 2}` : "")
                    : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {task.due_date ? formatDueDate(task.due_date) : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
