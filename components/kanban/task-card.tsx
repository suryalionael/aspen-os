"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { TaskMoveControl } from "@/components/kanban/task-move-control"
import { LABEL_COLORS, type Label } from "@/lib/labels"

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

// Postgres `date` columns come back as a bare "YYYY-MM-DD" string with no
// time component. new Date("YYYY-MM-DD") parses it as UTC midnight, which
// toLocaleDateString() then converts to the viewer's local timezone — in
// any negative-UTC-offset timezone that silently shifts the displayed date
// back by one day. Building the Date from explicit local Y/M/D components
// avoids that UTC round-trip entirely.
function formatDueDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

export function TaskCard({
  id,
  title,
  status,
  dueDate,
  priority,
  labels,
  onMove,
  onOpen,
}: {
  id: string
  title: string
  status: string
  dueDate: string | null
  priority: string | null
  labels: Label[]
  onMove: (newStatus: string) => void
  onOpen: () => void
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
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm shadow-sm"
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
          onClick={onOpen}
          className="flex-1 cursor-grab select-none"
        >
          {title}
        </span>
        <TaskMoveControl status={status} onMove={onMove} />
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                LABEL_COLORS.find((option) => option.value === label.color)
                  ?.className ?? "bg-secondary text-secondary-foreground"
              }`}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}
      {(dueDate || priority) && (
        <div className="flex items-center gap-2">
          {priority && (
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                PRIORITY_STYLES[priority] ?? "bg-secondary text-secondary-foreground"
              }`}
            >
              {PRIORITY_LABELS[priority] ?? priority}
            </span>
          )}
          {dueDate && (
            <span className="text-xs text-muted-foreground">
              Due {formatDueDate(dueDate)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
