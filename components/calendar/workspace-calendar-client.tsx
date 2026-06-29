"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { CalendarView } from "@/components/calendar/calendar-view"
import { MeetingDialog } from "@/components/calendar/meeting-dialog"
import { TaskDetailDialog } from "@/components/kanban/task-detail-dialog"
import { updateTaskDueDate, type EditedTask } from "@/lib/actions/tasks"
import { rescheduleMeeting, type Meeting } from "@/lib/actions/meetings"
import type { WorkspaceMember } from "@/lib/actions/workspaces"

type CalendarTaskInput = {
  id: string
  title: string
  due_date: string | null
  priority: string | null
  assignee_id: string | null
}

type MilestoneInput = {
  id: string
  title: string
  due_date: string | null
}

function shiftIsoToDate(iso: string, dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(iso)
  date.setFullYear(year, month - 1, day)
  return date.toISOString()
}

export function WorkspaceCalendarClient({
  workspaceId,
  workspaceSlug,
  initialTasks,
  initialMeetings,
  milestoneProjects,
  members,
  projects,
}: {
  workspaceId: string
  workspaceSlug: string
  initialTasks: CalendarTaskInput[]
  initialMeetings: Meeting[]
  milestoneProjects: MilestoneInput[]
  members: WorkspaceMember[]
  projects: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [meetings, setMeetings] = useState(initialMeetings)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null)

  function handleDueDateChange(taskId: string, dueDate: string) {
    setTasks((previous) =>
      previous.map((task) => (task.id === taskId ? { ...task, due_date: dueDate } : task))
    )
    updateTaskDueDate(taskId, dueDate)
  }

  function handleTaskUpdated(task: EditedTask) {
    setTasks((previous) =>
      previous.map((existing) =>
        existing.id === task.id
          ? { ...existing, title: task.title, due_date: task.due_date, priority: task.priority }
          : existing
      )
    )
  }

  function handleTaskArchiveChange(taskId: string, archivedAt: string | null) {
    if (archivedAt) {
      setTasks((previous) => previous.filter((task) => task.id !== taskId))
      setOpenTaskId(null)
    }
  }

  function handleTaskDeleted(taskId: string) {
    setTasks((previous) => previous.filter((task) => task.id !== taskId))
    setOpenTaskId(null)
  }

  function handleMeetingReschedule(meetingId: string, newDate: string) {
    setMeetings((previous) =>
      previous.map((meeting) =>
        meeting.id === meetingId
          ? {
              ...meeting,
              start_time: shiftIsoToDate(meeting.start_time, newDate),
              end_time: meeting.end_time ? shiftIsoToDate(meeting.end_time, newDate) : null,
            }
          : meeting
      )
    )
    rescheduleMeeting(meetingId, newDate)
  }

  function handleMeetingOpen(meetingId: string) {
    setEditingMeeting(meetings.find((meeting) => meeting.id === meetingId) ?? null)
    setMeetingDialogOpen(true)
  }

  function handleCreateMeeting() {
    setEditingMeeting(null)
    setMeetingDialogOpen(true)
  }

  function handleMeetingSaved(meeting: Meeting) {
    setMeetings((previous) => {
      const exists = previous.some((item) => item.id === meeting.id)
      return exists
        ? previous.map((item) => (item.id === meeting.id ? meeting : item))
        : [...previous, meeting]
    })
  }

  function handleMeetingDeleted(meetingId: string) {
    setMeetings((previous) => previous.filter((meeting) => meeting.id !== meetingId))
  }

  function handleMilestoneOpen(projectId: string) {
    router.push(`/${workspaceSlug}/${projectId}`)
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Calendar</h1>
      <CalendarView
        tasks={tasks}
        meetings={meetings}
        milestones={milestoneProjects}
        onDueDateChange={handleDueDateChange}
        onTaskOpen={setOpenTaskId}
        onMeetingReschedule={handleMeetingReschedule}
        onMeetingOpen={handleMeetingOpen}
        onMilestoneOpen={handleMilestoneOpen}
        onCreateMeeting={handleCreateMeeting}
      />
      <TaskDetailDialog
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={(open) => !open && setOpenTaskId(null)}
        onTaskUpdated={handleTaskUpdated}
        onTaskArchiveChange={handleTaskArchiveChange}
        onTaskDeleted={handleTaskDeleted}
        onLabelsChanged={() => {}}
        onAssigneesChanged={() => {}}
        onChecklistChanged={() => {}}
        onCommentCountChanged={() => {}}
        onAttachmentCountChanged={() => {}}
      />
      <MeetingDialog
        open={meetingDialogOpen}
        onOpenChange={setMeetingDialogOpen}
        workspaceId={workspaceId}
        projects={projects}
        members={members}
        meeting={editingMeeting}
        defaultDate={null}
        onSaved={handleMeetingSaved}
        onDeleted={handleMeetingDeleted}
      />
    </div>
  )
}
