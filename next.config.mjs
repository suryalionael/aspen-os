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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kehumsoipwvrzkomfyey.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
}

// Sentry is a no-op until NEXT_PUBLIC_SENTRY_DSN is set.
// See sentry.*.config.ts and instrumentation.ts for initialization.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
})
