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
