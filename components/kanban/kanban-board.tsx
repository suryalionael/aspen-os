"use client"

import { useState, useTransition } from "react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"

import { moveTask, type ArchivedTask, type EditedTask } from "@/lib/actions/tasks"
import { ArchivedTasksDialog } from "@/components/kanban/archived-tasks-dialog"
import { KanbanColumn } from "@/components/kanban/kanban-column"
import { TaskDetailDialog } from "@/components/kanban/task-detail-dialog"

const STATUSES = ["backlog", "todo", "in_progress", "done"] as const

type Task = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
}
type TasksByStatus = Record<string, Task[]>

function groupByStatus(tasks: Task[]): TasksByStatus {
  const grouped: TasksByStatus = { backlog: [], todo: [], in_progress: [], done: [] }
  for (const task of tasks) {
    grouped[task.status]?.push(task)
  }
  return grouped
}

export function KanbanBoard({
  projectId,
  initialTasks,
}: {
  projectId: string
  initialTasks: Task[]
}) {
  const [tasksByStatus, setTasksByStatus] = useState<TasksByStatus>(() =>
    groupByStatus(initialTasks)
  )
  const [error, setError] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // A small activation distance keeps the "move to" select and ordinary
  // clicks from being swallowed by an accidental drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  function commitMove(
    taskId: string,
    destinationStatus: string,
    destinationList: Task[],
    previousState: TasksByStatus,
    nextState: TasksByStatus
  ) {
    const index = destinationList.findIndex((task) => task.id === taskId)
    const beforeTaskId = index > 0 ? destinationList[index - 1].id : null
    const afterTaskId =
      index < destinationList.length - 1 ? destinationList[index + 1].id : null

    setTasksByStatus(nextState)
    setError(null)

    startTransition(async () => {
      const result = await moveTask({
        taskId,
        projectId,
        status: destinationStatus,
        beforeTaskId,
        afterTaskId,
      })
      if ("error" in result) {
        // Revert the optimistic change and surface the failure.
        setTasksByStatus(previousState)
        setError(result.error)
      }
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeTaskId = String(active.id)
    const overId = String(over.id)
    if (activeTaskId === overId) return

    const sourceStatus = STATUSES.find((status) =>
      tasksByStatus[status].some((task) => task.id === activeTaskId)
    )
    if (!sourceStatus) return

    const destinationStatus = (STATUSES as readonly string[]).includes(overId)
      ? overId
      : STATUSES.find((status) =>
          tasksByStatus[status].some((task) => task.id === overId)
        )
    if (!destinationStatus) return

    const previousState = tasksByStatus

    if (sourceStatus === destinationStatus) {
      const list = previousState[sourceStatus]
      const oldIndex = list.findIndex((task) => task.id === activeTaskId)
      const overIndex = list.findIndex((task) => task.id === overId)
      if (oldIndex === -1 || overIndex === -1) return

      const reordered = arrayMove(list, oldIndex, overIndex)
      const nextState = { ...previousState, [sourceStatus]: reordered }
      commitMove(activeTaskId, sourceStatus, reordered, previousState, nextState)
      return
    }

    const activeTask = previousState[sourceStatus].find(
      (task) => task.id === activeTaskId
    )
    if (!activeTask) return

    const nextState: TasksByStatus = { ...previousState }
    nextState[sourceStatus] = previousState[sourceStatus].filter(
      (task) => task.id !== activeTaskId
    )

    const destinationList = [...previousState[destinationStatus]]
    const overIndexInDestination = destinationList.findIndex(
      (task) => task.id === overId
    )
    const insertIndex =
      overIndexInDestination === -1
        ? destinationList.length
        : overIndexInDestination
    destinationList.splice(insertIndex, 0, {
      ...activeTask,
      status: destinationStatus,
    })
    nextState[destinationStatus] = destinationList

    commitMove(activeTaskId, destinationStatus, destinationList, previousState, nextState)
  }

  function handleKeyboardMove(taskId: string, destinationStatus: string) {
    const sourceStatus = STATUSES.find((status) =>
      tasksByStatus[status].some((task) => task.id === taskId)
    )
    if (!sourceStatus || sourceStatus === destinationStatus) return

    const previousState = tasksByStatus
    const activeTask = previousState[sourceStatus].find((task) => task.id === taskId)
    if (!activeTask) return

    const nextState: TasksByStatus = { ...previousState }
    nextState[sourceStatus] = previousState[sourceStatus].filter(
      (task) => task.id !== taskId
    )
    const destinationList = [
      ...previousState[destinationStatus],
      { ...activeTask, status: destinationStatus },
    ]
    nextState[destinationStatus] = destinationList

    commitMove(taskId, destinationStatus, destinationList, previousState, nextState)
  }

  function handleTaskCreated(task: { id: string; title: string; status: string }) {
    const newTask: Task = { ...task, due_date: null, priority: null }
    setTasksByStatus((previous) => ({
      ...previous,
      [task.status]: [...previous[task.status], newTask],
    }))
  }

  function removeTaskFromState(taskId: string) {
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].filter((task) => task.id !== taskId)
      }
      return next
    })
  }

  function handleTaskUpdated(updated: EditedTask) {
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].map((task) =>
          task.id === updated.id
            ? {
                ...task,
                title: updated.title,
                due_date: updated.due_date,
                priority: updated.priority,
              }
            : task
        )
      }
      return next
    })
  }

  function handleTaskArchiveChange(taskId: string, archivedAt: string | null) {
    // The board never displays archived tasks (see app/(dashboard) project
    // page query), so the moment a task is archived from its detail
    // dialog, it leaves this client state and the dialog closes.
    if (archivedAt) {
      removeTaskFromState(taskId)
      setOpenTaskId(null)
    }
  }

  function handleTaskRestored(task: ArchivedTask) {
    setTasksByStatus((previous) => ({
      ...previous,
      [task.status]: [...previous[task.status], task],
    }))
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="flex items-center justify-end">
        <ArchivedTasksDialog projectId={projectId} onTaskRestored={handleTaskRestored} />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto">
          {STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              projectId={projectId}
              tasks={tasksByStatus[status]}
              onTaskMove={handleKeyboardMove}
              onTaskCreated={handleTaskCreated}
              onTaskOpen={setOpenTaskId}
            />
          ))}
        </div>
      </DndContext>
      <TaskDetailDialog
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={(open) => !open && setOpenTaskId(null)}
        onTaskUpdated={handleTaskUpdated}
        onTaskArchiveChange={handleTaskArchiveChange}
        onTaskDeleted={removeTaskFromState}
      />
    </div>
  )
}
