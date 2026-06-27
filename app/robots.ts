import type { MetadataRoute } from "next"

const SITE_URL = "https://aspen-os.vercel.app"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/sign-in", "/sign-up", "/forgot-password"],
      // Everything past the workspace slug is an authenticated dashboard
      // route — disallowed rather than left to redirect crawlers to
      // /sign-in, since that wastes crawl budget on pages with nothing
      // to index anyway.
      disallow: ["/account", "/workspaces/", "/invite/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
