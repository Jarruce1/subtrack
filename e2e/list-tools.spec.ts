import { expect, test } from "@playwright/test";
import { BASE_URL } from "./support/env";

// Risk link (FR-005 extensions): the management-list tools — server-side
// search/status filter/sort, the CSV export endpoint, and the dashboard
// "paused savings" card — must all reflect the same store. Private user per
// run (exact-count assertions), fixtures via the API (test-plan §6.3 pattern),
// cleanup through the same API.

test.use({ storageState: { cookies: [], origins: [] } });

const createdIds: string[] = [];

async function apiSignup(page: import("@playwright/test").Page, email: string): Promise<void> {
  const response = await page.request.post("/api/auth/signup", {
    form: { email, password: "e2e-password-1" },
    // Astro's CSRF checkOrigin rejects form-encoded POSTs without a matching
    // Origin header — present the same origin a browser would.
    headers: { origin: BASE_URL },
  });
  expect(response.ok()).toBe(true);
  expect(response.url()).toContain("/auth/confirm-email");
}

async function apiCreate(page: import("@playwright/test").Page, payload: Record<string, unknown>): Promise<void> {
  const response = await page.request.post("/api/subscriptions", { data: payload });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  createdIds.push(id);
}

test.afterEach(async ({ page }) => {
  for (const id of createdIds.splice(0)) {
    await page.request.delete(`/api/subscriptions/${id}`);
  }
});

test("list search/filter/sort, CSV export, and paused-savings card reflect the same store", async ({ page }) => {
  const uniqueId = Date.now();
  const big = `e2e-tools-big-${String(uniqueId)}`;
  const small = `e2e-tools-small-${String(uniqueId)}`;
  const paused = `e2e-tools-paused-${String(uniqueId)}`;
  const today = new Date().toISOString().slice(0, 10);

  await apiSignup(page, `e2e-tools-${String(uniqueId)}@example.com`);
  const base = { start_date: today, currency: "PLN", billing_cycle: "monthly", note: null };
  await apiCreate(page, { ...base, name: big, amount: 100, category: "Software", status: "active" });
  await apiCreate(page, { ...base, name: small, amount: 5, category: "Streaming", status: "active" });
  // Paused 15 PLN monthly → hand-derived savings card value: PLN 15.00 / month.
  await apiCreate(page, { ...base, name: paused, amount: 15, category: "Other", status: "paused" });

  // Search narrows to the one matching name.
  await page.goto(`/subscriptions?q=${big}`);
  await expect(page.getByRole("listitem").filter({ hasText: big })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: small })).toHaveCount(0);

  // Status filter: paused only.
  await page.goto("/subscriptions?status=paused");
  await expect(page.getByRole("listitem").filter({ hasText: paused })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: big })).toHaveCount(0);

  // Sort by monthly cost: the 100 PLN row outranks the 5 PLN row.
  await page.goto("/subscriptions?sort=monthly");
  const names = await page.getByRole("listitem").allTextContents();
  expect(names.findIndex((text) => text.includes(big))).toBeLessThan(names.findIndex((text) => text.includes(small)));

  // CSV export: same session, text/csv, carries the fixture row.
  const exportResponse = await page.request.get("/api/subscriptions/export");
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-type"]).toContain("text/csv");
  const csv = await exportResponse.text();
  expect(csv).toContain("name,category,status");
  expect(csv).toContain(`"${big}"`);
  expect(csv).toContain(`"${paused}"`);

  // Dashboard savings card shows the paused monthly total (15 → PLN 15.00).
  await page.goto("/dashboard");
  const savings = page.getByRole("region", { name: "Paused savings" });
  await expect(savings).toBeVisible();
  await expect(savings).toContainText("PLN 15.00");
});
