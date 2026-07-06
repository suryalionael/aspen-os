import { test } from "@playwright/test"

const BASE = "https://aspen-os.vercel.app"
const UNIQUE = Date.now()
const EMAIL = `perf-auth-${UNIQUE}@example.com`
const PASSWORD = "AuthTest123!"

test("debug auth flow in production", async ({ page }) => {
  test.setTimeout(120_000)

  // 1. Check sign-up page loads
  console.log("=== 1. Sign-up page ===")
  const resp = await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle", timeout: 30000 })
  console.log(`  Status: ${resp?.status()}`)
  console.log(`  URL: ${page.url()}`)
  console.log(`  Title: ${await page.title()}`)

  // 2. Fill and submit
  console.log("\n=== 2. Submit sign-up ===")
  await page.waitForSelector("#email", { timeout: 10000 })
  await page.fill("#email", EMAIL)
  await page.fill("#password", PASSWORD)
  // Listen for navigation
  const [navResp] = await Promise.all([
    page.waitForNavigation({ timeout: 30000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ])
  console.log(`  After submit URL: ${page.url()}`)
  console.log(`  After submit status: ${navResp ? await navResp.status() : "no navigation"}`)

  // 3. Try to find workspace creation
  const pageContent = await page.content()
  const hasWorkspaceForm = pageContent.includes("Workspace name") || pageContent.includes("workspaces/new")
  console.log(`\n=== 3. On workspace creation page: ${hasWorkspaceForm} ===`)
  console.log(`  Current URL: ${page.url()}`)

  if (page.url().includes("workspaces/new") || hasWorkspaceForm) {
    // Create workspace
    await page.waitForSelector('input[name="name"]', { timeout: 10000 })
    await page.fill('input[name="name"]', `Auth Debug ${UNIQUE}`)
    
    const [wsResp] = await Promise.all([
      page.waitForNavigation({ timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ])
    console.log(`\n=== 4. After workspace creation ===`)
    console.log(`  URL: ${page.url()}`)

    // 5. Check cookies
    const cookies = await page.context().cookies()
    const supabaseCookies = cookies.filter(c => c.name.includes("supabase") || c.name.includes("sb-") || c.name.includes("auth"))
    console.log(`\n=== 5. Auth cookies ===`)
    supabaseCookies.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0, 50)}... domain=${c.domain}`))

    // 6. Check if we can navigate
    if (page.url().match(/^https:\/\/aspen-os\.vercel\.app\/[^/]+$/)) {
      const slug = new URL(page.url()).pathname.split("/").filter(Boolean)[0]
      console.log(`\n  Workspace slug: ${slug}`)
      
      // Check page content
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500))
      console.log(`  Page content (first 500 chars): ${bodyText.substring(0, 200)}`)
    } else {
      // What page are we on?
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500))
      console.log(`  Unexpected URL: ${page.url()}`)
      console.log(`  Page content: ${bodyText.substring(0, 300)}`)
    }
  } else {
    // We're not on the workspace creation page. Check if we need email confirmation
    const errorEl = await page.textContent('[role="alert"]').catch(() => null)
    console.log(`  Error message: ${errorEl}`)
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000))
    console.log(`  Page content: ${bodyText.substring(0, 500)}`)
    
    // Try to sign in directly
    console.log("\n=== 6. Trying sign-in instead ===")
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" })
    await page.waitForSelector("#email", { timeout: 10000 })
    await page.fill("#email", EMAIL)
    await page.fill("#password", PASSWORD)
    
    const [signinResp] = await Promise.all([
      page.waitForNavigation({ timeout: 30000 }).catch(() => null),
      page.click('button[type="submit"]'),
    ])
    console.log(`  After sign-in URL: ${page.url()}`)
    const bodyAfter = await page.evaluate(() => document.body.innerText.substring(0, 500))
    console.log(`  Content: ${bodyAfter.substring(0, 300)}`)
  }

  // Screenshot for debugging
  await page.screenshot({ path: "/tmp/prod-auth-state.png", fullPage: true })
  console.log("\nScreenshot saved to /tmp/prod-auth-state.png")
})
