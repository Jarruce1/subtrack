import { expect, test } from "@playwright/test";
import { waitForIslands } from "./support/hydration";

// Risk #4 (test-plan §2): "North-star flow regression: a new user cannot
// complete signup → add subscription → dashboard, or a gated page stops
// redirecting unauthenticated visitors."
//
// Business scenario (the assertion): a BRAND-NEW user signs up, adds a
// 43 PLN monthly subscription started 2026-07-15, and the dashboard shows
// PLN 43.00 / month and PLN 516.00 / year plus the correct next renewal —
// values hand-derived from PRD Business Logic §1–§2 below, NEVER imported
// from src/lib/billing.ts. Real boundaries: auth, routing, API, DB, SSR.
// Nothing mocked.
//
// This file runs UNAUTHENTICATED on purpose (empty storageState): signup IS
// the flow under test, so the "auth without UI" rule does not apply to test
// one — the fresh-user UI signup is the subject, not auth plumbing.
test.use({ storageState: { cookies: [], origins: [] } });

// PRD Business Logic §1, hand-derived oracle for 43 PLN monthly:
//   monthly = amount            = 43   → rendered "PLN 43.00"
//   yearly  = amount × 12       = 516  → rendered "PLN 516.00"
const MONTHLY_TEXT = "PLN 43.00";
const YEARLY_TEXT = "PLN 516.00";
const START_DATE = "2026-07-15";

/**
 * PRD Business Logic §2, hand-derived (NOT imported from the implementation):
 * monthly occurrences are anchored to the start date — same day-of-month,
 * clamped to shorter months; the next renewal is the earliest occurrence on
 * or after today. Day 15 never needs clamping, but the clamp is kept so the
 * oracle states the full PRD rule.
 */
function expectedNextMonthlyRenewal(startIso: string, todayIso: string): string {
  if (startIso >= todayIso) {
    return startIso;
  }
  const [startYear, startMonth, startDay] = startIso.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let k = 1; ; k += 1) {
    const monthIndex = startMonth - 1 + k;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const candidate = `${String(year)}-${pad(month)}-${pad(Math.min(startDay, daysInMonth))}`;
    if (candidate >= todayIso) {
      return candidate;
    }
  }
}

test("fresh user completes signup → add 43 PLN monthly → dashboard shows hand-derived totals and renewal", async ({
  page,
}) => {
  const uniqueId = Date.now();
  const email = `e2e-north-star-${String(uniqueId)}@example.com`;
  const subscriptionName = `e2e-north-star-${String(uniqueId)}`;
  // Server "today" is the UTC date (Workers run UTC) — derive the oracle from
  // the same calendar so the test is date-independent.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const expectedRenewal = expectedNextMonthlyRenewal(START_DATE, todayUtc);

  // Signup through the real UI — the flow under test.
  await page.goto("/auth/signup");
  await waitForIslands(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-1");
  await page.getByLabel("Confirm password").fill("e2e-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/auth/confirm-email");

  // The fresh account starts empty.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "No subscriptions yet" })).toBeVisible();

  // Add the subscription through the real form.
  await page.getByRole("link", { name: "Add your first subscription" }).click();
  await page.waitForURL("**/subscriptions/new");
  await waitForIslands(page);
  await page.getByLabel("Name").fill(subscriptionName);
  await page.getByLabel("Amount").fill("43");
  await expect(page.getByLabel("Currency")).toHaveValue("PLN"); // form default
  await expect(page.getByRole("combobox", { name: "Billing cycle" })).toHaveText("Monthly"); // form default
  await page.getByLabel("Start date").fill(START_DATE);
  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "Streaming" }).click();
  await page.getByRole("button", { name: "Add subscription" }).click();
  await page.waitForURL("**/dashboard");

  // Dashboard shows the hand-derived numbers (would fail if risk #4
  // materialized anywhere along signup → add → dashboard).
  const totals = page.getByRole("region", { name: "Active totals" });
  await expect(totals).toContainText(MONTHLY_TEXT);
  await expect(totals).toContainText(YEARLY_TEXT);

  const card = page.getByRole("region", { name: "Subscriptions" }).getByRole("listitem").filter({
    hasText: subscriptionName,
  });
  await expect(card).toContainText(MONTHLY_TEXT);
  await expect(card).toContainText(YEARLY_TEXT);
  await expect(card).toContainText(expectedRenewal);

  // A day-15 monthly renewal is always ≤ 30 days out → must be listed.
  const renewals = page.getByRole("region", { name: "Upcoming renewals" });
  await expect(renewals.getByText(subscriptionName)).toBeVisible();
  await expect(renewals).toContainText(expectedRenewal);

  // Cleanup: remove the row through the UI; the user keeps the e2e- prefix
  // (local-stack users are cleared by `npx supabase db reset`).
  await page.goto("/subscriptions");
  await waitForIslands(page);
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByRole("listitem")
    .filter({ hasText: subscriptionName })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.waitForURL("**/subscriptions");
  await expect(page.getByRole("listitem").filter({ hasText: subscriptionName })).toHaveCount(0);
});

test("unauthenticated visit to /dashboard redirects to sign-in", async ({ page }) => {
  // Gating half of risk #4: the middleware must bounce anonymous visitors.
  await page.goto("/dashboard");
  await page.waitForURL("**/auth/signin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
