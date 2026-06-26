"use client"

import { useRouter } from "next/navigation"

export function WorkspaceSelect({
  workspaces,
}: {
  workspaces: { slug: string; name: string }[]
}) {
  const router = useRouter()

  return (
    <select
      aria-label="Switch workspace"
      defaultValue=""
      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      onChange={(event) => {
        if (event.target.value) {
          router.push(`/${event.target.value}`)
        }
      }}
    >
      <option value="" disabled>
        Switch workspace…
      </option>
      {workspaces.map((workspace) => (
        <option key={workspace.slug} value={workspace.slug}>
          {workspace.name}
        </option>
      ))}
    </select>
  )
}
