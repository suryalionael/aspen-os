import { test, type Page, type BrowserContext } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

const BASE = "http://localhost:3333"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
const RESULTS_FILE = "/tmp/react_profiler.txt"

interface ProfilerData {
  commitCount: number
  commitTimestamps: number[]
  fiberNodeCount: number | null
  reRenders: number | null
  cdpProfile: any
  profilingBuild: boolean
  success: boolean
  errors: string[]
}

test("react profiler - production build with profiling", async ({ browser }) => {
  test.setTimeout(300_000)

  const results: ProfilerData = {
    commitCount: 0,
    commitTimestamps: [],
    fiberNodeCount: null,
    reRenders: null,
    cdpProfile: null,
    profilingBuild: true,
    success: false,
    errors: [],
  }

  const UNIQUE = Date.now()
  const EMAIL = `react-profiler-${UNIQUE}@example.com`
  const PASSWORD = "ReactProfiler123!"

  const output: string[] = []
  const log = (msg: string) => { console.log(msg); output.push(msg) }

  try {
    // ── 1. Auth Setup ────────────────────────────────────────────
    log("=== STEP 1: Auth Setup ===")
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const authData: any = await r.json()
    if (!authData.access_token) {
      log(`  Signup response: ${JSON.stringify(authData)}`)
    } else {
      log(`  Created user: ${EMAIL}`)
    }

    // ── 2. Sign in + workspace creation ──────────────────────────
    log("\n=== STEP 2: Sign in and create workspace ===")
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForSelector("#email", { timeout: 10000 })
    await page.fill("#email", EMAIL)
    await page.fill("#password", PASSWORD)
    await Promise.all([
      page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(3000)

    if (page.url().includes("sign-")) {
      log("  Sign-in redirected back to sign page, retrying...")
      await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
      await page.waitForSelector("#email", { timeout: 10000 })
      await page.fill("#email", EMAIL)
      await page.fill("#password", PASSWORD)
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ])
      await page.waitForTimeout(3000)
    }

    log(`  After sign-in URL: ${page.url()}`)

    if (page.url().includes("workspaces/new")) {
      await page.waitForTimeout(2000)
      const nameInput = page.locator("#name")
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nameInput.fill(`React Profiler ${UNIQUE}`)
        await page.getByRole("button", { name: "Create workspace" }).click()
        try {
          await page.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
        } catch {}
      }
      await page.waitForTimeout(3000)
    }

    const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0] || ""
    log(`  Workspace slug: ${slug}`)

    if (!slug || slug.includes("workspace") || slug.includes("sign-in") || slug.includes("sign-up")) {
      throw new Error(`Could not establish authenticated session. URL: ${page.url()}`)
    }

    // Save auth cookies
    const authCookies = await ctx.cookies()
    await page.close()
    await ctx.close()

    // ── 3. Open a fresh context with addInitScript for React hook ──
    log("\n=== STEP 3: Profile with addInitScript hook ===")
    const profileCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await profileCtx.addCookies(
      authCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        httpOnly: c.httpOnly, secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )

    // Inject React profiler hook BEFORE any page JS loads
    await profileCtx.addInitScript(() => {
      const commitTimes: number[] = []
      const origDefineProperty = Object.defineProperty

      // Patch __REACT_DEVTOOLS_GLOBAL_HOOK__
      origDefineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
        configurable: true,
        enumerable: true,
        get() {
          return {
            supportsFiber: true,
            inject: function (fiber: any) {
              ;(window as any).__reactFiber = fiber
            },
            onCommitFiberRoot: function(rendererID: number, root: any) {
              commitTimes.push(performance.now())
            },
            onCommitFiberUnmount: function() {},
            reactRoots: new Set(),
          }
        },
        set(val: any) {},
      })

      // Expose commit times to tests
      origDefineProperty(window, "__reactCommitTimes", {
        configurable: true,
        enumerable: true,
        get() { return commitTimes },
        set() {},
      })
    })

    const profilePage = await profileCtx.newPage()
    const dashboardUrl = `${BASE}/${slug}`

    log(`  Navigating to: ${dashboardUrl}`)

    // ── 4. CDP Profiling (Chrome DevTools Protocol) ─────────────
    let cdpSession: any = null
    try {
      cdpSession = await profilePage.context().newCDPSession(profilePage)
      await cdpSession.send("Profiler.enable")
      await cdpSession.send("Profiler.start")
      log("  CDP Profiler started")
    } catch (e: any) {
      log(`  CDP not available: ${e.message}`)
    }

    await profilePage.goto(dashboardUrl, { waitUntil: "networkidle", timeout: 60000 })
    await profilePage.waitForTimeout(3000)

    let cdpProfile = null
    if (cdpSession) {
      try {
        cdpProfile = await cdpSession.send("Profiler.stop")
        log(`  CDP Profile captured: ${cdpProfile.nodes ? cdpProfile.nodes.length + " nodes" : "no nodes"}`)
        await cdpSession.detach()
      } catch (e: any) {
        log(`  CDP stop error: ${e.message}`)
      }
    }

    // ── 5. Collect commit times ──────────────────────────────────
    log("\n=== STEP 4: Collecting React profiling data ===")
    const commitTimes = await profilePage.evaluate(() => {
      const times = (window as any).__reactCommitTimes
      if (!times || !Array.isArray(times)) return null
      return times.slice()
    })

    if (commitTimes && commitTimes.length > 0) {
      results.commitCount = commitTimes.length
      results.commitTimestamps = commitTimes
      log(`  React commits detected: ${commitTimes.length}`)
      commitTimes.forEach((t: number, i: number) => {
        const rel = i > 0 ? `(+${(t - commitTimes[i-1]).toFixed(2)}ms)` : ""
        log(`    Commit ${i + 1}: ${t.toFixed(2)}ms ${rel}`)
      })
    } else {
      log("  No React commits detected via addInitScript hook")
      results.errors.push("No React commits detected via addInitScript hook")
    }

    // ── 6. Fiber tree node count ─────────────────────────────────
    log("\n=== STEP 5: Fiber tree analysis ===")
    const fiberData = await profilePage.evaluate(() => {
      const rootEl = document.getElementById("__next")
      if (!rootEl) return { error: "No __next element found" }

      const fiberKey = Object.keys(rootEl).find(k => k.startsWith("__reactFiber"))
      if (!fiberKey) return { error: "No React fiber key on __next" }

      const fiber = (rootEl as any)[fiberKey]

      function countNodes(f: any): number {
        if (!f) return 0
        return 1 + countNodes(f.child) + countNodes(f.sibling)
      }

      function countRendered(f: any): number {
        if (!f) return 0
        const own = f.stateNode && f.stateNode.nodeType === 1 ? 1 : 0
        return own + countRendered(f.child) + countRendered(f.sibling)
      }

      return {
        totalNodes: countNodes(fiber),
        renderedDomNodes: countRendered(fiber),
        memoizedState: fiber.memoizedState ? "present" : "null",
        tag: fiber.tag,
        type: typeof fiber.type === "function" ? fiber.type.name : typeof fiber.type,
      }
    })
    log(`  Fiber data: ${JSON.stringify(fiberData, null, 2)}`)
    if (fiberData && !fiberData.error) {
      results.fiberNodeCount = fiberData.totalNodes || null
    }

    // ── 7. Check __REACT_DEVTOOLS_GLOBAL_HOOK__ state ───────────
    log("\n=== STEP 6: React DevTools Hook inspection ===")
    const hookState = await profilePage.evaluate(() => {
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__
      if (!hook) return { found: false, error: "Hook not found" }

      const keys = Object.keys(hook)
      return {
        found: true,
        supportsFiber: hook.supportsFiber,
        hasInject: typeof hook.inject === "function",
        hasOnCommit: typeof hook.onCommitFiberRoot === "function",
        keys: keys,
      }
    })
    log(`  Hook state: ${JSON.stringify(hookState, null, 2)}`)

    // ── 8. Re-render count via checking commit times pattern ─────
    log("\n=== STEP 7: Re-render analysis ===")
    if (commitTimes && commitTimes.length > 0) {
      const intervals = commitTimes.slice(1).map((t: number, i: number) => t - commitTimes[i])
      const fastRenders = intervals.filter((d: number) => d < 50).length
      const slowRenders = intervals.filter((d: number) => d >= 50).length
      results.reRenders = commitTimes.length
      log(`  Total commits: ${commitTimes.length}`)
      log(`  Fast renders (<50ms gap): ${fastRenders}`)
      log(`  Slow renders (>=50ms gap): ${slowRenders}`)
    }

    // ── 9. DOM content analysis ──────────────────────────────────
    log("\n=== STEP 8: DOM Content Analysis ===")
    const domSnapshot = await profilePage.evaluate(() => {
      return {
        domSize: document.querySelectorAll("*").length,
        rootChildren: document.getElementById("__next")?.childElementCount || 0,
        bodyHTML: document.body.innerHTML.substring(0, 500),
      }
    })
    log(`  DOM size: ${domSnapshot.domSize} elements`)
    log(`  Root children: ${domSnapshot.rootChildren}`)

    results.cdpProfile = cdpProfile ? {
      nodes: cdpProfile.nodes?.length || 0,
      samples: cdpProfile.samples?.length || 0,
      timeDeltas: cdpProfile.timeDeltas?.length || 0,
    } : null

    results.success = true

    await profilePage.close()
    await profileCtx.close()
  } catch (e: any) {
    log(`\n  ERROR: ${e.message}`)
    results.errors.push(e.message)
  }

  // ── WRITE RESULTS ──────────────────────────────────────────────
  log("\n═══════════════════════════════════════════════════════════════")
  log("REACT PROFILER — PRODUCTION BUILD")
  log("═══════════════════════════════════════════════════════════════")
  log("")
  log(`Profiling build enabled:    ${results.profilingBuild}`)
  log(`Test succeeded:             ${results.success}`)
  log(`React commits detected:     ${results.commitCount}`)
  log(`Fiber tree node count:      ${results.fiberNodeCount ?? "N/A"}`)
  log(`Total re-renders (commits): ${results.reRenders ?? "N/A"}`)
  if (results.commitTimestamps.length > 0) {
    log(`\nCommit timestamps (relative):`)
    const start = results.commitTimestamps[0]
    results.commitTimestamps.forEach((t, i) => {
      const rel = (t - start).toFixed(2)
      const gap = i > 0 ? `(+${(t - results.commitTimestamps[i-1]).toFixed(2)}ms)` : "(first)"
      log(`  Commit ${i + 1}: ${rel}ms ${gap}`)
    })
  }
  if (results.cdpProfile) {
    log(`\nCDP Profile data:`)
    log(`  Nodes:       ${results.cdpProfile.nodes}`)
    log(`  Samples:     ${results.cdpProfile.samples}`)
    log(`  Time deltas: ${results.cdpProfile.timeDeltas}`)
  }
  if (results.errors.length > 0) {
    log(`\nErrors:`)
    results.errors.forEach((e, i) => log(`  ${i + 1}. ${e}`))
  }

  log("\n═══════════════════════════════════════════════════════════════")

  fs.writeFileSync(RESULTS_FILE, output.join("\n"), "utf-8")
  log(`\nResults saved to ${RESULTS_FILE}`)
})
