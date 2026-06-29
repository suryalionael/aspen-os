"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/actions/audit"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type MeetingAttendee = { user_id: string; email: string }

export type Meeting = {
  id: string
  workspace_id: string
  project_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  attendees: MeetingAttendee[]
}

type MeetingRow = {
  id: string
  workspace_id: string
  project_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  meeting_attendees: { user_id: string }[]
}

async function resolveAttendeeEmails(
  supabase: SupabaseServerClient,
  workspaceId: string,
  rows: MeetingRow[]
): Promise<Meeting[]> {
  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })
  const emailByUserId = new Map<string, string>(
    (members ?? []).map((member: { user_id: string; email: string }) => [
      member.user_id,
      member.email,
    ])
  )
  return rows.map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    attendees: row.meeting_attendees.map((attendee) => ({
      user_id: attendee.user_id,
      email: emailByUserId.get(attendee.user_id) ?? "Unknown",
    })),
  }))
}

export async function getWorkspaceMeetings(
  workspaceId: string
): Promise<{ error: string } | { success: true; meetings: Meeting[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, workspace_id, project_id, title, description, start_time, end_time, meeting_attendees(user_id)"
    )
    .eq("workspace_id", workspaceId)
    .order("start_time", { ascending: true })

  if (error) {
    return { error: error.message }
  }

  const meetings = await resolveAttendeeEmails(supabase, workspaceId, (data ?? []) as MeetingRow[])
  return { success: true, meetings }
}

export async function createMeeting(input: {
  workspaceId: string
  projectId: string | null
  title: string
  description: string | null
  startTime: string
  endTime: string | null
  attendeeIds: string[]
}): Promise<{ error: string } | { success: true; meeting: Meeting }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a meeting." }
  }
  if (!input.title.trim()) {
    return { error: "Meeting title is required." }
  }

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description,
      start_time: input.startTime,
      end_time: input.endTime,
      created_by: user.id,
    })
    .select("id, workspace_id, project_id, title, description, start_time, end_time")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not create meeting." }
  }

  if (input.attendeeIds.length > 0) {
    await supabase
      .from("meeting_attendees")
      .insert(input.attendeeIds.map((userId) => ({ meeting_id: data.id, user_id: userId })))
  }

  await logAuditEvent(supabase, {
    workspaceId: input.workspaceId,
    actorId: user.id,
    action: "meeting.created",
    targetLabel: data.title,
  })

  revalidatePath("/", "layout")
  const meetings = await resolveAttendeeEmails(supabase, input.workspaceId, [
    { ...data, meeting_attendees: input.attendeeIds.map((id) => ({ user_id: id })) },
  ])
  return { success: true, meeting: meetings[0] }
}

export async function updateMeeting(
  meetingId: string,
  input: {
    title: string
    description: string | null
    startTime: string
    endTime: string | null
    projectId: string | null
    attendeeIds: string[]
  }
): Promise<{ error: string } | { success: true; meeting: Meeting }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to edit a meeting." }
  }
  if (!input.title.trim()) {
    return { error: "Meeting title is required." }
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({
      title: input.title.trim(),
      description: input.description,
      start_time: input.startTime,
      end_time: input.endTime,
      project_id: input.projectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", meetingId)
    .select("id, workspace_id, project_id, title, description, start_time, end_time")
    .single()

  if (error || !data) {
    return { error: error?.message ?? "Could not update meeting." }
  }

  // Re-deriving attendees from scratch rather than diffing — meetings have
  // few attendees, so this is simpler than computing add/remove sets.
  await supabase.from("meeting_attendees").delete().eq("meeting_id", meetingId)
  if (input.attendeeIds.length > 0) {
    await supabase
      .from("meeting_attendees")
      .insert(input.attendeeIds.map((userId) => ({ meeting_id: meetingId, user_id: userId })))
  }

  revalidatePath("/", "layout")
  const meetings = await resolveAttendeeEmails(supabase, data.workspace_id, [
    { ...data, meeting_attendees: input.attendeeIds.map((id) => ({ user_id: id })) },
  ])
  return { success: true, meeting: meetings[0] }
}

export async function rescheduleMeeting(
  meetingId: string,
  newDateKey: string
): Promise<{ error: string } | { success: true; startTime: string; endTime: string | null }> {
  const supabase = await createClient()

  const { data: existing, error: fetchError } = await supabase
    .from("meetings")
    .select("start_time, end_time")
    .eq("id", meetingId)
    .single()

  if (fetchError || !existing) {
    return { error: fetchError?.message ?? "Meeting not found." }
  }

  const [year, month, day] = newDateKey.split("-").map(Number)
  function shiftToDate(iso: string): string {
    const shifted = new Date(iso)
    shifted.setFullYear(year, month - 1, day)
    return shifted.toISOString()
  }

  const newStartTime = shiftToDate(existing.start_time)
  const newEndTime = existing.end_time ? shiftToDate(existing.end_time) : null

  const { error } = await supabase
    .from("meetings")
    .update({ start_time: newStartTime, end_time: newEndTime, updated_at: new Date().toISOString() })
    .eq("id", meetingId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/", "layout")
  return { success: true, startTime: newStartTime, endTime: newEndTime }
}

export async function deleteMeeting(
  meetingId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to delete a meeting." }
  }

  const { data: existing } = await supabase
    .from("meetings")
    .select("workspace_id, title")
    .eq("id", meetingId)
    .maybeSingle()

  const { error } = await supabase.from("meetings").delete().eq("id", meetingId)
  if (error) {
    return { error: error.message }
  }

  if (existing) {
    await logAuditEvent(supabase, {
      workspaceId: existing.workspace_id,
      actorId: user.id,
      action: "meeting.deleted",
      targetLabel: existing.title,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}
