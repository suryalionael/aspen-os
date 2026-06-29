// A task's own progress is its checklist completion when it has a
// checklist, otherwise the manually-set `tasks.progress` percentage
// (Sprint 4 Priority 8). Centralized here since both the Kanban card and
// the project-wide aggregates (header, completion sidebar) need the same
// rule rather than each re-deriving it.
export function getTaskProgress(task: {
  progress: number
  checklistCompleted: number
  checklistTotal: number
}): number {
  if (task.checklistTotal > 0) {
    return Math.round((task.checklistCompleted / task.checklistTotal) * 100)
  }
  return task.progress
}

export function getAverageProgress(
  tasks: { progress: number; checklistCompleted: number; checklistTotal: number }[]
): number {
  if (tasks.length === 0) return 0
  const total = tasks.reduce((sum, task) => sum + getTaskProgress(task), 0)
  return Math.round(total / tasks.length)
}
