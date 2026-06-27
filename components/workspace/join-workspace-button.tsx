"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { declineInvite, joinWorkspaceViaInvite } from "@/lib/actions/workspaces"

export function JoinWorkspaceButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const result = await joinWorkspaceViaInvite(token)
      if ("error" in result) {
        setError(result.error)
        return
      }
      router.push(`/${result.workspaceSlug}`)
    })
  }

  function handleDecline() {
    setError(null)
    startTransition(async () => {
      const result = await declineInvite(token)
      if ("error" in result) {
        setError(result.error)
        return
      }
      setDeclined(true)
    })
  }

  if (declined) {
    return <p className="text-sm text-muted-foreground">Invite declined.</p>
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-2">
        <Button onClick={handleAccept} disabled={pending}>
          {pending ? "Joining…" : "Accept"}
        </Button>
        <Button onClick={handleDecline} disabled={pending} variant="outline">
          Decline
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
