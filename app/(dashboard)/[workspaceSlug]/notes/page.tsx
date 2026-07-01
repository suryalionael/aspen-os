import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getWorkspaceBySlug } from "@/lib/data/workspace"
import { getWorkspaceNotes } from "@/lib/actions/notes"
import { NotesClient } from "@/components/notes/notes-client"

export default async function WorkspaceNotesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  const supabase = await createClient()

  const workspace = await getWorkspaceBySlug(workspaceSlug)
  if (!workspace) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const timezone =
    typeof user?.user_metadata?.timezone === "string" ? user.user_metadata.timezone : null

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true })

  const notesResult = await getWorkspaceNotes(workspace.id)

  return (
    <NotesClient
      workspaceId={workspace.id}
      projects={projects ?? []}
      initialNotes={"success" in notesResult ? notesResult.notes : []}
      timezone={timezone}
    />
  )
}
