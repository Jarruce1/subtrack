import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Wait until every React island on the page is hydrated. Astro renders
 * islands as `<astro-island ssr>` and removes the `ssr` attribute once the
 * client component has mounted; filling a controlled input before that point
 * silently loses the value when React takes over.
 *
 * This is an infrastructure readiness wait (state, not time — no
 * waitForTimeout), not an element locator: user-facing interactions still go
 * through getByRole/getByLabel.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
