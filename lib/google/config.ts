export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

  if (!clientId) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID. Copy .env.example to .env.local and set it to your Google OAuth client ID."
    )
  }
  if (!clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_SECRET. Copy .env.example to .env.local and set it to your Google OAuth client secret."
    )
  }
  if (!redirectUri) {
    throw new Error(
      "Missing GOOGLE_REDIRECT_URI. Copy .env.example to .env.local and set it to your Google OAuth redirect URI."
    )
  }
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error(
      "Missing or invalid GOOGLE_TOKEN_ENCRYPTION_KEY. Must be at least 32 characters. Generate one with: openssl rand -hex 32"
    )
  }

  return { clientId, clientSecret, redirectUri, encryptionKey }
}

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ")
