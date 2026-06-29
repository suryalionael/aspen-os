"use client"

import { useMemo, useState } from "react"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-secondary-foreground/40",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  urgent: "bg-red-500",
}

type CalendarTask = {
  id: string
  title: string
  due_date: string | null
  priority: string | null
  assignee_id: string | null
}

type CalendarMeeting = {
  id: string
  title: string
  start_time: string
  end_time: string | null
}

type CalendarMilestone = {
  id: string
  title: string
  due_date: string | null
}

// Local Y/M/D formatting throughout — the same reasoning as TaskCard's
// formatDueDate: due_date is a bare "YYYY-MM-DD" string with no time
// component, and round-tripping it through new Date(string).toISOString()
// would shift the calendar date in negative-UTC-offset timezones.
function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - result.getDay())
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function getMonthGrid(referenceDate: Date): Date[] {
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  const lastOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0)
  const gridEnd = startOfWeek(lastOfMonth)
  const days: Date[] = []
  for (let day = gridStart; day <= addDays(gridEnd, 6); day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

function getWeekGrid(referenceDate: Date): Date[] {
  const start = startOfWeek(referenceDate)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

function getDayGrid(referenceDate: Date): Date[] {
  const day = new Date(referenceDate)
  day.setHours(0, 0, 0, 0)
  return [day]
}

function CalendarTaskChip({ task, onOpen }: { task: CalendarTask; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { kind: "task", id: task.id },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      data-testid="calendar-task-chip"
      className={`flex cursor-grab items-center gap-1 truncate rounded bg-secondary px-1 py-0.5 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {task.priority && (
        <span className={`size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? ""}`} />
      )}
      <span className="truncate">{task.title}</span>
    </div>
  )
}

function CalendarMeetingChip({
  meeting,
  onOpen,
}: {
  meeting: CalendarMeeting
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meeting-${meeting.id}`,
    data: { kind: "meeting", id: meeting.id },
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const time = new Date(meeting.start_time).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      data-testid="calendar-meeting-chip"
      className={`flex cursor-grab items-center gap-1 truncate rounded bg-blue-500/15 px-1 py-0.5 text-blue-700 dark:text-blue-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span className="shrink-0">{time}</span>
      <span className="truncate">{meeting.title}</span>
    </div>
  )
}

function CalendarMilestoneChip({
  milestone,
  onOpen,
}: {
  milestone: CalendarMilestone
  onOpen: () => void
}) {
  return (
    <div
      onClick={onOpen}
      data-testid="calendar-milestone-chip"
      className="flex cursor-pointer items-center gap-1 truncate rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-amber-700 dark:text-amber-300"
    >
      <span className="truncate">🚩 {milestone.title}</span>
    </div>
  )
}

function DayCell({
  date,
  isCurrentMonth,
  tasks,
  meetings,
  milestones,
  onTaskOpen,
  onMeetingOpen,
  onMilestoneOpen,
}: {
  date: Date
  isCurrentMonth: boolean
  tasks: CalendarTask[]
  meetings: CalendarMeeting[]
  milestones: CalendarMilestone[]
  onTaskOpen: (taskId: string) => void
  onMeetingOpen: (meetingId: string) => void
  onMilestoneOpen: (milestoneId: string) => void
}) {
  const dateKey = toDateKey(date)
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  const isToday = dateKey === toDateKey(new Date())

  return (
    <div
      ref={setNodeRef}
      data-testid="calendar-day"
      data-date={dateKey}
      className={`flex min-h-24 flex-col gap-1 rounded-md border p-1.5 text-xs ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      } ${isCurrentMonth ? "" : "opacity-50"}`}
    >
      <span className={`font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-1">
        {milestones.map((milestone) => (
          <CalendarMilestoneChip
            key={milestone.id}
            milestone={milestone}
            onOpen={() => onMilestoneOpen(milestone.id)}
          />
        ))}
        {meetings.map((meeting) => (
          <CalendarMeetingChip
            key={meeting.id}
            meeting={meeting}
            onOpen={() => onMeetingOpen(meeting.id)}
          />
        ))}
        {tasks.map((task) => (
          <CalendarTaskChip key={task.id} task={task} onOpen={() => onTaskOpen(task.id)} />
        ))}
      </div>
    </div>
  )
}

export function CalendarView({
  tasks,
  meetings = [],
  milestones = [],
  onDueDateChange,
  onTaskOpen,
  onMeetingReschedule,
  onMeetingOpen,
  onMilestoneOpen,
  onCreateMeeting,
}: {
  tasks: CalendarTask[]
  meetings?: CalendarMeeting[]
  milestones?: CalendarMilestone[]
  onDueDateChange: (taskId: string, dueDate: string) => void
  onTaskOpen: (taskId: string) => void
  onMeetingReschedule?: (meetingId: string, newDate: string) => void
  onMeetingOpen?: (meetingId: string) => void
  onMilestoneOpen?: (milestoneId: string) => void
  onCreateMeeting?: () => void
}) {
  const [mode, setMode] = useState<"month" | "week" | "day">("month")
  const [referenceDate, setReferenceDate] = useState(() => new Date())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const days = useMemo(() => {
    if (mode === "month") return getMonthGrid(referenceDate)
    if (mode === "week") return getWeekGrid(referenceDate)
    return getDayGrid(referenceDate)
  }, [mode, referenceDate])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>()
    for (const task of tasks) {
      if (!task.due_date) continue
      const existing = map.get(task.due_date) ?? []
      existing.push(task)
      map.set(task.due_date, existing)
    }
    return map
  }, [tasks])

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>()
    for (const meeting of meetings) {
      const key = toDateKey(new Date(meeting.start_time))
      const existing = map.get(key) ?? []
      existing.push(meeting)
      map.set(key, existing)
    }
    return map
  }, [meetings])

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, CalendarMilestone[]>()
    for (const milestone of milestones) {
      if (!milestone.due_date) continue
      const existing = map.get(milestone.due_date) ?? []
      existing.push(milestone)
      map.set(milestone.due_date, existing)
    }
    return map
  }, [milestones])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const newDateKey = String(over.id)
    const data = active.data.current as { kind: "task" | "meeting"; id: string } | undefined
    if (!data) return
    if (data.kind === "task") {
      onDueDateChange(data.id, newDateKey)
    } else if (data.kind === "meeting") {
      onMeetingReschedule?.(data.id, newDateKey)
    }
  }

  function navigate(direction: -1 | 1) {
    setReferenceDate((previous) => {
      if (mode === "month") {
        return new Date(previous.getFullYear(), previous.getMonth() + direction, 1)
      }
      if (mode === "week") {
        return addDays(previous, direction * 7)
      }
      return addDays(previous, direction)
    })
  }

  const heading =
    mode === "month"
      ? referenceDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : mode === "week"
        ? `Week of ${startOfWeek(referenceDate).toLocaleDateString()}`
        : referenceDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => navigate(-1)}
            className="rounded-md border border-input px-2 py-1 text-sm hover:bg-secondary"
          >
            ←
          </button>
          <h2 className="min-w-[180px] text-sm font-semibold">{heading}</h2>
          <button
            type="button"
            aria-label="Next"
            onClick={() => navigate(1)}
            className="rounded-md border border-input px-2 py-1 text-sm hover:bg-secondary"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setReferenceDate(new Date())}
            className="rounded-md border border-input px-2 py-1 text-sm hover:bg-secondary"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-1">
          {onCreateMeeting && (
            <button
              type="button"
              onClick={onCreateMeeting}
              className="mr-2 rounded-md border border-input px-2 py-1 text-sm hover:bg-secondary"
            >
              + New meeting
            </button>
          )}
          <button
            type="button"
            aria-pressed={mode === "month"}
            onClick={() => setMode("month")}
            className={`rounded-md border border-input px-2 py-1 text-sm ${
              mode === "month" ? "bg-secondary" : "hover:bg-secondary"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            aria-pressed={mode === "week"}
            onClick={() => setMode("week")}
            className={`rounded-md border border-input px-2 py-1 text-sm ${
              mode === "week" ? "bg-secondary" : "hover:bg-secondary"
            }`}
          >
            Week
          </button>
          <button
            type="button"
            aria-pressed={mode === "day"}
            onClick={() => setMode("day")}
            className={`rounded-md border border-input px-2 py-1 text-sm ${
              mode === "day" ? "bg-secondary" : "hover:bg-secondary"
            }`}
          >
            Day
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={mode === "day" ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-7 gap-1.5"}>
          {mode !== "day" &&
            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="px-1 text-center text-xs font-medium text-muted-foreground">
                {label}
              </div>
            ))}
          {days.map((date) => {
            const dateKey = toDateKey(date)
            return (
              <DayCell
                key={dateKey}
                date={date}
                isCurrentMonth={mode !== "month" || date.getMonth() === referenceDate.getMonth()}
                tasks={tasksByDate.get(dateKey) ?? []}
                meetings={meetingsByDate.get(dateKey) ?? []}
                milestones={milestonesByDate.get(dateKey) ?? []}
                onTaskOpen={onTaskOpen}
                onMeetingOpen={(meetingId) => onMeetingOpen?.(meetingId)}
                onMilestoneOpen={(milestoneId) => onMilestoneOpen?.(milestoneId)}
              />
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}
