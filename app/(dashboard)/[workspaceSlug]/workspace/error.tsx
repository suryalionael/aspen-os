"use client"

import { AlertCircle } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const message = error.message || "An unexpected error occurred."

  const isDriveApiDisabled =
    message.includes("Google Drive API is not enabled") ||
    message.includes("SERVICE_DISABLED") ||
    message.includes("accessNotConfigured")

  const isConfigMissing = message.includes("not configured")

  const isTableMissing = message.includes("Could not find the table")

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <div>
              <CardTitle>
                {isDriveApiDisabled
                  ? "Google Drive API not enabled"
                  : isConfigMissing
                    ? "Drive not configured"
                    : isTableMissing
                      ? "Database setup required"
                      : "Something went wrong"}
              </CardTitle>
              <CardDescription>
                {isDriveApiDisabled
                  ? "The Google Drive API must be enabled for this application to work."
                  : isConfigMissing
                    ? "The workspace Drive folder is not configured."
                    : isTableMissing
                      ? "The database schema is not fully migrated."
                      : "An error occurred while loading the workspace."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={reset}>
              Try again
            </Button>
            <Link href="/account">
              <Button type="button" variant="outline" size="sm">
                Account settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
