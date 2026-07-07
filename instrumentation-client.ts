import { init, getClient, captureRouterTransitionStart } from "@sentry/nextjs"

// No-op when DSN is not configured.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
  })

  // Defer Sentry Replay to keep the initial bundle lean (~121 KB parsed,
  // 96% unused per V8 coverage). Replay attaches once the client is ready.
  import("@sentry/replay").then(({ replayIntegration }) => {
    getClient()?.addIntegration?.(replayIntegration())
  })
}

// Required by Sentry SDK for navigation instrumentation.
export const onRouterTransitionStart = captureRouterTransitionStart
