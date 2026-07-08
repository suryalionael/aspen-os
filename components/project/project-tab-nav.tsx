"use client"

import Link from "next/link"

export function ProjectTabNav({
  workspaceSlug,
  projectId,
  activeTab,
}: {
  workspaceSlug: string
  projectId: string
  activeTab: "tasks" | "files"
}) {
  const tabs = [
    { id: "tasks" as const, label: "Tasks", href: `/${workspaceSlug}/${projectId}` },
    { id: "files" as const, label: "Files", href: `/${workspaceSlug}/${projectId}/files` },
  ]

  return (
    <nav className="mt-3 flex gap-4">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`border-b-2 pb-1 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
