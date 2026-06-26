"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { TaskCard } from "@/components/kanban/task-card"
import { TaskCreateInline } from "@/components/kanban/task-create-inline"
import type { Label } from "@/lib/labels"

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
  onTaskMove,
  onTaskCreated,
  onTaskOpen,
}: {
  status: string
  projectId: string
  tasks: {
    id: string
    title: string
    due_date: string | null
    priority: string | null
    labels: Label[]
    checklistCompleted: number
    checklistTotal: number
  }[]
  onTaskMove: (taskId: string, newStatus: string) => void
  onTaskCreated: (task: { id: string; title: string; status: string }) => void
  onTaskOpen: (taskId: string) => void
}) {
  // The column itself is a drop target (id = status) so dropping on empty
  // space — not just on another card — registers correctly.
  const { setNodeRef } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${status}`}
      className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-lg bg-secondary/50 p-3"
    >
      <h3 className="px-1 text-sm font-semibold">
        {COLUMN_LABELS[status] ?? status}
      </h3>
      {/* Per ux-review.md §6: quick-add lives only in "To Do" — new tasks
          should be immediately actionable, not buried in the backlog. */}
      {status === "todo" && (
        <TaskCreateInline projectId={projectId} onTaskCreated={onTaskCreated} />
      )}
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        {tasks.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">No tasks yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                title={task.title}
                status={status}
                dueDate={task.due_date}
                priority={task.priority}
                labels={task.labels}
                checklistCompleted={task.checklistCompleted}
                checklistTotal={task.checklistTotal}
                onMove={(newStatus) => onTaskMove(task.id, newStatus)}
                onOpen={() => onTaskOpen(task.id)}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </div>
  )
}
