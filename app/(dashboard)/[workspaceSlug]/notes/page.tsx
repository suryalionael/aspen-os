import { notFound } from "next/navigation"
import { Suspense } from "react"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug, getProjectsForWorkspace } from "@/lib/data/workspace"
import { getWorkspaceNotes } from "@/lib/actions/notes"
import { NotesClient } from "@/components/notes/notes-client"

function NotesSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}

async function NotesContent({ workspaceSlug }: { workspaceSlug: string }) {
  const supabase = await createClient()
  const workspace = await getWorkspaceBySlug(workspaceSlug)
  if (!workspace) notFound()

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  const timezone =
    typeof user?.user_metadata?.timezone === "string" ? user.user_metadata.timezone : null

  const projects = await getProjectsForWorkspace(workspace.id)

  const notesResult = await getWorkspaceNotes(workspace.id)

  return (
    <NotesClient
      workspaceId={workspace.id}
      projects={projects}
      initialNotes={"success" in notesResult ? notesResult.notes : []}
      timezone={timezone}
    />
  )
}

export default async function WorkspaceNotesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params

  return (
    <Suspense fallback={<NotesSkeleton />}>
      <NotesContent workspaceSlug={workspaceSlug} />
    </Suspense>
  )
}
