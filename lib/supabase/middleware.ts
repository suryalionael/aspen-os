import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { getSupabaseEnv } from "@/lib/supabase/env"

// Routes reachable while signed out. Everything else is protected by
// default — new routes added in later phases (e.g. workspace/project pages)
// are automatically gated without needing another middleware change.
// /auth/confirm is the password-recovery link's landing route — it must be
// reachable before a session exists, since establishing one is its job.
const PUBLIC_PATHS = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/auth/confirm",
])
const AUTH_PATHS = new Set(["/sign-in", "/sign-up", "/forgot-password"])

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/invite/")

  // Skip session refresh for RSC payload fetches and prefetches — these
  // are client-side navigations from already-authenticated pages. The
  // initial page load already verified + refreshed the session via
  // getUser(). Saves ~130ms per client navigation.
  if (request.headers.get("RSC") === "1" || request.headers.get("Next-Router-Prefetch") === "1") {
    return supabaseResponse
  }

  const { url, anonKey } = getSupabaseEnv()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Calling getUser() (not getSession()) on every request is what refreshes
  // the session cookie via the Supabase Auth server — this is the session
  // persistence mechanism itself, not just a read.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/sign-in"
    return NextResponse.redirect(redirectUrl)
  }

  if (user && AUTH_PATHS.has(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/"
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}
