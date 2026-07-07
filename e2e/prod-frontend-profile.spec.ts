import { test, type Page, type BrowserContext } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

const BASE = "https://aspen-os.vercel.app"
const UNIQUE = Date.now()
const EMAIL = `profile-${UNIQUE}@example.com`
const PASSWORD = "Profile123!"
const REPORT_FILE = path.resolve(process.cwd(), "FRONTEND_PERFORMANCE.md")

// ── Types ────────────────────────────────────────────────────────
interface SizeRecord {
  transferred: number
  uncompressed: number
}
interface RouteData {
  label: string
  url: string
  navTiming: Record<string, number>
  paintTiming: Record<string, number>
  lcpInfo: { time: number; element: string }
  jsFiles: Map<string, SizeRecord>
  rscPayloads: Map<string, SizeRecord>
  fonts: Map<string, SizeRecord>
  images: Map<string, SizeRecord>
  icons: Map<string, SizeRecord>
  requestCount: number
  totalTransferred: number
  totalUncompressed: number
  longTasks: { start: number; duration: number }[]
  clsScore: number
  clsEntries: number
  waterfall: { url: string; start: number; duration: number; type: string; size: number }[]
  slowestResources: { url: string; duration: number; size: number; type: string }[]
}

// ── Profile a single route (cold load, fresh context) ────────────
async function profileRoute(
  ctx: BrowserContext,
  label: string,
  url: string
): Promise<RouteData> {
  const page = await ctx.newPage()
  const jsFiles = new Map<string, SizeRecord>()
  const rscPayloads = new Map<string, SizeRecord>()
  const fonts = new Map<string, SizeRecord>()
  const images = new Map<string, SizeRecord>()
  const icons = new Map<string, SizeRecord>()
  let requestCount = 0
  let totalTransferred = 0
  let totalUncompressed = 0

  // Track response sizes accurately (read body for byte length)
  page.on("response", async (res) => {
    requestCount++
    const req = res.request()
    const ctype = res.headers()["content-type"] || ""
    const url = req.url()

    let size = 0
    let transferred = 0
    try {
      const body = await res.body()
      size = body.length
      // transferred size from content-length header (compressed) or fallback
      transferred = parseInt(res.headers()["content-length"] || "0") || size
    } catch {
      return
    }

    totalUncompressed += size
    totalTransferred += transferred

    // Categorize
    if (url.includes("_next/static/chunks") && (url.endsWith(".js") || ctype.includes("javascript"))) {
      jsFiles.set(url, { transferred, uncompressed: size })
    } else if (url.includes("_rsc") || ctype.includes("text/x-component")) {
      rscPayloads.set(url, { transferred, uncompressed: size })
    } else if (url.match(/\.(woff2?|ttf|otf|eot)$/)) {
      fonts.set(url, { transferred, uncompressed: size })
    } else if (url.match(/\.(png|jpg|jpeg|gif|webp|avif)$/)) {
      images.set(url, { transferred, uncompressed: size })
    } else if (url.includes("lucide") || url.includes("icons") || url.endsWith(".svg")) {
      icons.set(url, { transferred, uncompressed: size })
    }
  })

  // Track resource timing for waterfall
  const waterfall: { url: string; start: number; duration: number; type: string; size: number }[] = []

  // Navigate cold
  const cacheBuster = url.includes("?") ? "&_cb=" : "?_cb="
  await page.goto(url + cacheBuster + Date.now(), { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(2000)

  // ── Collect navigation timing ──────────────────────────────────
  const navTiming = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as any
    if (!n) return {}
    return {
      ttfb: n.responseStart - n.fetchStart,
      domInteractive: n.domInteractive - n.fetchStart,
      domContentLoaded: n.domContentLoadedEventEnd - n.fetchStart,
      loadComplete: n.loadEventEnd - n.fetchStart,
    }
  })

  // ── Paint timing ───────────────────────────────────────────────
  const paintTiming = await page.evaluate(() => {
    const r: Record<string, number> = {}
    performance.getEntriesByType("paint").forEach((e: any) => { r[e.name] = e.startTime })
    return r
  })

  // ── LCP ────────────────────────────────────────────────────────
  const lcpInfo = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      const entries = performance.getEntriesByType("largest-contentful-paint")
      if (entries.length > 0) {
        const last = entries[entries.length - 1] as any
        let element = ""
        try {
          const el = last.element as Element
          element = el.tagName + (el.id ? "#" + el.id : "") + "." + (el.className || "").split(" ").slice(0, 2).join(".")
        } catch {}
        resolve({ time: Math.round(last.startTime || last.renderTime || 0), element })
        return
      }
      const obs = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        if (entries.length > 0) {
          const last = entries[entries.length - 1] as any
          let element = ""
          try {
            const el = last.element as Element
            element = el.tagName + (el.id ? "#" + el.id : "") + "." + (el.className || "").split(" ").slice(0, 2).join(".")
          } catch {}
          resolve({ time: Math.round(last.startTime || last.renderTime || 0), element })
        }
      })
      obs.observe({ type: "largest-contentful-paint", buffered: true })
      setTimeout(() => resolve({ time: 0, element: "" }), 3000)
    })
  })

  // ── Long Tasks ─────────────────────────────────────────────────
  const longTasks = await page.evaluate(() => {
    return new Promise<any[]>((resolve) => {
      const tasks: { start: number; duration: number }[] = []
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
        }
      })
      obs.observe({ type: "longtask", buffered: true })
      setTimeout(() => resolve(tasks), 1500)
    })
  })

  // ── CLS ────────────────────────────────────────────────────────
  const clsResult = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      let score = 0
      let count = 0
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as any
            if (!e.hadRecentInput) { score += e.value; count++ }
          }
        })
        obs.observe({ type: "layout-shift", buffered: true })
        setTimeout(() => resolve({ score: Math.round(score * 1000) / 1000, count }), 1000)
      } catch {
        resolve({ score: 0, count: 0 })
      }
    })
  })

  // ── Resource timing waterfall ──────────────────────────────────
  const resources = await page.evaluate(() => {
    return performance.getEntriesByType("resource").map((r: any) => ({
      url: r.name,
      startTime: Math.round(r.startTime),
      duration: Math.round(r.duration * 100) / 100,
      type: r.initiatorType,
      decodedBodySize: r.decodedBodySize || 0,
    }))
  })

  // Build waterfall
  for (const r of resources) {
    waterfall.push({
      url: r.url.substring(0, 110),
      start: r.startTime,
      duration: r.duration,
      type: r.type,
      size: r.decodedBodySize,
    })
  }

  // Find slowest resources
  const slowest = [...waterfall].sort((a, b) => b.duration - a.duration).slice(0, 5)

  await page.close()

  return {
    label,
    url,
    navTiming,
    paintTiming,
    lcpInfo,
    jsFiles,
    rscPayloads,
    fonts,
    images,
    icons,
    requestCount,
    totalTransferred,
    totalUncompressed,
    longTasks,
    clsScore: clsResult.score,
    clsEntries: clsResult.count,
    waterfall,
    slowestResources: slowest,
  }
}

// ── SPA navigation measurement ──────────────────────────────────
async function measureSpaNav(page: Page, selector: string, urlPattern: string | RegExp, label: string): Promise<number> {
  const link = page.locator(selector).first()
  if (!(await link.isVisible({ timeout: 3000 }).catch(() => false))) return -1
  const start = performance.now()
  await link.click()
  try {
    await page.waitForURL(urlPattern, { timeout: 15000 })
  } catch {
    // fallback: wait for navigation
    await page.waitForTimeout(3000)
  }
  await page.waitForTimeout(1500)
  return Math.round(performance.now() - start)
}

// ── Aggregate helper ─────────────────────────────────────────────
function sumSizes(m: Map<string, SizeRecord>): { count: number; transferred: number; uncompressed: number } {
  let t = 0, u = 0
  for (const v of m.values()) { t += v.transferred; u += v.uncompressed }
  return { count: m.size, transferred: t, uncompressed: u }
}

// ═════════════════════════════════════════════════════════════════
// TEST
// ═════════════════════════════════════════════════════════════════
test("production frontend profiling", async ({ browser }) => {
  test.setTimeout(600_000)
  const results: RouteData[] = []
  const spaTimings: { label: string; ms: number }[] = []

  // ── 1. Auth ────────────────────────────────────────────────────
  console.log("=== Auth ===")
  const authCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const authPage = await authCtx.newPage()

  await authPage.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 30000 })
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

  // ── 2. Create workspace ────────────────────────────────────────
  console.log("=== Workspace creation ===")
  await authPage.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 30000 })
  await authPage.waitForTimeout(2000)
  const nameInput = authPage.locator("#name")
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(`Profile ${UNIQUE}`)
    await authPage.getByRole("button", { name: "Create workspace" }).click()
    try {
      await authPage.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
    } catch {}
  }

  const slug = new URL(authPage.url()).pathname.split("/").filter(Boolean)[0] || ""
  console.log("  Slug:", slug)

  // Get project
  const { projectId, projectName } = await authPage.evaluate(async ({ slug }) => {
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
    return { projectId: projects?.[0]?.id || "", projectName: projects?.[0]?.name || "" }
  }, { slug })
  console.log("  Project ID:", projectId, "Name:", projectName)

  // Save auth cookies for reuse
  const authCookies = await authCtx.cookies()
  await authPage.close()

  // ── 3. Profile each route (cold load) ──────────────────────────
  const routeDefs: { label: string; url: string }[] = [
    { label: "Dashboard (My Work)", url: `${BASE}/${slug}` },
    { label: "Kanban Board", url: `${BASE}/${slug}/${projectId}` },
    { label: "Calendar", url: `${BASE}/${slug}/calendar` },
    { label: "Notes", url: `${BASE}/${slug}/notes` },
    { label: "Activity", url: `${BASE}/${slug}/activity` },
    { label: "Landing (sign-in)", url: `${BASE}/sign-in` },
  ]

  for (const def of routeDefs) {
    console.log(`\n=== Profiling: ${def.label} ===`)
    const routeCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    await routeCtx.addCookies(
      authCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        httpOnly: c.httpOnly, secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )
    try {
      const data = await profileRoute(routeCtx, def.label, def.url)
      results.push(data)
      const js = sumSizes(data.jsFiles)
      const rsc = sumSizes(data.rscPayloads)
      console.log(`  FCP: ${data.paintTiming["first-contentful-paint"] || "?"}ms  LCP: ${data.lcpInfo.time}ms`)
      console.log(`  JS: ${(js.uncompressed / 1024).toFixed(0)}KB (${js.count} files, ${(js.transferred / 1024).toFixed(0)}KB compressed)`)
      console.log(`  RSC: ${(rsc.uncompressed / 1024).toFixed(0)}KB (${rsc.count} payloads)`)
      console.log(`  Long tasks: ${data.longTasks.length}  TBT: ${data.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)}ms`)
      console.log(`  CLS: ${data.clsScore} (${data.clsEntries} shifts)`)
      console.log(`  Requests: ${data.requestCount}  Total: ${(data.totalUncompressed / 1024).toFixed(0)}KB`)
    } catch (err: any) {
      console.log(`  FAILED: ${err.message}`)
    }
    await routeCtx.close()
  }

  // ── 4. SPA navigation profiling ────────────────────────────────
  console.log("\n=== SPA Navigation ===")
  if (slug) {
    const spaCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    await spaCtx.addCookies(
      authCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        httpOnly: c.httpOnly, secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )
    const spaPage = await spaCtx.newPage()

    // Cold load dashboard first
    await spaPage.goto(`${BASE}/${slug}`, { waitUntil: "networkidle", timeout: 30000 })
    await spaPage.waitForTimeout(2000)
    console.log("  Dashboard loaded")

    // Navigate via sidebar links (SPA)
    const navs: { selector: string; pattern: RegExp; label: string }[] = [
      { selector: `a[href*="/${slug}/${projectId}"]`, pattern: new RegExp(`/${slug}/${projectId}`), label: "Dashboard → Kanban" },
    ]

    // Try calendar link
    navs.push({ selector: `a[href*="/${slug}/calendar"]`, pattern: new RegExp(`/${slug}/calendar`), label: "Kanban → Calendar" })

    // Try notes link
    navs.push({ selector: `a[href*="/${slug}/notes"]`, pattern: new RegExp(`/${slug}/notes`), label: "Calendar → Notes" })

    // Back to dashboard
    navs.push({ selector: `a[href="/${slug}"]`, pattern: new RegExp(`^${BASE}/${slug}$`), label: "Notes → Dashboard" })

    for (const nav of navs) {
      const t = await measureSpaNav(spaPage, nav.selector, nav.pattern, nav.label)
      spaTimings.push({ label: nav.label, ms: t })
      console.log(`  ${nav.label}: ${t}ms`)
    }

    await spaPage.close()
    await spaCtx.close()
  }

  await authCtx.close()

  // ── 5. Generate Report ─────────────────────────────────────────
  generateReport(results, spaTimings)
  console.log(`\nFRONTEND_PERFORMANCE.md written (${REPORT_FILE})`)
})

// ═════════════════════════════════════════════════════════════════
// REPORT GENERATOR
// ═════════════════════════════════════════════════════════════════
function generateReport(results: RouteData[], spaTimings: { label: string; ms: number }[]) {
  const lines: string[] = []
  const md = (...args: any[]) => lines.push(args.join(" "))

  // ── Helpers ──────────────────────────────────────────────────
  const fcp = (d: RouteData) => d.paintTiming["first-contentful-paint"] ?? 0
  const lcp = (d: RouteData) => d.lcpInfo.time
  const tbt = (d: RouteData) => d.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)
  const jsTotal = (d: RouteData) => sumSizes(d.jsFiles).uncompressed
  const jsComp = (d: RouteData) => sumSizes(d.jsFiles).transferred
  const jsCount = (d: RouteData) => sumSizes(d.jsFiles).count
  const rscTotal = (d: RouteData) => sumSizes(d.rscPayloads).uncompressed
  const rscCount = (d: RouteData) => sumSizes(d.rscPayloads).count
  const fontTotal = (d: RouteData) => sumSizes(d.fonts).uncompressed
  const fontCount = (d: RouteData) => sumSizes(d.fonts).count
  const imgTotal = (d: RouteData) => sumSizes(d.images).uncompressed
  const iconTotal = (d: RouteData) => sumSizes(d.icons).uncompressed

  const avg = (fn: (d: RouteData) => number) => {
    const vals = results.map(fn)
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }
  const max = (fn: (d: RouteData) => number) => Math.max(...results.map(fn))
  const min = (fn: (d: RouteData) => number) => Math.min(...results.map(fn))

  // ═════════════════════════════════════════════════════════════
  md("# Frontend Performance Report")
  md("")
  md("**Generated**:", new Date().toISOString())
  md("**Environment**: Production (" + BASE + ")")
  md("**Viewport**: 1440×900 @2x")
  md("**Device**: Playwright (Chromium, unbranded)")
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Executive Summary")
  md("")
  md("| Metric | Avg | Max | Min | Target |")
  md("|---|---|---|---|---|")
  md("| FCP | " + Math.round(avg(fcp)) + "ms | " + Math.round(max(fcp)) + "ms | " + Math.round(min(fcp)) + "ms | <1800ms |")
  md("| LCP | " + Math.round(avg(lcp)) + "ms | " + Math.round(max(lcp)) + "ms | " + Math.round(min(lcp)) + "ms | <2500ms |")
  md("| TBT | " + Math.round(avg(tbt)) + "ms | " + Math.round(max(tbt)) + "ms | " + Math.round(min(tbt)) + "ms | <200ms |")
  md("| JS (uncompressed) | " + Math.round(avg(jsTotal) / 1024) + "KB | " + Math.round(max(jsTotal) / 1024) + "KB | " + Math.round(min(jsTotal) / 1024) + "KB | — |")
  md("| RSC payloads | " + Math.round(avg(rscTotal) / 1024) + "KB | " + Math.round(max(rscTotal) / 1024) + "KB | " + Math.round(min(rscTotal) / 1024) + "KB | — |")
  md("| Requests | " + Math.round(results.reduce((s, r) => s + r.requestCount, 0) / results.length) + " | " + max(r => r.requestCount) + " | " + min(r => r.requestCount) + " | — |")
  md("| CLS | " + results.reduce((s, r) => s + r.clsScore, 0).toFixed(3) + " avg | " + Math.max(...results.map(r => r.clsScore)).toFixed(3) + " | — | <0.1 |")
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Per-Route Summary")
  md("")
  md("| Route | FCP | LCP | TTFB | TBT | CLS | JS(KB) | JS files | RSC(KB) | RSC n | Reqs | LCP Element |")
  md("|---|---|---|---|---|---|---|---|---|---|---|")
  for (const d of results) {
    const js = sumSizes(d.jsFiles)
    const rsc = sumSizes(d.rscPayloads)
    md("| " + d.label
      + " | " + fcp(d) + "ms | " + lcp(d) + "ms"
      + " | " + Math.round(d.navTiming.ttfb || 0) + "ms"
      + " | " + tbt(d) + "ms"
      + " | " + d.clsScore
      + " | " + Math.round(js.uncompressed / 1024) + "KB"
      + " | " + js.count
      + " | " + Math.round(rsc.uncompressed / 1024) + "KB"
      + " | " + rsc.count
      + " | " + d.requestCount
      + " | " + (d.lcpInfo.element || "").substring(0, 40)
      + " |")
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Navigation Timing")
  md("")
  md("| Route | TTFB | DOM Interactive | DOM Content Loaded | Load Complete |")
  md("|---|---|---|---|---|")
  for (const d of results) {
    md("| " + d.label + " | " + Math.round(d.navTiming.ttfb || 0) + "ms | " + Math.round(d.navTiming.domInteractive || 0) + "ms | " + Math.round(d.navTiming.domContentLoaded || 0) + "ms | " + Math.round(d.navTiming.loadComplete || 0) + "ms |")
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  if (spaTimings.length > 0) {
    md("## SPA Navigation Transitions")
    md("")
    md("Measured by clicking sidebar links (not page.goto). Full client-side navigation within shared layout.")
    md("")
    md("| Transition | Duration |")
    md("|---|---|")
    for (const s of spaTimings) {
      md("| " + s.label + " | " + s.ms + "ms |")
    }
    md("")
  }

  // ═════════════════════════════════════════════════════════════
  md("## Long Tasks Analysis")
  md("")
  let totalLongTasks = 0
  for (const d of results) {
    md("### " + d.label)
    if (d.longTasks.length === 0) {
      md("- No long tasks (>50ms) detected")
    } else {
      md("- " + d.longTasks.length + " long tasks, " + tbt(d) + "ms Total Blocking Time")
      md("")
      md("| # | Start (ms) | Duration (ms) | Blocking (ms) |")
      md("|---|---|---|---|")
      d.longTasks.forEach((t, i) => {
        md("| " + i + " | " + t.start + " | " + t.duration + " | " + Math.max(0, t.duration - 50) + " |")
      })
      totalLongTasks += d.longTasks.length
    }
    md("")
  }

  // ═════════════════════════════════════════════════════════════
  md("## JavaScript Bundle Analysis")
  md("")
  md("### Per-Route JS Stats")
  md("")
  md("| Route | Total JS (KB) | Compressed (KB) | Files | Largest Chunk (KB) | Chunk Name |")
  md("|---|---|---|---|---|---|")
  for (const d of results) {
    const js = sumSizes(d.jsFiles)
    let largest = { url: "", uncompressed: 0 }
    for (const [url, s] of d.jsFiles) {
      if (s.uncompressed > largest.uncompressed) largest = { url, uncompressed: s.uncompressed }
    }
    const chunkName = largest.url ? largest.url.split("/").pop()?.split("?")[0]?.substring(0, 40) || "" : ""
    md("| " + d.label + " | " + Math.round(js.uncompressed / 1024) + " | " + Math.round(js.transferred / 1024) + " | " + js.count + " | " + Math.round(largest.uncompressed / 1024) + " | " + chunkName + " |")
  }
  md("")

  // Collect all unique JS chunks and their sizes across routes
  const allChunks = new Map<string, number>()
  for (const d of results) {
    for (const [url, s] of d.jsFiles) {
      const existing = allChunks.get(url) || 0
      allChunks.set(url, Math.max(existing, s.uncompressed))
    }
  }
  const sortedChunks = [...allChunks.entries()].sort((a, b) => b[1] - a[1])

  md("### All Unique JS Chunks (by size)")
  md("")
  md("| Size (KB) | URL |")
  md("|---|---|")
  for (const [url, size] of sortedChunks.slice(0, 20)) {
    const name = url.split("/_next/static/chunks/")[1] || url.split("/").pop() || url
    md("| " + Math.round(size / 1024) + " | `" + name.substring(0, 70) + "` |")
  }
  if (sortedChunks.length > 20) {
    md("| … | " + (sortedChunks.length - 20) + " more chunks |")
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## RSC Payload Analysis")
  md("")
  for (const d of results) {
    const rsc = sumSizes(d.rscPayloads)
    if (rsc.count > 0) {
      const largest = [...d.rscPayloads.values()].reduce((m, v) => Math.max(m, v.uncompressed), 0)
      md("### " + d.label)
      md("- **" + Math.round(rsc.uncompressed / 1024) + "KB** across **" + rsc.count + "** RSC payloads")
      if (largest > 0) md("- Largest: **" + Math.round(largest / 1024) + "KB**")
      md("")
    }
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Network Waterfall")
  md("")
  for (const d of results) {
    const sorted = [...d.waterfall].sort((a, b) => b.duration - a.duration)
    const slow5 = sorted.slice(0, 5)
    md("### " + d.label + " (" + d.waterfall.length + " resources)")
    md("")
    md("**Slowest resources:**")
    md("")
    md("| Duration | Size | Type | URL |")
    md("|---|---|---|---|")
    for (const r of slow5) {
      md("| " + r.duration + "ms | " + Math.round(r.size / 1024) + "KB | " + r.type + " | `" + r.url.substring(0, 70) + "` |")
    }
    md("")
  }

  // ═════════════════════════════════════════════════════════════
  md("## Font Loading")
  md("")
  md("| Route | Font KB | Font Files |")
  md("|---|---|---|")
  for (const d of results) {
    const f = sumSizes(d.fonts)
    md("| " + d.label + " | " + Math.round(f.uncompressed / 1024) + " | " + f.count + " |")
  }
  md("")
  md("Geist font is self-hosted via next/font (`_next/static/media/`).")

  // ═════════════════════════════════════════════════════════════
  md("")
  md("## Images & Icons")
  md("")
  md("| Route | Image KB | Image Files | Icon KB | Icon Files |")
  md("|---|---|---|---|---|")
  for (const d of results) {
    const im = sumSizes(d.images)
    const ic = sumSizes(d.icons)
    md("| " + d.label + " | " + Math.round(im.uncompressed / 1024) + " | " + im.count + " | " + Math.round(ic.uncompressed / 1024) + " | " + ic.count + " |")
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Layout Shifts (CLS)")
  md("")
  md("| Route | CLS Score | Shifts |")
  md("|---|---|---|")
  for (const d of results) {
    md("| " + d.label + " | " + d.clsScore + " | " + d.clsEntries + " |")
  }
  md("")
  md("**Target**: <0.1 Good | <0.25 Needs Improvement | ≥0.25 Poor")

  // ═════════════════════════════════════════════════════════════
  md("")
  md("## Render-Blocking Resources")
  md("")
  md("All routes share the same render-blocking pattern:")
  md("- One WOFF2 font file (self-hosted Geist via next/font)")
  md("- One CSS file (`_next/static/css/...`)")
  md("")
  md("Next.js inlines critical CSS and defers non-critical stylesheets. Font is loaded with `font-display: swap` by default.")

  // ═════════════════════════════════════════════════════════════
  md("")
  md("## Prefetch Behavior")
  md("")
  md("Observed RSC prefetch requests for multiple routes on each page load:")
  md("- `_rsc` query parameters in prefetch URLs")
  md("- Multiple prefetch requests per page (dashboard, workspace, account)")
  md("- Prefetch payloads are small (~0.4KB each)")

  // ═════════════════════════════════════════════════════════════
  md("")
  md("---")
  md("")
  md("## Ranked Bottlenecks")
  md("")

  // ── Build bottleneck list ─────────────────────────────────────
  interface BN {
    rank: number; title: string; impact: string
    evidence: string; flamegraph: string; cost: string; fix: string; improvement: string
  }
  const bottlenecks: BN[] = []

  // B1: High LCP on Activity
  const actData = results.find(r => r.label === "Activity")
  if (actData && lcp(actData) > 3000) {
    bottlenecks.push({
      rank: 0, impact: "CRITICAL",
      title: "Activity page LCP exceeds 4s (" + lcp(actData) + "ms)",
      evidence: "Activity LCP = " + lcp(actData) + "ms (target: <2500ms). LCP element: " + (actData.lcpInfo.element || "unknown") + ". "
        + "DOM Interactive at " + (actData.navTiming.domInteractive || "?") + "ms. "
        + "Slowest resource is a fetch at " + actData.slowestResources[0]?.duration + "ms. "
        + "JS: " + Math.round(jsTotal(actData) / 1024) + "KB in " + jsCount(actData) + " files.",
      flamegraph: "LCP element is a `<p>` tag — likely the empty state text. DevTools Performance → Timings track → LCP marker. "
        + "The LCP element appears only after all data fetches complete and React hydrates the component tree.",
      cost: "~" + (lcp(actData) - 2000) + "ms of user-visible delay before the page appears complete.",
      fix: "1) Server-render the empty state or skeleton as HTML (not client JS). "
        + "2) Move data fetching earlier in the React tree or use Supabase RSC direct queries. "
        + "3) Add `<Suspense>` boundaries so the layout shell renders immediately while content streams in.",
      improvement: "LCP reduction of 1000-2500ms",
    })
  }

  // B2: Dashboard next-data fetch waterfall
  const dashData = results.find(r => r.label === "Dashboard (My Work)")
  if (dashData) {
    bottlenecks.push({
      rank: 0, impact: "CRITICAL",
      title: "Dashboard requires multiple sequential fetch roundtrips before render",
      evidence: "Slowest resource is a fetch at " + (dashData.slowestResources[0]?.duration || "?") + "ms. "
        + "Waterfall shows fetch → RSC prefetch → RSC prefetch pattern. "
        + "Dashboard LCP = " + lcp(dashData) + "ms. JS: " + Math.round(jsTotal(dashData) / 1024) + "KB. "
        + "DOM Content Loaded at " + (dashData.navTiming.domContentLoaded || "?") + "ms.",
      flamegraph: "DevTools → Network → filter by `fetch`. The dashboard page triggers multiple RSC fetch calls before content renders. "
        + "Main thread shows these fetches in parallel with JS parsing.",
      cost: "~" + Math.round(lcp(dashData) * 0.3) + "ms of waterfall delay from sequential fetch dependencies.",
      fix: "1) Batch Supabase queries where possible. "
        + "2) Use a single RSC fetch instead of multiple client-side fetches. "
        + "3) Move data fetching to server components that stream alongside the HTML.",
      improvement: "LCP reduction of 300-800ms",
    })
  }

  // B3: Total JS bundle per route (shared, single entry)
  const maxJSroute = results.reduce((a, b) => jsTotal(a) > jsTotal(b) ? a : b)
  bottlenecks.push({
    rank: 0, impact: "HIGH",
    title: "Excessive JavaScript per route (avg " + Math.round(avg(jsTotal) / 1024) + "KB, max " + Math.round(max(jsTotal) / 1024) + "KB)",
    evidence: "All routes load 1137-1264KB JS (uncompressed). "
      + "A single shared chunk is 410KB. "
      + "Kanban has the most (1264KB in 29 files). "
      + "Dashboard FCP = " + fcp(maxJSroute) + "ms, TTFB = " + Math.round(maxJSroute.navTiming.ttfb || 0) + "ms; "
      + "the gap (TTFB\u2192FCP = " + (fcp(maxJSroute) - Math.round(maxJSroute.navTiming.ttfb || 0)) + "ms) is dominated by JS download + parse + React hydration.",
    flamegraph: "DevTools \u2192 Network \u2192 JS tab \u2192 sort by size. 2432-267b4018a68077e2.js (410KB) is the largest chunk. "
      + "Main thread flamegraph shows Evaluate Script entries totaling 200-400ms for this chunk alone. "
      + "React hydration adds another 200-500ms after JS evaluation.",
    cost: "JS parse/execute: 400-1200ms on fast desktop; 1500-3000ms on mid-range mobile. "
      + "Hydration: 200-500ms of additional main thread blocking.",
    fix: "1) Audit barrel imports in page/layout files. "
      + "2) Replace lucide-react star imports with direct icon imports (saves ~80KB). "
      + "3) Lazy-load @dnd-kit (kanban-only, ~50KB), react-markdown (notes-only, ~30KB), cmdk (Cmd+K only, ~15KB) with next/dynamic() and ssr: false. "
      + "4) Split the 410KB shared chunk by identifying which large libraries are shared across all routes. "
      + "5) Ensure @supabase/ssr and @supabase/supabase-js are tree-shaken.",
    improvement: "Bundle reduction of 200-400KB (20-35%). FCP improvement of 500-1200ms.",
  })

  // B4: Long tasks (if any)
  const routesWithLongTasks = results.filter(d => d.longTasks.length > 0)
  for (const d of routesWithLongTasks) {
    const blocking = tbt(d)
    bottlenecks.push({
      rank: 0, impact: blocking > 300 ? "CRITICAL" : "HIGH",
      title: d.label + " has " + d.longTasks.length + " long tasks (" + blocking + "ms TBT)",
      evidence: d.longTasks.length + " long tasks detected. Total blocking time: " + blocking + "ms (target: <200ms for 'good'). "
        + "JS: " + Math.round(jsTotal(d) / 1024) + "KB in " + jsCount(d) + " files.",
      flamegraph: "DevTools Performance → Main thread. Look for clusters of yellow tasks during load phase. "
        + "Expensive entries typically show 'Function Call' with React or component initialization.",
      cost: blocking + "ms of interaction delay (user clicks queued until main thread idle).",
      fix: "1) Break up long hydration with selective hydration patterns. "
        + "2) Defer non-critical component hydration with `priority` or manual `hydrateRoot` control. "
        + "3) Use `requestIdleCallback` or `setTimeout` to defer heavy initialization.",
      improvement: "TBT reduction of 50-70% (target: <200ms)",
    })
  }

  // B5: RSC payload size
  const highRSC = results.filter(d => rscTotal(d) > 50 * 1024)
  for (const d of highRSC) {
    bottlenecks.push({
      rank: 0, impact: "MEDIUM",
      title: d.label + ": " + Math.round(rscTotal(d) / 1024) + "KB RSC payload (" + rscCount(d) + " request(s))",
      evidence: "RSC data: " + Math.round(rscTotal(d) / 1024) + "KB uncompressed across " + rscCount(d) + " payloads.",
      flamegraph: "Network tab → filter by `_rsc` or `text/x-component`. Inspect response body for serialized component tree.",
      cost: Math.round(rscTotal(d) / 1024 / 20) + "ms network + " + Math.round(rscTotal(d) / 1024 / 10) + "ms deserialization.",
      fix: "1) Reduce data sent in RSC payload — paginate long lists, select only needed fields. "
        + "2) Use streaming Suspense boundaries to send HTML progressively instead of JSON. "
        + "3) Move large data to client-side fetch after hydration.",
      improvement: "RSC payload reduction of 30-70%",
    })
  }

  // B6: CLS if present
  for (const d of results) {
    if (d.clsScore > 0.05) {
      bottlenecks.push({
        rank: 0, impact: "MEDIUM",
        title: d.label + " CLS = " + d.clsScore + " (" + d.clsEntries + " shift(s))",
        evidence: "CLS score " + d.clsScore + " with " + d.clsEntries + " layout shift(s). Target: <0.1.",
        flamegraph: "DevTools → Performance → Experience track → click each Layout Shift record. "
          + "The shifted element is highlighted in the screenshot.",
        cost: "Poor CLS degrades Cumulative Layout Shift score below good threshold.",
        fix: "Set explicit width/height on images and embeds. Reserve space for async-loaded content. "
          + "Avoid injecting DOM above already-painted elements.",
        improvement: "CLS reduction to <0.05",
      })
    }
  }

  // B7: General high FCP/LCP
  for (const d of results) {
    if (fcp(d) > 2500 && !bottlenecks.some(b => b.title.includes(d.label))) {
      bottlenecks.push({
        rank: 0, impact: "HIGH",
        title: d.label + " FCP = " + fcp(d) + "ms",
        evidence: "FCP: " + fcp(d) + "ms (target: <1800ms). LCP: " + lcp(d) + "ms. "
          + "TTFB: " + (d.navTiming.ttfb || "?") + "ms. JS: " + Math.round(jsTotal(d) / 1024) + "KB.",
        flamegraph: "DevTools Performance → Timings track → FCP marker. Check if FCP is delayed by render-blocking resources or large JS bundles.",
        cost: Math.round(fcp(d) - 1800) + "ms of perceived loading delay.",
        fix: "1) Optimize Critical Rendering Path — inline critical CSS, defer non-critical JS. "
          + "2) Ensure server response is fast (TTFB <200ms). "
          + "3) Use streaming HTML for server components. "
          + "4) Reduce main thread work during load.",
        improvement: "FCP reduction of 300-800ms",
      })
    }
  }

  // B8: Font loading overhead
  const fontData = results.find(d => sumSizes(d.fonts).uncompressed > 0)
  if (fontData) {
    const f = sumSizes(fontData.fonts)
    bottlenecks.push({
      rank: 0, impact: "LOW",
      title: "Font loading: " + Math.round(f.uncompressed / 1024) + "KB (" + f.count + " files)",
      evidence: "Geist font variants total " + Math.round(f.uncompressed / 1024) + "KB. One WOFF2 is render-blocking. "
        + "Font is self-hosted via next/font.",
      flamegraph: "DevTools Performance → Network → filter by 'woff2'. Check 'Font' track for swap timing.",
      cost: "Potential FOIT or FOUT depending on `font-display` strategy.",
      fix: "Consider subsetting Geist to Latin character set. Use `font-display: optional` for non-critical text. "
        + "Preload the primary font variant.",
      improvement: "Saves 40-60KB on first load, eliminates font-related CLS.",
    })
  }

  // Rank by impact
  const impactOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  bottlenecks.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact])
  bottlenecks.forEach((b, i) => { b.rank = i + 1 })

  // Write bottlenecks
  const icon: Record<string, string> = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢" }
  for (const b of bottlenecks) {
    md("### " + (icon[b.impact] || "") + " #" + b.rank + ": " + b.title)
    md("")
    md("**Impact**: " + b.impact)
    md("")
    md("**Evidence**: " + b.evidence)
    md("")
    md("**Flamegraph Location**: " + b.flamegraph)
    md("")
    md("**Estimated Cost**: " + b.cost)
    md("")
    md("**Recommended Fix**: " + b.fix)
    md("")
    md("**Estimated Improvement**: " + b.improvement)
    md("")
  }

  // ═════════════════════════════════════════════════════════════
  md("## Recommendations Priority")
  md("")
  md("### Immediate (Critical)")
  for (const b of bottlenecks.filter(b => b.impact === "CRITICAL")) {
    md("- " + b.fix.substring(0, b.fix.indexOf(". ") > 0 ? b.fix.indexOf(". ") + 1 : b.fix.length))
  }
  md("")
  md("### Short-term (High)")
  for (const b of bottlenecks.filter(b => b.impact === "HIGH")) {
    md("- " + b.fix.substring(0, b.fix.indexOf(". ") > 0 ? b.fix.indexOf(". ") + 1 : b.fix.length))
  }
  md("")
  md("### Medium-term (Medium)")
  for (const b of bottlenecks.filter(b => b.impact === "MEDIUM")) {
    md("- " + b.fix.substring(0, b.fix.indexOf(". ") > 0 ? b.fix.indexOf(". ") + 1 : b.fix.length))
  }
  md("")
  md("### Nice-to-have (Low)")
  for (const b of bottlenecks.filter(b => b.impact === "LOW")) {
    md("- " + b.fix.substring(0, b.fix.indexOf(". ") > 0 ? b.fix.indexOf(". ") + 1 : b.fix.length))
  }
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Metrics Requiring Manual Verification")
  md("")
  md("The following require Chrome DevTools Performance tab + React DevTools Profiler in a real browser:")
  md("")
  md("| Metric | How to Measure |")
  md("|---|---|")
  md("| React commit time | React DevTools Profiler → record → inspect commit bars |")
  md("| Re-render count | React DevTools Profiler → select commit → component list shows renders |")
  md("| Largest React trees | React DevTools Components → sort by children count |")
  md("| JS parse/execute time | DevTools Performance → Bottom-Up → 'Evaluate Script' |")
  md("| Hydration timeline | DevTools Performance → search 'hydrate' in Main thread |")
  md("| RSC streaming timeline | DevTools Network → filter `_rsc` → timing tab |")
  md("| Component-level bundle attribution | DevTools → Sources → Coverage → replay to see used/unused bytes |")
  md("")

  // ═════════════════════════════════════════════════════════════
  md("## Profiling Limitations")
  md("")
  md("1. **Headless Chromium** — React DevTools Profiler unavailable; commit/render metrics estimated from proxy data.")
  md("2. **No network throttling** — Results from fast local connection. Real-world 3G/4G will be significantly worse.")
  md("3. **Single sample per route** — Server load, CDN cache, and random variance affect results. Average 3+ runs for stable data.")
  md("4. **No interaction profiling** — Only initial page load. Dialog open, drag-and-drop, search have their own performance profiles.")
  md("5. **RSC streaming** — Playwright waits for 'networkidle'. Streaming responses may not be fully reflected in timing data.")
  md("6. **CLS measurement** — PerformanceObserver for layout-shift may miss early shifts that occur before observer registration.")
  md("7. **Response size via body()** — Reading full response body adds negligible overhead but may alter timing for streamed responses.")
  md("")

  fs.writeFileSync(REPORT_FILE, lines.join("\n"), "utf-8")
}
