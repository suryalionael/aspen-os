import path from "node:path"

import { test, expect } from "@playwright/test"

/**
 * Sprint 2 Phase G: avatar upload/removal, and bio/theme/timezone/
 * notifications saved via the account page. Per DEC-024, bio/theme/
 * timezone/notifications live in auth.users.user_metadata (no table), and
 * avatars live in the "avatars" Storage bucket (migration 021).
 */
test("avatar can be uploaded and removed, and profile fields persist across reload", async ({
  page,
}) => {
  const unique = Date.now()
  const email = `e2e-profile-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.goto("/account")
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible()

  // --- Avatar upload ---
  const uploadPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page
    .getByLabel("Avatar")
    .setInputFiles(path.join(__dirname, "..", "app", "icon.png"))
  await uploadPersisted
  await expect(page.getByRole("img", { name: "" }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible()

  // --- Profile fields: bio, theme, timezone, notifications ---
  await page.getByLabel("Bio").fill("Building nonprofit tools.")
  await page.getByLabel("Theme").selectOption("dark")
  await page.getByLabel("Timezone").selectOption("America/New_York")
  await page.getByLabel("Show in-app notifications for board activity").uncheck()
  const savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save profile" }).click()
  await savePersisted
  await expect(page.getByText("Saved.")).toBeVisible()

  // Dark theme applies immediately on save, client-side.
  await expect(page.locator("html")).toHaveClass(/dark/)

  // --- Reload: confirm everything persisted server-side, not just locally ---
  await page.reload()
  await expect(page.getByLabel("Bio")).toHaveValue("Building nonprofit tools.")
  await expect(page.getByLabel("Theme")).toHaveValue("dark")
  await expect(page.getByLabel("Timezone")).toHaveValue("America/New_York")
  await expect(
    page.getByLabel("Show in-app notifications for board activity")
  ).not.toBeChecked()
  await expect(page.locator("html")).toHaveClass(/dark/)

  // --- Avatar persists across reload too, and can be removed ---
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible()
  const removePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Remove photo" }).click()
  await removePersisted
  await expect(page.getByText("No photo")).toBeVisible()
})
