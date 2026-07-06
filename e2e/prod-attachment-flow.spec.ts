import { test } from "@playwright/test"

const BASE = "https://aspen-os.vercel.app"
const UNIQUE = Date.now()
const EMAIL = `attachflow-${UNIQUE}@example.com`
const PASSWORD = "Attach123!"

test("debug attachment upload flow end-to-end", async ({ page, context }) => {
  test.setTimeout(300_000)

  const consoleErrors: string[] = []
  const networkErrors: { url: string; status: number; body: string }[] = []

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text())
  })
  let allPostRequests: { url: string; method: string; nextAction: string; contentType: string }[] = []
  let allPostResponses: { url: string; status: number; contentType: string; nextAction: string; bodyLength: number }[] = []
  page.on("request", (req) => {
    if (req.method() === "POST") {
      const h = req.headers()
      const nextAction = h["next-action"] || h["Next-Action"] || ""
      allPostRequests.push({
        url: req.url().substring(0, 120),
        method: req.method(),
        nextAction: nextAction.substring(0, 60),
        contentType: (h["content-type"] || "").substring(0, 80),
      })
    }
  })
  page.on("response", async (resp) => {
    const url = resp.url()
    if (url.includes("supabase") && resp.status() >= 400) {
      let body = ""
      try { body = await resp.text() } catch {}
      networkErrors.push({ url: url.substring(0, 200), status: resp.status(), body: body.substring(0, 500) })
    }
    const method = resp.request().method()
    if (method === "POST") {
      const reqHeaders = resp.request().headers()
      const nextAction = reqHeaders["next-action"] || reqHeaders["Next-Action"] || ""
      try {
        const body = await resp.text()
        allPostResponses.push({
          url: url.substring(0, 120),
          status: resp.status(),
          contentType: (resp.headers()["content-type"] || "").substring(0, 80),
          nextAction: nextAction.substring(0, 60),
          bodyLength: body.length,
        })
      } catch {}
    }
  })
  page.on("pageerror", (err) => consoleErrors.push(`PAGE_ERROR: ${err.message}`))

  // 1. SIGN UP AND CREATE WORKSPACE
  console.log("=== STEP 1: Sign up ===")
  await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  console.log(`  After sign-up: ${page.url()}`)
  
  // Check if sign-up succeeded — if redirected to sign-in, the account already
  // exists (previous run), so sign in instead.
  if (page.url().includes("sign-in")) {
    console.log("  Account exists — signing in instead")
    await page.fill("#email", EMAIL)
    await page.fill("#password", PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
    console.log(`  After sign-in: ${page.url()}`)
  }

  console.log("\n=== STEP 2: Create workspace and get project ===")
  await page.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 30000 })
  const wsInput = page.locator('input[name="name"]')
  if (await wsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await wsInput.fill(`Attach Flow ${UNIQUE}`)
    await page.getByRole("button", { name: "Create workspace" }).click()
    await page.waitForTimeout(5000)
  }
  const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
  if (slug === "workspaces" || slug.includes("sign-in")) {
    console.log(`  ❌ Failed: URL is ${page.url()}`)
    return
  }
  console.log(`  Slug: ${slug}`)

  // 2. GET ALL NEEDED IDS USING PAGE.EVALUATE (credentials sent automatically)
  console.log("\n=== STEP 3: Get IDs from page cookies ===")
  
  // Extract auth token from cookie via page.evaluate
  const authData = await page.evaluate(async () => {
    const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
    const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
    
    // Find the supabase auth cookie
    const cookies = document.cookie.split("; ").filter(c => c.includes("sb-") && c.includes("auth-token"))
    if (cookies.length === 0) return { error: "no auth cookie" }
    
    // The cookie value is "base64-" + base64url-encoded JSON
    // The inner JSON is [access_token, refresh_token, user]
    const raw = cookies[0].split("=").slice(1).join("=")
    try {
      // Strip "base64-" prefix
      let encoded = raw
      if (encoded.startsWith("base64-")) encoded = encoded.slice(7)
      // Convert base64url → base64
      const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4)
      const decoded = atob(padded)
      const parsed = JSON.parse(decoded)
      const accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token
      const user = Array.isArray(parsed) ? parsed[2] : parsed.user
      return { accessToken, userId: user?.id }
    } catch (e: any) {
      return { error: `decode failed: ${e.message}`, raw: raw.substring(0, 100) }
    }
  })
  
  if (!authData.accessToken) {
    console.log(`  ❌ ${JSON.stringify(authData)}`)
    return
  }
  console.log(`  User ID: ${authData.userId?.substring(0, 20)}...`)
  console.log(`  Token: ${authData.accessToken.substring(0, 20)}...`)
  
  // Now make the API calls from page.evaluate (browser context with correct fetch)
  const apiResults = await page.evaluate(async ({ slug, authData: { accessToken, userId } }) => {
    const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
    const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
    
    const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
    const results: any = {}
    
    // Try to find workspace by slug
    try {
      const wsResp = await fetch(`${SUPABASE_URL}/rest/v1/workspaces?select=id&slug=eq.${slug}`, { headers })
      if (wsResp.ok) {
        const data = await wsResp.json()
        results.workspace = data
      } else {
        results.workspaceError = `${wsResp.status}: ${await wsResp.text()}`
      }
    } catch (e: any) { results.workspaceError = e.message }
    
    // If we have workspace ID, find projects
    if (results.workspace?.[0]?.id) {
      const wsId = results.workspace[0].id
      try {
        const projResp = await fetch(`${SUPABASE_URL}/rest/v1/projects?select=id,name&workspace_id=eq.${wsId}`, { headers })
        if (projResp.ok) results.projects = await projResp.json()
        else results.projectsError = `${projResp.status}: ${await projResp.text()}`
      } catch (e: any) { results.projectsError = e.message }
      
      // Find tasks from first project
      if (results.projects?.[0]?.id) {
        const projId = results.projects[0].id
        try {
          const tasksResp = await fetch(`${SUPABASE_URL}/rest/v1/tasks?select=id,title&project_id=eq.${projId}&limit=5`, { headers })
          if (tasksResp.ok) results.tasks = await tasksResp.json()
          else results.tasksError = `${tasksResp.status}: ${await tasksResp.text()}`
        } catch (e: any) { results.tasksError = e.message }
      }
    }
    
    // TEST 1: Storage upload
    const taskId = results.tasks?.[0]?.id || "no-task"
    const testPath = `${taskId}/test-upload-${Date.now()}.txt`
    
    try {
      const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${testPath}`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "text/plain" },
        body: "test content for debugging",
      })
      results.storageUpload = { status: uploadResp.status, body: await uploadResp.text() }
    } catch (e: any) { results.storageUpload = { error: e.message } }
    
    // TEST 2: DB insert
    if (results.tasks?.[0]?.id && userId) {
      try {
        const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/task_attachments`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({
            task_id: results.tasks[0].id,
            uploaded_by: userId,
            file_name: "test.txt",
            file_path: testPath,
            file_size: 24,
            content_type: "text/plain",
          }),
        })
        results.dbInsert = { status: insertResp.status, body: await insertResp.text() }
      } catch (e: any) { results.dbInsert = { error: e.message } }
    }
    
    // TEST 3: Create signed URL
    try {
      const signedResp = await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${testPath}?createSignedURL=true`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      })
      results.signedUrl = { status: signedResp.status, body: await signedResp.text() }
    } catch (e: any) { results.signedUrl = { error: e.message } }
    
    // CLEANUP
    for (const path of [testPath]) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${path}`, {
        method: "DELETE",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
      }).catch(() => {})
    }
    if (results.tasks?.[0]?.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/task_attachments?file_path=eq.${encodeURIComponent(testPath)}`, {
        method: "DELETE",
        headers,
      }).catch(() => {})
    }
    
    return results
  }, { slug, authData })
  
  console.log("\n=== STEP 4: API call results ===")
  console.log(`  Workspace: ${JSON.stringify(apiResults.workspace || apiResults.workspaceError)}`)
  console.log(`  Projects: ${JSON.stringify(apiResults.projects || apiResults.projectsError)}`)
  console.log(`  Tasks: ${JSON.stringify(apiResults.tasks || apiResults.tasksError)}`)
  console.log(`  Storage upload: ${JSON.stringify(apiResults.storageUpload)}`)
  console.log(`  DB insert: ${JSON.stringify(apiResults.dbInsert)}`)
  console.log(`  Signed URL: ${JSON.stringify(apiResults.signedUrl)}`)

  // 5. VERIFY SIGNED URL ENDPOINT
  console.log("\n=== STEP 5: Verify signed URL creation ===")
  
  const taskId = apiResults.tasks?.[0]?.id
  const testPath = `${taskId || "test"}/verify-signed-url.txt`
  
  // First upload a file
  const signedUrlTest = await page.evaluate(async ({ taskId, testPath }) => {
    const SUPABASE_URL = "https://kehumsoipwvrzkomfyey.supabase.co"
    const ANON_KEY = "sb_publishable_mt9b7tK-KKazX-JwUiqzSg_CjYo-3qK"
    
    // Get auth token from cookie
    const cookie = document.cookie.split("; ").find(c => c.includes("sb-") && c.includes("auth-token"))
    if (!cookie) return { error: "no cookie" }
    const raw = cookie.split("=").slice(1).join("=")
    let encoded = raw.startsWith("base64-") ? raw.slice(7) : raw
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4)
    const parsed = JSON.parse(atob(padded))
    const accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token
    const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` }
    
    // Upload test file
    await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${testPath}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "text/plain" },
      body: "verify signed url test",
    })
    
    // Create signed URL (correct REST endpoint)
    const signResp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/task-attachments/${testPath}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    })
    const signResult = { status: signResp.status, body: await signResp.text() }
    
    // Test the signed URL
    let downloadResult = "not tested"
    if (signResp.ok) {
      try {
        const signedData = JSON.parse(signResult.body)
        const signedUrl = signedData.signedURL || signedData.url || signedData.signedUrl
        if (signedUrl) {
          const dlResp = await fetch(signedUrl)
          downloadResult = `HTTP ${dlResp.status}: ${await dlResp.text()}`
        } else {
          downloadResult = `no URL in response: ${signResult.body}`
        }
      } catch (e: any) {
        downloadResult = `parse error: ${e.message}, body: ${signResult.body.substring(0, 200)}`
      }
    }
    
    // Clean up
    await fetch(`${SUPABASE_URL}/storage/v1/object/task-attachments/${testPath}`, {
      method: "DELETE", headers,
    }).catch(() => {})
    
    return { signedUrlResult: signResult, downloadResult }
  }, { taskId, testPath })
  
  console.log(`  Signed URL result: ${JSON.stringify(signedUrlTest?.signedUrlResult)}`)
  console.log(`  Download via signed URL: ${signedUrlTest?.downloadResult}`)
  
  // 6. INVESTIGATE UI
  console.log("\n=== STEP 6: Investigate task detail dialog ===")
  
  const projectId = apiResults.projects?.[0]?.id
  if (projectId) {
    await page.goto(`${BASE}/${slug}/${projectId}`, { waitUntil: "networkidle", timeout: 30000 })
    await page.waitForTimeout(3000)
    
    const pageStructure = await page.evaluate(() => {
      const fileInputs = document.querySelectorAll('input[type="file"]')
      const taskCards = document.querySelectorAll('[data-testid="task-card"]')
      const dialog = document.querySelector('[role="dialog"]')
      return {
        fileInputCount: fileInputs.length,
        taskCardCount: taskCards.length,
        hasDialog: !!dialog,
        fileInputDetails: Array.from(fileInputs).map(el => ({
          'aria-label': el.getAttribute('aria-label'),
          id: el.id,
          visible: (el as HTMLElement).offsetParent !== null,
        })),
      }
    })
    console.log(`  File inputs: ${pageStructure.fileInputCount}`)
    console.log(`  Task cards: ${pageStructure.taskCardCount}`)
    
    // Click on the task card span (not draggable attr, click the flex-1 span)
    if (pageStructure.taskCardCount > 0) {
      const taskCard = page.locator('[data-testid="task-card"]').first()
      // The clickable span is inside the task card
      const clickTarget = taskCard.locator('span.cursor-grab')
      if (await clickTarget.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickTarget.click()
        await page.waitForTimeout(3000)
        
        const afterClick = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]')
          const fileInputs = document.querySelectorAll('input[type="file"]')
          const loadingText = document.body.innerText.includes("Loading attachments")
          const attachSection = dialog?.innerHTML?.includes("Attachment") || dialog?.innerHTML?.includes("attachment")
          return {
            hasDialog: !!dialog,
            fileInputCount: fileInputs.length,
            loadingAttachments: loadingText,
            hasAttachmentSection: attachSection,
            dialogHtml: dialog?.innerHTML?.substring(0, 1500) || "no dialog",
          }
        })
        console.log(`  After click:`)
        console.log(`    Dialog open: ${afterClick.hasDialog}`)
        console.log(`    File inputs: ${afterClick.fileInputCount}`)
        console.log(`    Loading attachments: ${afterClick.loadingAttachments}`)
        console.log(`    Has attachment section: ${afterClick.hasAttachmentSection}`)
        
        // 7. ACTUAL UPLOAD THROUGH THE DIALOG
        if (afterClick.fileInputCount > 0) {
          console.log("\n=== STEP 7: Upload through dialog ===")
          const attachInput = page.locator('input[type="file"]').first()
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            attachInput.click(),
          ])
          if (fileChooser) {
            // Track requests during upload
            const uploadPhaseRequests: string[] = []
            const handler = (req: any) => {
              if (req.method() === "POST") {
                const h = req.headers()
                uploadPhaseRequests.push(`${req.url().substring(0, 120)} action=${h["next-action"] || h["Next-Action"] || "none"} ct=${(h["content-type"] || "").substring(0, 50)}`)
              }
            }
            page.on("request", handler)
            
            fileChooser.setFiles(["/tmp/test-attachment.txt"])
            console.log("  ✅ File selected via dialog")
            
            // Wait for upload to complete
            await page.waitForTimeout(5000)
            
            page.off("request", handler)
            
            console.log(`  Requests during upload phase: ${uploadPhaseRequests.length}`)
            uploadPhaseRequests.forEach(r => console.log(`    ${r}`))
            
            // Enumerate ALL [role="alert"] elements
            const allAlerts = await page.evaluate(() => {
              const alerts = document.querySelectorAll('[role="alert"]')
              return Array.from(alerts).map((el, i) => ({
                index: i,
                text: (el as HTMLElement).innerText || "",
                html: (el as HTMLElement).outerHTML?.substring(0, 200),
                className: (el as HTMLElement).className,
              }))
            })
            console.log(`  Visible alerts on page: ${JSON.stringify(allAlerts)}`)
            
            // Check if attachment item appeared
            const attachItem = page.locator('[data-testid="attachment-item"]')
            if (await attachItem.isVisible({ timeout: 5000 }).catch(() => false)) {
              const fileName = await attachItem.locator('a, span').first().textContent()
              console.log(`  ✅ Attachment rendered: "${fileName}"`)
            } else {
              console.log("  ℹ️ No attachment item appeared")
            }
          } else {
            console.log("  ❌ File chooser did not open")
          }
        }
      } else {
        console.log("  ❌ No clickable span found in task card")
        await taskCard.click()
        await page.waitForTimeout(2000)
        const dialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
        console.log(`    Dialog after card click: ${dialog}`)
      }
    } else {
      console.log("  ❌ No task cards rendered")
      const text = await page.evaluate(() => document.body.innerText.substring(0, 1000))
      console.log(`  Page: ${text.substring(0, 500)}`)
    }
  }

  // 8. FINAL REPORT
  console.log("\n=== STEP 8: Error report ===")
  console.log(`Console errors: ${consoleErrors.length}`)
  consoleErrors.forEach(e => console.log(`  ${e.substring(0, 200)}`))
  console.log(`Network errors: ${networkErrors.length}`)
  networkErrors.forEach(e => console.log(`  HTTP ${e.status}: ${e.url.substring(0, 100)} => ${e.body.substring(0, 200)}`))
  console.log(`All server action POST requests: ${allPostRequests.filter(r => r.nextAction).length}`)
  allPostRequests.filter(r => r.nextAction).forEach((r, i) => {
    console.log(`  REQ #${i}: ${r.url.substring(0, 100)} action=${r.nextAction} [${r.contentType.substring(0, 40)}]`)
  })
  console.log(`All POST responses: ${allPostResponses.length}`)
  allPostResponses.filter(r => r.nextAction || r.contentType.includes("boundary")).forEach((r, i) => {
    console.log(`  POST #${i}: ${r.status} ${r.url.substring(0, 100)} action=${r.nextAction} [${r.contentType.substring(0, 40)}] (${r.bodyLength}B)`)
  })
  // Also log any multipart/form-data posts that might be file uploads
  const fileUploads = allPostRequests.filter(r => r.contentType.includes("multipart") || r.contentType.includes("boundary") || r.contentType.includes("form-data"))
  if (fileUploads.length > 0) {
    console.log(`  File upload POSTs: ${JSON.stringify(fileUploads)}`)
  } else {
    console.log(`  No file upload POSTs detected (0 multipart/form-data requests)`)
  }

  await page.screenshot({ path: "/tmp/attachment-debug.png", fullPage: true })
  console.log("\nDone. Screenshot at /tmp/attachment-debug.png")
})
