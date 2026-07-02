"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { slugify, withRetrySuffix } from "@/lib/utils/slug"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/actions/audit"

export type CreateWorkspaceState = { error: string } | undefined

const MAX_SLUG_ATTEMPTS = 5
const POSTGRES_UNIQUE_VIOLATION = "23505"

export async function createWorkspace(
  _prevState: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const name = String(formData.get("name") ?? "").trim()

  if (!name) {
    return { error: "Workspace name is required." }
  }

  const supabase = await createClient()
  const baseSlug = slugify(name)
  let slug = baseSlug

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("create_workspace_with_owner", {
      workspace_name: name,
      workspace_slug: slug,
    })

    if (!error && data) {
      await seedOnboarding(supabase, data.id, data.slug)
      redirect(`/${data.slug}`)
    }

    // Only retry on a slug collision (DEC-018 / audit M-4) — any other
    // error should surface immediately, not loop silently.
    if (error?.code !== POSTGRES_UNIQUE_VIOLATION) {
      return { error: error?.message ?? "Could not create workspace." }
    }

    slug = withRetrySuffix(baseSlug)
  }

  return {
    error:
      "Could not generate a unique workspace URL after several attempts. Please try a different name.",
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// Seeded once per new workspace so the user lands on a populated board
// rather than a blank slate. Tasks are lightweight placeholders they can
// rename or delete immediately — not tutorials that block progress.
async function seedOnboarding(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceSlug: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: project } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: "Getting Started",
      description: "A sample project to help you explore Aspen OS. Rename or delete it whenever you're ready.",
      created_by: user.id,
    })
    .select("id")
    .single()

  if (!project) return

  const sampleTasks = [
    { title: "Invite your team members", status: "todo", priority: "high", position: 1 },
    { title: "Create your first real project", status: "todo", priority: "medium", position: 2 },
    { title: "Set up your workspace profile", status: "in_progress", priority: "low", position: 3 },
    { title: "Explore the Calendar and Notes tabs", status: "backlog", priority: null, position: 4 },
  ]

  await supabase.from("tasks").insert(
    sampleTasks.map((task) => ({
      project_id: project.id,
      created_by: user.id,
      ...task,
    }))
  )
}

export type WorkspaceMember = {
  user_id: string
  email: string
  role: string
  joined_at: string
}

export async function getWorkspaceMembers(workspaceId: string): Promise<
  | { error: string }
  | { success: true; members: WorkspaceMember[]; currentUserId: string | null }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, members: data ?? [], currentUserId: user?.id ?? null }
}

export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })
  const removedEmail = (members ?? []).find(
    (member: { user_id: string; email: string }) => member.user_id === userId
  )?.email

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: "member.removed",
      targetLabel: removedEmail ?? null,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function leaveWorkspace(
  workspaceId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to leave a workspace." }
  }

  // Logged before the delete, not after — once this user's own membership
  // row is gone, audit_log's INSERT policy (is_workspace_member) would
  // reject an entry from them for this workspace.
  await logAuditEvent(supabase, {
    workspaceId,
    actorId: user.id,
    action: "member.left",
    targetLabel: user.email ?? null,
  })

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export type WorkspaceInvite = {
  id: string
  token: string
  invited_email: string | null
  created_at: string
  revoked_at: string | null
  accepted_at: string | null
  declined_at: string | null
}

// "Pending invitations" per Phase I — returns every invite for this
// workspace (not just unresolved ones), since the list is also how an
// admin/owner sees that an invite was accepted or declined, not only
// whether a link is still live.
export async function getPendingInvites(
  workspaceId: string
): Promise<{ error: string } | { success: true; invites: WorkspaceInvite[] }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, token, invited_email, created_at, revoked_at, accepted_at, declined_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: error.message }
  }

  return { success: true, invites: data ?? [] }
}

export async function createInvite(
  workspaceId: string,
  invitedEmail?: string
): Promise<{ error: string } | { success: true; invite: WorkspaceInvite }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create an invite." }
  }

  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      created_by: user.id,
      invited_email: invitedEmail?.trim() || null,
    })
    .select("id, token, invited_email, created_at, revoked_at, accepted_at, declined_at")
    .single()

  if (error || !data) {
    return {
      error:
        error?.message ??
        "Could not create an invite link. Only workspace owners and admins can invite people.",
    }
  }

  await logAuditEvent(supabase, {
    workspaceId,
    actorId: user.id,
    action: "invitation.created",
    targetLabel: data.invited_email,
  })

  revalidatePath("/", "layout")
  return { success: true, invite: data }
}

export async function revokeInvite(
  inviteId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .select("workspace_id, invited_email")
    .single()

  if (error) {
    return { error: error.message }
  }

  if (user && data) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "invitation.revoked",
      targetLabel: data.invited_email,
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function declineInvite(
  token: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  // No audit_log entry here, deliberately: the decliner isn't (and never
  // becomes) a workspace member, and audit_log's INSERT policy requires
  // is_workspace_member — same membership-gated posture as task_activity.
  // The invite's own declined_at column already records this.
  const { error } = await supabase.rpc("decline_workspace_invite", { p_token: token })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function changeMemberRole(
  workspaceId: string,
  userId: string,
  role: "admin" | "member"
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })
  const targetEmail = (members ?? []).find(
    (member: { user_id: string; email: string }) => member.user_id === userId
  )?.email

  const { error } = await supabase.rpc("change_member_role", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  })

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: "member.role_changed",
      targetLabel: targetEmail ?? null,
      metadata: { role },
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function transferOwnership(
  workspaceId: string,
  newOwnerId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase.rpc("get_workspace_members_with_email", {
    p_workspace_id: workspaceId,
  })
  const newOwnerEmail = (members ?? []).find(
    (member: { user_id: string; email: string }) => member.user_id === newOwnerId
  )?.email

  const { error } = await supabase.rpc("transfer_workspace_ownership", {
    p_workspace_id: workspaceId,
    p_new_owner_id: newOwnerId,
  })

  if (error) {
    return { error: error.message }
  }

  if (user) {
    await logAuditEvent(supabase, {
      workspaceId,
      actorId: user.id,
      action: "member.role_changed",
      targetLabel: newOwnerEmail ?? null,
      metadata: { role: "owner" },
    })
  }

  revalidatePath("/", "layout")
  return { success: true }
}

export async function getInviteWorkspaceName(
  token: string
): Promise<{ error: string } | { success: true; workspaceName: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("get_invite_workspace_name", {
    p_token: token,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, workspaceName: data }
}

export async function joinWorkspaceViaInvite(
  token: string
): Promise<{ error: string } | { success: true; workspaceSlug: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.rpc("join_workspace_via_invite", {
    p_token: token,
  })

  if (error || !data) {
    return { error: error?.message ?? "Could not join workspace." }
  }

  // Safe to log now, not before: the RPC's own INSERT into
  // workspace_members already committed, so this caller now satisfies
  // audit_log's is_workspace_member INSERT check.
  if (user) {
    await logAuditEvent(supabase, {
      workspaceId: data.workspace_id,
      actorId: user.id,
      action: "invitation.accepted",
      targetLabel: user.email ?? null,
    })
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", data.workspace_id)
    .single()

  if (!workspace) {
    return { error: "Joined, but could not find the workspace." }
  }

  return { success: true, workspaceSlug: workspace.slug }
}
