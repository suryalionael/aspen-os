"use client"

import { useEffect, useState, useTransition } from "react"

import {
  addBlocker,
  getBlockingTasks,
  getProjectTaskTitles,
  removeBlocker,
  type TaskDependency,
} from "@/lib/actions/dependencies"

const STATUS_DONE = "done"

export function TaskDependencyPicker({
  taskId,
  projectId,
  onChanged,
}: {
  taskId: string
  projectId: string
  onChanged?: (blockedCount: number) => void
}) {
  const [projectTasks, setProjectTasks] = useState<TaskDependency[]>([])
  const [blockers, setBlockers] = useState<TaskDependency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([getProjectTaskTitles(projectId, taskId), getBlockingTasks(taskId)]).then(
      ([tasksResult, blockersResult]) => {
        if (!active) return
        setProjectTasks("success" in tasksResult ? tasksResult.tasks : [])
        setBlockers("success" in blockersResult ? blockersResult.blockers : [])
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [taskId, projectId])

  function notify(next: TaskDependency[]) {
    const activeBlockers = next.filter((blocker) => blocker.status !== STATUS_DONE)
    onChanged?.(activeBlockers.length)
  }

  function handleToggle(task: TaskDependency, isBlocker: boolean) {
    setError(null)
    startTransition(async () => {
      const result = isBlocker
        ? await removeBlocker(taskId, task.task_id)
        : await addBlocker(taskId, task.task_id)

      if ("error" in result) {
        setError(result.error)
        return
      }
      const next = isBlocker
        ? blockers.filter((existing) => existing.task_id !== task.task_id)
        : [...blockers, task]
      setBlockers(next)
      notify(next)
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading dependencies…</p>
  }

  if (projectTasks.length === 0) {
    return <p className="text-sm text-muted-foreground">No other tasks in this project.</p>
  }

  const blockerIds = new Set(blockers.map((b) => b.task_id))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {projectTasks.map((task) => {
          const isBlocker = blockerIds.has(task.task_id)
          return (
            <button
              key={task.task_id}
              type="button"
              onClick={() => handleToggle(task, isBlocker)}
              title={task.title}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                isBlocker
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-secondary-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <span className="max-w-[160px] truncate">{task.title}</span>
            </button>
          )
        })}
      </div>
      {blockers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {blockers.filter((b) => b.status !== STATUS_DONE).length > 0
            ? "⚠ This task is currently blocked."
            : "All blocking tasks are done."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
