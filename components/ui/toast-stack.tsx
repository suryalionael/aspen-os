import type { Toast } from "@/lib/hooks/use-toasts"

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="toast-item rounded-lg bg-foreground/95 px-3.5 py-2.5 text-sm font-medium text-background shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
