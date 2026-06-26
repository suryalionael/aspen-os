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
import {
  createInvite,
  getActiveInvite,
  getWorkspaceMembers,
  leaveWorkspace,
  removeMember,
  revokeInvite,
  type WorkspaceInvite,
  type WorkspaceMember,
} from "@/lib/actions/workspaces"

export function WorkspaceMembersDialog({
  workspaceId,
  isOwner,
}: {
  workspaceId: string
  isOwner: boolean
}) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [invite, setInvite] = useState<WorkspaceInvite | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
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
      isOwner ? getActiveInvite(workspaceId) : null,
    ]).then(([membersResult, inviteResult]) => {
      if (!active) return
      if (membersResult && "success" in membersResult) {
        setMembers(membersResult.members)
        setCurrentUserId(membersResult.currentUserId)
      }
      if (inviteResult && "success" in inviteResult) {
        setInvite(inviteResult.invite)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [open, workspaceId, isOwner])

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

  function handleCreateInvite() {
    setError(null)
    startTransition(async () => {
      const result = await createInvite(workspaceId)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setInvite(result.invite)
    })
  }

  function handleRevokeInvite() {
    if (!invite) return
    startTransition(async () => {
      const result = await revokeInvite(invite.id)
      if ("success" in result) {
        setInvite(null)
      }
    })
  }

  function handleCopyLink() {
    if (!invite) return
    const url = `${window.location.origin}/invite/${invite.token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Members
        </Button>
      </DialogTrigger>
      <DialogContent>
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
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <div>
                    <span>{member.email}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {member.role}
                    </span>
                  </div>
                  {member.user_id === currentUserId ? (
                    <Button size="sm" variant="outline" onClick={handleLeave}>
                      Leave
                    </Button>
                  ) : (
                    isOwner && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemove(member)}
                      >
                        Remove
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {isOwner && (
              <div className="border-t border-border pt-3">
                <h3 className="mb-2 text-sm font-semibold">Invite link</h3>
                {invite ? (
                  <div className="flex flex-col gap-2">
                    <p className="break-all rounded-md border border-border bg-secondary/30 p-2 text-xs">
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/invite/${invite.token}`
                        : `/invite/${invite.token}`}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleCopyLink}>
                        {copied ? "Copied!" : "Copy link"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleRevokeInvite}>
                        Revoke
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleCreateInvite}>
                    Create invite link
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
