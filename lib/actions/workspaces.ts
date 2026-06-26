"use server"

import { redirect } from "next/navigation"

import { slugify, withRetrySuffix } from "@/lib/utils/slug"
import { createClient } from "@/lib/supabase/server"

export type CreateWorkspaceState = { error: string } | undefined

const MAX_SLUG_ATTEMPTS = 5
const POSTGRES_UNIQUE_VIOLATION = "23505"

export async function createWorkspace(
  _prevState: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const name = String(formData.get("name") ?? "").trim()

  if (!name) {
    return { error: "Workspace name is required." }
  }

  const supabase = await createClient()
  const baseSlug = slugify(name)
  let slug = baseSlug

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("create_workspace_with_owner", {
      workspace_name: name,
      workspace_slug: slug,
    })

    if (!error && data) {
      redirect(`/${data.slug}`)
    }

    // Only retry on a slug collision (DEC-018 / audit M-4) — any other
    // error should surface immediately, not loop silently.
    if (error?.code !== POSTGRES_UNIQUE_VIOLATION) {
      return { error: error?.message ?? "Could not create workspace." }
    }

    slug = withRetrySuffix(baseSlug)
  }

  return {
    error:
      "Could not generate a unique workspace URL after several attempts. Please try a different name.",
  }
}
