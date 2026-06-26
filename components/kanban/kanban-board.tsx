"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"

import { moveTask, type ArchivedTask, type EditedTask } from "@/lib/actions/tasks"
import type { Label } from "@/lib/labels"
import { createClient } from "@/lib/supabase/client"
import { useToasts } from "@/lib/hooks/use-toasts"
import { ArchivedTasksDialog } from "@/components/kanban/archived-tasks-dialog"
import { BoardToolbar, type SortMode } from "@/components/kanban/board-toolbar"
import { KanbanColumn } from "@/components/kanban/kanban-column"
import { TaskDetailDialog } from "@/components/kanban/task-detail-dialog"
import { ToastStack } from "@/components/ui/toast-stack"

// How long a task ID counts as "just changed by this session" after a
// local mutation — long enough to absorb the round-trip before this same
// session's own write echoes back over Realtime, short enough that a
// second, genuinely remote change to the same task shortly after still
// gets its own toast (DEC-023).
const SELF_ECHO_WINDOW_MS = 4000

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const STATUSES = ["backlog", "todo", "in_progress", "done"] as const

type Task = {
  id: string
  title: string
  status: string
  due_date: string | null
  priority: string | null
  labels: Label[]
  checklistCompleted: number
  checklistTotal: number
  commentCount: number
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
  const [searchQuery, setSearchQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState("")
  const [labelFilter, setLabelFilter] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("manual")
  const { toasts, pushToast } = useToasts()
  const recentlyTouched = useRef<Map<string, number>>(new Map())

  function markTouched(taskId: string) {
    recentlyTouched.current.set(taskId, Date.now())
  }

  function wasRecentlyTouched(taskId: string) {
    const touchedAt = recentlyTouched.current.get(taskId)
    return Boolean(touchedAt) && Date.now() - touchedAt! < SELF_ECHO_WINDOW_MS
  }

  // DEC-023: a Realtime subscription is genuinely new client-state scope
  // beyond DEC-008's drag-and-drop-only carve-out — other sessions editing
  // this same project now show up live. Realtime payloads only carry the
  // raw tasks row, not the labels/checklist/comment joins used for the
  // initial bulk fetch, so a remotely-created or -restored task starts
  // with those at zero/empty until the next full reload (the same
  // accepted display-lag tradeoff already used for restored tasks).
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Per Supabase's docs ("Custom tokens" section of the Postgres
    // Changes guide): the auth token must be set on the Realtime client
    // before connecting to a channel, not after. createBrowserClient
    // doesn't appear to apply the current session to Realtime on its
    // own quickly enough — without this explicit, awaited setAuth call
    // first, the channel reaches SUBSCRIBED but silently never receives
    // any postgres_changes events (confirmed directly: zero events
    // arrived even after 30s, with no error, until this fix was added).
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data.session) {
        supabase.realtime.setAuth(data.session.access_token)
      }
      channel = buildChannel(data.session?.user.id ?? null)
    })

    function buildChannel(currentUserId: string | null) {
      return supabase
        .channel(`tasks-${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as {
                created_by: string
                id: string
                title: string
                status: string
                due_date: string | null
                priority: string | null
                archived_at: string | null
              }
              if (row.archived_at) return

              // created_by is timing-independent, unlike the touched-
              // tracking used for UPDATE/DELETE below: for a freshly
              // created task, this Realtime event can arrive over the
              // already-open websocket before this same browser's own
              // createTask Server Action call even returns (confirmed
              // directly — a task could appear twice and toast its own
              // creation to itself before this fix), so "was this
              // recently touched by me" can't be evaluated correctly
              // yet at the moment this fires. Whether the row already
              // exists locally is reliable regardless of which path
              // (Realtime or the local quick-add callback) wins the race.
              let added = false
              setTasksByStatus((previous) => {
                const alreadyPresent = STATUSES.some((status) =>
                  previous[status].some((task) => task.id === row.id)
                )
                if (alreadyPresent) return previous
                added = true
                const newTask: Task = {
                  id: row.id,
                  title: row.title,
                  status: row.status,
                  due_date: row.due_date,
                  priority: row.priority,
                  labels: [],
                  checklistCompleted: 0,
                  checklistTotal: 0,
                  commentCount: 0,
                }
                return {
                  ...previous,
                  [row.status]: [...previous[row.status], newTask],
                }
              })
              if (added && row.created_by !== currentUserId) {
                pushToast(`New task: ${row.title}`)
              }
              return
            }

          if (payload.eventType === "UPDATE") {
            const row = payload.new as {
              id: string
              title: string
              status: string
              due_date: string | null
              priority: string | null
              archived_at: string | null
            }
            const touched = wasRecentlyTouched(row.id)

            setTasksByStatus((previous) => {
              let existing: Task | undefined
              const stripped: TasksByStatus = {
                backlog: [],
                todo: [],
                in_progress: [],
                done: [],
              }
              for (const status of STATUSES) {
                for (const task of previous[status]) {
                  if (task.id === row.id) {
                    existing = task
                  } else {
                    stripped[status].push(task)
                  }
                }
              }

              if (row.archived_at) return stripped

              const merged: Task = existing
                ? {
                    ...existing,
                    title: row.title,
                    status: row.status,
                    due_date: row.due_date,
                    priority: row.priority,
                  }
                : {
                    id: row.id,
                    title: row.title,
                    status: row.status,
                    due_date: row.due_date,
                    priority: row.priority,
                    labels: [],
                    checklistCompleted: 0,
                    checklistTotal: 0,
                    commentCount: 0,
                  }
              stripped[row.status] = [...stripped[row.status], merged]
              return stripped
            })

            if (!touched) pushToast(`Task updated: ${row.title}`)
            return
          }

            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as { id: string }
              const touched = wasRecentlyTouched(oldRow.id)
              removeTaskFromState(oldRow.id)
              if (!touched) pushToast("A task was deleted")
            }
          }
        )
        .subscribe()
    }

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const allLabels = useMemo(() => {
    const seen = new Map<string, Label>()
    for (const status of STATUSES) {
      for (const task of tasksByStatus[status]) {
        for (const label of task.labels) seen.set(label.id, label)
      }
    }
    return Array.from(seen.values())
  }, [tasksByStatus])

  const isFiltered = Boolean(searchQuery || priorityFilter || labelFilter)
  const isViewModified = isFiltered || sortMode !== "manual"

  const visibleTasksByStatus = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const next: TasksByStatus = { backlog: [], todo: [], in_progress: [], done: [] }

    for (const status of STATUSES) {
      let list = tasksByStatus[status].filter((task) => {
        if (query && !task.title.toLowerCase().includes(query)) return false
        if (priorityFilter && task.priority !== priorityFilter) return false
        if (labelFilter && !task.labels.some((label) => label.id === labelFilter)) {
          return false
        }
        return true
      })

      if (sortMode === "priority") {
        list = [...list].sort(
          (a, b) =>
            (PRIORITY_ORDER[a.priority ?? ""] ?? 99) -
            (PRIORITY_ORDER[b.priority ?? ""] ?? 99)
        )
      } else if (sortMode === "due_date") {
        list = [...list].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        })
      }

      next[status] = list
    }

    return next
  }, [tasksByStatus, searchQuery, priorityFilter, labelFilter, sortMode])

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
    markTouched(taskId)

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
    // Reordering a filtered/sorted view has no safe, unambiguous mapping
    // back onto the real fractional position data, so drags are inert
    // while the view is modified. This is gated here rather than by
    // swapping the DndContext `sensors` array to an empty one — doing
    // that changes the array's length between renders, which violates an
    // internal hook-dependency invariant inside useSensors/DndContext and
    // visibly corrupts the board (confirmed via a real "changed size
    // between renders" React error, not just a theoretical concern).
    if (isViewModified) return

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
    markTouched(task.id)
    const newTask: Task = {
      ...task,
      due_date: null,
      priority: null,
      labels: [],
      checklistCompleted: 0,
      checklistTotal: 0,
      commentCount: 0,
    }
    setTasksByStatus((previous) => {
      // The Realtime echo of this same INSERT can arrive over the
      // websocket before this Server Action's own HTTP response gets
      // back to the client — confirmed directly, not theoretical — so
      // this local path needs the same "already present" guard the
      // Realtime handler uses, or the task gets added twice.
      const alreadyPresent = STATUSES.some((status) =>
        previous[status].some((existing) => existing.id === task.id)
      )
      if (alreadyPresent) return previous
      return {
        ...previous,
        [task.status]: [...previous[task.status], newTask],
      }
    })
  }

  function removeTaskFromState(taskId: string) {
    markTouched(taskId)
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].filter((task) => task.id !== taskId)
      }
      return next
    })
  }

  function handleTaskUpdated(updated: EditedTask) {
    markTouched(updated.id)
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
    markTouched(taskId)
    if (archivedAt) {
      removeTaskFromState(taskId)
      setOpenTaskId(null)
    }
  }

  function handleTaskRestored(task: ArchivedTask) {
    // Labels/checklist aren't fetched for archived tasks (kept minimal —
    // see getArchivedTasks), so a restored card shows them again after the
    // next full reload rather than instantly. Nothing is actually lost;
    // only the card's display lags briefly.
    setTasksByStatus((previous) => ({
      ...previous,
      [task.status]: [
        ...previous[task.status],
        {
          ...task,
          labels: [],
          checklistCompleted: 0,
          checklistTotal: 0,
          commentCount: 0,
        },
      ],
    }))
  }

  function handleLabelsChanged(taskId: string, labels: Label[]) {
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].map((task) =>
          task.id === taskId ? { ...task, labels } : task
        )
      }
      return next
    })
  }

  function handleChecklistChanged(taskId: string, completed: number, total: number) {
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].map((task) =>
          task.id === taskId
            ? { ...task, checklistCompleted: completed, checklistTotal: total }
            : task
        )
      }
      return next
    })
  }

  function handleCommentCountChanged(taskId: string, count: number) {
    setTasksByStatus((previous) => {
      const next: TasksByStatus = { ...previous }
      for (const status of STATUSES) {
        next[status] = previous[status].map((task) =>
          task.id === taskId ? { ...task, commentCount: count } : task
        )
      }
      return next
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-6">
      <div className="flex items-center justify-between gap-3">
        <BoardToolbar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          labelFilter={labelFilter}
          onLabelFilterChange={setLabelFilter}
          availableLabels={allLabels}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
        />
        <ArchivedTasksDialog projectId={projectId} onTaskRestored={handleTaskRestored} />
      </div>
      {isViewModified && (
        <p className="text-xs text-muted-foreground">
          Drag and drop is disabled while searching, filtering, or sorting.
        </p>
      )}
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
              tasks={visibleTasksByStatus[status]}
              onTaskMove={handleKeyboardMove}
              onTaskCreated={handleTaskCreated}
              onTaskOpen={setOpenTaskId}
              isFiltered={isFiltered}
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
        onLabelsChanged={handleLabelsChanged}
        onChecklistChanged={handleChecklistChanged}
        onCommentCountChanged={handleCommentCountChanged}
      />
      <ToastStack toasts={toasts} />
    </div>
  )
}
