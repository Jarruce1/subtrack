import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./e2e/support/env";

// E2E suite against the LOCAL Supabase stack (test-plan §3 Phase 2, §6.3).
// NO `webServer:` block on purpose: Playwright boots webServer BEFORE
// globalSetup, which would start `astro dev` with the cloud `.dev.vars`.
// e2e/support/global-setup.ts swaps the env files first and then owns the
// server lifecycle (see the comment there).

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    // Creates one fresh `e2e-*` user per run through the real signup UI and
    // saves its session as storageState — tests authenticate without the UI.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
