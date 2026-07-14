import { test, type Page } from "@playwright/test"
import * as fs from "fs"

const BASE = "https://aspen-os.vercel.app"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
const RESULTS_FILE = "/tmp/browser_perf.txt"

interface PerfResults {
  timestamp: string
  url: string
  navigationTiming: Record<string, number>
  paintTiming: Record<string, number>
  lcp: { time: number; element: string }
  fid: { delay: number; duration: number } | null
  longTasks: { start: number; duration: number; name: string }[]
  totalBlockingTime: number
  jsParseTimings: { url: string; duration: number; decodedSize: number; transferSize: number }[]
  totalJsParseTime: number
  largestChunks: { url: string; duration: number; decodedSize: number }[]
  reactCommitTiming: Record<string, unknown> | null
  scriptTimings: { url: string; duration: number; transferSize: number; decodedSize: number }[]
  errors: string[]
}

function appendToFile(path: string, content: string): void {
  try {
    fs.appendFileSync(path, content, "utf-8")
  } catch (e: any) {
    console.error("Failed to write results:", e.message)
  }
}

async function measureAll(page: Page, url: string): Promise<void> {
  const errors: string[] = []
  const results: PerfResults = {
    timestamp: new Date().toISOString(),
    url,
    navigationTiming: {},
    paintTiming: {},
    lcp: { time: 0, element: "" },
    fid: null,
    longTasks: [],
    totalBlockingTime: 0,
    jsParseTimings: [],
    totalJsParseTime: 0,
    largestChunks: [],
    reactCommitTiming: null,
    scriptTimings: [],
    errors: [],
  }

  page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`))
  page.on("crash", () => errors.push("PAGE CRASHED"))

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(2000)

  // ── 1. Full navigation timing breakdown ──────────────────────────
  try {
    results.navigationTiming = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as any
      if (!n) return {}
      const keys = [
        "fetchStart", "domainLookupStart", "domainLookupEnd", "connectStart", "connectEnd",
        "secureConnectionStart", "requestStart", "responseStart", "responseEnd",
        "domInteractive", "domContentLoadedEventStart", "domContentLoadedEventEnd",
        "domComplete", "loadEventStart", "loadEventEnd", "unloadEventStart", "unloadEventEnd",
        "redirectStart", "redirectEnd",
        "workerStart",
        "transferSize", "encodedBodySize", "decodedBodySize",
        "duration", "startTime",
      ]
      const r: Record<string, number> = {}
      for (const k of keys) {
        if (k in n) { r[k] = Math.round(n[k]) }
      }
      r["ttfb"] = Math.round(n.responseStart - n.fetchStart)
      r["domContentLoadedDuration"] = Math.round(n.domContentLoadedEventEnd - n.domContentLoadedEventStart)
      r["loadEventDuration"] = Math.round(n.loadEventEnd - n.loadEventStart)
      // relative times from fetchStart
      r["ttfbFromFetch"] = Math.round(n.responseStart)
      r["domInteractiveFromFetch"] = Math.round(n.domInteractive)
      r["domContentLoadedFromFetch"] = Math.round(n.domContentLoadedEventEnd)
      r["domCompleteFromFetch"] = Math.round(n.domComplete)
      r["loadCompleteFromFetch"] = Math.round(n.loadEventEnd)
      r["totalDomProcessing"] = Math.round(n.domComplete - n.domInteractive)
      return r
    })
  } catch (e: any) {
    errors.push(`navTiming: ${e.message}`)
  }

  // ── 2. Paint timing (FCP, FP) ────────────────────────────────────
  try {
    results.paintTiming = await page.evaluate(() => {
      const r: Record<string, number> = {}
      performance.getEntriesByType("paint").forEach((e: any) => { r[e.name] = Math.round(e.startTime) })
      return r
    })
  } catch (e: any) {
    errors.push(`paintTiming: ${e.message}`)
  }

  // ── 3. LCP via PerformanceObserver (buffered) ────────────────────
  try {
    results.lcp = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const entries = performance.getEntriesByType("largest-contentful-paint")
        if (entries.length > 0) {
          const last = entries[entries.length - 1] as any
          let element = ""
          try { const el = last.element as Element; element = `${el.tagName}${el.id ? "#" + el.id : ""}` } catch {}
          resolve({ time: Math.round(last.startTime || last.renderTime || 0), element })
          return
        }
        const obs = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          if (entries.length > 0) {
            const last = entries[entries.length - 1] as any
            let element = ""
            try { const el = last.element as Element; element = `${el.tagName}${el.id ? "#" + el.id : ""}` } catch {}
            resolve({ time: Math.round(last.startTime || last.renderTime || 0), element })
          }
        })
        obs.observe({ type: "largest-contentful-paint", buffered: true })
        setTimeout(() => resolve({ time: 0, element: "" }), 3000)
      })
    })
  } catch (e: any) {
    errors.push(`lcp: ${e.message}`)
  }

  // ── 4. Long Tasks API + Total Blocking Time ──────────────────────
  try {
    const longData = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const tasks: { start: number; duration: number; name: string }[] = []
        try {
          const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              tasks.push({
                start: Math.round(entry.startTime),
                duration: Math.round(entry.duration),
                name: (entry as any).name || "",
              })
            }
          })
          obs.observe({ type: "longtask", buffered: true })
          setTimeout(() => {
            const tbt = tasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)
            resolve({ tasks, totalBlockingTime: tbt })
          }, 2000)
        } catch (e) {
          resolve({ tasks: [], totalBlockingTime: 0 })
        }
      })
    })
    results.longTasks = longData.tasks
    results.totalBlockingTime = longData.totalBlockingTime
  } catch (e: any) {
    errors.push(`longTasks: ${e.message}`)
  }

  // ── 5. JS parse/execute times from resource timing (scripts) ─────
  try {
    results.scriptTimings = await page.evaluate(() => {
      return performance.getEntriesByType("resource")
        .filter((r: any) =>
          r.initiatorType === "script" ||
          r.name.match(/\.js$/) ||
          (r.name.includes("_next/static/chunks") && r.name.endsWith(".js"))
        )
        .map((r: any) => ({
          url: r.name,
          duration: Math.round(r.duration * 100) / 100,
          transferSize: r.transferSize || 0,
          decodedSize: r.decodedBodySize || 0,
        }))
        .sort((a: any, b: any) => b.duration - a.duration)
    })

    results.totalJsParseTime = results.scriptTimings.reduce((s, r) => s + r.duration, 0)
    results.jsParseTimings = results.scriptTimings.filter(r => r.duration > 10)
    results.largestChunks = results.scriptTimings
      .sort((a, b) => b.decodedSize - a.decodedSize)
      .slice(0, 5)
  } catch (e: any) {
    errors.push(`jsTimings: ${e.message}`)
  }

  // ── 6. FID — synthetic input event measurement ──────────────────
  try {
    results.fid = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        try {
          const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              resolve({
                delay: Math.round((entry as any).processingStart - (entry as any).startTime),
                duration: Math.round(entry.duration),
              })
              return
            }
          })
          obs.observe({ type: "first-input", buffered: true })

          // If we already have entries, resolve immediately
          const entries = performance.getEntriesByType("first-input")
          if (entries.length > 0) {
            const e = entries[0] as any
            resolve({
              delay: Math.round(e.processingStart - e.startTime),
              duration: Math.round(e.duration),
            })
            return
          }

          // Dispatch synthetic click to trigger first-input observation
          const target = document.body
          target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
          target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))

          setTimeout(() => {
            const entries = performance.getEntriesByType("first-input")
            if (entries.length > 0) {
              const e = entries[0] as any
              resolve({
                delay: Math.round(e.processingStart - e.startTime),
                duration: Math.round(e.duration),
              })
            } else {
              resolve(null)
            }
          }, 1000)
        } catch (e) {
          resolve(null)
        }
      })
    })
  } catch (e: any) {
    errors.push(`fid: ${e.message}`)
    results.fid = null
  }

  // ── 7. React commit timing via hook patching ─────────────────────
  try {
    results.reactCommitTiming = await page.evaluate(() => {
      const hooks = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
      if (!hooks) return { error: "__REACT_DEVTOOLS_GLOBAL_HOOK__ not found" }

      // Try to get React internals via __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
      const rootEl = document.getElementById("__next") || document.getElementById("root")
      if (!rootEl) return { error: "No React root element found" }

      const reactRoots = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.reactRoots
      if (reactRoots && reactRoots.size > 0) {
        return { reactRootsFound: reactRoots.size, note: "reactRoots available via hook" }
      }

      // Try to access fiber by traversing root DOM
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith("__reactFiber$"))
      if (!fiberKey) return { error: "No React fiber key found on root element" }

      return { fiberKey, note: "React fiber found, but commit timing requires profiling build" }
    })
  } catch (e: any) {
    errors.push(`reactCommit: ${e.message}`)
  }

  results.errors = errors

  // ── WRITE RESULTS ───────────────────────────────────────────────
  let output = ""
  output += `═══════════════════════════════════════════════════════════════════════════\n`
  output += `BROWSER PERFORMANCE MEASUREMENT REPORT\n`
  output += `URL:       ${results.url}\n`
  output += `Timestamp: ${results.timestamp}\n`
  output += `═══════════════════════════════════════════════════════════════════════════\n\n`

  // Navigation Timing Breakdown
  output += `── NAVIGATION TIMING BREAKDOWN (ms) ──────────────────────────────────────\n\n`
  const navOrder = [
    "fetchStart", "domainLookupStart", "domainLookupEnd", "connectStart", "connectEnd",
    "secureConnectionStart", "requestStart", "responseStart", "responseEnd",
    "domInteractive", "domContentLoadedEventStart", "domContentLoadedEventEnd",
    "domComplete", "loadEventStart", "loadEventEnd",
  ]
  for (const k of navOrder) {
    if (k in results.navigationTiming) {
      output += `  ${k.padEnd(35)} ${String(results.navigationTiming[k]).padStart(6)} ms\n`
    }
  }
  output += `\n`
  // Derived metrics
  const derivedKeys = [
    "ttfb", "ttfbFromFetch", "domInteractiveFromFetch", "domContentLoadedFromFetch",
    "domCompleteFromFetch", "loadCompleteFromFetch",
    "domContentLoadedDuration", "loadEventDuration", "totalDomProcessing",
    "transferSize", "encodedBodySize", "decodedBodySize", "duration",
  ]
  output += `  ── Derived / computed ─────────────────────────────────────────────\n\n`
  for (const k of derivedKeys) {
    if (k in results.navigationTiming) {
      const suffix = k.includes("Size") ? " bytes" : " ms"
      output += `  ${k.padEnd(35)} ${String(results.navigationTiming[k]).padStart(10)}${suffix}\n`
    }
  }

  // Paint timing
  output += `\n── PAINT TIMING (ms) ────────────────────────────────────────────────────\n\n`
  for (const [name, val] of Object.entries(results.paintTiming)) {
    output += `  ${name.padEnd(35)} ${String(val).padStart(6)} ms\n`
  }

  // LCP
  output += `\n── LARGEST CONTENTFUL PAINT ──────────────────────────────────────────────\n\n`
  output += `  LCP time:    ${results.lcp.time} ms\n`
  output += `  LCP element: ${results.lcp.element || "(none)"}\n`

  // FID
  output += `\n── FIRST INPUT DELAY ─────────────────────────────────────────────────────\n\n`
  if (results.fid) {
    output += `  Processing delay: ${results.fid.delay} ms\n`
    output += `  Event duration:   ${results.fid.duration} ms\n`
  } else {
    output += `  (No first-input detected — synthetic dispatch may not have triggered)\n`
  }

  // Long tasks
  output += `\n── LONG TASKS (duration > 50ms) ──────────────────────────────────────────\n\n`
  output += `  Total long tasks:        ${results.longTasks.length}\n`
  output += `  Total Blocking Time:     ${results.totalBlockingTime} ms\n\n`
  if (results.longTasks.length > 0) {
    output += `  #  │   Start (ms) │ Duration (ms) │ Blocking (ms) │ Name\n`
    output += `  ───┼──────────────┼───────────────┼───────────────┼────────────────────────────────────\n`
    results.longTasks.forEach((t, i) => {
      const blocking = Math.max(0, t.duration - 50)
      output += `  ${String(i).padStart(2)} │ ${String(t.start).padStart(11)} │ ${String(t.duration).padStart(12)} │ ${String(blocking).padStart(12)} │ ${t.name || "(no name)"}\n`
    })
  } else {
    output += `  (No long tasks recorded)\n`
  }

  // JS parse/execute times
  output += `\n── SCRIPT RESOURCE TIMINGS ────────────────────────────────────────────────\n\n`
  output += `  Total JS parse/execute time (all scripts): ${Math.round(results.totalJsParseTime)} ms\n`
  output += `  Scripts with duration > 10ms: ${results.jsParseTimings.length}\n\n`
  if (results.jsParseTimings.length > 0) {
    output += `  Duration (ms) │ Transferred (B) │ Decoded (B) │ URL\n`
    output += `  ──────────────┼─────────────────┼──────────────┼────────────────────────────────────────────\n`
    for (const s of results.jsParseTimings) {
      const shortUrl = s.url.length > 90 ? s.url.substring(0, 87) + "..." : s.url
      output += `  ${String(Math.round(s.duration)).padStart(12)} │ ${String(s.transferSize).padStart(15)} │ ${String(s.decodedSize).padStart(11)} │ ${shortUrl}\n`
    }
  }

  // Largest chunks
  output += `\n── LARGEST CHUNKS BY SIZE ──────────────────────────────────────────────────\n\n`
  if (results.largestChunks.length > 0) {
    output += `  Decoded Size │ Duration │ URL\n`
    output += `  ─────────────┼──────────┼──────────────────────────────────────────────────────────────────\n`
    for (const c of results.largestChunks) {
      const shortUrl = c.url.length > 90 ? c.url.substring(0, 87) + "..." : c.url
      output += `  ${String(Math.round(c.decodedSize / 1024)).padStart(8)} KB │ ${String(Math.round(c.duration)).padStart(7)} ms │ ${shortUrl}\n`
    }
  }

  // React commit timing
  output += `\n── REACT COMMIT TIMING ─────────────────────────────────────────────────────\n\n`
  if (results.reactCommitTiming) {
    for (const [k, v] of Object.entries(results.reactCommitTiming)) {
      output += `  ${k}: ${v}\n`
    }
    output += `\n  Note: React commit timing in production requires a profiling build.\n`
    output += `  For accurate React commit times, run with: next build --profile\n`
  } else {
    output += `  (React profiling data not available in production mode)\n`
  }

  // Errors
  if (results.errors.length > 0) {
    output += `\n── ERRORS ENCOUNTERED ─────────────────────────────────────────────────────\n\n`
    results.errors.forEach((e, i) => { output += `  ${i + 1}. ${e}\n` })
  }

  output += `\n═══════════════════════════════════════════════════════════════════════════\n`

  appendToFile(RESULTS_FILE, output)
  console.log(output)
}

test("production browser performance measurement", async ({ page, context, browser }) => {
  test.setTimeout(300_000)

  // Clear results file
  fs.writeFileSync(RESULTS_FILE, "", "utf-8")

  // ── Auth: create user via Supabase API ───────────────────────────
  const UNIQUE = Date.now()
  const EMAIL = `perf-browser-${UNIQUE}@example.com`
  const PASSWORD = "BrowserPerf123!"

  console.log("=== Creating user via Supabase REST ===")
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const authData: any = await r.json()
  if (!authData.access_token) {
    const errMsg = `Auth signup failed: ${JSON.stringify(authData)}`
    console.log(`  ${errMsg}`)
    appendToFile(RESULTS_FILE, `FATAL: ${errMsg}\n`)
    return
  }
  console.log(`  Created user: ${EMAIL}`)

  // ── Sign in through the form to get proper cookies ───────────────
  console.log("\n=== Signing in ===")
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await Promise.all([
    page.waitForURL(url => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(3000)
  console.log(`  After sign-in: ${page.url()}`)

  // ── Handle workspace creation if needed ──────────────────────────
  const currentUrl = page.url()
  if (currentUrl.includes("workspaces/new")) {
    console.log("  → Creating workspace")
    await page.waitForTimeout(2000)
    const nameInput = page.locator("#name")
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill(`Perf Browser ${UNIQUE}`)
      await page.getByRole("button", { name: "Create workspace" }).click()
      try {
        await page.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
      } catch {}
    }
    await page.waitForTimeout(3000)
  } else if (currentUrl.includes("sign-")) {
    // Auth failed — try direct sign-in
    console.log("  → Redirected to sign-in, trying again")
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForSelector("#email", { timeout: 10000 })
    await page.fill("#email", EMAIL)
    await page.fill("#password", PASSWORD)
    await Promise.all([
      page.waitForURL(url => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(3000)
    // Try workspace creation again
    if (page.url().includes("workspaces/new")) {
      const nameInput = page.locator("#name")
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill(`Perf Browser ${UNIQUE}`)
        await page.getByRole("button", { name: "Create workspace" }).click()
        try {
          await page.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
        } catch {}
      }
      await page.waitForTimeout(3000)
    }
  }

  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
  console.log(`  Workspace slug: ${slug || "NONE"}`)

  if (!slug || slug.includes("workspace") || slug.includes("sign-in") || slug.includes("sign-up")) {
    const errMsg = "Could not establish authenticated session"
    console.log(`  ${errMsg}`)
    appendToFile(RESULTS_FILE, `FATAL: ${errMsg}\n`)
    return
  }

  // Save cookies for reuse across pages
  const authCookies = await context.cookies()

  // ── Measure cold loads on fresh contexts ─────────────────────────
  const routes = [
    { label: "Dashboard (My Work)", url: `${BASE}/${slug}` },
    { label: "Calendar", url: `${BASE}/${slug}/calendar` },
    { label: "Notes", url: `${BASE}/${slug}/notes` },
  ]

  for (const route of routes) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    await ctx.addCookies(
      authCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )
    const p = await ctx.newPage()

    appendToFile(RESULTS_FILE, `\n>>> ROUTE: ${route.label} (${route.url})\n\n`)
    try {
      await measureAll(p, route.url)
    } catch (e: any) {
      const msg = `FATAL on ${route.label}: ${e.message}\n`
      console.error(msg)
      appendToFile(RESULTS_FILE, msg)
    }
    await p.close()
    await ctx.close()
  }

  console.log(`\n✓ Results saved to ${RESULTS_FILE}`)
})
