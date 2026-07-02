"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NoteDialog } from "@/components/notes/note-dialog"
import { formatDateTime } from "@/lib/utils/format-date"
import type { Note, NoteType } from "@/lib/actions/notes"

const TYPE_LABELS: Record<NoteType, string> = {
  document: "Document",
  quick_note: "Quick note",
  meeting_note: "Meeting note",
  announcement: "Announcement",
}

const FILTERS: { value: NoteType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "document", label: "Documents" },
  { value: "quick_note", label: "Quick notes" },
  { value: "meeting_note", label: "Meeting notes" },
  { value: "announcement", label: "Announcements" },
]

export function NotesClient({
  workspaceId,
  projects,
  initialNotes,
  timezone,
}: {
  workspaceId: string
  projects: { id: string; name: string }[]
  initialNotes: Note[]
  timezone: string | null
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [filter, setFilter] = useState<NoteType | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)

  const visibleNotes = filter === "all" ? notes : notes.filter((note) => note.type === filter)

  function handleCreate() {
    setEditingNote(null)
    setDialogOpen(true)
  }

  function handleOpen(note: Note) {
    setEditingNote(note)
    setDialogOpen(true)
  }

  function handleSaved(note: Note) {
    setNotes((previous) => {
      const exists = previous.some((item) => item.id === note.id)
      const next = exists
        ? previous.map((item) => (item.id === note.id ? note : item))
        : [note, ...previous]
      return next.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    })
  }

  function handleDeleted(noteId: string) {
    setNotes((previous) => previous.filter((note) => note.id !== noteId))
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Notes</h1>
        <Button size="sm" onClick={handleCreate}>
          + New note
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`rounded-md border border-input px-2 py-1 text-sm ${
              filter === item.value ? "bg-secondary" : "hover:bg-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visibleNotes.length === 0 ? (
        <EmptyState
          icon="📝"
          title={filter === "all" ? "No notes yet" : `No ${TYPE_LABELS[filter as NoteType] ?? filter.toLowerCase()}s yet`}
          description="Capture documents, quick notes, meeting notes, and announcements for your team."
          action={
            <Button size="sm" onClick={handleCreate}>
              Create a note
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visibleNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => handleOpen(note)}
              data-testid="note-card"
              className="flex flex-col gap-1 rounded-lg border border-border p-3 text-left hover:bg-secondary/30"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {TYPE_LABELS[note.type]}
              </span>
              <span className="font-medium">{note.title}</span>
              <span className="line-clamp-2 text-sm text-muted-foreground">{note.body}</span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(note.updated_at, timezone)}
              </span>
            </button>
          ))}
        </div>
      )}

      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        projects={projects}
        note={editingNote}
        defaultType={filter === "all" ? "quick_note" : filter}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
