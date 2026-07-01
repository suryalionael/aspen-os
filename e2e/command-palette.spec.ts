import { test, expect } from "@playwright/test"

/**
 * Sprint 5 / Sprint 7: global ⌘K command palette — opens from anywhere in
 * the workspace, navigates to projects/Calendar/Notes, and closes on Escape.
 */
test("command palette opens with ⌘K, filters items, navigates, and closes on Escape", async ({
  page,
}) => {
  test.setTimeout(60_000)

  const unique = Date.now()
  const email = `e2e-cmd-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Cmd Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Cmd Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // Wait for client-side hydration — sidebar links confirm JS is live.
  await page.getByRole("link", { name: "Calendar", exact: true }).waitFor({ state: "visible" })

  // --- ⌘K opens the palette ---
  await page.keyboard.press("Meta+k")
  await expect(page.getByTestId("command-palette")).toBeVisible({ timeout: 8000 })

  // --- Escape closes it ---
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("command-palette")).not.toBeAttached()

  // --- Typing "notes" filters to the Notes item and Enter navigates ---
  await page.keyboard.press("Meta+k")
  await page.getByTestId("command-palette-input").fill("notes")
  await page.keyboard.press("Enter")
  await page.waitForURL((url) => url.pathname === `${workspacePath}/notes`)

  // --- Palette works from the Notes page too ---
  await page.keyboard.press("Meta+k")
  await expect(page.getByTestId("command-palette")).toBeVisible()
  await page.getByTestId("command-palette-input").fill(`E2E Cmd Project ${unique}`)
  await page.keyboard.press("Enter")
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  await expect(page.getByText(`E2E Cmd Project ${unique}`)).toBeVisible()
})
