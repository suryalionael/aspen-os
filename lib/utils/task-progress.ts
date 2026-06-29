// A task's own progress is 100% once its status is "done" - regardless
// of checklist/manual progress, since a card sitting in the Done column
// is the user's explicit statement that it's finished, even if they never
// checked off every checklist item or set a manual percentage. Short of
// that, it's checklist completion when a checklist exists, otherwise the
// manually-set `tasks.progress` percentage (Sprint 4 Priority 8).
// Centralized here since the Kanban card and the project-wide aggregates
// (header, completion sidebar) need the same rule rather than each
// re-deriving it - this was originally missing the status check, which
// left a task moved to Done (no checklist, progress never manually set)
// still reading as 0% (found verifying Sprint 4 Phase 0 Bug 1).
export function getTaskProgress(task: {
  status: string
  progress: number
  checklistCompleted: number
  checklistTotal: number
}): number {
  if (task.status === "done") return 100
  if (task.checklistTotal > 0) {
    return Math.round((task.checklistCompleted / task.checklistTotal) * 100)
  }
  return task.progress
}

export function getAverageProgress(
  tasks: {
    status: string
    progress: number
    checklistCompleted: number
    checklistTotal: number
  }[]
): number {
  if (tasks.length === 0) return 0
  const total = tasks.reduce((sum, task) => sum + getTaskProgress(task), 0)
  return Math.round(total / tasks.length)
}
