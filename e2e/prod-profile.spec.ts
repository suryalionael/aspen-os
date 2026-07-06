import { test } from "@playwright/test"

const BASE = "https://aspen-os.vercel.app"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"

test("production performance profile", async ({ page, context }) => {
  test.setTimeout(600_000)

  // 1. Create user via Supabase REST API
  const UNIQUE = Date.now()
  const EMAIL = `perf-${UNIQUE}@example.com`
  const PASSWORD = "ProfileTest123!"

  console.log("=== CREATE USER via Supabase REST ===")
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const authData: any = await r.json()
  if (!authData.access_token) {
    console.log(`  Failed: ${JSON.stringify(authData)}`)
    return
  }
  console.log(`  User: ${EMAIL}`)

  // 2. Sign in through the actual form (this sets cookies properly via the server action)
  console.log("\n=== SIGN IN (through form) ===")
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  
  // Submit and wait for redirect
  await Promise.all([
    page.waitForURL(url => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  console.log(`  After sign-in: ${page.url()}`)

  // Wait a moment for any redirect chain to settle
  await page.waitForTimeout(3000)
  console.log(`  After settle: ${page.url()}`)

  // Take screenshot
  await page.screenshot({ path: "/tmp/prod-after-signin.png", fullPage: true })

  const currentUrl = page.url()
  
  // If we got redirected to workspaces/new, create a workspace
  if (currentUrl.includes("workspaces/new")) {
    console.log("  → On workspace creation page")
    const wsInput = page.locator('input[name="name"]')
    if (await wsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await wsInput.fill(`Production Profile ${UNIQUE}`)
      await Promise.all([
        page.waitForURL(url => /\/[^/]+$/.test(url.pathname) && !url.pathname.includes("workspaces/new"), { timeout: 30000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ])
      await page.waitForTimeout(3000)
      console.log(`  After workspace creation: ${page.url()}`)
    }
  }

  // Get slug
  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
  console.log(`  Workspace slug: ${slug || "NONE"}`)

  if (!slug || slug.includes("workspace") || slug.includes("sign-in") || slug.includes("sign-up")) {
    console.log("\n  Could not establish authenticated session in production.")
    console.log("  This indicates a production auth bug preventing login.")
    
    const cookies = await context.cookies()
    const authCookies = cookies.filter(c => c.name.includes("sb-") || c.name.includes("auth") || c.name.includes("supabase"))
    console.log(`\n  Auth cookies: ${authCookies.length}`)
    authCookies.forEach(c => console.log(`    ${c.name}: len=${c.value.length} domain=${c.domain} path=${c.path}`))
    
    await page.screenshot({ path: "/tmp/prod-auth-state.png", fullPage: true })
    return
  }

  // 3. PERFORMANCE MEASUREMENTS
  async function measure(label: string, url: string) {
    const navStart = Date.now()
    await page.goto(url, { waitUntil: "commit", timeout: 45000 })
    const navCommit = Date.now() - navStart
    await page.waitForLoadState("networkidle", { timeout: 45000 })
    const totalTime = Date.now() - navStart

    const metrics = await page.evaluate(() => {
      const p = performance.getEntriesByType("paint")
      const n = performance.getEntriesByType("navigation")[0] as any
      const resources = performance.getEntriesByType("resource") as any[]
      const lcpE = performance.getEntriesByType("largest-contentful-paint").pop() as any
      return {
        ttfb: Math.round(n?.responseStart ?? -1),
        fcp: Math.round((p.find((e: any) => e.name === "first-contentful-paint") as any)?.startTime ?? -1),
        lcp: Math.round(lcpE?.startTime ?? -1),
        responseEnd: Math.round(n?.responseEnd ?? -1),
        domInteractive: Math.round(n?.domInteractive ?? -1),
        domComplete: Math.round(n?.domComplete ?? -1),
        domSize: document.querySelectorAll("*").length,
        totalRequests: resources.length,
        totalSize: resources.reduce((s: number, r: any) => s + (r.transferSize || 0), 0),
        rscCount: resources.filter((r: any) => r.name.includes("_rsc") || r.name.includes("__rsc")).length,
        slowResources: resources
          .filter((r: any) => r.duration > 200)
          .sort((a: any, b: any) => b.duration - a.duration)
          .slice(0, 10)
          .map((r: any) => ({
            url: r.name.length > 100 ? r.name.substring(0, 100) + "..." : r.name,
            duration: Math.round(r.duration),
            initiator: r.initiatorType,
          })),
      }
    })

    const hydrationGap = Math.max(0, metrics.domInteractive - metrics.responseEnd)

    console.log(`\n=== ${label} ===`)
    console.log(`  URL:               ${url}`)
    console.log(`  Nav→commit:        ${navCommit}ms`)
    console.log(`  Total nav:         ${totalTime}ms`)
    console.log(`  TTFB:              ${metrics.ttfb}ms`)
    console.log(`  FCP:               ${metrics.fcp}ms`)
    console.log(`  LCP:               ${metrics.lcp}ms`)
    console.log(`  RSC response end:  ${metrics.responseEnd}ms`)
    console.log(`  DOM interactive:   ${metrics.domInteractive}ms`)
    console.log(`  DOM complete:      ${metrics.domComplete}ms`)
    console.log(`  Hydration gap:     ${hydrationGap}ms`)
    console.log(`  DOM size:          ${metrics.domSize}`)
    console.log(`  Network reqs:      ${metrics.totalRequests}`)
    console.log(`  Transfer size:     ${(metrics.totalSize / 1024).toFixed(0)}KB`)
    console.log(`  RSC reqs:          ${metrics.rscCount}`)

    if (metrics.slowResources.length > 0) {
      console.log(`\n  Slowest resources:`)
      metrics.slowResources.forEach((r: any) => console.log(`    ${r.duration}ms ${r.initiator}: ${r.url}`))
    }

    return metrics
  }

  const results: Record<string, any> = {}
  
  // Try to create a project first for project page measurement
  console.log("\n=== Setting up project ===")
  await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" })
  
  // Check if this is the empty state (no projects)
  const isEmpty = await page.getByText("Create your first project").isVisible().catch(() => false)
  if (isEmpty) {
    console.log("  Empty workspace — welcome page shown")
  }

  // Measure all pages
  results.coldHome = await measure("Home (Cold)", `${BASE}/${slug}`)
  results.warmHome = await measure("Home (Warm)", `${BASE}/${slug}`)
  results.calendar = await measure("Calendar", `${BASE}/${slug}/calendar`)
  results.notes = await measure("Notes", `${BASE}/${slug}/notes`)

  // Project — try to find one
  const projLink = page.locator(`a[href*="/${slug}/"]`).filter({ hasText: /.+/ }).first()
  if (await projLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    const href = await projLink.getAttribute("href")
    if (href && href !== `/${slug}` && !href.match(/\/(calendar|notes|activity)$/)) {
      results.project = await measure("Project", `${BASE}${href}`)
    }
  }

  // Summary
  console.log("\n\n==================== PRODUCTION PERFORMANCE SUMMARY ====================")
  console.log(`User: ${EMAIL}`)
  console.log(`Workspace: ${slug}`)
  console.log("")
  for (const [key, m] of Object.entries(results)) {
    if (m && typeof m === "object") {
      console.log(`${key}:`)
      console.log(`  TTFB:${m.ttfb}ms FCP:${m.fcp}ms LCP:${m.lcp}ms RSC:${m.responseEnd}ms DOM:${m.domInteractive}ms Hydrate:${Math.max(0, m.domInteractive - m.responseEnd)}ms Reqs:${m.totalRequests} Size:${(m.totalSize / 1024).toFixed(0)}KB`)
    }
  }
})
