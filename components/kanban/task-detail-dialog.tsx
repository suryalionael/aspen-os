"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  archiveTask,
  editTask,
  deleteTask,
  getTaskActivity,
  unarchiveTask,
  type TaskActivityEntry,
} from "@/lib/actions/tasks"

const ACTIVITY_LABELS: Record<string, (metadata: Record<string, unknown> | null) => string> = {
  created: () => "Task created",
  moved: (metadata) => `Moved to ${String(metadata?.to ?? "another column")}`,
  edited: (metadata) =>
    metadata?.field === "title"
      ? `Title changed to "${String(metadata?.to ?? "")}"`
      : "Task edited",
  archived: () => "Task archived",
  unarchived: () => "Task restored from archive",
}

function describeActivity(entry: TaskActivityEntry): string {
  const describe = ACTIVITY_LABELS[entry.event_type]
  return describe ? describe(entry.metadata) : entry.event_type
}

export type DialogTask = {
  id: string
  title: string
  status: string
  archived_at: string | null
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onTaskUpdated,
  onTaskArchiveChange,
  onTaskDeleted,
}: {
  task: DialogTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdated: (task: { id: string; title: string }) => void
  onTaskArchiveChange: (taskId: string, archivedAt: string | null) => void
  onTaskDeleted: (taskId: string) => void
}) {
  const [editState, editAction, editPending] = useActionState(editTask, undefined)
  const [, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [activity, setActivity] = useState<TaskActivityEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!open || !task) return
    setConfirmingDelete(false)
    setActivityLoading(true)
    getTaskActivity(task.id).then((result) => {
      setActivity("success" in result ? result.activity : [])
      setActivityLoading(false)
    })
  }, [open, task])

  // Guards against an infinite render loop: onTaskUpdated is a plain
  // closure recreated on every KanbanBoard render (not memoized), so
  // including it in the dependency array means calling it (which updates
  // KanbanBoard's state and re-renders it) produces a new function
  // identity, re-firing this effect indefinitely even though editState
  // itself hasn't changed. Tracking the last-handled editState by
  // reference makes the effect idempotent regardless of callback churn.
  const handledEditState = useRef<typeof editState>(undefined)
  useEffect(() => {
    if (
      editState &&
      "success" in editState &&
      handledEditState.current !== editState
    ) {
      handledEditState.current = editState
      onTaskUpdated(editState.task)
    }
  }, [editState, onTaskUpdated])

  if (!task) return null

  const isArchived = Boolean(task.archived_at)

  function handleArchiveToggle() {
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveTask(task!.id)
        : await archiveTask(task!.id)
      if ("success" in result) {
        onTaskArchiveChange(task!.id, isArchived ? null : new Date().toISOString())
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(task!.id)
      if ("success" in result) {
        onTaskDeleted(task!.id)
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Task details</DialogTitle>
        </DialogHeader>

        <form action={editAction} className="flex flex-col gap-2">
          <input type="hidden" name="taskId" value={task.id} />
          <label htmlFor="task-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="task-title"
            name="title"
            key={task.id}
            defaultValue={task.title}
            required
          />
          {editState && "error" in editState && (
            <p role="alert" className="text-sm text-destructive">
              {editState.error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={editPending} className="self-start">
            {editPending ? "Saving…" : "Save"}
          </Button>
        </form>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={handleArchiveToggle}>
            {isArchived ? "Unarchive" : "Archive"}
          </Button>
          {confirmingDelete ? (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              Confirm delete
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">Activity</h3>
          {activityLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {activity.map((entry) => (
                <li key={entry.id}>
                  {describeActivity(entry)} ·{" "}
                  {new Date(entry.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
