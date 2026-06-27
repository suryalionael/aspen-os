import path from "node:path"

import { test, expect } from "@playwright/test"

/**
 * Sprint 3 Phase M: workspace logo/description/default timezone,
 * JSON/CSV export, and the danger zone (archive/restore, delete).
 * General field edits are admin+owner (migration 026); archive/delete
 * stay owner-only, funneled through dedicated RPCs (DEC pattern from
 * change_member_role/transfer_workspace_ownership).
 */
test("workspace settings can be edited, exported, and archived/restored", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-wssettings-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`Settings Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(page.url()).pathname

  await page.getByRole("button", { name: "Workspace settings" }).click()
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toBeVisible()

  // --- Logo upload ---
  const uploadPersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByLabel("Workspace logo").setInputFiles(path.join(__dirname, "..", "app", "icon.png"))
  await uploadPersisted
  await expect(page.getByRole("button", { name: "Remove logo" })).toBeVisible()

  // --- Name, description, default timezone ---
  await page.getByLabel("Name").fill(`Renamed Settings Workspace ${unique}`)
  await page.getByLabel("Description").fill("A workspace for E2E settings coverage.")
  await page.getByLabel("Default timezone").selectOption("America/New_York")
  const savePersisted = page.waitForResponse((resp) => resp.request().method() === "POST")
  await page.getByRole("button", { name: "Save" }).click()
  await savePersisted
  await expect(page.getByText("Saved.")).toBeVisible()

  // --- Export as JSON ---
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export as JSON" }).click(),
  ])
  expect(jsonDownload.suggestedFilename()).toContain(".json")
  const jsonStream = await jsonDownload.createReadStream()
  const jsonChunks: Buffer[] = []
  for await (const chunk of jsonStream!) jsonChunks.push(chunk as Buffer)
  const jsonContent = JSON.parse(Buffer.concat(jsonChunks).toString("utf-8"))
  expect(jsonContent.workspace.name).toBe(`Renamed Settings Workspace ${unique}`)

  // --- Export as CSV ---
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export as CSV" }).click(),
  ])
  expect(csvDownload.suggestedFilename()).toContain(".csv")

  // --- Archive: redirects away since this was the only workspace ---
  await page.getByRole("button", { name: "Archive workspace" }).click()
  await page.waitForURL("**/workspaces/new")

  // --- Restore: visit the archived workspace directly, then unarchive ---
  await page.goto(workspacePath)
  await page.getByRole("button", { name: "Workspace settings" }).click()
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Restore workspace" })).toBeVisible()
  await page.getByRole("button", { name: "Restore workspace" }).click()
  await expect(page.getByRole("button", { name: "Archive workspace" })).toBeVisible()
})

test("a workspace can be permanently deleted", async ({ page }) => {
  const unique = Date.now()
  const email = `e2e-wsdelete-${unique}@example.com`
  const password = "TestPassword123!"

  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()

  await page.waitForURL("**/workspaces/new")
  await page.getByLabel("Workspace name").fill(`Delete Workspace ${unique}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  await page.getByRole("button", { name: "Workspace settings" }).click()
  await expect(page.getByRole("dialog", { name: "Workspace settings" })).toBeVisible()
  await page.getByRole("button", { name: "Delete workspace" }).click()
  await page.getByRole("button", { name: "Confirm delete" }).click()
  await page.waitForURL("**/workspaces/new")
})
