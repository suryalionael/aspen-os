import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Raise the 1 MB default body limit for Server Actions so that logo and
    // avatar uploads (validated at 2 MB in the action itself) can reach the
    // server before Next.js rejects them and triggers the error boundary.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    // Lets next/image actually optimize avatar/workspace-logo images
    // (Supabase Storage public URLs) instead of the `unoptimized` escape
    // hatch used while this wasn't configured — covers both buckets'
    // public-object paths under this project's storage host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kehumsoipwvrzkomfyey.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
}

// Sentry is optional: the integration is a no-op when NEXT_PUBLIC_SENTRY_DSN
// is not set (see sentry.*.config.ts). withSentryConfig wraps the build to
// add source map uploads and the Sentry webpack plugin; it's safe to apply
// even before the DSN is configured.
export default withSentryConfig(nextConfig, {
  // Suppress the Sentry CLI output during builds when DSN is not yet set.
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Source map upload requires SENTRY_AUTH_TOKEN and SENTRY_ORG env vars —
  // disable until those are configured (see docs/CI-AND-DEPLOYMENT.md).
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
  // Avoid Sentry wrapping server-side routes when DSN is absent.
  autoInstrumentServerFunctions: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})
