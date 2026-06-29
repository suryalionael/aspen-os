"use client"

import { useMemo } from "react"

import { formatDueDate, isOverdue, toDateKey } from "@/lib/utils/dates"

type Task = {
  id: string
  title: string
  status: string
  due_date: string | null
}

function Section({
  title,
  tasks,
  onTaskOpen,
  emptyMessage,
}: {
  title: string
  tasks: Task[]
  onTaskOpen: (taskId: string) => void
  emptyMessage: string
}) {
  const visible = tasks.slice(0, 3)
  const overflow = tasks.length - visible.length

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium normal-case">
          {tasks.length}
        </span>
      </h3>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onTaskOpen(task.id)}
                className="w-full truncate rounded-md px-1.5 py-1 text-left text-xs hover:bg-secondary"
              >
                {task.title}
              </button>
            </li>
          ))}
          {overflow > 0 && (
            <li className="px-1.5 text-xs text-muted-foreground">+{overflow} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

export function ProjectCompletionSidebar({
  tasks,
  onTaskOpen,
}: {
  tasks: Task[]
  onTaskOpen: (taskId: string) => void
}) {
  const { percent, completed, total, today, week, month, overdue } = useMemo(() => {
    const totalCount = tasks.length
    const completedCount = tasks.filter((task) => task.status === "done").length
    const open = tasks.filter((task) => task.status !== "done")

    const now = new Date()
    const todayKey = toDateKey(now)
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndKey = toDateKey(weekEnd)
    const monthEnd = new Date(now)
    monthEnd.setDate(monthEnd.getDate() + 30)
    const monthEndKey = toDateKey(monthEnd)

    return {
      percent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      completed: completedCount,
      total: totalCount,
      today: open.filter((task) => task.due_date === todayKey),
      week: open.filter(
        (task) => task.due_date !== null && task.due_date >= todayKey && task.due_date <= weekEndKey
      ),
      month: open.filter(
        (task) => task.due_date !== null && task.due_date >= todayKey && task.due_date <= monthEndKey
      ),
      overdue: tasks.filter((task) => task.due_date !== null && isOverdue(task.due_date, task.status)),
    }
  }, [tasks])

  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col gap-5 overflow-y-auto border-l border-border pl-5 lg:flex">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Progress
          </h3>
          <span className="text-lg font-semibold">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {completed}/{total} tasks done
        </p>
      </div>

      <Section title="Today" tasks={today} onTaskOpen={onTaskOpen} emptyMessage="Nothing due today" />
      <Section title="This week" tasks={week} onTaskOpen={onTaskOpen} emptyMessage="Nothing due this week" />
      <Section title="This month" tasks={month} onTaskOpen={onTaskOpen} emptyMessage="Nothing due this month" />
      <Section
        title="Overdue"
        tasks={overdue.map((task) => ({
          ...task,
          title: task.due_date ? `${task.title} (${formatDueDate(task.due_date)})` : task.title,
        }))}
        onTaskOpen={onTaskOpen}
        emptyMessage="Nothing overdue"
      />
    </aside>
  )
}
