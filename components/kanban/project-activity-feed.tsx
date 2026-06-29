"use client"

import { useEffect, useState } from "react"

import { getProjectActivity, type ProjectActivityEntry } from "@/lib/actions/tasks"
import { describeActivity } from "@/lib/utils/activity-labels"
import { formatDateTime } from "@/lib/utils/format-date"

export function ProjectActivityFeed({ projectId }: { projectId: string }) {
  const [activity, setActivity] = useState<ProjectActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getProjectActivity(projectId).then((result) => {
      if (!active) return
      setActivity("success" in result ? result.activity : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [projectId])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading activity…</p>
  }

  if (activity.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {activity.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">{entry.task_title}: </span>
            {describeActivity(entry.event_type, entry.metadata)}
          </span>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {formatDateTime(entry.created_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}
