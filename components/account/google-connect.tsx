"use client"

import { useState, useTransition } from "react"
import Image from "next/image"

import { getGoogleAuthUrl, disconnectGoogle } from "@/lib/google/actions"
import type { GoogleConnectionStatus } from "@/lib/google/actions"
import { Button } from "@/components/ui/button"

export function GoogleConnect({
  status,
}: {
  status: GoogleConnectionStatus
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleConnect() {
    setError(null)
    startTransition(async () => {
      try {
        const url = await getGoogleAuthUrl()
        window.location.href = url
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to connect. Check that Google OAuth is configured."
        )
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectGoogle()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {status.connected ? (
        <>
          <div className="flex items-center gap-3">
            {status.photoUrl && (
              <Image
                src={status.photoUrl}
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              {status.displayName && (
                <p className="truncate text-sm font-medium">{status.displayName}</p>
              )}
              <p className="truncate text-xs text-muted-foreground">{status.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            {isPending ? "Disconnecting…" : "Disconnect Google account"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Connect your Google account to access Drive files from within Aspen OS.
          </p>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleConnect}
            disabled={isPending}
          >
            {isPending ? "Redirecting…" : "Connect Google account"}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
