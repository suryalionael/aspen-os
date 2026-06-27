import { test, expect } from "@playwright/test"

/**
 * Sprint 3 Phase O: robots.txt and sitemap.xml must be reachable by an
 * unauthenticated client without redirecting to /sign-in — confirmed
 * directly via Lighthouse that the auth middleware was intercepting
 * /robots.txt (it wasn't in PUBLIC_PATHS), failing the "robots.txt is
 * valid" SEO audit. Fixed by excluding both from the middleware matcher
 * entirely, plus adding real app/robots.ts and app/sitemap.ts routes.
 */
test("robots.txt and sitemap.xml are reachable without an auth redirect", async ({
  page,
  request,
}) => {
  const robotsResponse = await request.get("/robots.txt")
  expect(robotsResponse.status()).toBe(200)
  const robotsBody = await robotsResponse.text()
  expect(robotsBody).toContain("User-Agent")
  expect(robotsBody).toContain("Sitemap:")

  const sitemapResponse = await request.get("/sitemap.xml")
  expect(sitemapResponse.status()).toBe(200)

  // A signed-out browser navigation must not be redirected to /sign-in —
  // this is the exact failure mode that broke the SEO audit.
  await page.goto("/robots.txt")
  expect(new URL(page.url()).pathname).toBe("/robots.txt")
})
