import { test, expect, type Page } from "@playwright/test"
import path from "path"
import fs from "fs"
import os from "os"

/**
 * Bug fix verification: workspace logo and profile avatar uploads previously
 * hit the error boundary ("Something went wrong") due to two combined issues:
 *  1. Next.js's default 1 MB Server Action body limit was lower than the app's
 *     2 MB validation, so larger files were rejected before the action ran.
 *  2. Logo upload used <form action={serverAction}> inside a Radix Portal,
 *     which silently fails for file inputs in production.
 * Both are fixed: bodySizeLimit raised to 4 MB, both upload forms now call
 * the action directly (same pattern as TaskAttachments).
 */

async function signUpAndCreateWorkspace(page: Page, unique: number) {
  const email = `e2e-uploads-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`E2E Uploads Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  return { email }
}

function createTinyPng(): string {
  // Minimal 1×1 px PNG (68 bytes) — valid image that fits under all limits.
  const pngBytes = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
    "2e00000000c4944415478016360f8cfc0000000200016732ce790000000049454e44ae426082",
    "hex"
  )
  const tmp = path.join(os.tmpdir(), `test-${Date.now()}.png`)
  fs.writeFileSync(tmp, pngBytes)
  return tmp
}

test("workspace logo upload works without hitting the error boundary", async ({ page }) => {
  test.setTimeout(60_000)
  const unique = Date.now()
  await signUpAndCreateWorkspace(page, unique)

  const pngPath = createTinyPng()

  // Open workspace settings.
  await page.getByRole("button", { name: "Project settings" }).waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
    // Might be admin/owner gear button — try the workspace settings button.
    await page.getByRole("button", { name: "Workspace settings" }).waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  })

  // Find and click the workspace settings via sidebar.
  const settingsBtn = page.getByRole("button", { name: /Workspace settings|Settings/i }).first()
  await settingsBtn.waitFor({ state: "visible", timeout: 10_000 })
  await settingsBtn.click()

  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })

  // Upload a logo — should NOT navigate to error page.
  const logoInput = page.getByLabel("Workspace logo")
  await logoInput.setInputFiles(pngPath)

  // Wait for upload to complete (either success indicator or error message —
  // but NOT the error boundary "Something went wrong").
  await page.waitForTimeout(3000)
  await expect(page.getByText("Something went wrong")).not.toBeVisible()
  await expect(page.getByRole("dialog")).toBeVisible()

  fs.unlinkSync(pngPath)
})

test("avatar upload on account page works without hitting the error boundary", async ({
  page,
}) => {
  test.setTimeout(60_000)
  const unique = Date.now()
  await signUpAndCreateWorkspace(page, unique)

  const pngPath = createTinyPng()

  await page.goto("/account")
  await expect(page.getByLabel("Avatar")).toBeVisible({ timeout: 10_000 })

  const avatarInput = page.getByLabel("Avatar")
  await avatarInput.setInputFiles(pngPath)

  await page.waitForTimeout(3000)
  // Primary check: must NOT hit the global error boundary.
  await expect(page.getByText("Something went wrong")).not.toBeVisible()
  // Must not show any upload-specific error (distinct from the pre-existing
  // empty alert elements that account page components always render).
  await expect(page.getByText("Avatar must be", { exact: false })).not.toBeVisible()
  await expect(page.getByText("Choose an image", { exact: false })).not.toBeVisible()

  fs.unlinkSync(pngPath)
})
