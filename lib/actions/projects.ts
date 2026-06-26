"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type CreateProjectState = { error: string } | undefined

export async function createProject(
  _prevState: CreateProjectState,
  formData: FormData
): Promise<CreateProjectState> {
  const name = String(formData.get("name") ?? "").trim()
  const workspaceId = String(formData.get("workspaceId") ?? "")
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "")

  if (!name) {
    return { error: "Project name is required." }
  }
  if (!workspaceId || !workspaceSlug) {
    return { error: "Missing workspace context." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "You must be signed in to create a project." }
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ workspace_id: workspaceId, name, created_by: user.id })
    .select("id")
    .single()

  if (error || !project) {
    return { error: error?.message ?? "Could not create project." }
  }

  redirect(`/${workspaceSlug}/${project.id}`)
}
