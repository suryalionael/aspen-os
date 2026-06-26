import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { WorkspaceSelect } from "@/components/workspace/workspace-select"

// Resolves pre-implementation-audit.md finding X-3: with zero or exactly
// one workspace (the expected case for nearly every Sprint 1 user, since
// there is no invite flow — DEC-011), this renders as a plain label rather
// than a dropdown with zero or one pointless entries.
export async function WorkspaceSwitcher() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("workspaces")
    .select("slug, name")
    .order("created_at", { ascending: true })

  const workspaces = data ?? []

  if (workspaces.length === 0) {
    return (
      <Link
        href="/workspaces/new"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        New workspace
      </Link>
    )
  }

  if (workspaces.length === 1) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{workspaces[0].name}</span>
        <Link
          href="/workspaces/new"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          New workspace
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <WorkspaceSelect workspaces={workspaces} />
      <Link
        href="/workspaces/new"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        New workspace
      </Link>
    </div>
  )
}
