import { withSentryConfig } from "@sentry/nextjs"
import withBundleAnalyzer from "@next/bundle-analyzer"

const withBA = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  analyzerMode: "static",
  generateStatsFile: true,
  statsFilename: "stats.json",
  reportFilename: "analyze/[name].html",
  openAnalyzer: false,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Increased for Google Drive uploads which use a two-phase approach:
    // Phase 1 (server): small metadata request to create resumable upload URL
    // Phase 2 (client): direct upload to Google with XHR progress tracking
    // The server action limit covers the metadata + parentId, not the file body.
    serverActions: { bodySizeLimit: "4mb" },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kehumsoipwvrzkomfyey.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
}

// Sentry is a no-op until NEXT_PUBLIC_SENTRY_DSN is set.
// See sentry.*.config.ts and instrumentation.ts for initialization.
export default withSentryConfig(withBA(nextConfig), {
  silent: true,
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
})
