import { createClient } from "@/lib/supabase/server"

import type {
  AspenMember,
  AspenPermission,
  AspenProjectRef,
  AspenRole,
  SelectedObject,
  UserContext,
} from "@/lib/ai/types"

const PERMISSIONS_BY_ROLE: Record<AspenRole, AspenPermission[]> = {
  owner: [
    "view_workspace",
    "view_all_tasks",
    "manage_tasks",
    "manage_projects",
    "manage_members",
    "manage_workspace",
    "view_analytics",
    "manage_drive",
  ],
  admin: [
    "view_workspace",
    "view_all_tasks",
    "manage_tasks",
    "manage_projects",
    "manage_members",
    "view_analytics",
    "manage_drive",
  ],
  member: [
    "view_workspace",
    "view_all_tasks",
    "manage_tasks",
    "view_analytics",
    "manage_drive",
  ],
}

function deriveFullName(
  metadata: Record<string, unknown> | undefined,
  email: string | null
): string {
  const fromMeta =
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof metadata?.name === "string" && metadata.name)
  if (fromMeta) return fromMeta
  if (email) return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return "there"
}

function nameFromEmail(email: string | null): string {
  if (!email) return "Member"
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

type WorkspaceMemberRow = {
  user_id: string
  email: string
  role: string
}

/**
 * Resolves the full personal + workspace context Aspen reasons over:
 * the current user, their role, derived permissions, workspace, members,
 * the project list, the currently open project, and the active page.
 *
 * This is the personalization layer — everything downstream ("me", "my",
 * "our", permissions, project awareness) reads from here.
 */
export async function resolveUserContext(
  workspaceId: string,
  userId: string,
  opts?: {
    projectId?: string | null
    page?: string | null
    selectedTaskId?: string | null
    selectedNoteId?: string | null
    selectedMeetingId?: string | null
    selectedMemberId?: string | null
    selectedSprintId?: string | null
  }
): Promise<UserContext> {
  const supabase = await createClient()

  const [
    { data: workspace },
    { data: sessionData },
    { data: memberRows },
    { data: projects },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, slug")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase.auth.getUser(),
    supabase
      .rpc("get_workspace_members_with_email", { p_workspace_id: workspaceId })
      .returns<WorkspaceMemberRow[]>(),
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
  ])

  const user = sessionData.user
  const email = user?.email ?? null
  const fullName = deriveFullName(user?.user_metadata as Record<string, unknown> | undefined, email)

  const memberList = (memberRows ?? []) as WorkspaceMemberRow[]
  const members: AspenMember[] = memberList.map((m) => ({
    id: m.user_id,
    email: m.email,
    fullName: nameFromEmail(m.email),
    role: (m.role as AspenRole) ?? "member",
  }))

  const myRow = memberList.find((m) => m.user_id === userId)
  const role: AspenRole = (myRow?.role as AspenRole) ?? "member"

  const projectRef: AspenProjectRef = opts?.projectId
    ? await resolveProject(supabase, opts.projectId)
    : null

  const selected = await resolveSelected(supabase, members, opts)

  return {
    user: {
      id: userId,
      email: email ?? "",
      fullName,
      role,
    },
    permissions: PERMISSIONS_BY_ROLE[role],
    workspace: {
      id: workspaceId,
      name: workspace?.name ?? "this workspace",
      slug: workspace?.slug ?? "",
    },
    members,
    projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name })),
    project: projectRef,
    page: opts?.page ?? null,
    selected,
  }
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<AspenProjectRef> {
  const { data } = await supabase
    .from("projects")
    .select("id, name, status, due_date, description")
    .eq("id", projectId)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    name: data.name,
    status: data.status ?? null,
    dueDate: data.due_date ?? null,
    description: data.description ?? null,
  }
}

export function hasPermission(
  ctx: UserContext,
  permission: AspenPermission
): boolean {
  return ctx.permissions.includes(permission)
}

export function memberById(
  ctx: UserContext,
  id: string | null
): AspenMember | undefined {
  if (!id) return undefined
  return ctx.members.find((m) => m.id === id)
}

export function memberEmailById(
  ctx: UserContext,
  id: string | null
): string | undefined {
  return memberById(ctx, id)?.email
}

async function resolveSelected(
  supabase: Awaited<ReturnType<typeof createClient>>,
  members: AspenMember[],
  opts?: {
    selectedTaskId?: string | null
    selectedNoteId?: string | null
    selectedMeetingId?: string | null
    selectedMemberId?: string | null
    selectedSprintId?: string | null
  }
): Promise<SelectedObject | null> {
  if (opts?.selectedTaskId) {
    const { data } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("id", opts.selectedTaskId)
      .maybeSingle()
    if (data) return { kind: "task", id: data.id, title: data.title }
  }
  if (opts?.selectedNoteId) {
    const { data } = await supabase
      .from("notes")
      .select("id, title")
      .eq("id", opts.selectedNoteId)
      .maybeSingle()
    if (data) return { kind: "note", id: data.id, title: data.title }
  }
  if (opts?.selectedMeetingId) {
    const { data } = await supabase
      .from("meetings")
      .select("id, title")
      .eq("id", opts.selectedMeetingId)
      .maybeSingle()
    if (data) return { kind: "meeting", id: data.id, title: data.title }
  }
  if (opts?.selectedMemberId) {
    const m = members.find((x) => x.id === opts.selectedMemberId)
    if (m) return { kind: "member", id: m.id, title: m.fullName }
  }
  if (opts?.selectedSprintId) {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", opts.selectedSprintId)
      .maybeSingle()
    if (data) return { kind: "sprint", id: data.id, title: data.name }
  }
  return null
}
