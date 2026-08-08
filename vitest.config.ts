import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config on purpose — NOT `getViteConfig` from "astro/config": the
// Astro wrapper crashes under Astro 6 + Vitest 4 (withastro/astro#15847) and
// nothing under test imports Astro virtual modules. If a future test needs
// `astro:env/*`, mock it via alias stubs here instead of switching wrappers.

// billing.ts is TZ-immune by construction; pinning UTC keeps test helpers that
// build ISO strings via Date#toISOString honest on any machine.
process.env.TZ ??= "UTC";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
