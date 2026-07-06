# Production Performance Report

Generated: 2026-07-06
Target: https://aspen-os.vercel.app

---

## 1. Infrastructure

### Vercel

| Property | Value |
|----------|-------|
| Project ID | `prj_hylTKXkD4egWgZOuEmervPqQy2pW` |
| Plan | Hobby (serverless) |
| Function Region | `iad1` (US East, N. Virginia) — default |
| Request Route | `sin1` (Singapore edge) → `iad1` origin |
| `vercel.json` | Not found (no custom config) |

**Impact:** All requests traverse the Vercel edge network from `sin1` to `iad1`, adding ~100-200ms of network latency for users outside the US. The function region is not configured — Vercel Hobby defaults to `iad1`. There is no `vercel.json` to set `regions` for optimal placement.

### Supabase

| Property | Value |
|----------|-------|
| Project URL | `https://kehumsoipwvrzkomfyey.supabase.co` |
| Email Confirmation | **Disabled** (`mailer_autoconfirm: true`) |
| Anon Key | Set via `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `@supabase/ssr` | `^0.5.2` |

**Supabase Project Region:** Not publicly detectable without an API token, but latency from US East (~100ms) is consistent with `us-east-1`.

### JS Bundle Sizes (Production)

| Chunk | Size | Description |
|-------|------|-------------|
| `2432-*.js` | **409 KB** | Largest shared chunk |
| `4bd1b696-*.js` | 169 KB | Shared chunk |
| `4a7b0c69-*.js` | 121 KB | Shared chunk |
| `main-app-*.js` | 2 KB | App shell |
| **Total shared (first load)** | **~226 KB** | Per build output |

**Impact:** 409 KB single chunk is large. While gzip reduces wire size (~120 KB), parsing/executing this amount of JS on low-end devices adds 200-500ms to TBT (Total Blocking Time). The CommandPalette and dialog components were lazy-loaded in a previous session, but the remaining shared JS is still significant.

---

## 2. Production Response Times

Measured via `curl` (first byte timing, no auth).

### Unauthenticated Pages

| Page | Cold Start (TTFB) | Warm (TTFB) | HTTP |
|------|-------------------|-------------|------|
| `/` | 396ms | 352ms | 200 |
| `/sign-in` | 108ms | 113ms | 200 |
| `/sign-up` | 101ms | 136ms | 200 |
| `/workspaces/new` | 104ms | 102ms | 307 (redirect) |

**Notes:**
- The root page (`/`) is significantly slower than auth pages — it runs a database query (`SELECT slug FROM workspaces`) even for unauthenticated users, plus the `getSession()` auth check. 396ms cold is high for a landing page.
- Static pages (`/sign-in`, `/sign-up`) are fast at ~100ms.
- `/workspaces/new` returns 307 because the curl request has no auth cookies. This is expected.

### Server Timing Headers

**Not present.** The production deployment sends no `Server-Timing` header. This means:

- Cannot measure server-side execution time vs network latency
- Cannot identify which database queries or RPC calls are slow
- Sentry's `tracesSampleRate: 0.1` is configured but no DSN is set, so tracing data is not captured

---

## 3. Production Auth Flow Bug

**Severity: BLOCKER — prevents logged-in users from using the app**

### Observed Behavior

1. Sign-up via REST API → **works** (returns `access_token`)
2. Sign-in via server action form → **works** (redirects to `/workspaces/new`)
3. Workspace creation via server action form → **FAILS** (redirects to `/sign-in`)

### Root Cause Analysis

The auth session is established during sign-in (cookies are set) and present on the `/workspaces/new` page. But the workspace creation server action's redirect (`redirect("/{slug}")`) loses the session cookies.

Likely causes (in order of probability):

1. **`@supabase/ssr` `setAll()` swallows errors silently** (`lib/supabase/server.ts:19-26`). If `cookies().set()` fails in the server action context (or the cached client from the page render is used), the session cookie update is silently dropped. The `try/catch` was intended for Server Component contexts but also masks failures in server actions.

2. **`React.cache()` on `createClient`** (`lib/supabase/server.ts:7`). The cached client instance may bind to the page render's cookie store, where `cookies().set()` is not allowed. When the server action reuses this cached client, `setAll()` calls the wrong cookie store, catches the error, and the session cookies never reach the browser.

3. **`seedOnboarding()` calls `getSession()`**, which reads the existing session. If a token refresh happens during this call, the new token might not propagate to the redirect response.

### Evidence

```
  Before workspace creation: /workspaces/new (authenticated)
  After workspace creation:  /sign-in (not authenticated)
  Auth cookies: 0
```

The Vercel `x-vercel-id` header changes between requests, confirming separate function invocations rather than a reused instance.

---

## 4. Identified Bottlenecks (Ranked)

### P0: Storage Buckets Do Not Exist

See `UPLOAD_DEBUG.md` for full analysis.

### P1: Auth Session Lost During Workspace Creation

**Impact:** 100% of new users cannot complete onboarding. All authenticated navigation fails after workspace creation.
**Fix:** Remove `React.cache()` from `createClient()`, or ensure the cookie store is rebound in server action contexts.

### P2: No Server-Timing Headers

**Impact:** Cannot diagnose which part of the server response is slow (auth vs database vs rendering).
**Fix:** Enable experimental `serverActions.timing` or add manual `Server-Timing` headers in middleware or page components.

### P3: 409 KB Single JS Chunk

**Impact:** Adds 200-500ms of parse/execute time on mid-range devices, particularly after cold navigation or hard refresh.
**Fix:** Further code-split the largest chunk. Likely contains `@supabase/ssr`, `lucide-react`, `cmdk`, and other heavy libraries. Consider dynamic imports for rarely-used icons and components.

### P4: Root Page Slow (396ms Cold)

**Impact:** The landing page runs `getSession()` + `SELECT slug FROM workspaces` for every visit, even unauthenticated ones. This adds ~300ms of server execution time.
**Fix:** Skip the database query for unauthenticated visitors. The root page already has a conditional render for `!user`, but the query runs before that check. Move query inside the `if (user)` block.

### P5: Function Region in US East Only

**Impact:** Users outside US East experience 100-200ms additional latency from edge-to-origin routing.
**Fix:** Set Vercel function regions to match the primary user base, or use `@vercel/functions` with regional hints.

### P6: No Sentry Tracing

**Impact:** `NEXT_PUBLIC_SENTRY_DSN` is not set. The instrumentation.ts configures Sentry with `tracesSampleRate: 0.1` but only activates when DSN is present. Production errors have no trace context.
**Fix:** Provide a Sentry DSN environment variable.

---

## 5. Production-Only Differences from Local

| Aspect | Local (dev) | Production (Vercel) |
|--------|-------------|---------------------|
| Supabase project | Same project | Same project |
| Body size limit | 4 MB | 4 MB |
| Auth flow | Works | Breaks at workspace creation |
| Storage buckets | Present (migrations run) | Missing (never created) |
| Server Timing | Available in dev mode | Not present |
| Cold start | N/A | ~104-396ms additional |
| Function memory | Unlimited (local) | 1024 MB default (Vercel Hobby) |
| Max duration | Unlimited (local) | 60s (Hobby), 15s (free) |
