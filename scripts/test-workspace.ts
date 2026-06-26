/**
 * Automated check for AC-2 (workspace creation, zero extra fields) and the
 * slug-collision retry path (resolves pre-implementation-audit.md finding
 * M-4). Run against the real Supabase project — anon key only.
 *
 * Server Actions can't be invoked directly from a standalone script (they
 * depend on next/headers' cookies()/redirect(), which only exist inside a
 * Next.js request). This script instead exercises the same underlying
 * mechanism lib/actions/workspaces.ts relies on: the
 * create_workspace_with_owner RPC, plus the slugify/withRetrySuffix
 * utilities, called directly.
 *
 * Usage:
 *   cp .env.example .env.local && fill in real Supabase project values
 *   npm run test:workspace
 */

import { createClient } from "@supabase/supabase-js"

import { slugify, withRetrySuffix } from "../lib/utils/slug"
import type { Database } from "../lib/types/database"

try {
  process.loadEnvFile?.(".env.local")
} catch {
  // .env.local may not exist yet (e.g. in CI) — fall through and let the
  // missing-env-var check below fail loudly instead.
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in a real Supabase project before running this script."
  )
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function runPureSlugChecks(): void {
  assert(
    slugify("Riverside Volunteers") === "riverside-volunteers",
    "slugify should lowercase and hyphenate"
  )
  assert(
    slugify("  Café São Paulo!! ") === "cafe-sao-paulo",
    "slugify should strip accents and punctuation"
  )
  assert(
    slugify("***") === "workspace",
    "slugify should fall back to 'workspace' when nothing alphanumeric remains"
  )
  const suffixed = withRetrySuffix("riverside-volunteers")
  assert(
    suffixed.startsWith("riverside-volunteers-") &&
      suffixed.length === "riverside-volunteers-".length + 4,
    "withRetrySuffix should append a 4-character suffix"
  )
  console.log("Pure slug utility checks passed.")
}

async function runLiveCollisionCheck(): Promise<void> {
  const client = createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const email = `workspace-test-${Date.now()}@example.com`
  const password = crypto.randomUUID()

  const { data: signUpData, error: signUpError } = await client.auth.signUp({
    email,
    password,
  })
  if (signUpError) throw signUpError
  assert(
    !!signUpData.session,
    "expected an immediate session after sign-up (is email confirmation disabled per DEC-014?)"
  )

  const name = "Volunteers"
  const baseSlug = slugify(name)

  const { data: first, error: firstError } = await client.rpc(
    "create_workspace_with_owner",
    { workspace_name: name, workspace_slug: baseSlug }
  )
  if (firstError) throw firstError
  if (!first) throw new Error("create_workspace_with_owner returned no row")
  assert(first.slug === baseSlug, "first workspace should get the plain slug")

  // Second workspace, same human name -> same base slug -> must collide.
  const { error: collisionError } = await client.rpc(
    "create_workspace_with_owner",
    { workspace_name: name, workspace_slug: baseSlug }
  )
  assert(
    collisionError?.code === "23505",
    `creating a second workspace with the same slug should hit a unique violation (got: ${JSON.stringify(collisionError)})`
  )

  // Retrying with a suffixed slug (what the Server Action does next) must succeed.
  const retrySlug = withRetrySuffix(baseSlug)
  const { data: second, error: secondError } = await client.rpc(
    "create_workspace_with_owner",
    { workspace_name: name, workspace_slug: retrySlug }
  )
  if (secondError) throw secondError
  if (!second) throw new Error("create_workspace_with_owner returned no row")
  assert(
    second.slug === retrySlug && second.slug !== first.slug,
    "retried workspace should have a distinct slug from the first"
  )

  console.log("Live slug-collision retry check passed.")
}

async function main() {
  runPureSlugChecks()
  await runLiveCollisionCheck()
  console.log("All workspace checks passed.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
