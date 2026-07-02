"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[ProjectBoard]", error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-medium text-foreground">Couldn&apos;t load this project</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        {error.message ?? "Something went wrong while loading the board."}
      </p>
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
