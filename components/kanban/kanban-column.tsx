"use client"

import { memo } from "react"
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

const COLUMN_BG: Record<string, string> = {
  backlog: "bg-secondary/30",
  todo: "bg-secondary/40",
  in_progress: "bg-blue-50/50 dark:bg-blue-950/20",
  done: "bg-emerald-50/50 dark:bg-emerald-950/20",
}

export const KanbanColumn = memo(function KanbanColumn({
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
    assigneeIds: string[]
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
  // isOver highlights the column when a card hovers over it — improves
  // drag feedback for users who haven't dragged to an empty column before.
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${status}`}
      className={`flex w-72 flex-shrink-0 flex-col gap-3 rounded-xl p-3.5 transition-all duration-200 ease-out ${
        isOver
          ? "bg-primary/[0.07] ring-2 ring-primary/25 shadow-inner"
          : (COLUMN_BG[status] ?? "bg-secondary/40")
      }`}
    >
      <h3 className="flex items-center gap-2 px-0.5 text-sm font-semibold tracking-tight">
        {status === "done" && (
          <span className="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>
        )}
        {COLUMN_LABELS[status] ?? status}
        <span className="ml-auto rounded-full bg-secondary/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
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
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground/70">
            {isFiltered ? "No matching tasks" : "Drop tasks here"}
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
                assigneeEmails={task.assigneeIds
                  .map((userId) => assigneeEmailById.get(userId))
                  .filter((email): email is string => Boolean(email))}
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
})
