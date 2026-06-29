"use client"

import { memo } from "react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { TaskMoveControl } from "@/components/kanban/task-move-control"
import { LABEL_COLORS, type Label } from "@/lib/labels"
import { formatDueDate, isOverdue } from "@/lib/utils/dates"

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-secondary text-secondary-foreground",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

// Memoized — a Kanban board re-renders all its cards on any task mutation
// (tasksByStatus is one object covering every column), so without this
// every card in every column would re-render whenever any single task
// changed. Takes `id` and dispatches through it (onMove(id, status),
// onOpen(id)) rather than receiving pre-bound per-card closures, so the
// parent can pass the same stable function reference to every card
// instead of a fresh closure each render — required for memo's shallow
// prop comparison to actually skip anything.
export const TaskCard = memo(function TaskCard({
  id,
  title,
  status,
  dueDate,
  priority,
  assigneeEmail,
  labels,
  checklistCompleted,
  checklistTotal,
  commentCount,
  onMove,
  onOpen,
}: {
  id: string
  title: string
  status: string
  dueDate: string | null
  priority: string | null
  assigneeEmail?: string | null
  labels: Label[]
  checklistCompleted: number
  checklistTotal: number
  commentCount: number
  onMove: (id: string, newStatus: string) => void
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="task-card"
      className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        {/* The drag handle is scoped to the title only, so it never
            competes with the keyboard "move to" control's own
            pointer/keyboard events. onClick still fires normally after a
            plain click (no movement), since dnd-kit's activation distance
            constraint only swallows pointer events once an actual drag
            starts — so this same span can open the detail dialog without a
            separate affordance. */}
        <span
          {...attributes}
          {...listeners}
          onClick={() => onOpen(id)}
          className="flex-1 cursor-grab select-none"
        >
          {title}
        </span>
        <TaskMoveControl status={status} onMove={(newStatus) => onMove(id, newStatus)} />
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                LABEL_COLORS.find((option) => option.value === label.color)
                  ?.className ?? "bg-secondary text-secondary-foreground"
              }`}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      {(dueDate || priority || assigneeEmail || checklistTotal > 0 || commentCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {checklistTotal > 0 && (
            <span className="text-xs text-muted-foreground">
              ☑ {checklistCompleted}/{checklistTotal}
            </span>
          )}
          {commentCount > 0 && (
            <span className="text-xs text-muted-foreground">💬 {commentCount}</span>
          )}
          {priority && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                PRIORITY_STYLES[priority] ?? "bg-secondary text-secondary-foreground"
              }`}
            >
              {PRIORITY_LABELS[priority] ?? priority}
            </span>
          )}
          {dueDate && (
            <span
              className={
                isOverdue(dueDate, status)
                  ? "rounded px-1.5 py-0.5 text-xs font-medium text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {isOverdue(dueDate, status) ? "Overdue " : "Due "}
              {formatDueDate(dueDate)}
            </span>
          )}
          {assigneeEmail && (
            <span className="text-xs text-muted-foreground">{assigneeEmail}</span>
          )}
        </div>
      )}
    </div>
  )
})
