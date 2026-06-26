"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addLabelToTask,
  createLabel,
  deleteLabel,
  getProjectLabels,
  getTaskLabels,
  removeLabelFromTask,
} from "@/lib/actions/labels"
import { LABEL_COLORS, type Label } from "@/lib/labels"

function colorClassName(color: string): string {
  return (
    LABEL_COLORS.find((option) => option.value === color)?.className ??
    "bg-secondary text-secondary-foreground"
  )
}

export function TaskLabelPicker({
  taskId,
  projectId,
  onLabelsChanged,
}: {
  taskId: string
  projectId: string
  onLabelsChanged: (labels: Label[]) => void
}) {
  const [projectLabels, setProjectLabels] = useState<Label[]>([])
  const [taskLabels, setTaskLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0].value)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    // Guards against React StrictMode's double-invoked effects in
    // development: without this, the first invocation's fetch can resolve
    // after a later optimistic update and stomp it with stale data — the
    // same race confirmed and fixed in TaskChecklist.
    let active = true
    setLoading(true)
    Promise.all([getProjectLabels(projectId), getTaskLabels(taskId)]).then(
      ([projectResult, taskResult]) => {
        if (!active) return
        setProjectLabels("success" in projectResult ? projectResult.labels : [])
        setTaskLabels("success" in taskResult ? taskResult.labels : [])
        setLoading(false)
      }
    )
    return () => {
      active = false
    }
  }, [projectId, taskId])

  function notifyChange(next: Label[]) {
    setTaskLabels(next)
    onLabelsChanged(next)
  }

  function handleToggle(label: Label, attached: boolean) {
    setError(null)
    startTransition(async () => {
      const result = attached
        ? await removeLabelFromTask(taskId, label.id, label.name)
        : await addLabelToTask(taskId, label.id, label.name)

      if ("error" in result) {
        setError(result.error)
        return
      }
      notifyChange(
        attached
          ? taskLabels.filter((existing) => existing.id !== label.id)
          : [...taskLabels, label]
      )
    })
  }

  function handleCreateLabel() {
    setError(null)
    startTransition(async () => {
      const result = await createLabel(projectId, newName, newColor)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setProjectLabels((previous) => [...previous, result.label])
      setNewName("")
    })
  }

  function handleDeleteLabel(label: Label) {
    startTransition(async () => {
      const result = await deleteLabel(label.id)
      if ("success" in result) {
        setProjectLabels((previous) => previous.filter((l) => l.id !== label.id))
        if (taskLabels.some((l) => l.id === label.id)) {
          notifyChange(taskLabels.filter((l) => l.id !== label.id))
        }
      }
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading labels…</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {projectLabels.map((label) => {
          const attached = taskLabels.some((l) => l.id === label.id)
          return (
            <span key={label.id} className="group inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleToggle(label, attached)}
                className={`rounded px-2 py-0.5 text-xs font-medium ${colorClassName(label.color)} ${
                  attached ? "" : "opacity-40"
                }`}
              >
                {label.name}
              </button>
              <button
                type="button"
                aria-label={`Delete label ${label.name}`}
                onClick={() => handleDeleteLabel(label)}
                className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                ×
              </button>
            </span>
          )
        })}
        {projectLabels.length === 0 && (
          <p className="text-sm text-muted-foreground">No labels yet</p>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          aria-label="New label name"
          placeholder="New label"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          className="h-7 max-w-[140px] text-xs"
        />
        <select
          aria-label="New label color"
          value={newColor}
          onChange={(event) => setNewColor(event.target.value)}
          className="h-7 rounded border border-input bg-transparent px-1 text-xs"
        >
          {LABEL_COLORS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-7" onClick={handleCreateLabel}>
          Add label
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
