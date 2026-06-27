import { test, expect, type Page } from "@playwright/test"

/**
 * Sprint 3 Phase I: the three-tier role system (owner/admin/member,
 * migration 023) and email-tagged invites that can be accepted or
 * declined. RLS-level permission enforcement is covered separately by
 * scripts/test-roles.ts (npm run test:roles) — these tests cover the
 * user-facing flows: invite-by-email status transitions, and that the
 * UI correctly hides admin/owner-only actions from a plain member.
 */

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/sign-up")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL("**/workspaces/new")
}

test("an email invite can be accepted, and a separate invite can be declined", async ({
  browser,
}) => {
  const unique = Date.now()
  const password = "TestPassword123!"

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const accepterContext = await browser.newContext()
  const accepterPage = await accepterContext.newPage()
  const declinerContext = await browser.newContext()
  const declinerPage = await declinerContext.newPage()

  const ownerEmail = `e2e-invemail-owner-${unique}@example.com`
  const accepterEmail = `e2e-invemail-accepter-${unique}@example.com`
  const declinerEmail = `e2e-invemail-decliner-${unique}@example.com`

  await signUp(ownerPage, ownerEmail, password)
  await ownerPage.getByLabel("Workspace name").fill(`Invite Email Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))

  // --- Create an invite tagged with the accepter's email ---
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  await ownerPage.getByLabel("Invite email").fill(accepterEmail)
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()

  const acceptRow = ownerPage.getByTestId("invite-row").filter({ hasText: accepterEmail })
  await expect(acceptRow).toBeVisible()
  await expect(acceptRow.getByText("Pending")).toBeVisible()
  const acceptLinkText = await acceptRow.locator("p", { hasText: "/invite/" }).textContent()
  const acceptUrl = new URL(acceptLinkText!.trim())

  // --- A second invite, tagged with the decliner's email ---
  await ownerPage.getByLabel("Invite email").fill(declinerEmail)
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const declineRow = ownerPage.getByTestId("invite-row").filter({ hasText: declinerEmail })
  await expect(declineRow).toBeVisible()
  const declineLinkText = await declineRow.locator("p", { hasText: "/invite/" }).textContent()
  const declineUrl = new URL(declineLinkText!.trim())

  // --- Accepter signs up and accepts ---
  await signUp(accepterPage, accepterEmail, password)
  await accepterPage.goto(acceptUrl.pathname)
  await expect(
    accepterPage.getByText(`invited to join Invite Email Workspace ${unique}`, {
      exact: false,
    })
  ).toBeVisible()
  await accepterPage.getByRole("button", { name: "Accept" }).click()
  await accepterPage.waitForURL((url) => url.pathname !== acceptUrl.pathname)

  // --- Decliner signs up and declines ---
  await signUp(declinerPage, declinerEmail, password)
  await declinerPage.goto(declineUrl.pathname)
  await declinerPage.getByRole("button", { name: "Decline" }).click()
  await expect(declinerPage.getByText("Invite declined")).toBeVisible()

  // --- Owner sees both invites' real status, and the accepter as a member ---
  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  await expect(
    ownerPage.getByTestId("member-row").filter({ hasText: accepterEmail })
  ).toBeVisible()
  await expect(
    ownerPage.getByTestId("invite-row").filter({ hasText: accepterEmail }).getByText("Accepted")
  ).toBeVisible()
  await expect(
    ownerPage.getByTestId("invite-row").filter({ hasText: declinerEmail }).getByText("Declined")
  ).toBeVisible()
  // The decliner never joined.
  await expect(
    ownerPage.getByTestId("member-row").filter({ hasText: declinerEmail })
  ).toHaveCount(0)
})

test("a plain member cannot manage projects or invite, an admin can but cannot remove members or transfer ownership", async ({
  browser,
}) => {
  const unique = Date.now()
  const password = "TestPassword123!"

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()

  const ownerEmail = `e2e-roleperm-owner-${unique}@example.com`
  const memberEmail = `e2e-roleperm-member-${unique}@example.com`

  await signUp(ownerPage, ownerEmail, password)
  await ownerPage.getByLabel("Workspace name").fill(`Role Perm Workspace ${unique}`)
  await ownerPage.getByRole("button", { name: "Create workspace" }).click()
  await ownerPage.waitForURL((url) => /^\/[^/]+$/.test(url.pathname))
  const workspacePath = new URL(ownerPage.url()).pathname

  await ownerPage.getByRole("button", { name: "Members" }).click()
  await ownerPage.getByRole("button", { name: "Create invite link" }).click()
  const linkText = await ownerPage.locator("p", { hasText: "/invite/" }).first().textContent()
  const inviteUrl = new URL(linkText!.trim())
  await ownerPage.keyboard.press("Escape")

  await signUp(memberPage, memberEmail, password)
  await memberPage.goto(inviteUrl.pathname)
  await memberPage.getByRole("button", { name: "Accept" }).click()
  await memberPage.waitForURL((url) => url.pathname === workspacePath)

  // --- As a plain member: no "New" project button, no invite UI ---
  await expect(memberPage.getByRole("button", { name: "New" })).toHaveCount(0)
  await memberPage.getByRole("button", { name: "Members" }).click()
  await expect(memberPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  await expect(memberPage.getByLabel("Invite email")).toHaveCount(0)
  await memberPage.keyboard.press("Escape")

  // --- Owner promotes the member to admin ---
  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Members" }).click()
  await expect(ownerPage.getByRole("dialog", { name: "Workspace members" })).toBeVisible()
  const memberRow = ownerPage.getByTestId("member-row").filter({ hasText: memberEmail })
  const promotePersisted = ownerPage.waitForResponse((resp) => resp.request().method() === "POST")
  await memberRow.getByRole("button", { name: "Make admin" }).click()
  await promotePersisted
  await expect(memberRow.getByText("admin", { exact: true })).toBeVisible()
  await ownerPage.keyboard.press("Escape")

  // --- As an admin: "New" project button and invite UI are visible, and work ---
  await memberPage.reload()
  await expect(memberPage.getByRole("button", { name: "New" })).toBeVisible()
  await memberPage.getByRole("button", { name: "New" }).click()
  await memberPage.getByLabel("Project name").fill(`Admin Project ${unique}`)
  await memberPage.getByRole("button", { name: "Create project" }).click()
  await memberPage.waitForURL((url) => /^\/[^/]+\/[^/]+$/.test(url.pathname))
  await expect(
    memberPage.getByRole("heading", { name: `Admin Project ${unique}` })
  ).toBeVisible()

  await memberPage.getByRole("button", { name: "Members" }).click()
  await expect(memberPage.getByLabel("Invite email")).toBeVisible()

  // --- An admin does not see role/remove/transfer controls for other members ---
  const ownerRow = memberPage.getByTestId("member-row").filter({ hasText: ownerEmail })
  await expect(ownerRow.getByRole("button", { name: "Remove" })).toHaveCount(0)
  await expect(ownerRow.getByRole("button", { name: "Make owner" })).toHaveCount(0)
  await expect(ownerRow.getByRole("button", { name: /Make (admin|member)/ })).toHaveCount(0)
})
