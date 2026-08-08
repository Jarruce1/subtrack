import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { BASE_URL } from "./support/env";
import { waitForIslands } from "./support/hydration";

// Risk #1 (test-plan §2): "A user sees a silently wrong renewal date or cost
// total — the active-only aggregation rule drifting apart across dashboard,
// category, and renewals views."
//
// Business scenario: with a mixed fixture (monthly / yearly / custom-3
// cycles, PLN + EUR, one paused), every rendered total equals a
// hand-derivable PRD value, IDENTICALLY in "Active totals" and "Costs by
// category"; the paused subscription appears in no sum and no renewal; and
// after pausing another one through the real UI, all views drop together.
//
// Isolation: this test asserts EXACT sums, so it owns a private user made
// via the signup API (auth without UI — no shared storageState, no
// interference from parallel tests). Fixture rows are created through the
// app's real API and deleted in afterEach.
test.use({ storageState: { cookies: [], origins: [] } });

// ── Hand-derived oracle (PRD Business Logic §1 + §3 — NOT from billing.ts) ──
// active Streaming    30 PLN monthly  → monthly 30.00, yearly 30×12 = 360.00
// active News & Media 120 PLN yearly  → monthly 120/12 = 10.00, yearly 120.00
// active Software     9.99 EUR every 3 months → monthly 9.99/3 = 3.33,
//                                              yearly 9.99×12/3 = 39.96
// paused Health & Fitness 60 PLN monthly → excluded from every total (§3)
//
// Totals per currency (currencies never merged):
//   PLN: monthly 30 + 10 = 40.00, yearly 360 + 120 = 480.00
//        (100.00 if the paused row leaked in — that is the regression)
//   EUR: monthly 3.33, yearly 39.96
// After pausing Streaming via the UI:
//   PLN: monthly 10.00, yearly 120.00; EUR unchanged.
const PLN_BEFORE = { monthly: "PLN 40.00", yearly: "PLN 480.00" };
const PLN_AFTER_PAUSE = { monthly: "PLN 10.00", yearly: "PLN 120.00" };
const EUR_TOTALS = { monthly: "€3.33", yearly: "€39.96" };

const createdIds: string[] = [];

async function apiSignup(page: Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/signup", {
    form: { email, password: "e2e-password-1" },
    // Astro's CSRF checkOrigin rejects form-encoded POSTs without a matching
    // Origin header (a browser sends it automatically; page.request must not
    // bypass the protection, so we present the same origin a browser would).
    headers: { origin: BASE_URL },
  });
  const diagnostics = `signup answered ${String(response.status())} at ${response.url()}`;
  expect(response.ok(), diagnostics).toBe(true);
  // A failed signup redirects back to /auth/signup?error=… with status 200 —
  // only the confirm-email landing proves the session was minted.
  expect(response.url(), diagnostics).toContain("/auth/confirm-email");
}

async function apiCreateSubscription(page: Page, payload: Record<string, unknown>): Promise<void> {
  const response = await page.request.post("/api/subscriptions", { data: payload });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  createdIds.push(id);
}

test.afterEach(async ({ page }) => {
  // Cleanup: remove fixture rows through the app's API (same session).
  for (const id of createdIds.splice(0)) {
    await page.request.delete(`/api/subscriptions/${id}`);
  }
});

test("totals, categories, and renewals agree per currency and exclude paused — before and after a UI pause", async ({
  page,
}) => {
  const uniqueId = Date.now();
  const streamingName = `e2e-streaming-${String(uniqueId)}`;
  const newsName = `e2e-news-${String(uniqueId)}`;
  const softwareName = `e2e-software-${String(uniqueId)}`;
  const pausedName = `e2e-paused-${String(uniqueId)}`;
  // Started today (server UTC calendar) → each active row's next renewal is
  // today (PRD §2, k = 0), guaranteed inside the 30-day window (§4).
  const today = new Date().toISOString().slice(0, 10);

  await apiSignup(page, `e2e-crossview-${String(uniqueId)}@example.com`);
  const base = { start_date: today, note: null };
  await apiCreateSubscription(page, {
    ...base,
    name: streamingName,
    amount: 30,
    currency: "PLN",
    billing_cycle: "monthly",
    category: "Streaming",
    status: "active",
  });
  await apiCreateSubscription(page, {
    ...base,
    name: newsName,
    amount: 120,
    currency: "PLN",
    billing_cycle: "yearly",
    category: "News & Media",
    status: "active",
  });
  await apiCreateSubscription(page, {
    ...base,
    name: softwareName,
    amount: 9.99,
    currency: "EUR",
    billing_cycle: "custom",
    billing_interval_months: 3,
    category: "Software",
    status: "active",
  });
  await apiCreateSubscription(page, {
    ...base,
    name: pausedName,
    amount: 60,
    currency: "PLN",
    billing_cycle: "monthly",
    category: "Health & Fitness",
    status: "paused",
  });

  await page.goto("/dashboard");
  const totals = page.getByRole("region", { name: "Active totals" });
  const categories = page.getByRole("region", { name: "Costs by category" });
  const renewals = page.getByRole("region", { name: "Upcoming renewals" });

  // 1. Overall totals per currency — paused excluded (PLN 40, not 100).
  const plnTotal = totals.getByRole("listitem").filter({ hasText: "PLN" });
  await expect(plnTotal).toContainText(PLN_BEFORE.monthly);
  await expect(plnTotal).toContainText(PLN_BEFORE.yearly);
  const eurTotal = totals.getByRole("listitem").filter({ hasText: "EUR" });
  await expect(eurTotal).toContainText(EUR_TOTALS.monthly);
  await expect(eurTotal).toContainText(EUR_TOTALS.yearly);

  // 2. Category view carries the SAME hand-derived values: per currency the
  // category rows sum to the overall totals (PLN 30 + 10 = 40; EUR 3.33).
  const streamingRow = categories.getByRole("listitem").filter({ hasText: "Streaming" });
  await expect(streamingRow).toContainText("PLN 30.00");
  await expect(streamingRow).toContainText("PLN 360.00");
  const newsRow = categories.getByRole("listitem").filter({ hasText: "News & Media" });
  await expect(newsRow).toContainText("PLN 10.00");
  await expect(newsRow).toContainText("PLN 120.00");
  const softwareRow = categories.getByRole("listitem").filter({ hasText: "Software" });
  await expect(softwareRow).toContainText(EUR_TOTALS.monthly);
  await expect(softwareRow).toContainText(EUR_TOTALS.yearly);
  // A category whose rows are all paused yields NO row at all (PRD §3).
  await expect(categories.getByText("Health & Fitness")).toHaveCount(0);

  // 3. Renewals: all three active rows renew today; the paused one is absent.
  await expect(renewals.getByText(streamingName)).toBeVisible();
  await expect(renewals.getByText(newsName)).toBeVisible();
  await expect(renewals.getByText(softwareName)).toBeVisible();
  await expect(renewals.getByText(pausedName)).toHaveCount(0);

  // 4. Pause Streaming through the real UI (StatusActions island) …
  await page.goto("/subscriptions");
  await waitForIslands(page);
  const streamingCard = page.getByRole("listitem").filter({ hasText: streamingName });
  await streamingCard.getByRole("button", { name: "Pause" }).click();
  await expect(streamingCard.getByRole("button", { name: "Resume" })).toBeVisible();

  // … and every dashboard view must drop CONSISTENTLY (PLN 40 → 10),
  // with the untouched currency intact.
  await page.goto("/dashboard");
  await expect(plnTotal).toContainText(PLN_AFTER_PAUSE.monthly);
  await expect(plnTotal).toContainText(PLN_AFTER_PAUSE.yearly);
  await expect(eurTotal).toContainText(EUR_TOTALS.monthly);
  await expect(categories.getByText("Streaming")).toHaveCount(0);
  await expect(newsRow).toContainText("PLN 10.00");
  await expect(renewals.getByText(streamingName)).toHaveCount(0);
  await expect(renewals.getByText(newsName)).toBeVisible();
});
