"use client"

import { useCallback, useState } from "react"

export type Toast = { id: string; message: string }

// Deliberately not a global context — DEC-023 scopes Phase E's
// notifications to ephemeral, session-local toasts triggered directly by
// a Realtime subscription, not a persisted/markable-read system. Each
// consumer (the board, the comments list) owns its own toast queue.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = useCallback((message: string) => {
    const id = crypto.randomUUID()
    setToasts((previous) => [...previous, { id, message }])
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  return { toasts, pushToast }
}
