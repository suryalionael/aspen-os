"use client"

import { useEffect, useState, useTransition } from "react"
import dynamic from "next/dynamic"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createNote, deleteNote, updateNote, type Note, type NoteType } from "@/lib/actions/notes"

// Same reasoning as TaskDetailDialog: keeps react-markdown out of the
// initial bundle for pages that never open this dialog.
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false })

const TYPE_LABELS: Record<NoteType, string> = {
  document: "Document",
  quick_note: "Quick note",
  meeting_note: "Meeting note",
  announcement: "Announcement",
}

export function NoteDialog({
  open,
  onOpenChange,
  workspaceId,
  projects,
  note,
  defaultType,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  projects: { id: string; name: string }[]
  note: Note | null
  defaultType: NoteType
  onSaved: (note: Note) => void
  onDeleted: (noteId: string) => void
}) {
  const isEditing = note !== null
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [type, setType] = useState<NoteType>(defaultType)
  const [projectId, setProjectId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmingDelete(false)
    if (note) {
      setTitle(note.title)
      setBody(note.body)
      setType(note.type)
      setProjectId(note.project_id ?? "")
    } else {
      setTitle("")
      setBody("")
      setType(defaultType)
      setProjectId("")
    }
  }, [open, note, defaultType])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError("Title is required.")
      return
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateNote(note!.id, { title, body, type, projectId: projectId || null })
        : await createNote({ workspaceId, projectId: projectId || null, type, title, body })

      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved(result.note)
      onOpenChange(false)
    })
  }

  function handleDelete() {
    if (!note) return
    startTransition(async () => {
      const result = await deleteNote(note.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onDeleted(note.id)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit note" : "New note"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="note-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="note-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="note-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="note-type"
                value={type}
                onChange={(event) => setType(event.target.value as NoteType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="note-project" className="text-sm font-medium">
                Project
              </label>
              <select
                id="note-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="note-body" className="text-sm font-medium">
              Body
            </label>
            <Textarea
              id="note-body"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Markdown supported…"
            />
            {body && (
              <div className="rounded-md border border-border bg-secondary/30 p-2 text-sm [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{body}</ReactMarkdown>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {isEditing &&
              (confirmingDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={pending}
                >
                  Confirm delete
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </Button>
              ))}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
