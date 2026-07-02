import * as Sentry from "@sentry/nextjs"

// Only initialize if DSN is configured — prevents Sentry from throwing
// in development or CI where NEXT_PUBLIC_SENTRY_DSN is not set.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Capture 10% of traces in production to keep quota low for a small team.
    tracesSampleRate: 0.1,
    // Replay 1% of sessions; 100% of sessions with an error.
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
  })
}
