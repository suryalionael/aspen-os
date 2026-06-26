"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { joinWorkspaceViaInvite } from "@/lib/actions/workspaces"

export function JoinWorkspaceButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleJoin() {
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

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={handleJoin} disabled={pending}>
        {pending ? "Joining…" : "Join workspace"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
