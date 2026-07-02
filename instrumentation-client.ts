import * as Sentry from "@sentry/nextjs"

// No-op when DSN is not configured.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
  })
}

// Required by Sentry SDK for navigation instrumentation.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
