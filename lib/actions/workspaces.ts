"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { slugify, withRetrySuffix } from "@/lib/utils/slug"
import { createClient } from "@/lib/supabase/server"

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

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)

  if (error) {
    return { error: error.message }
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
  created_at: string
  revoked_at: string | null
}

export async function getActiveInvite(
  workspaceId: string
): Promise<{ error: string } | { success: true; invite: WorkspaceInvite | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, token, created_at, revoked_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { error: error.message }
  }

  return { success: true, invite: data }
}

export async function createInvite(
  workspaceId: string
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
    .insert({ workspace_id: workspaceId, created_by: user.id })
    .select("id, token, created_at, revoked_at")
    .single()

  if (error || !data) {
    return {
      error:
        error?.message ??
        "Could not create an invite link. Only the workspace owner can invite people.",
    }
  }

  revalidatePath("/", "layout")
  return { success: true, invite: data }
}

export async function revokeInvite(
  inviteId: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)

  if (error) {
    return { error: error.message }
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

  const { data, error } = await supabase.rpc("join_workspace_via_invite", {
    p_token: token,
  })

  if (error || !data) {
    return { error: error?.message ?? "Could not join workspace." }
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
