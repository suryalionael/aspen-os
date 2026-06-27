/** @type {import('next').NextConfig} */
const nextConfig = {
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
