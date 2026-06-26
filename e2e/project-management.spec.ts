import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase D: rename, favorite, archive/restore, and delete a
 * project. Favorites are per-user (project_favorites join table, not a
 * column on projects), since two different members could favorite
 * different projects in the same workspace.
 */
test("a project can be renamed, favorited, archived/restored, and deleted", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-projectmgmt-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()

  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "New" }).click()
  await page.getByLabel("Project name").fill(`Project One ${unique}`)
  await page.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))

  // --- Rename ---
  await page.getByRole("button", { name: "Project settings" }).click()
  await page.getByLabel("Name").fill(`Renamed Project ${unique}`)
  const renamePersisted = page.waitForResponse(
    (resp) => resp.request().method() === "POST"
  )
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await renamePersisted
  // The dialog doesn't auto-close on save (same as the task detail
  // dialog) — its overlay covers the page, so the heading underneath
  // isn't actually "visible" to Playwright until the dialog closes.
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("heading", { name: `Renamed Project ${unique}` })
  ).toBeVisible()

  // --- Favorite from the sidebar, confirm it appears under Favorites ---
  await page
    .getByRole("link", { name: `Renamed Project ${unique}` })
    .locator("..")
    .getByRole("button", { name: "Add to favorites" })
    .click()
  await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Favorites" }).locator("..")
      .getByRole("link", { name: `Renamed Project ${unique}` })
  ).toBeVisible()

  // --- Archive: redirects to the workspace home, project leaves the sidebar ---
  await page.getByRole("button", { name: "Project settings" }).click()
  await page.getByRole("button", { name: "Archive project" }).click()
  await page.waitForURL((url) => url.pathname === workspacePath)
  await expect(
    page.getByRole("link", { name: `Renamed Project ${unique}` })
  ).toHaveCount(0)

  // --- Restore from the Archived projects dialog ---
  await page.getByRole("button", { name: "Archived projects" }).click()
  await expect(page.getByText(`Renamed Project ${unique}`)).toBeVisible()
  await page.getByRole("button", { name: "Restore" }).click()
  await page.keyboard.press("Escape")
  // The restored project is still favorited, so it now renders twice
  // (Favorites + Projects) — .first() is enough to confirm it's back.
  await expect(
    page.getByRole("link", { name: `Renamed Project ${unique}` }).first()
  ).toBeVisible()

  // --- Delete: requires a second confirming click, then is gone for good ---
  await page.getByRole("link", { name: `Renamed Project ${unique}` }).first().click()
  await page.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  await page.getByRole("button", { name: "Project settings" }).click()
  await page.getByRole("button", { name: "Delete project", exact: true }).click()
  await page.getByRole("button", { name: "Confirm delete" }).click()
  await page.waitForURL((url) => url.pathname === workspacePath)
  await expect(
    page.getByRole("link", { name: `Renamed Project ${unique}` })
  ).toHaveCount(0)
})
