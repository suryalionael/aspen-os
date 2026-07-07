import { test, type BrowserContext } from "@playwright/test"
import * as fs from "fs"

const BASE = "https://aspen-os.vercel.app"
const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
const UNIQUE = Date.now()
const EMAIL = `bundle-exec-${UNIQUE}@example.com`
const PASSWORD = "BundleExec123!"
const REPORT_FILE = "/tmp/bundle_execution.txt"

interface CoverageEntry {
  url: string
  totalBytes: number
  usedBytes: number
  unusedBytes: number
  unusedPercent: number
  chunkName: string
  downloaded: boolean
  executed: boolean
}

test("production bundle execution analysis", async ({ browser }) => {
  test.setTimeout(600_000)

  const w = (...args: any[]) => args.join(" ") + "\n"

  // ═══════════════════════════════════════════════════════════════════
  // SETUP: Auth
  // ═══════════════════════════════════════════════════════════════════
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
  await Promise.all([
    authPage.waitForURL(url => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
    authPage.click('button[type="submit"]'),
  ])
  await authPage.waitForTimeout(5000)

  if (authPage.url().includes("sign-")) {
    await authPage.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await authPage.waitForSelector("#email", { timeout: 10000 })
    await authPage.fill("#email", EMAIL)
    await authPage.fill("#password", PASSWORD)
    await Promise.all([
      authPage.waitForURL(url => !url.pathname.includes("sign-in"), { timeout: 30000 }).catch(() => {}),
      authPage.click('button[type="submit"]'),
    ])
    await authPage.waitForTimeout(5000)
  }

  if (authPage.url().includes("workspaces/new")) {
    await authPage.waitForTimeout(2000)
    const nameInput = authPage.locator("#name")
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill(`Bundle Exec ${UNIQUE}`)
      await authPage.getByRole("button", { name: "Create workspace" }).click()
      try {
        await authPage.waitForURL((u) => !u.pathname.includes("workspaces/new"), { timeout: 20000 })
      } catch {}
    }
  }

  const slug = new URL(authPage.url()).pathname.split("/").filter(Boolean)[0] || ""
  console.log(`  Workspace slug: ${slug}`)

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
    if (projects?.[0]?.id) return { projectId: projects[0].id }
    const newProject = await (await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify({ name: `Bundle Exec Project ${UNIQUE}`, workspace_id: ws[0].id }),
    })).json()
    return { projectId: newProject?.[0]?.id || "" }
  }, { slug })
  console.log(`  Project ID: ${projectId || "none"}`)

  const authCookies = await ctx.cookies()
  await authPage.close()
  await ctx.close()

  // ═══════════════════════════════════════════════════════════════════
  // PROFILE ROUTES
  // ═══════════════════════════════════════════════════════════════════
  const routeDefs = [
    { label: "Home-Dashboard", url: `${BASE}/${slug}` },
    { label: "Calendar", url: `${BASE}/${slug}/calendar` },
    { label: "Kanban-Project", url: `${BASE}/${slug}/${projectId || "none"}` },
  ]

  const allRouteData: { label: string; entries: CoverageEntry[] }[] = []

  for (const route of routeDefs) {
    console.log(`\n=== Profiling: ${route.label} ===`)

    const routeCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await routeCtx.addCookies(
      authCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        httpOnly: c.httpOnly, secure: c.secure,
        sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      }))
    )
    const page = await routeCtx.newPage()

    const downloadedJsUrls = new Set<string>()
    page.on("response", (res) => {
      const url = res.url()
      if (url.includes("_next/static/chunks") && (url.endsWith(".js") || res.headers()["content-type"]?.includes("javascript"))) {
        downloadedJsUrls.add(url)
      }
    })

    await page.coverage.startJSCoverage()
    await page.goto(route.url, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForTimeout(2000)
    const coverage = await page.coverage.stopJSCoverage()

    const dedupCoverage = new Map<string, any>()
    for (const entry of coverage) {
      if (!entry.url.includes("_next/static/chunks") || !entry.source) continue
      dedupCoverage.set(entry.url, entry)
    }

    const coverageUrls = new Set(dedupCoverage.keys())

    const entries: CoverageEntry[] = [...dedupCoverage.values()].map(entry => {
      const totalBytes = entry.source.length

      const deadRanges: { start: number; end: number }[] = []
      for (const fn of entry.functions) {
        for (const range of fn.ranges) {
          if (range.count === 0) {
            deadRanges.push({ start: range.startOffset, end: range.endOffset })
          }
        }
      }
      deadRanges.sort((a, b) => a.start - b.start)
      const mergedDead: { start: number; end: number }[] = []
      for (const r of deadRanges) {
        if (mergedDead.length === 0 || r.start > mergedDead[mergedDead.length - 1].end) {
          mergedDead.push({ ...r })
        } else {
          mergedDead[mergedDead.length - 1].end = Math.max(mergedDead[mergedDead.length - 1].end, r.end)
        }
      }
      const deadBytes = mergedDead.reduce((sum, r) => sum + (r.end - r.start), 0)
      const usedBytes = totalBytes - deadBytes
      const unusedBytes = deadBytes
      const unusedPercent = totalBytes > 0 ? Math.round((unusedBytes / totalBytes) * 10000) / 100 : 0

      let chunkName = entry.url
      const chunksMatch = entry.url.match(/_next\/static\/chunks\/(.+)/)
      if (chunksMatch) {
        chunkName = chunksMatch[1].split("?")[0]
      }

      return {
        url: entry.url,
        totalBytes,
        usedBytes,
        unusedBytes,
        unusedPercent,
        chunkName,
        downloaded: downloadedJsUrls.has(entry.url),
        executed: usedBytes > 0,
      }
    })

    const notDownloaded = [...coverageUrls].filter(u => !downloadedJsUrls.has(u))
    const downloadedNotCovered = [...downloadedJsUrls].filter(u => !coverageUrls.has(u))
    if (notDownloaded.length > 0) {
      console.log(`  Coverage entries without network: ${notDownloaded.length}`)
    }
    if (downloadedNotCovered.length > 0) {
      console.log(`  Network downloads without coverage: ${downloadedNotCovered.length}`)
      for (const u of downloadedNotCovered) {
        console.log(`    ${u}`)
      }
    }
    entries.sort((a, b) => b.totalBytes - a.totalBytes)

    allRouteData.push({ label: route.label, entries })
    console.log(`  Scripts with coverage: ${entries.length}`)

    await page.close()
    await routeCtx.close()
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENERATE REPORT
  // ═══════════════════════════════════════════════════════════════════
  const lines: string[] = []

  const header = (s: string) => lines.push("\n" + s + "\n" + "─".repeat(120))

  lines.push("=".repeat(120))
  lines.push("BUNDLE EXECUTION ANALYSIS")
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`App: ${BASE}`)
  lines.push(`User: ${EMAIL}`)
  lines.push(`Workspace: ${slug}`)
  lines.push(`Project: ${projectId}`)
  lines.push("=".repeat(120))

  // ── Per-Route Tables ─────────────────────────────────────────────
  for (const routeData of allRouteData) {
    const { label, entries } = routeData
    header(label)

    const hdr = `${"Chunk Name".padEnd(65)} ${"Total (KB)".padStart(10)} ${"Used (KB)".padStart(10)} ${"Unused (KB)".padStart(11)} ${"Unused %".padStart(9)} ${"Status".padStart(10)}`
    const sep = `${"─".repeat(64)}  ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(11)} ${"─".repeat(9)} ${"─".repeat(10)}`
    lines.push(hdr)
    lines.push(sep)

    for (const e of entries) {
      const status = e.executed ? "EXECUTED" : (e.downloaded ? "NOEXEC-DL" : "NOEXEC-CV")
      lines.push(`${e.chunkName.padEnd(64)}  ${(e.totalBytes / 1024).toFixed(1).padStart(9)}  ${(e.usedBytes / 1024).toFixed(1).padStart(9)}  ${(e.unusedBytes / 1024).toFixed(1).padStart(10)}  ${e.unusedPercent.toFixed(1).padStart(8)}%  ${status}`)
    }

    const totalTotal = entries.reduce((s, e) => s + e.totalBytes, 0)
    const totalUsed = entries.reduce((s, e) => s + e.usedBytes, 0)
    const totalUnused = entries.reduce((s, e) => s + e.unusedBytes, 0)
    const executedCount = entries.filter(e => e.executed).length
    const wastedScripts = entries.filter(e => e.downloaded && !e.executed)

    lines.push("")
    lines.push(`  Totals:   ${(totalTotal / 1024).toFixed(1)} KB total, ${(totalUsed / 1024).toFixed(1)} KB used (${totalTotal > 0 ? Math.round(totalUsed / totalTotal * 100) : 0}%), ${(totalUnused / 1024).toFixed(1)} KB unused`)
    lines.push(`  Scripts:  ${entries.length} with coverage, ${executedCount} executed`)
    if (wastedScripts.length > 0) {
      const wastedBytes = wastedScripts.reduce((s, e) => s + e.totalBytes, 0)
      lines.push(`  WASTED:   ${wastedScripts.length} scripts (${(wastedBytes / 1024).toFixed(1)} KB) downloaded but NOT executed`)
      for (const ws of wastedScripts) {
        lines.push(`            ${ws.chunkName}`)
      }
    }

    const executedBySize = entries.filter(e => e.executed).sort((a, b) => b.totalBytes - a.totalBytes)
    lines.push(`  Largest executed chunks:`)
    for (const e of executedBySize.slice(0, 10)) {
      lines.push(`    ${(e.totalBytes / 1024).toFixed(1).padStart(8)} KB  used=${(e.usedBytes / 1024).toFixed(1)}KB  unused=${(e.unusedBytes / 1024).toFixed(1)}KB (${e.unusedPercent}%)  ${e.chunkName}`)
    }
    lines.push("")
  }

  // ── Cross-Route Analysis ─────────────────────────────────────────
  header("CROSS-ROUTE ANALYSIS")

  const chunkRouteMap = new Map<string, Map<string, CoverageEntry>>()
  for (const routeData of allRouteData) {
    for (const entry of routeData.entries) {
      if (!chunkRouteMap.has(entry.chunkName)) {
        chunkRouteMap.set(entry.chunkName, new Map())
      }
      chunkRouteMap.get(entry.chunkName)!.set(routeData.label, entry)
    }
  }

  const routeNames = routeDefs.map(r => r.label)
  const shared: string[] = []
  const routeSpecific: Record<string, string[]> = {}
  for (const rn of routeNames) routeSpecific[rn] = []
  const downloadedNotExecuted: { chunkName: string; route: string; bytes: number }[] = []

  for (const [chunkName, routeMap] of chunkRouteMap) {
    const presentOn = [...routeMap.keys()]
    if (presentOn.length === 3) {
      shared.push(chunkName)
    } else if (presentOn.length === 1) {
      for (const rn of presentOn) routeSpecific[rn].push(chunkName)
    }
    for (const [routeLabel, entry] of routeMap) {
      if (entry.downloaded && !entry.executed) {
        downloadedNotExecuted.push({ chunkName, route: routeLabel, bytes: entry.totalBytes })
      }
    }
  }

  lines.push(`\nSHARED CHUNKS (present on all ${routeNames.length} routes):\n`)
  for (const name of shared) {
    const routes = chunkRouteMap.get(name)!
    const firstEntry = routes.values().next().value!
    lines.push(`  ${(firstEntry.totalBytes / 1024).toFixed(1).padStart(8)} KB  ${name}`)
  }
  lines.push(`\n  (${shared.length} shared chunks)`)

  lines.push(`\nROUTE-SPECIFIC CHUNKS:\n`)
  for (const rn of routeNames) {
    const specific = routeSpecific[rn]
    if (specific.length > 0) {
      lines.push(`  ${rn}:`)
      for (const name of specific) {
        const entry = chunkRouteMap.get(name)!.get(rn)!
        const execStatus = entry.executed ? "EXECUTED" : "NOT EXECUTED"
        lines.push(`    ${(entry.totalBytes / 1024).toFixed(1).padStart(8)} KB  [${execStatus}]  ${name}`)
      }
      lines.push("")
    }
  }

  // Wasted bytes
  const wastedByChunk = new Map<string, { totalBytes: number; routes: string[] }>()
  for (const wc of downloadedNotExecuted) {
    if (!wastedByChunk.has(wc.chunkName)) {
      wastedByChunk.set(wc.chunkName, { totalBytes: wc.bytes, routes: [] })
    }
    wastedByChunk.get(wc.chunkName)!.routes.push(wc.route)
  }

  if (wastedByChunk.size > 0) {
    lines.push(`\nCHUNKS DOWNLOADED BUT NOT EXECUTED:\n`)
    const sortedWasted = [...wastedByChunk.entries()].sort((a, b) => b[1].totalBytes - a[1].totalBytes)
    for (const [name, data] of sortedWasted) {
      lines.push(`  ${(data.totalBytes / 1024).toFixed(1).padStart(8)} KB  ${name}`)
      lines.push(`           routes: ${data.routes.join(", ")}`)
    }
    const totalWasted = [...wastedByChunk.values()].reduce((s, d) => s + d.totalBytes, 0)
    lines.push(`\n  Total wasted (downloaded but not executed): ${(totalWasted / 1024).toFixed(1)} KB`)
  }

  lines.push(`\nPER-ROUTE UNUSED BYTES (downloaded but coverage shows not used):\n`)
  for (const routeData of allRouteData) {
    const total = routeData.entries.reduce((s, e) => s + e.totalBytes, 0)
    const unused = routeData.entries.reduce((s, e) => s + e.unusedBytes, 0)
    lines.push(`  ${routeData.label.padEnd(25)} ${(total / 1024).toFixed(1).padStart(8)} KB total, ${(unused / 1024).toFixed(1).padStart(8)} KB unused (${total > 0 ? Math.round(unused / total * 100) : 0}%)`)
  }

  lines.push(`\nLARGEST EXECUTED CHUNKS (by total size, across all routes):\n`)
  const allExecuted: { chunkName: string; totalBytes: number; usedBytes: number; unusedPercent: number; routes: string[] }[] = []
  for (const [chunkName, routeMap] of chunkRouteMap) {
    const entries = [...routeMap.values()]
    const execEntries = entries.filter(e => e.executed)
    if (execEntries.length > 0) {
      allExecuted.push({
        chunkName,
        totalBytes: execEntries[0].totalBytes,
        usedBytes: Math.max(...execEntries.map(e => e.usedBytes)),
        unusedPercent: Math.min(...execEntries.map(e => e.unusedPercent)),
        routes: [...routeMap.keys()],
      })
    }
  }
  allExecuted.sort((a, b) => b.totalBytes - a.totalBytes)
  lines.push(`${"Chunk Name".padEnd(60)} ${"Size (KB)".padStart(10)} ${"Used (KB)".padStart(10)} ${"Unused%".padStart(9)}  Routes`)
  lines.push(`${"─".repeat(59)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(9)}  ${"─".repeat(8)}`)
  for (const c of allExecuted.slice(0, 20)) {
    lines.push(`${c.chunkName.substring(0, 58).padEnd(59)} ${(c.totalBytes / 1024).toFixed(1).padStart(9)} ${(c.usedBytes / 1024).toFixed(1).padStart(9)} ${c.unusedPercent.toFixed(1).padStart(8)}%  ${c.routes.length} route(s)`)
  }
  if (allExecuted.length > 20) {
    lines.push(`  ... ${allExecuted.length - 20} more chunks`)
  }

  // Summary
  lines.push("")
  lines.push("=".repeat(120))
  lines.push("SUMMARY")
  lines.push("=".repeat(120))
  const allUniqueChunks = chunkRouteMap.size
  const sharedCount = shared.length
  const routeSpecificCount = routeNames.reduce((s, rn) => s + routeSpecific[rn].length, 0)
  const wastedChunkCount = wastedByChunk.size
  lines.push(`\n  Total unique chunks seen:         ${allUniqueChunks}`)
  lines.push(`  Shared (all ${routeNames.length} routes):        ${sharedCount}`)
  lines.push(`  Route-specific:                  ${routeSpecificCount}`)
  lines.push(`  Downloaded but not executed:     ${wastedChunkCount}`)
  if (allUniqueChunks > 0) {
    lines.push(`  Shared chunk ratio:              ${Math.round(sharedCount / allUniqueChunks * 100)}%`)
    lines.push(`  Route-specific ratio:            ${Math.round(routeSpecificCount / allUniqueChunks * 100)}%`)
  }
  lines.push("")

  // Compute total unused across all routes
  let grandTotalBytes = 0
  let grandUnusedBytes = 0
  for (const routeData of allRouteData) {
    grandTotalBytes += routeData.entries.reduce((s, e) => s + e.totalBytes, 0)
    grandUnusedBytes += routeData.entries.reduce((s, e) => s + e.unusedBytes, 0)
  }
  lines.push(`  Grand total bytes (all routes):   ${(grandTotalBytes / 1024).toFixed(0)} KB`)
  lines.push(`  Grand total unused bytes:         ${(grandUnusedBytes / 1024).toFixed(0)} KB (${grandTotalBytes > 0 ? Math.round(grandUnusedBytes / grandTotalBytes * 100) : 0}%)`)
  lines.push("")

  const report = lines.join("\n")
  fs.writeFileSync(REPORT_FILE, report, "utf-8")
  console.log(`\n\nReport saved to ${REPORT_FILE}`)
  console.log("\n" + report)
})
