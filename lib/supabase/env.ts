// Resolves pre-implementation-audit.md / Phase 1 review finding TECH-001
// (non-null assertions on Supabase env vars): validate at the call site with
// a clear error instead of silently trusting `!` and failing opaquely deep
// inside @supabase/ssr later.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Copy .env.example to .env.local and set it to your Supabase project URL."
    )
  }
  if (!anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and set it to your Supabase project's anon key."
    )
  }

  return { url, anonKey }
}

// Server-only. Never read this from a Client Component — the lack of a
// NEXT_PUBLIC_ prefix is what keeps Next.js from bundling it into client
// code, but that only holds if nothing client-reachable imports it.
export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and set it to your Supabase project's service_role secret key (Project Settings > API)."
    )
  }

  return serviceRoleKey
}
