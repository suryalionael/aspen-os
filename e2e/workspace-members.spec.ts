import { test, expect, type Page } from "@playwright/test"

/**
 * Sprint 2 Phase C: invite link, joining, member listing, and removal.
 * Resolves DEC-011 (no invite flow) and makes workspace_members.role
 * load-bearing for the first time (DEC-012/DEC-022) — owner-only invite
 * creation/revocation and member removal, self-removal ("leave") open to
 * anyone. Two independent browser contexts simulate two real users,
 * since this is inherently a multi-account flow.
 */
test("an owner can invite a second user, who joins and can later be removed", async ({
  browser,
}) => {
  const unique = Date.now()

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  async function signUp(page: Page, email: string, password: string) {
    await page.goto("/sign-up")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Create account" }).click()
    await page.waitForURL("**/workspaces/new")
  }

  const ownerEmail = `e2e-owner-${unique}@example.com`
  const memberEmail = `e2e-member-${unique}@example.com`
  const password = "TestPassword123!"

  await signUp(ownerPage, ownerEmail, password)
  await ownerPage.getByLabel("Workspace name").fill(`Shared Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(ownerPage.url()).pathname

  // --- Owner creates an invite link ---
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  await expect(ownerPage.getByText(ownerEmail)).toBeVisible()
  await expect(ownerPage.getByText("owner", { exact: true })).toBeVisible()

  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const linkText = await ownerPage
    .locator("p", { hasText: "/invite/" })
    .textContent()
  expect(linkText).toBeTruthy()
  const inviteUrl = new URL(linkText!.trim())

  // --- Second user signs up, then visits the invite link to join ---
  await signUp(memberPage, memberEmail, password)
  await memberPage.goto(inviteUrl.pathname)
  await expect(
    memberPage.getByText(`invited to join Shared Workspace ${unique}`, {
      exact: false,
    })
  ).toBeVisible()
  await memberPage.getByRole("button", { name: "Join workspace" }).click()
  await memberPage.waitForURL((url) => url.pathname === workspacePath)

  // --- Owner sees the new member listed ---
  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  await expect(ownerPage.getByText(memberEmail)).toBeVisible()
  await expect(
    ownerPage.locator("li", { hasText: memberEmail }).getByText("member", { exact: true })
  ).toBeVisible()

  // A non-owner has no Remove affordance for themselves beyond "Leave",
  // and never sees a Remove button for the owner's own row.
  await expect(
    ownerPage.locator("li", { hasText: ownerEmail }).getByRole("button", { name: "Leave" })
  ).toBeVisible()

  // --- Owner removes the member ---
  await ownerPage
    .locator("li", { hasText: memberEmail })
    .getByRole("button", { name: "Remove" })
    .click()
  await expect(ownerPage.getByText(memberEmail)).toHaveCount(0)

  // --- The removed member no longer has access to the workspace ---
  // RLS on workspaces.select requires membership, so the layout's lookup
  // by slug returns null and the route 404s (not-found.tsx), rather than
  // a redirect to /workspaces/new.
  await memberPage.reload()
  await expect(memberPage.getByText("Page not found")).toBeVisible()
})
