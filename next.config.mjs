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

export default nextConfig
