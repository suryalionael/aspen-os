"use client"

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import ReactMarkdown from "react-markdown"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { TaskLabelPicker } from "@/components/kanban/task-label-picker"
import { TaskChecklist } from "@/components/kanban/task-checklist"
import type { Label } from "@/lib/labels"
import {
  archiveTask,
  editTask,
  deleteTask,
  getTask,
  getTaskActivity,
  unarchiveTask,
  type EditedTask,
  type TaskActivityEntry,
  type TaskDetail,
} from "@/lib/actions/tasks"

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  due_date: "Due date",
  priority: "Priority",
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(none)"
  if (field === "priority") return PRIORITY_LABELS[String(value)] ?? String(value)
  if (field === "description") {
    const text = String(value)
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }
  return String(value)
}

const ACTIVITY_LABELS: Record<string, (metadata: Record<string, unknown> | null) => string> = {
  created: () => "Task created",
  moved: (metadata) => `Moved to ${String(metadata?.to ?? "another column")}`,
  edited: (metadata) => {
    const field = String(metadata?.field ?? "")
    const label = FIELD_LABELS[field] ?? "Task"
    return `${label} changed to ${formatFieldValue(field, metadata?.to)}`
  },
  archived: () => "Task archived",
  unarchived: () => "Task restored from archive",
  label_added: (metadata) => `Label "${String(metadata?.label_name ?? "")}" added`,
  label_removed: (metadata) => `Label "${String(metadata?.label_name ?? "")}" removed`,
  checklist_item_added: (metadata) =>
    `Checklist item "${String(metadata?.content ?? "")}" added`,
  checklist_item_completed: (metadata) =>
    `Checked off "${String(metadata?.content ?? "")}"`,
  checklist_item_reopened: (metadata) =>
    `Unchecked "${String(metadata?.content ?? "")}"`,
  checklist_item_removed: (metadata) =>
    `Checklist item "${String(metadata?.content ?? "")}" removed`,
}

function describeActivity(entry: TaskActivityEntry): string {
  const describe = ACTIVITY_LABELS[entry.event_type]
  return describe ? describe(entry.metadata) : entry.event_type
}

export function TaskDetailDialog({
  taskId,
  open,
  onOpenChange,
  onTaskUpdated,
  onTaskArchiveChange,
  onTaskDeleted,
  onLabelsChanged,
  onChecklistChanged,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdated: (task: EditedTask) => void
  onTaskArchiveChange: (taskId: string, archivedAt: string | null) => void
  onTaskDeleted: (taskId: string) => void
  onLabelsChanged: (taskId: string, labels: Label[]) => void
  onChecklistChanged: (taskId: string, completed: number, total: number) => void
}) {
  const [editState, editAction, editPending] = useActionState(editTask, undefined)
  const [, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const [activity, setActivity] = useState<TaskActivityEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  useEffect(() => {
    if (!open || !taskId) return
    // Guards against React StrictMode's double-invoked effects in
    // development: without this, the first invocation's fetch can resolve
    // after a later optimistic update (e.g. refetchActivity) and stomp it
    // with stale data — the same race confirmed and fixed in
    // TaskChecklist/TaskLabelPicker.
    let active = true
    setConfirmingDelete(false)
    setDetailLoading(true)
    setActivityLoading(true)

    getTask(taskId).then((result) => {
      if (!active) return
      if ("success" in result) {
        setTaskDetail(result.task)
        setDescriptionDraft(result.task.description ?? "")
      }
      setDetailLoading(false)
    })
    getTaskActivity(taskId).then((result) => {
      if (!active) return
      setActivity("success" in result ? result.activity : [])
      setActivityLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, taskId])

  // The activity panel otherwise only loads once when the dialog opens —
  // without an explicit refetch, editing, archiving, or relabeling a task
  // within the same open session would never show up until the dialog was
  // closed and reopened. Memoized so it can be listed as an effect
  // dependency without reintroducing the identity-churn loop described
  // below — its own dependency ([taskId]) only changes when the dialog
  // targets a different task, not on every render.
  const refetchActivity = useCallback(() => {
    if (!taskId) return
    getTaskActivity(taskId).then((result) => {
      if ("success" in result) setActivity(result.activity)
    })
  }, [taskId])

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
      setTaskDetail((previous) =>
        previous ? { ...previous, ...editState.task } : previous
      )
      onTaskUpdated(editState.task)
      refetchActivity()
    }
  }, [editState, onTaskUpdated, refetchActivity])

  if (!taskId || !taskDetail) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Task details</DialogTitle>
          </DialogHeader>
          {detailLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        </DialogContent>
      </Dialog>
    )
  }

  const isArchived = Boolean(taskDetail.archived_at)

  function handleArchiveToggle() {
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveTask(taskDetail!.id)
        : await archiveTask(taskDetail!.id)
      if ("success" in result) {
        onTaskArchiveChange(taskDetail!.id, isArchived ? null : new Date().toISOString())
        refetchActivity()
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(taskDetail!.id)
      if ("success" in result) {
        onTaskDeleted(taskDetail!.id)
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Task details</DialogTitle>
        </DialogHeader>

        <form action={editAction} className="flex flex-col gap-3">
          <input type="hidden" name="taskId" value={taskDetail.id} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="task-title"
              name="title"
              key={`title-${taskDetail.id}`}
              defaultValue={taskDetail.title}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="task-description"
              name="description"
              rows={4}
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              placeholder="Add a description… (Markdown supported)"
            />
            {descriptionDraft && (
              <div className="rounded-md border border-border bg-secondary/30 p-2 text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{descriptionDraft}</ReactMarkdown>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="task-due-date" className="text-sm font-medium">
                Due date
              </label>
              <Input
                id="task-due-date"
                name="dueDate"
                type="date"
                key={`due-${taskDetail.id}`}
                defaultValue={taskDetail.due_date ?? ""}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="task-priority" className="text-sm font-medium">
                Priority
              </label>
              <select
                id="task-priority"
                name="priority"
                key={`priority-${taskDetail.id}`}
                defaultValue={taskDetail.priority ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {editState && "error" in editState && (
            <p role="alert" className="text-sm text-destructive">
              {editState.error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={editPending} className="self-start">
            {editPending ? "Saving…" : "Save"}
          </Button>
        </form>

        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">Labels</h3>
          <TaskLabelPicker
            taskId={taskDetail.id}
            projectId={taskDetail.project_id}
            onLabelsChanged={(labels) => {
              onLabelsChanged(taskDetail.id, labels)
              refetchActivity()
            }}
          />
        </div>

        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
          <TaskChecklist
            taskId={taskDetail.id}
            onChanged={(completed, total) => {
              onChecklistChanged(taskDetail.id, completed, total)
              refetchActivity()
            }}
          />
        </div>

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
