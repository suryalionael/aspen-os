"use client"

import { ChevronRight, Home } from "lucide-react"

type Breadcrumb = { id: string; name: string }

export function DriveBreadcrumbs({
  items,
  onNavigate,
}: {
  items: Breadcrumb[]
  onNavigate: (folderId: string) => void
}) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate("root")}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        <span>My Drive</span>
      </button>
      {items.map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <button
            type="button"
            onClick={() => onNavigate(item.id)}
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            {item.name}
          </button>
        </span>
      ))}
    </nav>
  )
}
