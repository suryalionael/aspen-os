"use client"

import { useEffect, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createMeeting, deleteMeeting, updateMeeting, type Meeting } from "@/lib/actions/meetings"
import type { WorkspaceMember } from "@/lib/actions/workspaces"

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

function toDateInputValue(iso: string): string {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function toTimeInputValue(iso: string): string {
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function combineDateAndTime(dateValue: string, timeValue: string): string {
  return new Date(`${dateValue}T${timeValue}`).toISOString()
}

export function MeetingDialog({
  open,
  onOpenChange,
  workspaceId,
  projects,
  members,
  meeting,
  defaultDate,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  projects: { id: string; name: string }[]
  members: WorkspaceMember[]
  meeting: Meeting | null
  defaultDate: string | null
  onSaved: (meeting: Meeting) => void
  onDeleted: (meetingId: string) => void
}) {
  const isEditing = meeting !== null
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [projectId, setProjectId] = useState("")
  const [dateValue, setDateValue] = useState("")
  const [startTimeValue, setStartTimeValue] = useState("09:00")
  const [endTimeValue, setEndTimeValue] = useState("")
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmingDelete(false)
    if (meeting) {
      setTitle(meeting.title)
      setDescription(meeting.description ?? "")
      setProjectId(meeting.project_id ?? "")
      setDateValue(toDateInputValue(meeting.start_time))
      setStartTimeValue(toTimeInputValue(meeting.start_time))
      setEndTimeValue(meeting.end_time ? toTimeInputValue(meeting.end_time) : "")
      setAttendeeIds(new Set(meeting.attendees.map((attendee) => attendee.user_id)))
    } else {
      setTitle("")
      setDescription("")
      setProjectId("")
      setDateValue(defaultDate ?? toDateInputValue(new Date().toISOString()))
      setStartTimeValue("09:00")
      setEndTimeValue("")
      setAttendeeIds(new Set())
    }
  }, [open, meeting, defaultDate])

  function toggleAttendee(userId: string) {
    setAttendeeIds((previous) => {
      const next = new Set(previous)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!title.trim()) {
      setError("Title is required.")
      return
    }

    const startTime = combineDateAndTime(dateValue, startTimeValue)
    const endTime = endTimeValue ? combineDateAndTime(dateValue, endTimeValue) : null

    startTransition(async () => {
      const result = isEditing
        ? await updateMeeting(meeting!.id, {
            title,
            description: description || null,
            startTime,
            endTime,
            projectId: projectId || null,
            attendeeIds: Array.from(attendeeIds),
          })
        : await createMeeting({
            workspaceId,
            projectId: projectId || null,
            title,
            description: description || null,
            startTime,
            endTime,
            attendeeIds: Array.from(attendeeIds),
          })

      if ("error" in result) {
        setError(result.error)
        return
      }
      onSaved(result.meeting)
      onOpenChange(false)
    })
  }

  function handleDelete() {
    if (!meeting) return
    startTransition(async () => {
      const result = await deleteMeeting(meeting.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      onDeleted(meeting.id)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit meeting" : "New meeting"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="meeting-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="meeting-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="meeting-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="meeting-date" className="text-sm font-medium">
                Date
              </label>
              <Input
                id="meeting-date"
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="meeting-start" className="text-sm font-medium">
                Start
              </label>
              <Input
                id="meeting-start"
                type="time"
                value={startTimeValue}
                onChange={(event) => setStartTimeValue(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="meeting-end" className="text-sm font-medium">
                End
              </label>
              <Input
                id="meeting-end"
                type="time"
                value={endTimeValue}
                onChange={(event) => setEndTimeValue(event.target.value)}
              />
            </div>
          </div>

          {projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meeting-project" className="text-sm font-medium">
                Project
              </label>
              <select
                id="meeting-project"
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
            <span className="text-sm font-medium">Attendees</span>
            <div className="flex flex-wrap gap-1.5">
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground">No workspace members yet</p>
              )}
              {members.map((member) => {
                const selected = attendeeIds.has(member.user_id)
                return (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => toggleAttendee(member.user_id)}
                    title={member.email}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                      selected
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
