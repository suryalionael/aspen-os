"use client"

import { useMemo } from "react"

const PRIORITY_BAR: Record<string, string> = {
  low: "bg-secondary-foreground/40",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-500",
}

const DAYS = 42 // 6 weeks rolling window

type TimelineTask = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  created_at: string
}

function localDateKey(dateOrString: Date | string): string {
  const date = typeof dateOrString === "string" ? new Date(dateOrString) : dateOrString
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(dateKey: string, count: number): string {
  const date = new Date(dateKey)
  date.setDate(date.getDate() + count)
  return localDateKey(date)
}

export function TaskTimelineView({
  tasks,
  onTaskOpen,
}: {
  tasks: TimelineTask[]
  onTaskOpen: (taskId: string) => void
}) {
  const today = localDateKey(new Date())
  const startKey = addDays(today, -7) // start 7 days before today
  const endKey = addDays(startKey, DAYS - 1)

  // Build ordered day headers
  const dayKeys = useMemo(() => {
    const keys: string[] = []
    for (let i = 0; i < DAYS; i++) {
      keys.push(addDays(startKey, i))
    }
    return keys
  }, [startKey])

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : 1
      }),
    [tasks]
  )

  const cellWidth = 28 // px per day

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${200 + DAYS * cellWidth}px` }}>
          {/* Day header */}
          <div className="flex border-b border-border">
            <div style={{ width: 200 }} className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground">
              Task
            </div>
            {dayKeys.map((key) => {
              const date = new Date(key)
              const isToday = key === today
              const showLabel = date.getDate() === 1 || date.getDay() === 0 // 1st of month or Sunday
              return (
                <div
                  key={key}
                  style={{ width: cellWidth }}
                  className={`shrink-0 border-l border-border/50 py-2 text-center text-[9px] ${
                    isToday ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {showLabel
                    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : ""}
                </div>
              )
            })}
          </div>

          {/* Task rows */}
          {sortedTasks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tasks yet.
            </div>
          ) : (
            sortedTasks.map((task) => {
              // Bar spans from created_at (clamped to window) to due_date
              const barStart = task.due_date
                ? localDateKey(new Date(Math.max(
                    new Date(task.created_at).getTime(),
                    new Date(startKey).getTime()
                  )))
                : null
              const barEnd = task.due_date ? (task.due_date < startKey ? null : task.due_date > endKey ? endKey : task.due_date) : null
              const startIndex = barStart ? dayKeys.indexOf(barStart) : -1
              const endIndex = barEnd ? dayKeys.indexOf(barEnd) : -1

              return (
                <div key={task.id} className="flex items-center border-b border-border/30 hover:bg-secondary/20">
                  <button
                    type="button"
                    style={{ width: 200 }}
                    onClick={() => onTaskOpen(task.id)}
                    className="shrink-0 truncate px-3 py-2 text-left text-xs hover:underline"
                    title={task.title}
                  >
                    {task.status === "done" ? (
                      <span className="line-through text-muted-foreground">{task.title}</span>
                    ) : (
                      task.title
                    )}
                  </button>
                  <div className="relative flex items-center" style={{ width: DAYS * cellWidth, height: 28 }}>
                    {/* Day grid lines */}
                    {dayKeys.map((key, index) => (
                      <div
                        key={key}
                        style={{ left: index * cellWidth, width: cellWidth }}
                        className={`absolute inset-y-0 border-l border-border/20 ${
                          key === today ? "bg-primary/5" : ""
                        }`}
                      />
                    ))}
                    {/* Task bar */}
                    {startIndex >= 0 && endIndex >= 0 && (
                      <button
                        type="button"
                        onClick={() => onTaskOpen(task.id)}
                        style={{
                          left: startIndex * cellWidth + 2,
                          width: Math.max((endIndex - startIndex + 1) * cellWidth - 4, cellWidth - 4),
                        }}
                        title={`${task.title} — due ${task.due_date}`}
                        className={`absolute h-4 rounded-sm ${
                          PRIORITY_BAR[task.priority ?? ""] || "bg-secondary-foreground/40"
                        } ${task.status === "done" ? "opacity-40" : ""} hover:opacity-80 transition-opacity`}
                      />
                    )}
                    {/* Due-date point marker for tasks out of window */}
                    {task.due_date && (startIndex < 0 || endIndex < 0) && task.due_date >= startKey && task.due_date <= endKey && (
                      <button
                        type="button"
                        onClick={() => onTaskOpen(task.id)}
                        style={{ left: (dayKeys.indexOf(task.due_date) * cellWidth) + cellWidth / 2 - 4 }}
                        className={`absolute h-3 w-3 rounded-full border-2 border-background ${
                          PRIORITY_BAR[task.priority ?? ""] || "bg-secondary-foreground"
                        }`}
                      />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
