import { expect, test } from "@playwright/test";

// Risk link: the PL/EN interface toggle (subtrack-lang cookie) must switch the
// whole SSR render, survive a reload, and switch back — a broken cookie path
// would silently strand users in one language. EN is the default, so every
// other spec's English locators stay valid.

test("language toggle switches the UI to Polish, persists across reload, and switches back", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  // EN → PL (button is labeled with the language it switches TO).
  await page.getByRole("button", { name: "Przełącz na polski" }).click();
  await expect(page.getByRole("heading", { name: "Pulpit", exact: true })).toBeVisible();

  // The cookie makes it stick: a hard reload still renders Polish.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pulpit", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Subskrypcje" })).toBeVisible();

  // PL → EN (cleanup: leave the context in the default language).
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
});
