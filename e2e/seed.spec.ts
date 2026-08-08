import { expect, test } from "@playwright/test";
import { waitForIslands } from "./support/hydration";

// SEED TEST — the exemplar every generated E2E test in this project is
// modeled on (CLAUDE.md /10x-e2e; .claude/skills/10x-e2e/references/
// seed-test-pattern.md). What it demonstrates:
//   1. Role/label locators only — never CSS/XPath for user-facing elements.
//   2. Full cycle in ONE test: setup → action → assertion → cleanup.
//   3. Waits for state (waitForURL, toBeVisible, toHaveCount) — never time.
//   4. Unique Date.now() data + risk-tied test name.
// Auth: the run-scoped storageState user (playwright/.auth/user.json) —
// tests never sign in through the UI (auth.setup.ts owns that).
//
// Risk link (test-plan §2 #4, north-star add path): a subscription created
// through the real form must exist server-side — i.e. survive a full SSR
// render of the management list and a hard reload, not just live in island
// state.

test("subscription created through the form persists across a full SSR reload", async ({ page }) => {
  const name = `e2e-seed-${String(Date.now())}`;

  // Setup+action: create through the real form (API, DB, redirect all real).
  await page.goto("/subscriptions/new");
  await waitForIslands(page);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Amount").fill("12.50");
  await expect(page.getByLabel("Currency")).toHaveValue("PLN"); // default
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Streaming" }).click();
  await page.getByLabel("Start date").fill("2026-01-15");
  await page.getByRole("button", { name: "Add subscription" }).click();
  await page.waitForURL("**/dashboard");

  // Assertion: the row is a server-side fact — visible on the SSR list and
  // still there after a hard reload.
  await page.goto("/subscriptions");
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();

  // Cleanup: delete through the UI (accept the confirm dialog) and wait for
  // the state that proves it — the row is gone.
  await waitForIslands(page);
  page.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL("**/subscriptions");
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
});
