import { test } from "@playwright/test"

const BASE = "https://aspen-os.vercel.app"
const UNIQUE = Date.now()
const EMAIL = `attach-${UNIQUE}@example.com`
const PASSWORD = "Attach123!"

test("debug task attachment upload flow", async ({ page, context }) => {
  test.setTimeout(300_000)

  const errors: string[] = []
  const requests: { url: string; method: string }[] = []

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`)
  })
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`))
  page.on("request", (req) => {
    if (req.url().includes("supabase") || req.url().includes("_rsc")) {
      requests.push({ url: req.url().substring(0, 200), method: req.method() })
    }
  })
  page.on("requestfailed", (req) => {
    errors.push(`[requestfailed] ${req.url().substring(0, 200)}: ${req.failure()?.errorText}`)
  })
  page.on("response", (resp) => {
    if (resp.url().includes("supabase") && resp.status() >= 400) {
      errors.push(`[response ${resp.status()}] ${resp.url().substring(0, 200)}`)
    }
  })

  // 1. SIGN UP
  console.log("=== STEP 1: Sign up ===")
  await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)

  // 2. CREATE WORKSPACE
  console.log("\n=== STEP 2: Create workspace ===")
  await page.goto(`${BASE}/workspaces/new`, { waitUntil: "networkidle", timeout: 30000 })
  const wsInput = page.locator('input[name="name"]')
  if (await wsInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await wsInput.fill(`Attach Debug ${UNIQUE}`)
    await page.getByRole("button", { name: "Create workspace" }).click()
    await page.waitForTimeout(5000)
  }
  let slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
  if (slug === "workspaces" || slug.includes("sign-in")) {
    console.log(`  Failed to create workspace. URL: ${page.url()}`)
    return
  }
  console.log(`  Workspace slug: ${slug}`)

  // 3. GO TO PROJECT (seeded "Getting Started" project)
  console.log("\n=== STEP 3: Find and open project ===")
  await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle", timeout: 30000 })
  
  // Try to find the project
  const projLink = page.locator("a").filter({ hasText: /Getting Started|getting-started/i }).first()
  const rawProjLink = page.locator('[href*="/' + slug + '/"]').filter({ hasText: /.+/ }).first()
  
  let projectUrl = ""
  if (await projLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    projectUrl = (await projLink.getAttribute("href")) || ""
  } else if (await rawProjLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    projectUrl = (await rawProjLink.getAttribute("href")) || ""
  }
  
  if (!projectUrl) {
    console.log("  No project found. Checking page content...")
    const text = await page.evaluate(() => document.body.innerText.substring(0, 1000))
    console.log(`  Page content: ${text.substring(0, 500)}`)

    // Maybe we need to create a project?
    const createProjBtn = page.getByRole("button", { name: /create.*project|new.*project/i }).first()
    if (await createProjBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Creating a new project...")
      await createProjBtn.click()
      await page.waitForTimeout(3000)
      // Look for project link after creation
      const newProj = page.locator('[href*="/' + slug + '/"]').filter({ hasText: /.+/ }).first()
      if (await newProj.isVisible({ timeout: 5000 }).catch(() => false)) {
        projectUrl = (await newProj.getAttribute("href")) || ""
      }
    }
  }

  if (projectUrl) {
    await page.goto(`${BASE}${projectUrl}`, { waitUntil: "networkidle", timeout: 30000 })
    console.log(`  Project page: ${page.url()}`)
  } else {
    console.log("  Could not find or create a project. Aborting.")
    return
  }

  // 4. FIND A TASK AND OPEN IT
  console.log("\n=== STEP 4: Open task detail dialog ===")
  
  // Wait for kanban board to load
  await page.waitForTimeout(3000)

  // Look for any clickable task element
  const taskElements = [
    page.locator('[draggable="true"]').first(),
    page.locator('[data-testid="task-card"]').first(),
    page.locator('[role="button"]').filter({ hasText: /^[A-Z]/ }).first(),
  ]

  let taskClicked = false
  for (const el of taskElements) {
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click()
      taskClicked = true
      console.log("  ✅ Task clicked")
      await page.waitForTimeout(2000)
      break
    }
  }

  if (!taskClicked) {
    console.log("  ❌ No task element found to click")
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000))
    console.log(`  Page: ${bodyText.substring(0, 500)}`)
  }

  // 5. UPLOAD FILE
  console.log("\n=== STEP 5: Attempt attachment upload ===")

  // Look for file input
  const fileInput = page.locator('input[type="file"]')
  const inputCount = await fileInput.count()
  console.log(`  File inputs found: ${inputCount}`)

  if (inputCount > 0) {
    for (let i = 0; i < inputCount; i++) {
      const input = fileInput.nth(i)
      const label = await input.getAttribute("aria-label")
      const id = await input.getAttribute("id")
      console.log(`  Input #${i}: aria-label="${label}" id="${id}"`)
    }
  }

  // Find the attachment input (should have aria-label="Attachment")
  const attachInput = page.locator('input[type="file"][aria-label="Attachment"]')
  if (await attachInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("  ✅ Attachment input found")

    // Capture network activity during upload
    const supabaseRequests: Promise<any>[] = []

    // Upload
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
      attachInput.click(),
    ])

    if (fileChooser) {
      // Create test image
      const testFile = "/tmp/test-attachment.png"
      require("fs").writeFileSync(testFile, "fake png content")
      
      await fileChooser.setFiles([testFile])
      console.log("  ✅ File selected, waiting for upload...")
      
      await page.waitForTimeout(5000)

      // Check page for errors
      const bodyText = await page.evaluate(() => document.body.innerText)
      const errorText = bodyText.includes("error") || bodyText.includes("Error") 
        ? bodyText.substring(bodyText.indexOf("Error"), bodyText.indexOf("Error") + 200)
        : "No error found in body"

      console.log(`  Page errors: ${errorText.substring(0, 300)}`)

      // Check for upload error specifically
      const uploadErrorEl = page.locator('[role="alert"]')
      if (await uploadErrorEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        const alertText = await uploadErrorEl.textContent()
        console.log(`  ❌ Upload error visible: "${alertText}"`)
      } else {
        console.log("  No visible upload alert")
      }
    }
  } else {
    console.log("  ❌ No attachment input found")
    // List all file inputs
    const allInputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
        'aria-label': el.getAttribute('aria-label'),
        id: el.id,
        className: el.className.substring(0, 100),
      }))
    })
    console.log(`  All file inputs: ${JSON.stringify(allInputs)}`)
  }

  // 6. REPORT ALL ERRORS
  console.log("\n=== STEP 6: Error report ===")
  console.log(`  Console errors: ${errors.length}`)
  errors.forEach((e) => console.log(`    ${e}`))
  console.log(`  Supabase requests made: ${requests.length}`)
  requests.forEach((r) => console.log(`    ${r.method} ${r.url.substring(0, 150)}`))

  await page.screenshot({ path: "/tmp/attachment-debug.png", fullPage: true })
  console.log("\nScreenshot saved to /tmp/attachment-debug.png")
})
