import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration-test project (test-plan §3 Phase 1): runs ONLY
// src/tests/integration/** against the real local Supabase stack
// (`npx supabase start` first). Kept separate from vitest.config.ts so
// `npm test` and lefthook's `vitest related` never touch the network/DB.
// Deliberately NOT wired into CI — this is the local ad hoc gate the
// test plan (§5) makes mandatory before merging migration/API changes.
//
// fileParallelism: false — suites share one local database; sequential
// files remove cross-file interference at negligible cost (small suite).

process.env.TZ ??= "UTC";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
