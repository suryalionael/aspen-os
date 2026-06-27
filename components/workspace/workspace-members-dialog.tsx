"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  changeMemberRole,
  createInvite,
  getPendingInvites,
  getWorkspaceMembers,
  leaveWorkspace,
  removeMember,
  revokeInvite,
  transferOwnership,
  type WorkspaceInvite,
  type WorkspaceMember,
} from "@/lib/actions/workspaces"

function inviteStatus(invite: WorkspaceInvite): string {
  if (invite.accepted_at) return "Accepted"
  if (invite.declined_at) return "Declined"
  if (invite.revoked_at) return "Revoked"
  return "Pending"
}

export function WorkspaceMembersDialog({
  workspaceId,
  currentUserRole,
}: {
  workspaceId: string
  currentUserRole: "owner" | "admin" | "member"
}) {
  const isOwner = currentUserRole === "owner"
  const isAdminOrOwner = isOwner || currentUserRole === "admin"

  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [inviteEmail, setInviteEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    // Guards against React StrictMode's double-invoked effects in
    // development — see the same fix in TaskChecklist/TaskLabelPicker.
    let active = true
    setLoading(true)
    Promise.all([
      getWorkspaceMembers(workspaceId),
      isAdminOrOwner ? getPendingInvites(workspaceId) : null,
    ]).then(([membersResult, invitesResult]) => {
      if (!active) return
      if (membersResult && "success" in membersResult) {
        setMembers(membersResult.members)
        setCurrentUserId(membersResult.currentUserId)
      }
      if (invitesResult && "success" in invitesResult) {
        setInvites(invitesResult.invites)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, workspaceId, isAdminOrOwner])

  function handleRemove(member: WorkspaceMember) {
    setError(null)
    startTransition(async () => {
      const result = await removeMember(workspaceId, member.user_id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setMembers((previous) => previous.filter((m) => m.user_id !== member.user_id))
    })
  }

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveWorkspace(workspaceId)
      if ("success" in result) {
        router.push("/workspaces/new")
      }
    })
  }

  function handleRoleChange(member: WorkspaceMember, role: "admin" | "member") {
    setError(null)
    startTransition(async () => {
      const result = await changeMemberRole(workspaceId, member.user_id, role)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setMembers((previous) =>
        previous.map((m) => (m.user_id === member.user_id ? { ...m, role } : m))
      )
    })
  }

  function handleTransferOwnership(member: WorkspaceMember) {
    setError(null)
    startTransition(async () => {
      const result = await transferOwnership(workspaceId, member.user_id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      router.refresh()
      setOpen(false)
    })
  }

  function handleCreateInvite() {
    setError(null)
    startTransition(async () => {
      const result = await createInvite(workspaceId, inviteEmail)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setInvites((previous) => [result.invite, ...previous])
      setInviteEmail("")
    })
  }

  function handleRevokeInvite(invite: WorkspaceInvite) {
    startTransition(async () => {
      const result = await revokeInvite(invite.id)
      if ("success" in result) {
        setInvites((previous) =>
          previous.map((existing) =>
            existing.id === invite.id
              ? { ...existing, revoked_at: new Date().toISOString() }
              : existing
          )
        )
      }
    })
  }

  function handleCopyLink(invite: WorkspaceInvite) {
    const url = `${window.location.origin}/invite/${invite.token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(invite.id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Members
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workspace members</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li
                  key={member.user_id}
                  data-testid="member-row"
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <span>{member.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {member.user_id === currentUserId ? (
                      <Button size="sm" variant="outline" onClick={handleLeave}>
                        Leave
                      </Button>
                    ) : (
                      isOwner &&
                      member.role !== "owner" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleRoleChange(
                                member,
                                member.role === "admin" ? "member" : "admin"
                              )
                            }
                          >
                            {member.role === "admin" ? "Make member" : "Make admin"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTransferOwnership(member)}
                          >
                            Make owner
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemove(member)}
                          >
                            Remove
                          </Button>
                        </>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {isAdminOrOwner && (
              <div className="border-t border-border pt-3">
                <h3 className="mb-2 text-sm font-semibold">Invite someone</h3>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="email@example.com (optional)"
                    aria-label="Invite email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={handleCreateInvite}>
                    Create invite link
                  </Button>
                </div>

                {invites.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">
                      Pending invitations
                    </h4>
                    <ul className="flex flex-col gap-2">
                      {invites.map((invite) => (
                        <li
                          key={invite.id}
                          data-testid="invite-row"
                          className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span>{invite.invited_email ?? "(no email)"}</span>
                            <span className="text-muted-foreground">
                              {inviteStatus(invite)}
                            </span>
                          </div>
                          {!invite.revoked_at && !invite.declined_at && (
                            <>
                              <p className="break-all rounded-md border border-border bg-secondary/30 p-1.5">
                                {typeof window !== "undefined"
                                  ? `${window.location.origin}/invite/${invite.token}`
                                  : `/invite/${invite.token}`}
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopyLink(invite)}
                                >
                                  {copiedId === invite.id ? "Copied!" : "Copy link"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRevokeInvite(invite)}
                                >
                                  Revoke
                                </Button>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
