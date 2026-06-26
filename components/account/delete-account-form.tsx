"use client"

import { useActionState } from "react"

import { deleteAccount } from "@/lib/actions/account"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DeleteAccountForm() {
  const [state, formAction, isPending] = useActionState(
    deleteAccount,
    undefined
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="confirmation" className="text-sm font-medium">
          Type <span className="font-mono">DELETE</span> to confirm
        </label>
        <Input
          id="confirmation"
          name="confirmation"
          type="text"
          autoComplete="off"
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={isPending}>
        {isPending ? "Deleting account…" : "Permanently delete my account"}
      </Button>
    </form>
  )
}
