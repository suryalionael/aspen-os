"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addChecklistItem,
  deleteChecklistItem,
  getChecklistItems,
  toggleChecklistItem,
  type ChecklistItem,
} from "@/lib/actions/checklist"

export function TaskChecklist({
  taskId,
  onChanged,
}: {
  taskId: string
  onChanged: (completed: number, total: number) => void
}) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState("")
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Next.js defaults to React StrictMode, which deliberately double-
    // invokes effects in development: mount -> cleanup -> mount again.
    // The first invocation's fetch isn't cancelled by that cleanup, so
    // without this guard it can resolve after the second invocation (or
    // after a later optimistic update) and stomp newer state with stale
    // data — confirmed by a real race where a deleted item reappeared.
    let active = true
    setLoading(true)
    getChecklistItems(taskId).then((result) => {
      if (!active) return
      const loaded = "success" in result ? result.items : []
      setItems(loaded)
      onChanged(
        loaded.filter((item) => item.completed).length,
        loaded.length
      )
      setLoading(false)
    })
    return () => {
      active = false
    }
    // Runs once per taskId (dialog open), not on every onChanged identity
    // change — onChanged is intentionally omitted from deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  function reportCounts(next: ChecklistItem[]) {
    onChanged(next.filter((item) => item.completed).length, next.length)
  }

  function handleAdd() {
    const content = newContent.trim()
    if (!content) return
    startTransition(async () => {
      const result = await addChecklistItem(taskId, content)
      if ("success" in result) {
        const next = [...items, result.item]
        setItems(next)
        setNewContent("")
        inputRef.current?.focus()
        reportCounts(next)
      }
    })
  }

  function handleToggle(item: ChecklistItem) {
    const nextCompleted = !item.completed
    const optimistic = items.map((existing) =>
      existing.id === item.id ? { ...existing, completed: nextCompleted } : existing
    )
    setItems(optimistic)
    startTransition(async () => {
      const result = await toggleChecklistItem(item.id, taskId, nextCompleted)
      if ("error" in result) {
        setItems(items)
        return
      }
      reportCounts(optimistic)
    })
  }

  function handleDelete(item: ChecklistItem) {
    const next = items.filter((existing) => existing.id !== item.id)
    setItems(next)
    startTransition(async () => {
      const result = await deleteChecklistItem(item.id, taskId)
      if ("success" in result) reportCounts(next)
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading checklist…</p>
  }

  const completedCount = items.filter((item) => item.completed).length

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {completedCount}/{items.length} done
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="checklist-item"
            className="group flex items-center gap-2"
          >
            <input
              type="checkbox"
              aria-label={`Mark "${item.content}" as ${item.completed ? "not done" : "done"}`}
              checked={item.completed}
              onChange={() => handleToggle(item)}
              className="h-4 w-4"
            />
            <span
              className={`flex-1 text-sm ${
                item.completed ? "text-muted-foreground line-through" : ""
              }`}
            >
              {item.content}
            </span>
            <button
              type="button"
              aria-label={`Delete "${item.content}"`}
              onClick={() => handleDelete(item)}
              className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          aria-label="New checklist item"
          placeholder="Add an item…"
          value={newContent}
          onChange={(event) => setNewContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              handleAdd()
            }
          }}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleAdd}>
          Add item
        </Button>
      </div>
    </div>
  )
}
