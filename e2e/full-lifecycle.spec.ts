import { expect, test } from "@playwright/test";
import { waitForIslands } from "./support/hydration";

// Risk link (test-plan §2 #4 + FR-005..FR-008): the FULL management workflow a
// real user walks — create → edit → pause → resume → cancel → reactivate →
// delete — must work end to end against the real stack, with every transition
// visible after fresh SSR (status badge + values re-render from the store).
// Modeled on e2e/seed.spec.ts: role/label locators, state waits, unique ids,
// one setup→action→assert→cleanup cycle owning its data.

test("subscription survives the full lifecycle: create → edit → pause → resume → cancel → reactivate → delete", async ({
  page,
}) => {
  const name = `e2e-life-${String(Date.now())}`;
  const renamed = `${name}-edited`;

  // Create (real form → real API → redirect).
  await page.goto("/subscriptions/new");
  await waitForIslands(page);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Amount").fill("30.00");
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Software" }).click();
  await page.getByLabel("Start date").fill("2026-02-10");
  await page.getByRole("button", { name: "Add subscription" }).click();
  await page.waitForURL("**/dashboard");

  // Edit: rename + change the amount, verify the SSR list reflects both.
  await page.goto("/subscriptions");
  await waitForIslands(page);
  const createdRow = page.getByRole("listitem").filter({ hasText: name });
  await createdRow.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL("**/edit");
  await waitForIslands(page);
  await page.getByLabel("Name").fill(renamed);
  await page.getByLabel("Amount").fill("45.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL("**/subscriptions");
  const row = page.getByRole("listitem").filter({ hasText: renamed });
  await expect(row).toBeVisible();
  // Oracle: PRD Business Logic §1 — monthly 45.00 normalizes to yearly 540.00
  // (45 × 12, hand-derived, not read from billing.ts).
  await expect(row).toContainText("PLN 45.00");
  await expect(row).toContainText("PLN 540.00");

  // Pause → badge shows paused, Resume appears.
  await waitForIslands(page);
  await row.getByRole("button", { name: "Pause" }).click();
  await page.waitForURL("**/subscriptions");
  await waitForIslands(page);
  await expect(row).toContainText("paused");
  // Resume → active again.
  await row.getByRole("button", { name: "Resume" }).click();
  await page.waitForURL("**/subscriptions");
  await waitForIslands(page);
  await expect(row).toContainText("active");

  // Cancel (confirmed destructive intent) → cancelled badge + Reactivate.
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.waitForURL("**/subscriptions");
  await waitForIslands(page);
  await expect(row).toContainText("cancelled");

  // Reactivate → active.
  await row.getByRole("button", { name: "Reactivate" }).click();
  await page.waitForURL("**/subscriptions");
  await waitForIslands(page);
  await expect(row).toContainText("active");

  // Cleanup IS the last workflow step: delete through the UI.
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/subscriptions");
  await expect(page.getByRole("listitem").filter({ hasText: renamed })).toHaveCount(0);
});

// Risk link (test-plan §2 #5, FR-004): client-side validation stops an invalid
// payload before it leaves the form — no navigation, field marked invalid.
test("add form rejects invalid input client-side: negative amount and missing name never submit", async ({ page }) => {
  await page.goto("/subscriptions/new");
  await waitForIslands(page);

  await page.getByLabel("Amount").fill("-5");
  await page.getByLabel("Start date").fill("2026-02-10");
  await page.getByRole("button", { name: "Add subscription" }).click();

  // Still on the form (nothing was created), offending fields flagged.
  await expect(page).toHaveURL(/\/subscriptions\/new/);
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true");
});
