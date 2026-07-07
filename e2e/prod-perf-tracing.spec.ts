import { test, type Page } from "@playwright/test"
import * as fs from "fs"

const BASE = "https://aspen-os.vercel.app"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
const RESULTS_FILE = "/tmp/tracing_perf.txt"

interface TracingResult {
  route: string
  url: string
  traceEvents: any[]
  coverage: { url: string; usedBytes: number; totalBytes: number; usedPercent: number }[]
  paintEvents: { name: string; startTime: number; duration: number }[]
  layoutEvents: { startTime: number; duration: number; source: string }[]
  scriptCompilationEvents: { startTime: number; duration: number; url: string }[]
  gcEvents: { startTime: number; duration: number }[]
  longTasks: { startTime: number; duration: number; blockingTime: number }[]
  totalBlockingTime: number
  userMeasures: { name: string; startTime: number; duration: number }[]
  navigationTiming: Record<string, number>
  paintTiming: Record<string, number>
  errors: string[]
}

function appendToFile(path: string, content: string): void {
  try {
    fs.appendFileSync(path, content, "utf-8")
  } catch (e: any) {
    console.error("Failed to write results:", e.message)
  }
}

async function traceRoute(page: Page, label: string, url: string): Promise<TracingResult> {
  const errors: string[] = []
  const result: TracingResult = {
    route: label,
    url,
    traceEvents: [],
    coverage: [],
    paintEvents: [],
    layoutEvents: [],
    scriptCompilationEvents: [],
    gcEvents: [],
    longTasks: [],
    totalBlockingTime: 0,
    userMeasures: [],
    navigationTiming: {},
    paintTiming: {},
    errors: [],
  }

  page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`))
  page.on("crash", () => errors.push("PAGE CRASHED"))

  // Inject performance observers BEFORE navigation so they capture everything
  await page.addInitScript(() => {
    // Capture long tasks
    (window as any).__longTasks = []
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          ;(window as any).__longTasks.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          })
        }
      })
      obs.observe({ type: "longtask", buffered: true })
    } catch (_) {}

    // Capture layout shifts
    ;(window as any).__layoutShifts = []
    try {
      const lsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          ;(window as any).__layoutShifts.push({
            startTime: Math.round(entry.startTime),
            duration: Math.round((entry as any).duration || 0),
            source: ((entry as any).sources?.[0]?.node?.nodeName) || "unknown",
          })
        }
      })
      lsObs.observe({ type: "layout-shift", buffered: true })
    } catch (_) {}
  })

  // Start JS coverage (V8 coverage tracking)
  await page.coverage.startJSCoverage()

  // Navigate
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(3000)

  // Stop JS coverage — compute used bytes from V8 function ranges
  const jsCoverage = await page.coverage.stopJSCoverage()
  result.coverage = jsCoverage
    .filter((e) => e.url && !e.url.startsWith("data:") && (e.url.includes(".js") || e.url.includes("_next") || e.url.includes("/chunks/")))
    .map((e) => {
      const sourceLen = e.source?.length || 0
      // Compute union of all used byte ranges across all functions
      const usedRanges: { start: number; end: number }[] = []
      for (const fn of e.functions || []) {
        for (const range of fn.ranges || []) {
          if (range.endOffset > range.startOffset) {
            usedRanges.push({ start: range.startOffset, end: range.endOffset })
          }
        }
      }
      // Merge overlapping ranges
      usedRanges.sort((a, b) => a.start - b.start)
      const merged: { start: number; end: number }[] = []
      for (const r of usedRanges) {
        if (merged.length > 0 && r.start <= merged[merged.length - 1].end) {
          merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end)
        } else {
          merged.push({ ...r })
        }
      }
      const usedBytes = merged.reduce((s, r) => s + (r.end - r.start), 0)
      return {
        url: e.url,
        usedBytes,
        totalBytes: sourceLen,
        usedPercent: sourceLen > 0 ? Math.round((usedBytes / sourceLen) * 100) : 0,
      }
    })
    .filter((e) => e.totalBytes > 0)
    .sort((a, b) => b.totalBytes - a.totalBytes)

  // ── Collect performance data (uses pre-injected observers from addInitScript) ──
  try {
    const perfData = await page.evaluate(() => {
      // 1. Long tasks from window.__longTasks (pre-injected observer)
      const rawLongTasks = (window as any).__longTasks || []
      const longTasks = rawLongTasks.map((t: any) => ({
        startTime: t.startTime,
        duration: t.duration,
        blockingTime: Math.max(0, t.duration - 50),
      }))
      const totalBlockingTime = longTasks.reduce((s: number, t: any) => s + t.blockingTime, 0)

      // 2. Layout shifts from window.__layoutShifts (pre-injected observer)
      const layoutShifts = (window as any).__layoutShifts || []

      // 3. User timing measures
      const userMeasures = performance.getEntriesByType("measure").map((e: any) => ({
        name: e.name,
        startTime: Math.round(e.startTime),
        duration: Math.round(e.duration),
      }))

      // 4. Navigation timing breakdown
      const n = performance.getEntriesByType("navigation")[0] as any
      const navTiming: Record<string, number> = {}
      if (n) {
        const keys = [
          "fetchStart", "domainLookupStart", "domainLookupEnd", "connectStart", "connectEnd",
          "secureConnectionStart", "requestStart", "responseStart", "responseEnd",
          "domInteractive", "domContentLoadedEventStart", "domContentLoadedEventEnd",
          "domComplete", "loadEventStart", "loadEventEnd",
          "transferSize", "encodedBodySize", "decodedBodySize", "duration",
        ]
        for (const k of keys) {
          if (k in n) navTiming[k] = Math.round(n[k])
        }
        navTiming["ttfb"] = Math.round(n.responseStart - n.fetchStart)
      }

      // 5. Paint timing (FP, FCP)
      const paintTiming: Record<string, number> = {}
      performance.getEntriesByType("paint").forEach((e: any) => {
        paintTiming[e.name] = Math.round(e.startTime)
      })

      // 6. LCP
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint")
      const lcp = lcpEntries.length > 0 ? Math.round((lcpEntries[lcpEntries.length - 1] as any).startTime) : -1

      // 7. Script resource timings
      const scriptResources = performance
        .getEntriesByType("resource")
        .filter((r: any) => r.initiatorType === "script")
        .map((r: any) => ({
          url: r.name,
          startTime: Math.round(r.startTime),
          duration: Math.round(r.duration),
          transferSize: r.transferSize || 0,
          decodedBodySize: r.decodedBodySize || 0,
        }))

      return {
        longTasks,
        totalBlockingTime,
        layoutShifts,
        userMeasures,
        navTiming,
        paintTiming,
        lcp,
        scriptResources,
      }
    })

    result.longTasks = perfData.longTasks || []
    result.totalBlockingTime = perfData.totalBlockingTime || 0
    result.layoutEvents = perfData.layoutShifts || []
    result.scriptCompilationEvents = perfData.scriptResources || []
    result.userMeasures = perfData.userMeasures || []
    result.navigationTiming = perfData.navTiming || {}
    result.paintTiming = perfData.paintTiming || {}
  } catch (e: any) {
    errors.push(`perfData evaluate: ${e.message}`)
  }

  result.errors = errors
  return result
}

function formatResults(results: TracingResult[]): string {
  let output = ""
  output += "=".repeat(120) + "\n"
  output += "ASPEN OS — CHROMIUM TRACING / PERFORMANCE REPORT\n"
  output += `Generated: ${new Date().toISOString()}\n`
  output += `App: ${BASE}\n`
  output += "=".repeat(120) + "\n\n"

  for (const r of results) {
    output += "#".repeat(100) + "\n"
    output += `## ROUTE: ${r.route}\n`
    output += `## URL:   ${r.url}\n`
    output += "#".repeat(100) + "\n\n"

    // ── Navigation Timing ──────────────────────────────────────────
    output += `── NAVIGATION TIMING (ms) ──────────────────────────────────────────────\n\n`
    const navKeys = [
      ["TTFB", "ttfb"],
      ["Response Start", "responseStart"],
      ["Response End", "responseEnd"],
      ["DOM Interactive", "domInteractive"],
      ["DOM Content Loaded", "domContentLoadedEventEnd"],
      ["DOM Complete", "domComplete"],
      ["Load Event End", "loadEventEnd"],
      ["Duration", "duration"],
    ]
    for (const [label, key] of navKeys) {
      if (key in r.navigationTiming) {
        output += `  ${label.padEnd(30)} ${String(r.navigationTiming[key]).padStart(8)} ms\n`
      }
    }
    const sizeKeys = [
      ["Transfer Size", "transferSize"],
      ["Encoded Body", "encodedBodySize"],
      ["Decoded Body", "decodedBodySize"],
    ]
    output += "\n  ── Sizes ──\n\n"
    for (const [label, key] of sizeKeys) {
      if (key in r.navigationTiming) {
        const val = r.navigationTiming[key]
        output += `  ${label.padEnd(30)} ${(val / 1024).toFixed(1).padStart(10)} KB\n`
      }
    }

    // ── Paint Timing ───────────────────────────────────────────────
    output += `\n── PAINT TIMING (ms) ────────────────────────────────────────────────────\n\n`
    for (const [name, val] of Object.entries(r.paintTiming)) {
      output += `  ${name.padEnd(35)} ${String(val).padStart(6)} ms\n`
    }

    // ── User Measures ──────────────────────────────────────────────
    output += `\n── USER TIMING MEASURES (performance.measure) ───────────────────────────\n\n`
    if (r.userMeasures.length > 0) {
      output += `  ${"Name".padEnd(40)} ${"Start".padStart(8)} ${"Duration".padStart(10)}\n`
      output += `  ${"-".repeat(40)} ${"-".repeat(8)} ${"-".repeat(10)}\n`
      for (const m of r.userMeasures) {
        output += `  ${m.name.padEnd(40)} ${String(m.startTime).padStart(8)} ${String(m.duration).padStart(10)}\n`
      }
    } else {
      output += `  (No performance.measure entries found)\n`
    }

    // ── Long Tasks ─────────────────────────────────────────────────
    output += `\n── LONG TASKS ────────────────────────────────────────────────────────────\n\n`
    output += `  Total long tasks:      ${r.longTasks.length}\n`
    output += `  Total Blocking Time:   ${r.totalBlockingTime} ms\n\n`
    if (r.longTasks.length > 0) {
      output += `  ${"#".padStart(2)} ${"Start (ms)".padStart(10)} ${"Duration (ms)".padStart(13)} ${"Blocking (ms)".padStart(14)}\n`
      output += `  ${"-".repeat(2)} ${"-".repeat(10)} ${"-".repeat(13)} ${"-".repeat(14)}\n`
      r.longTasks.forEach((t, i) => {
        output += `  ${String(i + 1).padStart(2)} ${String(t.startTime).padStart(10)} ${String(t.duration).padStart(13)} ${String(t.blockingTime).padStart(14)}\n`
      })
    }

    // ── Layout Events ──────────────────────────────────────────────
    output += `\n── LAYOUT EVENTS ─────────────────────────────────────────────────────────\n\n`
    if (r.layoutEvents.length > 0) {
      const sorted = [...r.layoutEvents].sort((a, b) => b.duration - a.duration)
      output += `  Total layout shifts: ${sorted.length}\n\n`
      output += `  ${"Start (ms)".padStart(10)} ${"Duration (ms)".padStart(13)} ${"Source".padEnd(20)}\n`
      output += `  ${"-".repeat(10)} ${"-".repeat(13)} ${"-".repeat(20)}\n`
      for (const e of sorted.slice(0, 20)) {
        output += `  ${String(e.startTime).padStart(10)} ${String(e.duration).padStart(13)} ${e.source.padEnd(20)}\n`
      }
      if (sorted.length > 20) {
        output += `  ... and ${sorted.length - 20} more\n`
      }
    } else {
      output += `  (No layout shift events captured)\n`
    }

    // ── Script Compilation / Resource Events ───────────────────────
    output += `\n── SCRIPT EXECUTION TIMELINE (from resource timing) ──────────────────────\n\n`
    if (r.scriptCompilationEvents.length > 0) {
      const sorted = [...r.scriptCompilationEvents].sort((a, b) => b.duration - a.duration)
      output += `  Total scripts: ${sorted.length}\n`
      output += `  Total JS exec time: ${sorted.reduce((s, e) => s + e.duration, 0)} ms\n\n`
      output += `  ${"Duration (ms)".padStart(13)} ${"Start (ms)".padStart(10)} ${"URL".padEnd(80)}\n`
      output += `  ${"-".repeat(13)} ${"-".repeat(10)} ${"-".repeat(80)}\n`
      for (const e of sorted.slice(0, 30)) {
        const shortUrl = e.url.length > 80 ? e.url.substring(0, 77) + "..." : e.url
        output += `  ${String(e.duration).padStart(13)} ${String(e.startTime).padStart(10)} ${shortUrl}\n`
      }
      if (sorted.length > 30) {
        output += `  ... and ${sorted.length - 30} more\n`
      }
    } else {
      output += `  (No script compilation events)\n`
    }

    // ── JS Coverage ────────────────────────────────────────────────
    output += `\n── JS COVERAGE (used bytes vs loaded bytes) ──────────────────────────────\n\n`
    if (r.coverage.length > 0) {
      const sorted = [...r.coverage].sort((a, b) => b.totalBytes - a.totalBytes)
      output += `  Total scripts: ${sorted.length}\n`
      const totalLoaded = sorted.reduce((s, e) => s + e.totalBytes, 0)
      const totalUsed = sorted.reduce((s, e) => s + e.usedBytes, 0)
      output += `  Total loaded:  ${(totalLoaded / 1024).toFixed(1)} KB\n`
      output += `  Total used:    ${(totalUsed / 1024).toFixed(1)} KB\n`
      output += `  Overall util:  ${totalLoaded > 0 ? ((totalUsed / totalLoaded) * 100).toFixed(1) : "N/A"}%\n\n`
      output += `  ${"Used (KB)".padStart(9)} ${"Total (KB)".padStart(10)} ${"Util %".padStart(7)} ${"URL".padEnd(80)}\n`
      output += `  ${"-".repeat(9)} ${"-".repeat(10)} ${"-".repeat(7)} ${"-".repeat(80)}\n`
      for (const e of sorted.slice(0, 30)) {
        const shortUrl = e.url.length > 80 ? e.url.substring(0, 77) + "..." : e.url
        const usedKb = (e.usedBytes / 1024).toFixed(1)
        const totalKb = (e.totalBytes / 1024).toFixed(1)
        output += `  ${usedKb.padStart(9)} ${totalKb.padStart(10)} ${e.usedPercent.toString().padStart(6)}% ${shortUrl}\n`
      }
      if (sorted.length > 30) {
        output += `  ... and ${sorted.length - 30} more\n`
      }
    } else {
      output += `  (No JS coverage data)\n`
    }

    // ── Errors ─────────────────────────────────────────────────────
    if (r.errors.length > 0) {
      output += `\n── ERRORS ────────────────────────────────────────────────────────────────\n\n`
      r.errors.forEach((e, i) => output += `  ${i + 1}. ${e}\n`)
    }

    output += "\n"
  }

  // ── Cross-route Summary ──────────────────────────────────────────
  output += "=".repeat(120) + "\n"
  output += "CROSS-ROUTE SUMMARY\n"
  output += "=".repeat(120) + "\n\n"

  const metricLabels = [
    "TTFB",
    "DOM Complete",
    "Load Event End",
    "FCP",
    "Total Long Tasks",
    "Total Blocking Time",
    "Layout Shifts",
    "Total JS Exec",
  ]
  const metricKeys = [
    "ttfb",
    "domComplete",
    "loadEventEnd",
    "first-contentful-paint",
    "longTaskCount",
    "tbt",
    "layoutCount",
    "jsExecTime",
  ]

  const header = `  ${"Metric".padEnd(25)}`
  const cols = results.map((r) => r.route.padEnd(18)).join("")
  output += `  ${header} ${cols}\n`
  output += `  ${"-".repeat(25)} ${results.map(() => "-".repeat(18)).join(" ")}\n`

  for (let i = 0; i < metricLabels.length; i++) {
    const label = metricLabels[i]
    const key = metricKeys[i]
    const row = results.map((r) => {
      if (key === "ttfb") return String(r.navigationTiming["ttfb"] ?? "-").padStart(8)
      if (key === "domComplete") return String(r.navigationTiming["domComplete"] ?? "-").padStart(8)
      if (key === "loadEventEnd") return String(r.navigationTiming["loadEventEnd"] ?? "-").padStart(8)
      if (key === "first-contentful-paint") return String(r.paintTiming["first-contentful-paint"] ?? "-").padStart(8)
      if (key === "longTaskCount") return String(r.longTasks.length).padStart(8)
      if (key === "tbt") return String(r.totalBlockingTime).padStart(8)
      if (key === "layoutCount") return String(r.layoutEvents.length).padStart(8)
      if (key === "jsExecTime") {
        const total = r.scriptCompilationEvents.reduce((s, e) => s + e.duration, 0)
        return String(total).padStart(8)
      }
      return "".padStart(8)
    }).join(" ")
    output += `  ${label.padEnd(25)} ${row}\n`
  }

  output += "\n" + "=".repeat(120) + "\n"
  output += "END OF REPORT\n"
  output += "=".repeat(120) + "\n"

  return output
}

test("production chromium tracing performance measurement", async ({ browser }) => {
  test.setTimeout(600_000)

  // ── Auth: create user via Supabase REST API ──────────────────────
  const UNIQUE = Date.now()
  const EMAIL = `tracing-perf-${UNIQUE}@example.com`
  const PASSWORD = "TracingPerf123!"

  console.log("=== AUTH SETUP ===")
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

  // ── Sign in through form ─────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const authPage = await ctx.newPage()

  await authPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
  await authPage.waitForSelector("#email", { timeout: 10000 })
  await authPage.fill("#email", EMAIL)
  await authPage.fill("#password", PASSWORD)
  await Promise.all([
    authPage.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
    authPage.click('button[type="submit"]'),
  ])
  await authPage.waitForTimeout(3000)

  // Retry sign-in if still on sign-in page
  if (authPage.url().includes("sign-in")) {
    console.log("  → Retrying sign-in (still on sign-in page)")
    await authPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await authPage.waitForSelector("#email", { timeout: 10000 })
    await authPage.fill("#email", EMAIL)
    await authPage.fill("#password", PASSWORD)
    await Promise.all([
      authPage.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
      authPage.click('button[type="submit"]'),
    ])
    await authPage.waitForTimeout(3000)
  }

  // Handle workspace creation
  if (authPage.url().includes("workspaces/new")) {
    console.log("  → Creating workspace")
    const nameInput = authPage.locator("#name")
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill(`Tracing Workspace ${UNIQUE}`)
      await authPage.getByRole("button", { name: "Create workspace" }).click()
      try {
        await authPage.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
      } catch {}
    }
    await authPage.waitForTimeout(3000)
  }

  const slug = new URL(authPage.url()).pathname.split("/").filter(Boolean)[0] || ""
  console.log(`  Workspace slug: ${slug}`)

  // Create a project for kanban page
  let projectId = ""
  if (slug) {
    const newBtn = authPage.getByRole("button", { name: "New" })
    if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newBtn.click()
      const projInput = authPage.getByLabel("Project name")
      if (await projInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await projInput.fill(`Tracing Project ${UNIQUE}`)
        await authPage.getByRole("button", { name: "Create project" }).click()
        try {
          await authPage.waitForURL((u) => /^\/[^/]+\/[^/]+$/.test(u.pathname), { timeout: 20000 })
          const pathParts = new URL(authPage.url()).pathname.split("/").filter(Boolean)
          if (pathParts.length >= 2) projectId = pathParts[1]
        } catch {}
      }
    }
  }

  console.log(`  Project ID: ${projectId || "none"}`)

  // Save auth cookies
  const authCookies = await ctx.cookies()
  await authPage.close()
  await ctx.close()

  // ── Measure routes ───────────────────────────────────────────────
  const routes: { label: string; url: string }[] = []
  if (slug) {
    routes.push({ label: "Dashboard", url: `${BASE}/${slug}` })
    routes.push({ label: "Calendar", url: `${BASE}/${slug}/calendar` })
    if (projectId) {
      routes.push({ label: "Kanban", url: `${BASE}/${slug}/${projectId}` })
    }
  }

  if (routes.length === 0) {
    const msg = "FATAL: Could not establish authenticated session"
    console.log(msg)
    fs.writeFileSync(RESULTS_FILE, msg + "\n", "utf-8")
    return
  }

  // Clear results file
  fs.writeFileSync(RESULTS_FILE, "", "utf-8")

  const allResults: TracingResult[] = []

  for (const route of routes) {
    console.log(`\n=== Measuring: ${route.label} ===`)
    const routeCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    await routeCtx.addCookies(
      authCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )
    const routePage = await routeCtx.newPage()

    try {
      const result = await traceRoute(routePage, route.label, route.url)
      allResults.push(result)
      console.log(`  Done: ${result.longTasks.length} long tasks, ${result.totalBlockingTime}ms TBT, ${result.layoutEvents.length} layout shifts`)
    } catch (e: any) {
      console.error(`  Error on ${route.label}: ${e.message}`)
      allResults.push({
        route: route.label,
        url: route.url,
        traceEvents: [],
        coverage: [],
        paintEvents: [],
        layoutEvents: [],
        scriptCompilationEvents: [],
        gcEvents: [],
        longTasks: [],
        totalBlockingTime: 0,
        userMeasures: [],
        navigationTiming: {},
        paintTiming: {},
        errors: [`FATAL: ${e.message}`],
      })
    }

    await routePage.close()
    await routeCtx.close()
  }

  // ── Write formatted report ───────────────────────────────────────
  const report = formatResults(allResults)
  fs.writeFileSync(RESULTS_FILE, report, "utf-8")
  console.log(`\n✓ Report saved to ${RESULTS_FILE}`)
  console.log(report)
})
