/**
 * Sprint 3 Phase I: role-permission RLS test (owner/admin/member —
 * migration 023). Run against a real Supabase project — anon key only,
 * no service role — to verify from an actual client's vantage point that
 * the database itself enforces each role's permissions, not just the UI:
 *
 *   1. A plain member cannot create a project (admin+owner only).
 *   2. A plain member cannot create an invite (admin+owner only).
 *   3. Promoting that member to admin (owner-only RPC) lets them do both.
 *   4. An admin cannot remove a member or transfer ownership (owner-only).
 *   5. The owner can transfer ownership, after which roles are swapped
 *      atomically (exactly one owner, before and after).
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:roles
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "../lib/types/database"

try {
  process.loadEnvFile?.(".env.local")
} catch {
  // .env.local may not exist yet (e.g. in CI) — fall through and let the
  // missing-env-var check below fail loudly instead.
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in a real Supabase project before running this script."
  )
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

async function signUp(label: string): Promise<{
  client: SupabaseClient<Database>
  userId: string
}> {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const email = `roles-test-${label}-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw error
  assert(
    !!data.session,
    `${label}: expected an immediate session after sign-up (is email confirmation disabled per DEC-014?)`
  )

  return { client, userId: data.user!.id }
}

async function main() {
  console.log("Creating owner and member, joining member into owner's workspace...")

  const owner = await signUp("owner")
  const member = await signUp("member")

  const { data: workspace, error: workspaceError } = await owner.client.rpc(
    "create_workspace_with_owner",
    {
      workspace_name: "Roles Test Workspace",
      workspace_slug: `roles-test-${Date.now()}`,
    }
  )
  if (workspaceError) throw workspaceError
  if (!workspace) throw new Error("create_workspace_with_owner returned no row")

  const { data: invite, error: inviteError } = await owner.client
    .from("workspace_invites")
    .insert({ workspace_id: workspace.id, created_by: owner.userId })
    .select("token")
    .single()
  if (inviteError) throw inviteError

  const { error: joinError } = await member.client.rpc("join_workspace_via_invite", {
    p_token: invite.token,
  })
  if (joinError) throw joinError

  console.log("Setup complete. Running role-permission assertions...")

  // --- A plain member cannot create a project ---
  const { data: memberProject, error: memberProjectError } = await member.client
    .from("projects")
    .insert({ workspace_id: workspace.id, name: "Member's project", created_by: member.userId })
    .select()
  assert(
    !!memberProjectError && (memberProject ?? []).length === 0,
    "A plain member was able to create a project — admin+owner-only RLS regression"
  )

  // --- A plain member cannot create an invite ---
  const { data: memberInvite, error: memberInviteError } = await member.client
    .from("workspace_invites")
    .insert({ workspace_id: workspace.id, created_by: member.userId })
    .select()
  assert(
    !!memberInviteError && (memberInvite ?? []).length === 0,
    "A plain member was able to create an invite — admin+owner-only RLS regression"
  )

  // --- A plain member cannot promote themselves ---
  const { error: selfPromoteError } = await member.client.rpc("change_member_role", {
    p_workspace_id: workspace.id,
    p_user_id: member.userId,
    p_role: "admin",
  })
  assert(
    !!selfPromoteError,
    "A plain member was able to call change_member_role on themselves — owner-only RPC regression"
  )

  // --- Owner promotes the member to admin ---
  const { error: promoteError } = await owner.client.rpc("change_member_role", {
    p_workspace_id: workspace.id,
    p_user_id: member.userId,
    p_role: "admin",
  })
  if (promoteError) throw promoteError

  const { data: roleAfterPromote } = await owner.client
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspace.id)
    .eq("user_id", member.userId)
    .single()
  assert(
    roleAfterPromote?.role === "admin",
    "Member's role was not updated to 'admin' after change_member_role"
  )

  // --- Now an admin, the same user CAN create a project and an invite ---
  const { data: adminProject, error: adminProjectError } = await member.client
    .from("projects")
    .insert({ workspace_id: workspace.id, name: "Admin's project", created_by: member.userId })
    .select()
    .single()
  assert(
    !adminProjectError && !!adminProject,
    "An admin was blocked from creating a project — admin permissions regression"
  )

  const { error: adminInviteError } = await member.client
    .from("workspace_invites")
    .insert({ workspace_id: workspace.id, created_by: member.userId })
  assert(!adminInviteError, "An admin was blocked from creating an invite — admin permissions regression")

  // --- An admin cannot remove another member (owner-only) ---
  const { data: removedByAdmin } = await member.client
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("user_id", owner.userId)
    .select()
  assert(
    (removedByAdmin ?? []).length === 0,
    "An admin was able to remove the owner from workspace_members — owner-only RLS regression"
  )

  // --- An admin cannot transfer ownership to themselves (owner-only RPC) ---
  const { error: adminTransferError } = await member.client.rpc(
    "transfer_workspace_ownership",
    { p_workspace_id: workspace.id, p_new_owner_id: member.userId }
  )
  assert(
    !!adminTransferError,
    "An admin was able to call transfer_workspace_ownership — owner-only RPC regression"
  )

  // --- The owner CAN transfer ownership; roles swap atomically ---
  const { error: transferError } = await owner.client.rpc("transfer_workspace_ownership", {
    p_workspace_id: workspace.id,
    p_new_owner_id: member.userId,
  })
  if (transferError) throw transferError

  const { data: rolesAfterTransfer } = await owner.client
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspace.id)
  const ownerCount = (rolesAfterTransfer ?? []).filter((row) => row.role === "owner").length
  const newOwnerRole = (rolesAfterTransfer ?? []).find((row) => row.user_id === member.userId)?.role
  const oldOwnerRole = (rolesAfterTransfer ?? []).find((row) => row.user_id === owner.userId)?.role
  assert(ownerCount === 1, `Expected exactly one owner after transfer, found ${ownerCount}`)
  assert(newOwnerRole === "owner", "New owner's role was not set to 'owner' after transfer")
  assert(oldOwnerRole === "admin", "Previous owner's role was not demoted to 'admin' after transfer")

  // --- Sprint 3 Phase M: workspace archive/delete stay owner-only too.
  // After the transfer above, `owner` is now an admin and `member` is now
  // the owner. ---
  const { error: adminArchiveError } = await owner.client.rpc("archive_workspace", {
    p_workspace_id: workspace.id,
  })
  assert(
    !!adminArchiveError,
    "An admin (demoted ex-owner) was able to archive the workspace — owner-only RPC regression"
  )

  const { data: deletedByAdmin } = await owner.client
    .from("workspaces")
    .delete()
    .eq("id", workspace.id)
    .select()
  assert(
    (deletedByAdmin ?? []).length === 0,
    "An admin was able to delete the workspace — owner-only RLS regression"
  )

  const { error: ownerArchiveError } = await member.client.rpc("archive_workspace", {
    p_workspace_id: workspace.id,
  })
  assert(!ownerArchiveError, "The new owner was blocked from archiving their own workspace")

  const { data: deletedByOwner } = await member.client
    .from("workspaces")
    .delete()
    .eq("id", workspace.id)
    .select()
  assert(
    (deletedByOwner ?? []).length === 1,
    "The new owner was blocked from deleting their own workspace"
  )

  console.log("All role-permission assertions passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
