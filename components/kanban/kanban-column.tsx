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
  assigneeEmailById,
  onTaskMove,
  onTaskCreated,
  onTaskOpen,
  isFiltered = false,
}: {
  status: string
  projectId: string
  tasks: {
    id: string
    title: string
    due_date: string | null
    priority: string | null
    assignee_id: string | null
    labels: Label[]
    checklistCompleted: number
    checklistTotal: number
    commentCount: number
    attachmentCount: number
    progress: number
  }[]
  assigneeEmailById: Map<string, string>
  onTaskMove: (taskId: string, newStatus: string) => void
  onTaskCreated: (task: { id: string; title: string; status: string }) => void
  onTaskOpen: (taskId: string) => void
  isFiltered?: boolean
}) {
  // The column itself is a drop target (id = status) so dropping on empty
  // space — not just on another card — registers correctly.
  const { setNodeRef } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${status}`}
      className="flex w-72 flex-shrink-0 flex-col gap-3 rounded-xl bg-secondary/40 p-3"
    >
      <h3 className="flex items-center gap-2 px-1 text-sm font-semibold tracking-tight">
        {COLUMN_LABELS[status] ?? status}
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
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
          <p className="px-1 text-sm text-muted-foreground">
            {isFiltered ? "No matching tasks" : "No tasks yet"}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                title={task.title}
                status={status}
                dueDate={task.due_date}
                priority={task.priority}
                assigneeEmail={task.assignee_id ? assigneeEmailById.get(task.assignee_id) : null}
                labels={task.labels}
                checklistCompleted={task.checklistCompleted}
                checklistTotal={task.checklistTotal}
                commentCount={task.commentCount}
                attachmentCount={task.attachmentCount}
                progress={task.progress}
                onMove={onTaskMove}
                onOpen={onTaskOpen}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </div>
  )
}
