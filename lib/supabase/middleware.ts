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

  const { pathname } = request.nextUrl
  // /invite/[token] is the one public route that's dynamic rather than
  // fixed (DEC-022) — an invitee who isn't signed in yet still needs to
  // see which workspace they're being invited to before being asked to
  // sign up/in.
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/invite/")

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
