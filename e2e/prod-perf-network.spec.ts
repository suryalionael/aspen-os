import { test, type Page, type Request, type Response } from "@playwright/test"
import * as fs from "fs"

const BASE = "https://aspen-os.vercel.app"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
const UNIQUE = Date.now()
const EMAIL = `netperf-${UNIQUE}@example.com`
const PASSWORD = "NetPerf123!"

interface NetRequest {
  url: string
  method: string
  startTime: number
  responseEnd: number
  duration: number
  encodedBodySize: number
  decodedBodySize: number
  transferSize: number
  resourceType: string
  initiatorType: string
  status: number
  headers: Record<string, string>
  requestHeaders: Record<string, string>
  isPrefetch: boolean
  category: string
}

test("measure all network requests in production", async ({ browser }) => {
  test.setTimeout(600_000)

  // 1. AUTH via Supabase REST + form sign-in
  console.log("=== SETUP: Auth ===")
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const authPage = await ctx.newPage()

  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const authData: any = await r.json()
  if (!authData.access_token) {
    console.log(`  Sign-up response: ${JSON.stringify(authData)}`)
  } else {
    console.log(`  Created user: ${EMAIL}`)
  }

  await authPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
  await authPage.waitForSelector("#email", { timeout: 10000 })
  await authPage.fill("#email", EMAIL)
  await authPage.fill("#password", PASSWORD)
  await authPage.click('button[type="submit"]')
  await authPage.waitForTimeout(5000)

  if (authPage.url().includes("sign-")) {
    await authPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await authPage.waitForSelector("#email", { timeout: 10000 })
    await authPage.fill("#email", EMAIL)
    await authPage.fill("#password", PASSWORD)
    await authPage.click('button[type="submit"]')
    await authPage.waitForTimeout(5000)
  }

  await authPage.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 30000 })
  await authPage.waitForTimeout(2000)
  const nameInput = authPage.locator("#name")
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(`Network Perf ${UNIQUE}`)
    await authPage.getByRole("button", { name: "Create workspace" }).click()
    try {
      await authPage.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
    } catch {}
  }

  const slug = new URL(authPage.url()).pathname.split("/").filter(Boolean)[0] || ""
  console.log(`  Workspace slug: ${slug}`)

  // Get project ID via Supabase REST
  const { projectId } = await authPage.evaluate(async ({ slug }) => {
    const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
    const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
    const getToken = () => {
      const raw = document.cookie.split("; ").find(c => c.includes("sb-") && c.includes("auth-token"))
      if (!raw) return null
      const val = raw.split("=").slice(1).join("=")
      let encoded = val.startsWith("base64-") ? val.slice(7) : val
      const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
      try { return JSON.parse(atob(b64 + "=".repeat((4 - b64.length % 4) % 4))) } catch { return null }
    }
    const tok = getToken()
    const at = Array.isArray(tok) ? tok[0] : tok?.access_token
    if (!at) return { projectId: "" }
    const h = { apikey: ANON_KEY, Authorization: `Bearer ${at}`, "Content-Type": "application/json" }
    const ws = await (await fetch(`${SUPABASE_URL}/rest/v1/workspaces?select=id&slug=eq.${slug}`, { headers: h })).json()
    const projects = await (await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name&workspace_id=eq.${ws?.[0]?.id}`, { headers: h })).json()
    return { projectId: projects?.[0]?.id || "" }
  }, { slug })
  console.log(`  Project ID: ${projectId || "none (empty workspace)"}`)

  // Save auth cookies
  const authCookies = await ctx.cookies()
  await authPage.close()

  // 2. PROFILE ROUTES
  const routes = [
    { label: "Sign-In Page", url: `${BASE}/sign-in` },
  ]
  if (slug) {
    routes.push({ label: "Home (Dashboard)", url: `${BASE}/${slug}` })
    if (projectId) routes.push({ label: "Project (Kanban)", url: `${BASE}/${slug}/${projectId}` })
    routes.push({ label: "Calendar", url: `${BASE}/${slug}/calendar` })
    routes.push({ label: "Notes", url: `${BASE}/${slug}/notes` })
  }

  const allResults: string[] = []
  allResults.push("NETWORK PERFORMANCE REPORT")
  allResults.push(`Generated: ${new Date().toISOString()}`)
  allResults.push(`App: ${BASE}`)
  allResults.push(`User: ${EMAIL}`)
  allResults.push("=".repeat(100))
  allResults.push("")

  for (const route of routes) {
    allResults.push(`\n${"#".repeat(80)}`)
    allResults.push(`## ROUTE: ${route.label}`)
    allResults.push(`## URL:   ${route.url}`)
    allResults.push(`${"#".repeat(80)}`)

    const routeCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    if (slug) {
      await routeCtx.addCookies(
        authCookies.map(c => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          httpOnly: c.httpOnly, secure: c.secure,
          sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
        }))
      )
    }

    const page = await routeCtx.newPage()

    // Capture all network requests
    const requests: NetRequest[] = []
    const requestStartMap = new Map<string, number>()
    const requestHeadersMap = new Map<string, Record<string, string>>()
    const urlSet = new Set<string>()

    page.on("request", (req: Request) => {
      const url = req.url()
      if (url.startsWith("data:")) return
      requestStartMap.set(url, Date.now())
      requestHeadersMap.set(url, req.headers())
    })

    page.on("response", async (res: Response) => {
      const url = res.url()
      if (url.startsWith("data:")) return
      const startTime = requestStartMap.get(url) || 0
      const responseEnd = Date.now()
      const status = res.status()
      const headers = res.headers()
      const reqHeaders = requestHeadersMap.get(url) || {}
      const method = res.request().method()

      let encodedBodySize = 0
      let decodedBodySize = 0
      let transferSize = 0
      try {
        const body = await res.body()
        decodedBodySize = body.length
        transferSize = parseInt(res.headers()["content-length"] || "0") || decodedBodySize
        encodedBodySize = transferSize
      } catch {}

      const isPrefetch = !!(
        reqHeaders["sec-purpose"]?.includes("prefetch") ||
        headers["sec-purpose"]?.includes("prefetch") ||
        reqHeaders["purpose"] === "prefetch"
      )

      // Determine category
      let category = "other"
      if (url.includes("_rsc") || url.includes("__rsc") || headers["content-type"]?.includes("text/x-component")) {
        category = "rsc"
      } else if (url.includes("__next_data")) {
        category = "next-data"
      } else if (url.endsWith(".html") || headers["content-type"]?.includes("text/html")) {
        category = "html"
      } else if (url.match(/\.js(?:$|\?)/) || headers["content-type"]?.includes("javascript")) {
        category = "js"
      } else if (url.match(/\.css(?:$|\?)/) || headers["content-type"]?.includes("text/css")) {
        category = "css"
      } else if (url.match(/\.(woff2?|ttf|otf|eot)(?:$|\?)/)) {
        category = "font"
      } else if (url.match(/\.(png|jpg|jpeg|gif|webp|avif|svg)(?:$|\?)/)) {
        category = "image"
      } else if (url.match(/\.(json|map)(?:$|\?)/)) {
        category = "json"
      } else if (url.includes("supabase") && url.includes("/rest/v1/")) {
        category = "supabase-rest"
      } else if (method === "POST" && (reqHeaders["next-action"] || headers["next-action"])) {
        category = "server-action"
      }

      // Determine resource type
      let resourceType = "fetch"
      if (url.match(/\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|avif|svg)/)) {
        resourceType = "static"
      } else if (category === "html") {
        resourceType = "document"
      } else if (category === "rsc") {
        resourceType = "fetch"
      }

      requests.push({
        url,
        method,
        startTime: startTime ? startTime - (requests.length > 0 ? requests[0].startTime : startTime) : 0,
        responseEnd,
        duration: responseEnd - startTime,
        encodedBodySize,
        decodedBodySize,
        transferSize,
        resourceType,
        initiatorType: res.request().resourceType(),
        status,
        headers,
        requestHeaders: reqHeaders,
        isPrefetch,
        category,
      })
    })

    // Navigate
    await page.goto(route.url, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Get RT metrics from performance API
    const perfMetrics = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as any
      const p = performance.getEntriesByType("paint")
      const resources = performance.getEntriesByType("resource") as any[]
      const rscResources = resources.filter(r => r.name.includes("_rsc") || r.name.includes("__rsc"))
      return {
        ttfb: n ? Math.round(n.responseStart - n.fetchStart) : -1,
        fcp: p.find((e: any) => e.name === "first-contentful-paint") ? Math.round((p.find((e: any) => e.name === "first-contentful-paint") as any).startTime) : -1,
        lcp: performance.getEntriesByType("largest-contentful-paint").pop() ? Math.round((performance.getEntriesByType("largest-contentful-paint").pop() as any).startTime) : -1,
        domInteractive: n ? Math.round(n.domInteractive - n.fetchStart) : -1,
        domComplete: n ? Math.round(n.domComplete - n.fetchStart) : -1,
        rscFromPerf: rscResources.length,
        rscTiming: rscResources.map(r => ({ url: r.name, start: Math.round(r.startTime), duration: Math.round(r.duration), size: r.decodedBodySize })),
      }
    })

    // Sort by startTime for waterfall
    const sorted = [...requests].sort((a, b) => {
      if (a.startTime === 0 && b.startTime === 0) return 0
      if (a.startTime === 0) return -1
      if (b.startTime === 0) return 1
      return a.startTime - b.startTime
    })

    // ANALYSIS
    const rscReqs = requests.filter(r => r.category === "rsc")
    const saReqs = requests.filter(r => r.category === "server-action")
    const htmlReqs = requests.filter(r => r.category === "html")
    const staticReqs = requests.filter(r => ["js", "css", "font", "image", "json"].includes(r.category))
    const prefetchReqs = requests.filter(r => r.isPrefetch || r.category === "rsc")

    // Duplicate detection
    const urlCounts = new Map<string, number>()
    for (const r of requests) {
      urlCounts.set(r.url, (urlCounts.get(r.url) || 0) + 1)
    }
    const duplicates = [...urlCounts.entries()].filter(([_, c]) => c > 1)

    // Totals
    const totalBytes = requests.reduce((s, r) => s + r.transferSize, 0)
    const totalUncompressed = requests.reduce((s, r) => s + r.decodedBodySize, 0)
    const rscTotalSize = rscReqs.reduce((s, r) => s + r.decodedBodySize, 0)
    const rscTotalTransfer = rscReqs.reduce((s, r) => s + r.transferSize, 0)
    const saTotalDuration = saReqs.reduce((s, r) => s + r.duration, 0)

    // Critical path: find longest chain of sequential requests
    // For simplicity, identify requests that block rendering (duration > 500ms)
    const blocking = sorted.filter(r => r.duration > 500 && r.category !== "image" && r.category !== "font")

    // Build report
    const lines: string[] = []

    // --- Preamble ---
    lines.push(`\n  Auth user:          ${EMAIL}`)
    lines.push(`  Perf metrics:`)
    lines.push(`    TTFB:              ${perfMetrics.ttfb}ms`)
    lines.push(`    FCP:               ${perfMetrics.fcp}ms`)
    lines.push(`    LCP:               ${perfMetrics.lcp}ms`)
    lines.push(`    DOM Interactive:   ${perfMetrics.domInteractive}ms`)
    lines.push(`    DOM Complete:      ${perfMetrics.domComplete}ms`)
    lines.push(``)

    // --- Request Summary ---
    lines.push(`  ── REQUEST SUMMARY ──`)
    lines.push(`  Total requests:        ${requests.length}`)
    lines.push(`  Total transferred:     ${(totalBytes / 1024).toFixed(1)} KB (gzip)`)

    lines.push(`  Total uncompressed:    ${(totalUncompressed / 1024).toFixed(1)} KB`)

    lines.push(`  Compression ratio:     ${totalUncompressed > 0 ? (totalUncompressed / totalBytes).toFixed(2) + 'x' : 'N/A'}`)
    lines.push(``)

    // --- By Category ---
    lines.push(`  ── BY CATEGORY ──`)
    lines.push(`  HTML pages:           ${htmlReqs.length} request(s)`)
    for (const h of htmlReqs) {
      lines.push(`    ${h.status} ${h.url} (${h.duration}ms, ${(h.transferSize / 1024).toFixed(1)}KB)`)
    }

    lines.push(`  RSC requests:         ${rscReqs.length} request(s), ${(rscTotalSize / 1024).toFixed(1)}KB uncompressed, ${(rscTotalTransfer / 1024).toFixed(1)}KB gzip`)
    for (const rsc of rscReqs.sort((a, b) => b.duration - a.duration)) {
      lines.push(`    ${rsc.status} ${rsc.url.substring(0, 120)} (${rsc.duration}ms, ${(rsc.decodedBodySize / 1024).toFixed(1)}KB)`)
    }

    lines.push(`  Server Actions:       ${saReqs.length} request(s), ${saTotalDuration}ms total`)
    for (const sa of saReqs) {
      lines.push(`    ${sa.status} ${sa.url.substring(0, 120)} (${sa.duration}ms)`)
    }

    const jsStatic = staticReqs.filter(r => r.category === "js")
    const cssStatic = staticReqs.filter(r => r.category === "css")
    const fontStatic = staticReqs.filter(r => r.category === "font")
    const imgStatic = staticReqs.filter(r => r.category === "image")
    const jsonStatic = staticReqs.filter(r => r.category === "json")
    const supabaseReqs = requests.filter(r => r.category === "supabase-rest")
    const nextData = requests.filter(r => r.category === "next-data")

    lines.push(`  JS files:             ${jsStatic.length} files, ${(jsStatic.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1)}KB uncompressed, ${(jsStatic.reduce((s, r) => s + r.transferSize, 0) / 1024).toFixed(1)}KB gzip`)
    lines.push(`  CSS files:            ${cssStatic.length} files, ${(cssStatic.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1)}KB`)
    lines.push(`  Font files:           ${fontStatic.length} files, ${(fontStatic.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1)}KB`)
    lines.push(`  Images:               ${imgStatic.length} files, ${(imgStatic.reduce((s, r) => s + r.decodedBodySize, 0) / 1024).toFixed(1)}KB`)
    lines.push(`  Supabase REST:        ${supabaseReqs.length} queries`)
    lines.push(`  next-data:            ${nextData.length} requests`)
    lines.push(`  Prefetch requests:    ${prefetchReqs.length}`)
    lines.push(``)

    // --- Duplicate URLs ---
    if (duplicates.length > 0) {
      lines.push(`  ── DUPLICATE REQUESTS (${duplicates.length} unique URLs fetched more than once) ──`)
      for (const [url, count] of duplicates) {
        const reqs = requests.filter(r => r.url === url)
        lines.push(`    x${count}  ${url.substring(0, 130)}`)
        lines.push(`          methods: ${[...new Set(reqs.map(r => r.method))].join(", ")} categories: ${[...new Set(reqs.map(r => r.category))].join(", ")}`)
      }
      lines.push(``)
    } else {
      lines.push(`  ── DUPLICATE REQUESTS: None ──`)
      lines.push(``)
    }

    // --- TTFB ---
    lines.push(`  ── TIME TO FIRST BYTE (TTFB) ──`)
    lines.push(`  Initial HTML TTFB:  ${perfMetrics.ttfb}ms`)
    if (htmlReqs.length > 0) {
      const html = htmlReqs[0]
      lines.push(`  HTML URL:           ${html.url}`)
      lines.push(`  HTML status:        ${html.status}`)
      lines.push(`  HTML duration:      ${html.duration}ms`)
    }
    lines.push(``)

    // --- Blocking / Critical Path ---
    lines.push(`  ── CRITICAL PATH / RENDER-BLOCKING REQUESTS (>500ms) ──`)
    if (blocking.length === 0) {
      lines.push(`  (None — all requests completed within 500ms)`)
    } else {
      for (const b of blocking) {
        lines.push(`  ${b.duration}ms  ${b.status}  ${b.category}  ${b.url.substring(0, 130)}`)
      }
    }
    lines.push(``)

    // --- Prefetch Details ---
    lines.push(`  ── PREFETCH REQUEST DETAILS ──`)
    const pf = prefetchReqs
    if (pf.length === 0) {
      lines.push(`  (No prefetch requests detected)`)
    } else {
      for (const p of pf) {
        lines.push(`  ${p.method} ${p.url.substring(0, 130)}  (${p.duration}ms, ${(p.transferSize / 1024).toFixed(1)}KB)`)
      }
    }
    lines.push(``)

    // --- Networking Waterfall ---
    lines.push(`  ── COMPLETE NETWORK WATERFALL (sorted by startTime) ──`)
    lines.push(`  ${"TIME".padStart(8)} ${"DUR".padStart(6)} ${"SIZE".padStart(8)} ${"STAT".padStart(4)} ${"CAT".padStart(14)} ${"URL"}`)
    lines.push(`  ${"-".repeat(8)} ${"-".repeat(6)} ${"-".repeat(8)} ${"-".repeat(4)} ${"-".repeat(14)} ${"-".repeat(80)}`)
    for (const req of sorted) {
      const time = req.startTime === 0 ? 0 : req.startTime
      const sizeStr = req.transferSize > 0 ? `${(req.transferSize / 1024).toFixed(1)}KB` : "-"
      lines.push(`  ${String(time).padStart(8)} ${String(Math.round(req.duration)).padStart(6)} ${sizeStr.padStart(8)} ${String(req.status).padStart(4)} ${req.category.padStart(14)} ${req.url.substring(0, 120)}`)
    }
    lines.push(``)

    // --- Errors ---
    const errors = requests.filter(r => r.status >= 400)
    if (errors.length > 0) {
      lines.push(`  ── ERRORS (${errors.length}) ──`)
      for (const e of errors) {
        lines.push(`  ${e.status} ${e.method} ${e.url}`)
      }
      lines.push(``)
    } else {
      lines.push(`  ── ERRORS: None ──`)
      lines.push(``)
    }

    const routeReport = lines.join("\n")
    allResults.push(routeReport)

    // Also print to console for immediate feedback
    console.log(`\n=== ${route.label} ===`)
    console.log(`  Reqs: ${requests.length}  Transferred: ${(totalBytes / 1024).toFixed(1)}KB  RSC: ${rscReqs.length}  SA: ${saReqs.length}  Dups: ${duplicates.length}`)

    await page.close()
    await routeCtx.close()
  }

  // Final summary
  allResults.push("\n" + "=".repeat(100))
  allResults.push("END OF REPORT")
  allResults.push("=".repeat(100))

  const report = allResults.join("\n")
  fs.writeFileSync("/tmp/network_perf.txt", report, "utf-8")
  console.log("\n\nReport saved to /tmp/network_perf.txt")

  // Print summary to stdout
  console.log("\n\n==================== SUMMARY ====================")
  console.log(report)
})
