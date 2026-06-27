import type { MetadataRoute } from "next"

const SITE_URL = "https://aspen-os.vercel.app"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/sign-in`, priority: 0.8 },
    { url: `${SITE_URL}/sign-up`, priority: 0.8 },
  ]
}
