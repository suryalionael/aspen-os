import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

// The workspace-by-slug layout and its page both need the same row
// within the same request (the layout resolves it for the sidebar/nav,
// the page resolves it again for its own data) — without React's
// request-scoped cache(), that's two round-trips to Postgres for
// identical data on every dashboard page load. cache() memoizes by
// arguments for the lifetime of a single render pass, so the second call
// reuses the first's result instead of re-querying.
export const getWorkspaceBySlug = cache(async (slug: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("workspaces")
    .select("id, name, slug, description, logo_url, default_timezone, archived_at")
    .eq("slug", slug)
    .maybeSingle()
  return data
})

// The workspace layout fetches projects (with favorites for the sidebar),
// and every dashboard page fetches the same projects again (with different
// SELECT columns). React.cache() deduplicates by arguments, so the second
// call returns the first's result instead of re-querying, saving ~170ms
// per page render. The superset SELECT covers all consumers.
export const getProjectsForWorkspace = cache(async (workspaceId: string) => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("projects")
    .select("id, name, due_date, project_favorites(user_id)")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
  return data ?? []
})
