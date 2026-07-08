import { createClient } from "@/lib/supabase/server"
import { decryptToken } from "@/lib/google/crypto"
import { refreshAccessToken } from "@/lib/google/actions"

export async function getValidAccessToken(
  userId: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("user_google_connections")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single()

  if (!data) return null

  const expiresAt = new Date(data.token_expires_at).getTime()
  const now = Date.now()

  if (now < expiresAt - 60000) {
    return decryptToken(data.access_token)
  }

  const refreshToken = decryptToken(data.refresh_token)

  try {
    const result = await refreshAccessToken(userId, refreshToken)
    return result.accessToken
  } catch {
    return null
  }
}
