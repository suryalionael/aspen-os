"use client"

// DEC-016: the keyboard-accessible fallback for changing a task's status.
// Drag-and-drop is the primary interaction; this control is what makes
// US-5 achievable for keyboard-only and screen-reader users (audit X-1) —
// a plain, fully native <select> needs no extra ARIA wiring to be operable
// by Tab + arrow keys + Enter.

const STATUSES = ["backlog", "todo", "in_progress", "done"]

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
}

export function TaskMoveControl({
  status,
  onMove,
}: {
  status: string
  onMove: (newStatus: string) => void
}) {
  return (
    <select
      aria-label="Move task to column"
      value={status}
      onChange={(event) => {
        const newStatus = event.target.value
        if (newStatus !== status) {
          onMove(newStatus)
        }
      }}
      className="h-6 rounded border border-input bg-transparent text-xs"
    >
      {STATUSES.map((value) => (
        <option key={value} value={value}>
          {STATUS_LABELS[value]}
        </option>
      ))}
    </select>
  )
}
