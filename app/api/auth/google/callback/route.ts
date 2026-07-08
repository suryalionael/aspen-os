import { NextRequest, NextResponse } from "next/server"

import { handleGoogleCallback } from "@/lib/google/actions"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  if (error) {
    const redirectUrl = new URL("/account", request.url)
    redirectUrl.searchParams.set("google_error", `Google OAuth error: ${error}`)
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    const redirectUrl = new URL("/account", request.url)
    redirectUrl.searchParams.set("google_error", "No authorization code received from Google.")
    return NextResponse.redirect(redirectUrl)
  }

  const result = await handleGoogleCallback(code)

  const redirectUrl = new URL("/account", request.url)

  if ("error" in result) {
    redirectUrl.searchParams.set("google_error", result.error)
  } else {
    redirectUrl.searchParams.set("google_success", "Google account connected successfully.")
  }

  return NextResponse.redirect(redirectUrl)
}
