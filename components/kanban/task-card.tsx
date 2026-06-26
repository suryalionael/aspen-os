"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { TaskMoveControl } from "@/components/kanban/task-move-control"

export function TaskCard({
  id,
  title,
  status,
  onMove,
  onOpen,
}: {
  id: string
  title: string
  status: string
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
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm shadow-sm"
    >
      {/* The drag handle is scoped to the title only, so it never competes
          with the keyboard "move to" control's own pointer/keyboard events.
          onClick still fires normally after a plain click (no movement),
          since dnd-kit's activation distance constraint only swallows
          pointer events once an actual drag starts — so this same span can
          open the detail dialog without a separate affordance. */}
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
  )
}
