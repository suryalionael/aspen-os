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
