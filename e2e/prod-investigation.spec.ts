import { test, type Page, type Request } from "@playwright/test"
import * as fs from "fs"

const BASE = "https://aspen-os.vercel.app"
const RESULTS_FILE = "/tmp/prod_investigation.txt"

interface ReqInfo {
  url: string
  method: string
  startTime: number
  endTime: number
  duration: number
  resourceType: string
  status: number
  transferSize: number
}

function append(path: string, text: string) {
  try { fs.appendFileSync(path, text, "utf-8") } catch {}
}

test("production investigation", async ({ browser }) => {
  test.setTimeout(600_000)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  let allReqs: ReqInfo[] = []
  let pageUrl = ""

  function startCapture(p: Page) {
    allReqs = []
    p.on("request", (req: Request) => {
      ;(req as any).__start = Date.now()
    })
    p.on("response", (res) => {
      const req = res.request() as any
      if (!req.__start) return
      const dur = Date.now() - req.__start
      allReqs.push({
        url: req.url(),
        method: req.method(),
        startTime: req.__start,
        endTime: req.__start + dur,
        duration: dur,
        resourceType: req.resourceType(),
        status: res.status(),
        transferSize: (res as any).headers()["content-length"] || 0,
      })
    })
  }

  // ─── PHASE 1: AUTH via email+password ───────────────────────
  console.log("=== PHASE 1: Auth ===")
  const email = `perftest-${Date.now()}@aspen-test.com`
  const password = "TestPass123!"

  await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(1000)

  // Sign up
  const emailInput = page.locator("#email")
  if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailInput.fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: /sign.?up|create|submit/i }).click()
    await page.waitForTimeout(8000)
  }

  pageUrl = page.url()
  console.log("After sign-up URL:", pageUrl)

  // If redirect to sign-in, try signing in
  if (pageUrl.includes("sign-in")) {
    await page.locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: /sign.?in|submit/i }).click()
    await page.waitForTimeout(8000)
    pageUrl = page.url()
    console.log("After sign-in URL:", pageUrl)
  }

  // Navigate to workspace creation
  if (pageUrl.includes("workspaces/new") || pageUrl === BASE || pageUrl === `${BASE}/`) {
    console.log("On workspace creation page")
  } else if (pageUrl.includes("/sign-")) {
    console.log("Still on sign-in page — trying direct navigation")
    await page.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 60000 })
  }

  // Create workspace if needed
  const wsInput = page.locator("#name")
  if (await wsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    const wsName = `PerfTest ${Date.now()}`
    await wsInput.fill(wsName)
    await page.getByRole("button", { name: /create/i }).click()
    await page.waitForTimeout(5000)
  }

  pageUrl = page.url()
  console.log("Workspace URL:", pageUrl)

  // Extract slug
  const slug = pageUrl.split("/").filter(Boolean).pop() || pageUrl.split("/").filter(Boolean)[0] || ""
  console.log("Slug:", slug)

  // ─── PHASE 2: RSC WATERFALL ────────────────────────────────
  console.log("\n=== PHASE 2: RSC Waterfall ===")
  startCapture(page)
  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(2000)

  const rscReqs = allReqs.filter(r => r.url.includes("_rsc="))
  const totalRscTime = rscReqs.reduce((s, r) => s + r.duration, 0)
  const uniqueRscUrls = new Set(rscReqs.map(r => r.url.split("?")[0]))
  
  console.log(`Total RSC requests: ${rscReqs.length}`)
  console.log(`Unique RSC URLs: ${uniqueRscUrls.size}`)
  console.log(`Total cumulative RSC time: ${totalRscTime}ms`)
  console.log(`RSC request chain:`)

  // Build RSC waterfall
  const sortedRsc = [...rscReqs].sort((a, b) => a.startTime - b.startTime)
  if (sortedRsc.length > 0) {
    const baseTime = sortedRsc[0].startTime
    for (const r of sortedRsc) {
      const offset = r.startTime - baseTime
      const bar = "█".repeat(Math.max(1, Math.round(r.duration / 20)))
      const path = new URL(r.url).pathname.substring(0, 40)
      const params = new URL(r.url).searchParams
      const rscParam = params.get("_rsc")?.substring(0, 8) || ""
      console.log(`  +${String(offset).padStart(5)}ms [${String(r.duration).padStart(4)}ms] ${bar} ${path} (rsc=${rscParam})`)
    }
  }

  // Check for duplicate RSC requests
  const rscCount: Record<string, number> = {}
  for (const r of rscReqs) {
    const path = new URL(r.url).pathname
    rscCount[path] = (rscCount[path] || 0) + 1
  }
  const duplicates = Object.entries(rscCount).filter(([_, count]) => count > 1)
  if (duplicates.length > 0) {
    console.log(`\nDuplicate RSC requests:`)
    for (const [path, count] of duplicates) {
      console.log(`  ${path} — ${count}x`)
    }
  }

  // ─── PHASE 3: NAVIGATION TIMELINE ──────────────────────────
  console.log("\n=== PHASE 3: Navigation Timeline ===")
  let timelineMs = 0
  let navPerf: any = {}
  let navReqs: ReqInfo[] = []
  // Click on a sidebar link
  const calLink = page.locator('a[href*="calendar"]').first()
  if (await calLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const navEvents: any[] = []

    // Instrument for navigation timing
    await page.evaluate(() => {
      (window as any).__navStart = performance.now()
      ;(window as any).__perfEvents = []
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            ;(window as any).__perfEvents.push({
              name: entry.name,
              startTime: Math.round(entry.startTime),
              duration: Math.round((entry as any).duration || 0),
              type: entry.entryType,
            })
          }
        }).observe({ type: "measure", buffered: true })
      } catch(_) {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            ;(window as any).__perfEvents.push({
              name: entry.name,
              startTime: Math.round(entry.startTime),
              duration: Math.round((entry as any).duration || 0),
              type: entry.entryType,
            })
          }
        }).observe({ type: "navigation", buffered: true })
      } catch(_) {}
    })

    // Capture RSC requests during navigation
    navReqs = []
    page.on("request", (req: Request) => {
      ;(req as any).__navStart = Date.now()
    })
    page.on("response", (res) => {
      const req = res.request() as any
      if (!req.__navStart) return
      navReqs.push({
        url: req.url(),
        method: req.method(),
        startTime: req.__navStart,
        endTime: Date.now(),
        duration: Date.now() - req.__navStart,
        resourceType: req.resourceType(),
        status: res.status(),
        transferSize: 0,
      })
    })

    const clickTime = Date.now()
    await calLink.click()
    await page.waitForTimeout(6000)
    timelineMs = Date.now() - clickTime

    navPerf = await page.evaluate(() => {
      const events = (window as any).__perfEvents || []
      const nav = performance.getEntriesByType("navigation")[0] as any
      const paints: Record<string, number> = {}
      performance.getEntriesByType("paint").forEach((e: any) => { paints[e.name] = Math.round(e.startTime) })
      const lcp = performance.getEntriesByType("largest-contentful-paint")
      const lcpVal = lcp.length > 0 ? Math.round((lcp[lcp.length - 1] as any).startTime) : -1
      return { events, paints, lcp: lcpVal, navTiming: nav ? { ...nav.toJSON() } : {} }
    })

    console.log(`Total navigation time: ${timelineMs}ms`)
    console.log(`FCP: ${navPerf.paints["first-contentful-paint"] || "N/A"}ms`)
    console.log(`LCP: ${navPerf.lcp}ms`)
    console.log(`Navigation events:`)
    for (const ev of navPerf.events.slice(0, 20)) {
      console.log(`  ${ev.type}: ${ev.name.substring(0,60)} start=${ev.startTime}ms dur=${ev.duration}ms`)
    }
    console.log(`\nRSC requests during navigation:`)
    for (const r of navReqs) {
      const path = r.url.includes("_rsc") ? new URL(r.url).pathname + "?_rsc" : r.url.substring(0, 80)
      console.log(`  +${r.startTime - clickTime}ms [${r.duration}ms] ${r.method} ${path}`)
    }
  }

  // ─── PHASE 4: PREFETCH ANALYSIS ────────────────────────────
  console.log("\n=== PHASE 4: Prefetch Analysis ===")
  const prefetchReqs = allReqs.filter(r => {
    const url = r.url
    return url.includes("_rsc=") || url.includes("__next")
  })
  // Group by URL path
  const pathGroups: Record<string, ReqInfo[]> = {}
  for (const r of prefetchReqs) {
    const path = new URL(r.url).pathname
    if (!pathGroups[path]) pathGroups[path] = []
    pathGroups[path].push(r)
  }
  const totalPrefetchBytes = prefetchReqs.reduce((s, r) => s + (r.transferSize || 0), 0)
  console.log(`Total RSC requests: ${prefetchReqs.length}`)
  console.log(`Unique paths prefetched: ${Object.keys(pathGroups).length}`)
  console.log(`Estimated bandwidth: ${(totalPrefetchBytes / 1024).toFixed(1)} KB`)
  for (const [path, reqs] of Object.entries(pathGroups)) {
    const avgDur = Math.round(reqs.reduce((s, r) => s + r.duration, 0) / reqs.length)
    console.log(`  ${path.substring(0,50).padEnd(52)} ${reqs.length}x avg ${avgDur}ms`)
  }

  // ─── PHASE 5: JS BUNDLE LOADING ─────────────────────────────
  console.log("\n=== PHASE 5: JS Bundle Loading ===")
  const scriptReqs = allReqs.filter(r => r.resourceType === "script" && r.url.includes("_next"))
    .sort((a, b) => b.duration - a.duration)
  
  let totalScriptBytes = 0
  let totalScriptTime = 0
  for (const r of scriptReqs) {
    totalScriptBytes += r.transferSize
    totalScriptTime += r.duration
    const chunkName = r.url.split("/").pop() || ""
    console.log(`  ${r.duration.toString().padStart(4)}ms ${(r.transferSize / 1024).toFixed(1).padStart(6)} KB ${chunkName}`)
  }
  console.log(`Total script time: ${totalScriptTime}ms, Total transfer: ${(totalScriptBytes / 1024).toFixed(1)} KB`)

  // ─── PHASE 6: PERFORMANCE TIMING ────────────────────────────
  console.log("\n=== PHASE 6: Performance Timing ===")
  const perf = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as any
    if (!n) return {}
    const paints: Record<string, number> = {}
    performance.getEntriesByType("paint").forEach((e: any) => { paints[e.name] = Math.round(e.startTime) })
    const lcp = performance.getEntriesByType("largest-contentful-paint")
    return {
      ttfb: Math.round(n.responseStart - n.fetchStart),
      fcp: paints["first-contentful-paint"] || -1,
      lcp: lcp.length > 0 ? Math.round((lcp[lcp.length - 1] as any).startTime) : -1,
      domInteractive: Math.round(n.domInteractive),
      domComplete: Math.round(n.domComplete),
      decodedBodySize: n.decodedBodySize,
      transferSize: n.transferSize,
      duration: Math.round(n.duration),
    }
  })
  console.log(JSON.stringify(perf, null, 2))

  // ─── OUTPUT ─────────────────────────────────────────────────
  let output = "=".repeat(120) + "\n"
  output += "PRODUCTION PERFORMANCE INVESTIGATION\n"
  output += `Generated: ${new Date().toISOString()}\n`
  output += "=".repeat(120) + "\n\n"

  output += `## 1. RSC WATERFALL\n\n`
  output += `Total RSC requests: ${rscReqs.length}\n`
  output += `Unique paths: ${uniqueRscUrls.size}\n`
  output += `Cumulative server time: ${totalRscTime}ms\n`
  output += `\nRequest chain (sorted by start time):\n\n`
  const baseTime = sortedRsc.length > 0 ? sortedRsc[0].startTime : 0
  for (const r of sortedRsc) {
    const offset = r.startTime - baseTime
    const path = new URL(r.url).pathname
    output += `  +${String(offset).padStart(5)}ms  [${String(r.duration).padStart(4)}ms]  ${r.method} ${path}\n`
  }
  if (duplicates.length > 0) {
    output += `\nDUPLICATE RSC FETCHES:\n\n`
    for (const [path, count] of duplicates) {
      output += `  ${path} — ${count}x\n`
    }
  }

  output += `\n\n## 2. NAVIGATION TIMELINE\n\n`
  output += `Total time: ${timelineMs || 0}ms\n`

  output += `\n\n## 3. PREFETCH ANALYSIS\n\n`
  output += `Total prefetch/RSC requests: ${prefetchReqs.length}\n`
  output += `Unique paths: ${Object.keys(pathGroups).length}\n`
  output += `Estimated bandwidth: ${(totalPrefetchBytes / 1024).toFixed(1)} KB\n`
  for (const [path, reqs] of Object.entries(pathGroups)) {
    const avgDur = Math.round(reqs.reduce((s, r) => s + r.duration, 0) / reqs.length)
    const totalBytes = reqs.reduce((s, r) => s + (r.transferSize || 0), 0)
    output += `  ${(path || "/").substring(0,55).padEnd(57)} ${reqs.length}x  avg ${avgDur}ms  ${(totalBytes/1024).toFixed(1)} KB\n`
  }

  output += `\n\n## 4. PERFORMANCE TIMING\n\n`
  output += JSON.stringify(perf, null, 2) + "\n"

  output += `\n\n## 5. VERCEL HEADERS\n\n`
  const vercelReqs = allReqs.filter(r => r.url.includes("_rsc=") || r.resourceType === "document")
  for (const r of vercelReqs.slice(0, 3)) {
    output += `  ${r.url}\n`
  }

  output += `\n\n## 6. ALL REQUESTS (sorted by duration)\n\n`
  const allSorted = [...allReqs].sort((a, b) => b.duration - a.duration)
  for (const r of allSorted.slice(0, 40)) {
    const u = new URL(r.url)
    const short = u.pathname + u.search.substring(0, 30)
    output += `  ${String(r.duration).padStart(6)}ms ${r.method.padEnd(6)} ${r.status} ${short.substring(0, 90)}\n`
  }

  append(RESULTS_FILE, output)
  console.log(`\nResults saved to ${RESULTS_FILE}`)
})
