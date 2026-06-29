"use client"

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import dynamic from "next/dynamic"

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
import { TaskComments } from "@/components/kanban/task-comments"
import { TaskAttachments } from "@/components/kanban/task-attachments"
import type { Label } from "@/lib/labels"
import { getProjectMembers, type ProjectMember } from "@/lib/actions/projects"
import { getProfile } from "@/lib/actions/profile"
import { formatDateTime } from "@/lib/utils/format-date"
import { describeActivity as describeActivityEvent } from "@/lib/utils/activity-labels"
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

// Only needed while the dialog is open and has description text to
// preview — keeps react-markdown out of the Kanban board's initial bundle.
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false })

function describeActivity(entry: TaskActivityEntry): string {
  return describeActivityEvent(entry.event_type, entry.metadata)
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
  onCommentCountChanged,
  onAttachmentCountChanged,
}: {
  taskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdated: (task: EditedTask) => void
  onTaskArchiveChange: (taskId: string, archivedAt: string | null) => void
  onTaskDeleted: (taskId: string) => void
  onLabelsChanged: (taskId: string, labels: Label[]) => void
  onChecklistChanged: (taskId: string, completed: number, total: number) => void
  onCommentCountChanged: (taskId: string, count: number) => void
  onAttachmentCountChanged: (taskId: string, count: number) => void
}) {
  const [editState, editAction, editPending] = useActionState(editTask, undefined)
  const [, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [archiveDeleteError, setArchiveDeleteError] = useState<string | null>(null)
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState("")
  const [activity, setActivity] = useState<TaskActivityEntry[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [timezone, setTimezone] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getProfile().then((profile) => {
      if (active) setTimezone(profile?.timezone ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!open || !taskId) return
    // Guards against React StrictMode's double-invoked effects in
    // development: without this, the first invocation's fetch can resolve
    // after a later optimistic update (e.g. refetchActivity) and stomp it
    // with stale data — the same race confirmed and fixed in
    // TaskChecklist/TaskLabelPicker.
    let active = true
    setConfirmingDelete(false)
    setArchiveDeleteError(null)
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

  const projectIdForMembers = taskDetail?.project_id ?? null
  useEffect(() => {
    if (!projectIdForMembers) return
    let active = true
    setMembersLoaded(false)
    getProjectMembers(projectIdForMembers).then((result) => {
      if (!active) return
      setMembers("success" in result ? result.members : [])
      setMembersLoaded(true)
    })
    return () => {
      active = false
    }
  }, [projectIdForMembers])

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
    setArchiveDeleteError(null)
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveTask(taskDetail!.id)
        : await archiveTask(taskDetail!.id)
      if ("error" in result) {
        setArchiveDeleteError(result.error)
        return
      }
      onTaskArchiveChange(taskDetail!.id, isArchived ? null : new Date().toISOString())
      refetchActivity()
    })
  }

  function handleDelete() {
    setArchiveDeleteError(null)
    startTransition(async () => {
      const result = await deleteTask(taskDetail!.id)
      if ("error" in result) {
        setArchiveDeleteError(result.error)
        return
      }
      onTaskDeleted(taskDetail!.id)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-assignee" className="text-sm font-medium">
              Assignee
            </label>
            <select
              id="task-assignee"
              name="assigneeId"
              // Remounts once membersLoaded flips true so defaultValue is
              // (re-)applied against the complete <option> list — without
              // this, a save that landed before getProjectMembers()
              // resolved would permanently lose the assignee: the browser
              // can't select an option that doesn't exist yet at mount
              // time, and React never re-applies defaultValue to an
              // already-mounted uncontrolled <select> when children
              // change later (confirmed directly: editing an already-
              // assigned task's due date alone silently nulled out
              // assignee_id).
              key={`assignee-${taskDetail.id}-${membersLoaded}`}
              defaultValue={taskDetail.assignee_id ?? ""}
              disabled={!membersLoaded}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.email}
                </option>
              ))}
            </select>
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
          <h3 className="mb-2 text-sm font-semibold">Attachments</h3>
          <TaskAttachments
            taskId={taskDetail.id}
            onChanged={(count) => {
              onAttachmentCountChanged(taskDetail.id, count)
              refetchActivity()
            }}
          />
        </div>

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

        <div className="border-t border-border pt-3">
          <h3 className="mb-2 text-sm font-semibold">Comments</h3>
          <TaskComments
            taskId={taskDetail.id}
            onChanged={(count) => {
              onCommentCountChanged(taskDetail.id, count)
              refetchActivity()
            }}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {archiveDeleteError && (
            <p role="alert" className="text-sm text-destructive">
              {archiveDeleteError}
            </p>
          )}
          <div className="flex items-center gap-2">
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
                  {formatDateTime(entry.created_at, timezone)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
