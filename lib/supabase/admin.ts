import { createClient } from "@supabase/supabase-js"

import { getSupabaseEnv, getSupabaseServiceRoleKey } from "@/lib/supabase/env"

// SERVER-ONLY. This client bypasses RLS entirely. Never import this file
// from a Client Component, a Route Handler reachable without an auth
// check, or anywhere else that isn't a Server Action which has already
// verified the caller via the normal (anon-key) session first.
//
// Currently used for exactly one operation: lib/actions/account.ts's
// deleteAccount, which calls admin.auth.admin.deleteUser(user.id) using an
// id derived from the caller's own verified session — never from
// client-supplied input — so this never becomes a path for one user to
// delete another.
export function createAdminClient() {
  const { url } = getSupabaseEnv()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
