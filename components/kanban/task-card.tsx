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

type TaskCardProps = {
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
  attachmentCount: number
  progress: number
  onMove: (id: string, newStatus: string) => void
  onOpen: (id: string) => void
}

// The actual card markup, shared by the sortable in-column card and its
// DragOverlay clone — dnd-kit's recommended pattern is a separate,
// non-sortable copy for the overlay (registering useSortable twice under
// the same id would be wrong), so the drag-specific wiring (ref, style,
// attributes/listeners) is passed in rather than computed here.
function TaskCardBody({
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
  attachmentCount,
  progress,
  onMove,
  onOpen,
  dragHandleProps,
  className,
}: TaskCardProps & { dragHandleProps?: Record<string, unknown>; className: string }) {
  return (
    <div data-testid="task-card" className={className}>
      <div className="flex items-center justify-between gap-2">
        {/* The drag handle is scoped to the title only, so it never
            competes with the keyboard "move to" control's own
            pointer/keyboard events. onClick still fires normally after a
            plain click (no movement), since dnd-kit's activation distance
            constraint only swallows pointer events once an actual drag
            starts — so this same span can open the detail dialog without a
            separate affordance. */}
        <span
          {...dragHandleProps}
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
      {checklistTotal > 0 ? (
        <div className="flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((checklistCompleted / checklistTotal) * 100)}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {checklistCompleted}/{checklistTotal}
          </span>
        </div>
      ) : (
        progress > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="flex-shrink-0 text-xs text-muted-foreground">{progress}%</span>
          </div>
        )
      )}
      {(dueDate ||
        priority ||
        assigneeEmail ||
        commentCount > 0 ||
        attachmentCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {commentCount > 0 && (
            <span className="text-xs text-muted-foreground">💬 {commentCount}</span>
          )}
          {attachmentCount > 0 && (
            <span className="text-xs text-muted-foreground">📎 {attachmentCount}</span>
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
}

const CARD_CLASS =
  "flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md"

// Memoized — a Kanban board re-renders all its cards on any task mutation
// (tasksByStatus is one object covering every column), so without this
// every card in every column would re-render whenever any single task
// changed. Takes `id` and dispatches through it (onMove(id, status),
// onOpen(id)) rather than receiving pre-bound per-card closures, so the
// parent can pass the same stable function reference to every card
// instead of a fresh closure each render — required for memo's shallow
// prop comparison to actually skip anything.
export const TaskCard = memo(function TaskCard(props: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // While dragging, the original slot becomes a dashed placeholder
  // (matching Linear/Notion) instead of a faded copy of the card — the
  // actual card now follows the cursor via DragOverlay in KanbanBoard.
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="min-h-[3.5rem] rounded-xl border-2 border-dashed border-border bg-secondary/30"
      />
    )
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardBody {...props} dragHandleProps={{ ...attributes, ...listeners }} className={CARD_CLASS} />
    </div>
  )
})

// The floating clone rendered inside DragOverlay — no sortable wiring, a
// slightly elevated/rotated style to read clearly as "currently in hand."
export function TaskCardOverlay(props: TaskCardProps) {
  return (
    <TaskCardBody
      {...props}
      className={`${CARD_CLASS} rotate-2 cursor-grabbing shadow-xl`}
    />
  )
}
