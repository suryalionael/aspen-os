"use client"

import Image from "next/image"
import { useActionState, useRef, useState, useTransition } from "react"

import { removeAvatar, uploadAvatar } from "@/lib/actions/profile"
import { Button } from "@/components/ui/button"

export function AvatarUpload({ initialAvatarUrl }: { initialAvatarUrl: string | null }) {
  const [state, formAction, isPending] = useActionState(uploadAvatar, undefined)
  const [, startTransition] = useTransition()
  const [removing, setRemoving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const avatarUrl =
    state && "success" in state ? state.avatarUrl : removing ? null : initialAvatarUrl

  function handleRemove() {
    setRemoving(true)
    startTransition(async () => {
      await removeAvatar()
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
          unoptimized
          className="size-14 rounded-full object-cover"
        />
      ) : (
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-sm text-muted-foreground">
          No photo
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <form
          ref={formRef}
          action={formAction}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            name="avatar"
            accept="image/*"
            aria-label="Avatar"
            onChange={() => formRef.current?.requestSubmit()}
            className="text-sm"
          />
          {isPending && <span className="text-xs text-muted-foreground">Uploading…</span>}
        </form>
        {avatarUrl && (
          <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
            Remove photo
          </Button>
        )}
        {state && "error" in state && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </div>
  )
}
