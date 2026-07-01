import { test, expect } from "@playwright/test"

/**
 * Sprint 4 Priority 13 ("Heart & Hub"): a single notes entity covers
 * Documents/Quick Notes/Meeting Notes via a type tag, with Announcements as
 * a thin wrapper that also posts to the existing Audit Log and surfaces on
 * the workspace home page.
 */
test("notes support create/filter/edit by type, and announcements surface in the audit log and on workspace home", async ({
  page,
}) => {
  test.setTimeout(60_000)

  const unique = Date.now()
  const email = `e2e-notes-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Notes Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`E2E Notes Project ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // --- Navigate to Notes via the sidebar link ---
  await page.getByRole("link", { name: "Notes", exact: true }).click()
  await page.waitForURL((url) => url.pathname === `${workspacePath}/notes`)

  // --- Create a quick note (the default type) ---
  await page.getByRole("button", { name: "+ New note" }).click()
  await expect(page.getByRole("dialog", { name: "New note" })).toBeVisible()
  await page.getByLabel("Title").fill("Quick reminder")
  await page.getByLabel("Body").fill("Don't forget the grant deadline.")
  const quickNoteSaved = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await quickNoteSaved
  await expect(page.getByRole("dialog", { name: "New note" })).toBeHidden()
  await expect(page.getByTestId("note-card").filter({ hasText: "Quick reminder" })).toBeVisible()

  // --- Create an announcement ---
  await page.getByRole("button", { name: "+ New note" }).click()
  await page.getByLabel("Title").fill("Office closed Friday")
  await page.getByLabel("Type").selectOption("announcement")
  await page.getByLabel("Body").fill("We're closed this Friday for the holiday.")
  const announcementSaved = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await announcementSaved
  await expect(page.getByRole("dialog", { name: "New note" })).toBeHidden()
  await expect(page.getByTestId("note-card").filter({ hasText: "Office closed Friday" })).toBeVisible()

  // --- Filtering by type narrows the list ---
  await page.getByRole("button", { name: "Announcements", exact: true }).click()
  await expect(page.getByTestId("note-card")).toHaveCount(1)
  await expect(page.getByTestId("note-card").filter({ hasText: "Office closed Friday" })).toBeVisible()
  await page.getByRole("button", { name: "All", exact: true }).click()
  await expect(page.getByTestId("note-card")).toHaveCount(2)

  // --- Editing an existing note ---
  await page.getByTestId("note-card").filter({ hasText: "Quick reminder" }).click()
  await expect(page.getByRole("dialog", { name: "Edit note" })).toBeVisible()
  await expect(page.getByLabel("Title")).toHaveValue("Quick reminder")
  await page.keyboard.press("Escape")

  // --- The announcement also posted to the existing Audit Log ---
  await page.getByRole("button", { name: "Audit log" }).click()
  // Audit log renders action labels in lowercase — scope to entry rows to
  // avoid colliding with the "Announcement posted" option in the filter <select>.
  await expect(
    page.getByTestId("audit-log-entry").filter({ hasText: "announcement posted" })
  ).toBeVisible()
  await page.keyboard.press("Escape")

  // --- And surfaces on the workspace home dashboard ---
  await page.goto(workspacePath)
  await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Announcements" }).locator("../..").getByText("Office closed Friday")
  ).toBeVisible()
})
