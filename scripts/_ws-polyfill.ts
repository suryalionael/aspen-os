/**
 * WebSocket polyfill for Node.js < 22.
 *
 * @supabase/realtime-js calls WebSocketFactory.getWebSocketConstructor() inside
 * the RealtimeClient constructor, which runs at createClient() time. In Node < 22
 * there is no globalThis.WebSocket, so the factory throws before any test logic
 * runs. Setting globalThis.WebSocket here — before the main test script imports
 * @supabase/supabase-js — satisfies the factory's first-pass check and avoids
 * the crash. Loaded via tsx --import so no test script needs to change.
 */
import ws from "ws"

if (!globalThis.WebSocket) {
  // @ts-expect-error ws's WebSocket type is narrower than the DOM WebSocket
  globalThis.WebSocket = ws
}

// Normalize NEXT_PUBLIC_SUPABASE_URL to just the origin (scheme + host).
// @supabase/supabase-js appends /auth/v1, /rest/v1 etc. to whatever URL
// is provided. If the secret was stored with a path component (e.g.
// https://xxx.supabase.co/rest/v1) or a trailing slash, the constructed
// endpoint becomes invalid and GoTrue returns "Invalid path specified in
// request URL". Using URL.origin strips any path, search, or fragment,
// leaving exactly https://xxx.supabase.co — the format supabase-js expects.
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ).origin
  } catch {
    // If the URL is genuinely malformed (not parseable) leave it as-is;
    // the subsequent missing-var check in each test script will catch it.
  }
}
