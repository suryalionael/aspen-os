import type { Toast } from "@/lib/hooks/use-toasts"

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="rounded-md bg-foreground px-3 py-2 text-sm text-background shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
