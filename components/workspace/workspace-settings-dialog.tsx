"use client"

import { useActionState, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import {
  archiveWorkspace,
  deleteWorkspace,
  exportWorkspaceCsv,
  exportWorkspaceJson,
  removeWorkspaceLogo,
  unarchiveWorkspace,
  updateWorkspaceSettings,
  uploadWorkspaceLogo,
  type WorkspaceSettings,
} from "@/lib/actions/workspace-settings"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const FALLBACK_TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London"]

function getTimezoneOptions(current: string): string[] {
  let zones: string[]
  try {
    zones = Intl.supportedValuesOf("timeZone")
  } catch {
    zones = FALLBACK_TIMEZONES
  }
  return current && !zones.includes(current) ? [current, ...zones] : zones
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function WorkspaceSettingsDialog({
  workspace,
  isOwner,
}: {
  workspace: WorkspaceSettings
  isOwner: boolean
}) {
  const [open, setOpen] = useState(false)
  const [logoUrl, setLogoUrl] = useState(workspace.logoUrl)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const [settingsState, settingsAction, settingsPending] = useActionState(
    updateWorkspaceSettings,
    undefined
  )

  const timezoneOptions = useMemo(
    () => getTimezoneOptions(workspace.defaultTimezone ?? ""),
    [workspace.defaultTimezone]
  )

  const currentLogoUrl = logoUrl

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("workspaceId", workspace.id)
    formData.append("logo", file)
    setLogoError(null)
    setLogoUploading(true)
    startTransition(async () => {
      const result = await uploadWorkspaceLogo(undefined, formData)
      setLogoUploading(false)
      if (!result) return
      if ("error" in result) {
        setLogoError(result.error)
      } else if ("success" in result) {
        setLogoUrl(result.logoUrl)
      }
    })
  }

  function handleRemoveLogo() {
    setLogoUrl(null)
    startTransition(async () => {
      await removeWorkspaceLogo(workspace.id)
    })
  }

  function handleArchiveToggle() {
    setError(null)
    startTransition(async () => {
      const result = workspace.archivedAt
        ? await unarchiveWorkspace(workspace.id)
        : await archiveWorkspace(workspace.id)
      if ("error" in result) {
        setError(result.error)
        return
      }
      if (!workspace.archivedAt) {
        router.push("/workspaces/new")
      } else {
        router.refresh()
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteWorkspace(workspace.id)
      if (result && "error" in result) {
        setError(result.error)
      }
    })
  }

  function handleExportJson() {
    startTransition(async () => {
      const result = await exportWorkspaceJson(workspace.id)
      if ("success" in result) {
        downloadFile(result.json, `${workspace.name}-export.json`, "application/json")
      }
    })
  }

  function handleExportCsv() {
    startTransition(async () => {
      const result = await exportWorkspaceCsv(workspace.id)
      if ("success" in result) {
        downloadFile(result.csv, `${workspace.name}-export.csv`, "text/csv")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Workspace settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Workspace settings</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          {currentLogoUrl ? (
            <Image
              src={currentLogoUrl}
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-md object-cover"
            />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
              Logo
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <input
              type="file"
              name="logo"
              accept="image/*"
              aria-label="Workspace logo"
              onChange={handleLogoChange}
              className="text-sm"
            />
            {logoUploading && (
              <span className="text-xs text-muted-foreground">Uploading…</span>
            )}
            {currentLogoUrl && (
              <Button type="button" size="sm" variant="outline" onClick={handleRemoveLogo}>
                Remove logo
              </Button>
            )}
            {logoError && (
              <p role="alert" className="text-sm text-destructive">
                {logoError}
              </p>
            )}
          </div>
        </div>

        <form action={settingsAction} className="flex flex-col gap-3 border-t border-border pt-3">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-name" className="text-sm font-medium">
              Name
            </label>
            <Input id="workspace-name" name="name" defaultValue={workspace.name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-description" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="workspace-description"
              name="description"
              rows={3}
              defaultValue={workspace.description ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="workspace-timezone" className="text-sm font-medium">
              Default timezone
            </label>
            <select
              id="workspace-timezone"
              name="defaultTimezone"
              defaultValue={workspace.defaultTimezone ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Unset</option>
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          {settingsState && "error" in settingsState && (
            <p role="alert" className="text-sm text-destructive">
              {settingsState.error}
            </p>
          )}
          {settingsState && "success" in settingsState && (
            <p className="text-sm text-muted-foreground">Saved.</p>
          )}
          <Button type="submit" size="sm" disabled={settingsPending} className="self-start">
            {settingsPending ? "Saving…" : "Save"}
          </Button>
        </form>

        <div className="flex gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={handleExportJson}>
            Export as JSON
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            Export as CSV
          </Button>
        </div>

        {isOwner && (
          <div className="flex flex-col gap-2 border-t border-destructive/30 pt-3">
            <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleArchiveToggle}>
                {workspace.archivedAt ? "Restore workspace" : "Archive workspace"}
              </Button>
              {confirmingDelete ? (
                <Button size="sm" variant="destructive" onClick={handleDelete}>
                  Confirm delete
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete workspace
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
