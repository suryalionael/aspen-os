"use server"

import { revalidatePath } from "next/cache"
import crypto from "node:crypto"

import { createClient } from "@/lib/supabase/server"
import {
  getGoogleConfig,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  GOOGLE_SCOPES,
} from "@/lib/google/config"
import { encryptToken, decryptToken } from "@/lib/google/crypto"

export type GoogleConnectionStatus =
  | { connected: true; email: string; displayName: string | null; photoUrl: string | null }
  | { connected: false }

function generateState(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function getGoogleAuthUrl(): Promise<string> {
  const { clientId, redirectUri } = getGoogleConfig()
  const state = generateState()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
}

interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name: string
  picture: string
}

async function exchangeCodeForTokens(code: string): Promise<{
  tokens: GoogleTokenResponse
  userInfo: GoogleUserInfo
}> {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig()

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  const tokens: GoogleTokenResponse = await tokenResponse.json()

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userResponse.ok) {
    throw new Error("Failed to fetch user info from Google")
  }

  const userInfo: GoogleUserInfo = await userResponse.json()

  return { tokens, userInfo }
}

export async function handleGoogleCallback(
  code: string
): Promise<{ error: string } | { success: true }> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
      return { error: "You must be signed in to connect a Google account." }
    }

    const { tokens, userInfo } = await exchangeCodeForTokens(code)

    if (!tokens.refresh_token) {
      return {
        error:
          "Google did not provide a refresh token. This usually means the account was already connected before. Disconnect and reconnect to get a new refresh token.",
      }
    }

    const encryptedRefreshToken = encryptToken(tokens.refresh_token)
    const encryptedAccessToken = encryptToken(tokens.access_token)
    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    const { error } = await supabase.from("user_google_connections").upsert(
      {
        user_id: session.user.id,
        google_user_id: userInfo.id,
        google_email: userInfo.email,
        google_display_name: userInfo.name || null,
        google_photo_url: userInfo.picture || null,
        refresh_token: encryptedRefreshToken,
        access_token: encryptedAccessToken,
        token_expires_at: expiresAt,
        scope: tokens.scope,
      },
      { onConflict: "user_id" }
    )

    if (error) {
      return { error: `Failed to store Google connection: ${error.message}` }
    }

    revalidatePath("/account")
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to connect Google account.",
    }
  }
}

export async function disconnectGoogle(): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return { error: "You must be signed in." }
  }

  const { error } = await supabase
    .from("user_google_connections")
    .delete()
    .eq("user_id", session.user.id)

  if (error) {
    return { error: `Failed to disconnect Google account: ${error.message}` }
  }

  revalidatePath("/account")
  return { success: true }
}

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return { connected: false }
  }

  const { data } = await supabase
    .from("user_google_connections")
    .select("google_email, google_display_name, google_photo_url")
    .eq("user_id", session.user.id)
    .single()

  if (!data) {
    return { connected: false }
  }

  return {
    connected: true,
    email: data.google_email,
    displayName: data.google_display_name,
    photoUrl: data.google_photo_url,
  }
}

export async function getStoredTokens(userId: string): Promise<{
  accessToken: string
  refreshToken: string
} | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_google_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single()

  if (!data) return null

  return {
    accessToken: decryptToken(data.access_token),
    refreshToken: decryptToken(data.refresh_token),
  }
}

export async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: string }> {
  const { clientId, clientSecret } = getGoogleConfig()

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!response.ok) {
    throw new Error("Failed to refresh access token")
  }

  const data = await response.json()

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  const supabase = await createClient()
  const encryptedAccessToken = encryptToken(data.access_token)
  const { error } = await supabase
    .from("user_google_connections")
    .update({ access_token: encryptedAccessToken, token_expires_at: expiresAt })
    .eq("user_id", userId)

  if (error) {
    console.error("Failed to update stored access token:", error)
  }

  return { accessToken: data.access_token, expiresAt }
}
