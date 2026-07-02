import { type ReactNode } from "react"

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <span className="text-4xl">{icon}</span>}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
