import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { PROJECT_ROOT } from "./support/env";
import { waitForIslands } from "./support/hydration";

// One fresh `e2e-*` user per run, created through the REAL signup UI (auth
// stays a real boundary), persisted as storageState so individual tests never
// log in through the UI (E2E rule). Local stack has confirmations disabled,
// so signup immediately yields a live session. Users are never torn down:
// the `e2e-` prefix marks them and `npx supabase db reset` clears them.

export const STORAGE_STATE = path.join(PROJECT_ROOT, "playwright", ".auth", "user.json");

setup("create shared e2e user via UI signup", async ({ page }) => {
  const email = `e2e-shared-${String(Date.now())}@example.com`;

  await page.goto("/auth/signup");
  await waitForIslands(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-1");
  await page.getByLabel("Confirm password").fill("e2e-password-1");
  await page.getByRole("button", { name: "Create account" }).click();

  // Session cookies are set on this redirect (confirmations are off locally).
  await page.waitForURL("**/auth/confirm-email");
  await expect(page.getByRole("heading", { name: "Registration successful" })).toBeVisible();

  mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
