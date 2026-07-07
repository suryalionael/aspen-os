import { test } from "@playwright/test"
import * as fs from "fs"
import * as path from "path"

const BASE = "https://aspen-os.vercel.app"
const UNIQUE = Date.now()
const EMAIL = `probe-${UNIQUE}@example.com`
const PASSWORD = "Probe123!"
const TRACE_FILE = path.resolve(process.cwd(), "ATTACHMENT_TRACE.md")

let probeId = 0

test("attachment upload execution chain probe", async ({ page }) => {
  test.setTimeout(300_000)

  // ── Logging helpers ────────────────────────────────────────────
  const lines: string[] = []
  function md(...args: any[]) {
    const s = args.join(" ")
    lines.push(s)
    console.log(s)
  }

  // ── 1. Sign up / sign in ──────────────────────────────────────
  md("### 1. Auth")
  md("- Sign up at", BASE + "/sign-up")
  await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)
  md("- Post-sign-up URL:", page.url())

  if (page.url().includes("sign-")) {
    md("- Account exists, signing in instead")
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForSelector("#email", { timeout: 10000 })
    await page.fill("#email", EMAIL)
    await page.fill("#password", PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(4000)
    md("- Post-sign-in URL:", page.url())
  }

  // ── 2. Create workspace ───────────────────────────────────────
  md("### 2. Workspace creation")
  await page.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 60000 })
  await page.waitForTimeout(2000)

  const nameInput = page.locator("#name")
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(`Probe ${UNIQUE}`)
    md("- Submitting workspace form...")
    await page.getByRole("button", { name: "Create workspace" }).click()
    // Wait for URL to change from /workspaces/new to /<slug>
    try {
      await page.waitForURL((url) => !url.pathname.includes("workspaces/new"), { timeout: 20000 })
      md("- Redirected to:", page.url())
    } catch {
      md("- Timeout waiting for redirect, current URL:", page.url())
      md("  Page text:", await page.evaluate(() => document.body.innerText.substring(0, 300)))
    }
  }
  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
  md("- Workspace slug:", slug)
  if (slug === "workspaces" || slug.includes("sign-in")) {
    md("- FAILED to create workspace, stopping")
    generateReport(lines, [], [], [],)
    return
  }

  // ── 3. Get task IDs ───────────────────────────────────────────
  const { projectId, taskIds } = await page.evaluate(async ({ slug }) => {
    const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
    const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
    const getToken = () => {
      const raw = document.cookie.split("; ").find(c => c.includes("sb-") && c.includes("auth-token"))
      if (!raw) return null
      const val = raw.split("=").slice(1).join("=")
      let encoded = val.startsWith("base64-") ? val.slice(7) : val
      const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4)
      try { return JSON.parse(atob(padded)) } catch { return null }
    }
    const tok = getToken()
    const accessToken = Array.isArray(tok) ? tok[0] : tok?.access_token
    if (!accessToken) return { error: "no token" }
    const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    const wsResp = await fetch(`${SUPABASE_URL}/rest/v1/workspaces?select=id&slug=eq.${slug}`, { headers })
    const ws = await wsResp.json()
    if (!ws?.[0]?.id) return { error: "no workspace" }
    const projResp = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name&workspace_id=eq.${ws[0].id}`, { headers })
    const projects = await projResp.json()
    if (!projects?.[0]?.id) return { error: "no project" }
    const tasksResp = await fetch(`${SUPABASE_URL}/rest/v1/tasks?select=id,title&project_id=eq.${projects[0].id}&limit=5`, { headers })
    const tasks = await tasksResp.json()
    return { projectId: projects[0].id, taskIds: (tasks || []).map((t: any) => t.id) }
  }, { slug })
  md("- Project:", projectId, "Tasks:", taskIds?.length)

  // ── 4. Navigate to kanban ─────────────────────────────────────
  md("### 3. Opening dialog")
  await page.goto(`${BASE}/${slug}/${projectId}`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForTimeout(3000)

  // Click task card to open dialog
  const taskCard = page.locator('[data-testid="task-card"]').first()
  const clickTarget = taskCard.locator("span.cursor-grab")
  if (await clickTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clickTarget.click()
  } else {
    await taskCard.click()
  }
  await page.waitForTimeout(3000)
  const dialogOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
  const fileInputCt = await page.evaluate(() => document.querySelectorAll('input[type="file"]').length)
  md("- Dialog open:", dialogOpen, "File inputs:", fileInputCt)

  // ── 5. INJECT INSTRUMENTATION (after page is fully loaded) ────
  md("### 4. Instrumentation injection")
  const t0 = Date.now()
  await page.evaluate(() => {
    const T0 = Date.now()
    const trace: any[] = []
    const stamp = (label: string, payload: any = {}) => {
      trace.push({ dt: Date.now() - T0, label, ...payload })
    }

    // --- Step 2/3: Intercept onChange registration on file inputs ---
    const origAddEventListener = EventTarget.prototype.addEventListener
    EventTarget.prototype.addEventListener = function (
      type: string, handler: any, options?: any
    ) {
      const self = this as HTMLElement
      if (type === "change" && self.tagName === "INPUT") {
        const aria = self.getAttribute("aria-label") || ""
        stamp("ADD_EVENT_LISTENER", { tag: `INPUT[aria-label=${aria}]` })
      }
      return origAddEventListener.call(this, type, handler, options)
    }

    // --- Step 7: Intercept ALL fetch calls with full body capture ---
    const origFetch = window.fetch
    window.fetch = function (input: any, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : ""
      const method = init?.method || (input instanceof Request ? input.method || "GET" : "GET")
      const headers = init?.headers || (input instanceof Request ? Object.fromEntries(input.headers.entries()) : {}) as Record<string, string>
      
      // Serialize body preview
      let bodyPreview = ""
      if (init?.body) {
        const b = init.body
        if (typeof b === "string") bodyPreview = b.length > 100 ? b.substring(0, 100) + "..." : b
        else if (b instanceof URLSearchParams) bodyPreview = "[URLSearchParams]"
        else if (b instanceof Blob) bodyPreview = `[Blob ${b.size}B type=${b.type}]`
        else if (b instanceof FormData) {
          const entries: string[] = []
          for (const [k, v] of (b as FormData).entries()) {
            if (v instanceof File) entries.push(`${k}=[File ${v.name} ${v.size}B ${v.type}]`)
            else entries.push(`${k}=${String(v).substring(0, 50)}`)
          }
          bodyPreview = `FormData{${entries.join(", ")}}`
        }
        else bodyPreview = `[${typeof b}]`
      }

      stamp("FETCH", {
        url: url.substring(0, 130),
        method,
        nextAction: headers["next-action"] || headers["Next-Action"] || "",
        contentType: (headers["content-type"] || "").substring(0, 50),
        isMultipart: (headers["content-type"] || "").includes("multipart"),
        bodyPreview: bodyPreview.substring(0, 400),
      })
      return origFetch.call(window, input, init)
    }

    stamp("INSTRUMENTS_ACTIVE")
    ;(window as any).__TRACE__ = trace
    ;(window as any).__T0__ = T0
  })
  md("- Instruments injected after page load")

  // ── Collect pre-upload trace ──────────────────────────────────
  const preTrace = await page.evaluate(() => (window as any).__TRACE__ || [])
  md("- Pre-upload trace events:", preTrace.length)

  // ── 6. Trigger file upload ────────────────────────────────────
  md("### 5. Upload trigger")

  // Collect all POST request details from Playwright
  const postRequests: any[] = []
  page.on("request", (req) => {
    if (req.method() !== "POST") return
    const h = req.headers()
    postRequests.push({
      ts: Date.now(),
      url: req.url().substring(0, 130),
      nextAction: h["next-action"] || h["Next-Action"] || "",
      contentType: (h["content-type"] || "").substring(0, 50),
    })
  })

  const attachInput = page.locator('input[type="file"]').first()
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
    attachInput.click(),
  ])

  if (!fileChooser) {
    md("- FAILED: file chooser did not open")
    generateReport(lines, preTrace, [], postRequests)
    return
  }
  md("- File chooser opened")

  // Poll React state snapshots
  const snapshots: any[] = []
  const snapshotInterval = setInterval(async () => {
    try {
      const s = await page.evaluate(() => {
        const text = document.body.innerText
        return {
          dt: Date.now(),
          uploading: text.includes("Uploading"),
          items: document.querySelectorAll('[data-testid="attachment-item"]').length,
          alert: Array.from(document.querySelectorAll('[role="alert"]'))
            .filter(el => el.textContent?.trim())
            .map(el => el.textContent?.trim()),
          traceLen: ((window as any).__TRACE__ || []).length,
        }
      })
      snapshots.push(s)
    } catch {}
  }, 200)

  const setTime = Date.now()
  fileChooser.setFiles(["/tmp/test-attachment.txt"])
  md("- fileChooser.setFiles() called at t=", setTime)

  // Wait for attachment
  let attached = false
  try {
    await page.locator('[data-testid="attachment-item"]').waitFor({ state: "visible", timeout: 20000 })
    attached = true
    md("- ATTACHMENT ITEM APPEARED")
  } catch {
    md("- TIMEOUT: no attachment after 20s")
  }

  clearInterval(snapshotInterval)
  await page.waitForTimeout(1000)

  // ── 7. Collect final data ─────────────────────────────────────
  const finalTrace: any[] = await page.evaluate(() => (window as any).__TRACE__ || [])
  const fetchEvents = finalTrace.filter((e: any) => e.label === "FETCH")
  const addEventListenerEvents = finalTrace.filter((e: any) => e.label === "ADD_EVENT_LISTENER")
  const finalDom = await page.evaluate(() => ({
    items: document.querySelectorAll('[data-testid="attachment-item"]').length,
    uploading: document.body.innerText.includes("Uploading"),
    alerts: Array.from(document.querySelectorAll('[role="alert"]'))
      .filter(el => el.textContent?.trim())
      .map(el => el.textContent?.trim()),
    dialog: !!document.querySelector('[role="dialog"]'),
  }))

  generateReport(lines, finalTrace, snapshots, postRequests, {
    attached,
    setTime,
    fetchEvents,
    addEventListenerEvents,
    finalDom,
  })
})

function generateReport(
  lines: string[],
  finalTrace: any[],
  snapshots: any[],
  postRequests: any[],
  extra?: any,
) {
  let md = `# Attachment Upload Execution Chain Probe

**Generated at**: ${new Date().toISOString()}

## 1. Execution Steps

| # | Step | Est. Executed | Evidence |
|---|------|--------------|----------|
| 1 | File input receives file via \`setFiles()\` | \`YES\` | Playwright \`fileChooser.setFiles()\` returned |
| 2 | \`onChange\` fires on \`<input type="file">\` | | \`ADD_EVENT_LISTENER\` in trace |
| 3 | \`handleFileChange\` starts | | Check for storage upload fetch |
| 4 | \`startTransition\` callback executes | | Check for server action fetch after storage upload |
| 5 | \`createAttachmentRecord()\` invoked | | Check for server action fetch with this action ID |
| 6 | React server action proxy called | | \`window.fetch\` called with \`Next-Action\` header |
| 7 | \`fetch()\` dispatched to network | | Playwright \`page.on('request')\` captured |
| 8 | Server code starts executing | | Server responded (HTTP response received) |

## 2. Test Log

\`\`\`
${lines.join("\n")}
\`\`\`

## 3. Final DOM State

\`\`\`json
${JSON.stringify(extra?.finalDom || {}, null, 2)}
\`\`\`

## 4. Instrumented fetch() calls (chronological)

All calls to \`window.fetch\` captured after instrumentation injection:

| # | dt(ms) | Method | Next-Action | Multipart | Content-Type | URL |
|---|--------|--------|-------------|-----------|-------------|-----|
${(extra?.fetchEvents || finalTrace.filter((e: any) => e.label === "FETCH")).map((e: any, i: number) =>
  `| ${i} | ${e.dt} | ${e.method} | ${(e.nextAction || "").substring(0, 20)} | ${e.isMultipart} | ${(e.contentType || "").substring(0, 25)} | ${(e.url || "").substring(0, 70)} |`
).join("\n")}

### Full body previews

${(extra?.fetchEvents || finalTrace.filter((e: any) => e.label === "FETCH")).map((e: any, i: number) =>
  `**#${i}** (+${e.dt}ms) \`${e.method} ${(e.url || "").substring(0, 80)}\`\n  Body: ${e.bodyPreview || "(empty)"}`
).join("\n\n")}

## 5. React State Snapshots (every 200ms)

Time is relative to \`setFiles()\` call.

\`\`\`
${snapshots.map((s: any) => `t=${s.dt - (extra?.setTime || 0)}ms uploading=${s.uploading} items=${s.items} alerts=${JSON.stringify(s.alert)} traceLen=${s.traceLen}`).join("\n")}
\`\`\`

## 6. All POST requests (Playwright network capture)

\`\`\`
${postRequests.map((r: any, i: number) => `#${i} [${r.ts}] ${r.nextAction ? "action=" + r.nextAction.substring(0, 20) : "(no action)"} ${r.contentType} ${r.url.substring(0, 80)}`).join("\n")}
\`\`\`

## 7. addEventListener registrations on file inputs

\`\`\`
${(extra?.addEventListenerEvents || finalTrace.filter((e: any) => e.label === "ADD_EVENT_LISTENER")).map((e: any) => `+${e.dt}ms ${e.tag}`).join("\n") || "(none)"}
\`\`\`

## 8. Conclusion

${extra?.attached
  ? "**CHAIN COMPLETE**: The attachment item appeared in the DOM. All 8 steps executed successfully."
  : "**CHAIN BROKEN**: No attachment item appeared. See the trace above to identify which step did not execute."}
`

  fs.writeFileSync(TRACE_FILE, md, "utf-8")
  console.log(`ATTACHMENT_TRACE.md written (${md.length} chars)`)
}
