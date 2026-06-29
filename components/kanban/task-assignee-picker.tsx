"use client"

import { useEffect, useState, useTransition } from "react"

import { getProjectMembers, type ProjectMember } from "@/lib/actions/projects"
import {
  assignUserToTask,
  getTaskAssignees,
  unassignUserFromTask,
  type TaskAssignee,
} from "@/lib/actions/assignees"

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

export function TaskAssigneePicker({
  taskId,
  projectId,
  onAssigneesChanged,
}: {
  taskId: string
  projectId: string
  onAssigneesChanged: (assignees: TaskAssignee[]) => void
}) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Same StrictMode double-invoke guard used by TaskChecklist/
    // TaskLabelPicker — without it, the first invocation's fetch can
    // resolve after a later optimistic toggle and stomp it with stale data.
    let active = true
    setLoading(true)
    Promise.all([getProjectMembers(projectId), getTaskAssignees(taskId)]).then(
      ([membersResult, assigneesResult]) => {
        if (!active) return
        setMembers("success" in membersResult ? membersResult.members : [])
        setAssignees("success" in assigneesResult ? assigneesResult.assignees : [])
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [projectId, taskId])

  function notifyChange(next: TaskAssignee[]) {
    setAssignees(next)
    onAssigneesChanged(next)
  }

  function handleToggle(member: ProjectMember, assigned: boolean) {
    setError(null)
    startTransition(async () => {
      const result = assigned
        ? await unassignUserFromTask(taskId, member.user_id, member.email)
        : await assignUserToTask(taskId, member.user_id, member.email)

      if ("error" in result) {
        setError(result.error)
        return
      }
      notifyChange(
        assigned
          ? assignees.filter((existing) => existing.user_id !== member.user_id)
          : [...assignees, member]
      )
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading assignees…</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">No workspace members yet</p>
        )}
        {members.map((member) => {
          const assigned = assignees.some((a) => a.user_id === member.user_id)
          return (
            <button
              key={member.user_id}
              type="button"
              onClick={() => handleToggle(member, assigned)}
              title={member.email}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                assigned
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground opacity-60 hover:opacity-100"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background/20 text-[9px]">
                {initials(member.email)}
              </span>
              <span className="max-w-[140px] truncate">{member.email}</span>
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
