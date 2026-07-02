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
