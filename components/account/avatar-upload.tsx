"use client"

import Image from "next/image"
import { useState, useTransition } from "react"

import { removeAvatar, uploadAvatar } from "@/lib/actions/profile"
import { Button } from "@/components/ui/button"

export function AvatarUpload({ initialAvatarUrl }: { initialAvatarUrl: string | null }) {
  const [, startTransition] = useTransition()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Calling uploadAvatar directly (not via <form action={fn}> + useActionState)
  // matches the same fix applied to TaskAttachments — the form action pattern
  // silently fails for file inputs inside Radix Portals, and the 1 MB body
  // size limit triggered the global error boundary before the action code
  // even ran for larger images.
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("avatar", file)
    setUploadError(null)
    setUploading(true)
    startTransition(async () => {
      const result = await uploadAvatar(undefined, formData)
      setUploading(false)
      if (!result) return
      if ("error" in result) {
        setUploadError(result.error)
      } else if ("success" in result) {
        setAvatarUrl(result.avatarUrl)
      }
    })
  }

  function handleRemove() {
    setRemoving(true)
    startTransition(async () => {
      await removeAvatar()
      setAvatarUrl(null)
      setRemoving(false)
    })
  }

  return (
    <div className="flex items-center gap-4">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={56}
          height={56}
          className="size-14 rounded-full object-cover"
        />
      ) : (
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-sm text-muted-foreground">
          No photo
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            aria-label="Avatar"
            onChange={handleFileChange}
            className="text-sm"
          />
          {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
        </div>
        {avatarUrl && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={removing}>
            {removing ? "Removing…" : "Remove photo"}
          </Button>
        )}
        {uploadError && (
          <p role="alert" className="text-sm text-destructive">
            {uploadError}
          </p>
        )}
      </div>
    </div>
  )
}
