"use client"

import dynamic from "next/dynamic"

const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((mod) => mod.CommandPalette),
  { ssr: false }
)

export function LazyCommandPalette({
  workspaceSlug,
  workspaceId,
  projects,
}: {
  workspaceSlug: string
  workspaceId: string
  projects: { id: string; name: string; isFavorite: boolean }[]
}) {
  return (
    <CommandPalette
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projects={projects}
    />
  )
}
