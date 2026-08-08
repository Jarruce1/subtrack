import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { BASE_URL, E2E_PORT, LOCAL_SUPABASE_URL, PROJECT_ROOT, restoreEnvFiles, swapEnvFilesToLocal } from "./env";

// Global setup owns the dev server on purpose: Playwright starts a
// `webServer:` block BEFORE globalSetup (verified in
// node_modules/playwright/lib/runner/index.js — plugin setup precedes
// createGlobalSetupTask), so a config-level webServer would boot with the
// CLOUD `.dev.vars` before any swap could happen. Here the ordering is
// guaranteed: preflight → swap env files → spawn `astro dev` → readiness
// poll; any failure kills the server and restores the files before rethrowing.

const PID_FILE = path.join(PROJECT_ROOT, "test-results", ".astro-dev.pid");
const READINESS_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

async function urlAnswers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function globalSetup(): Promise<void> {
  // 1. Preflight: the LOCAL Supabase stack must be up (fail fast, diagnostically).
  if (!(await urlAnswers(`${LOCAL_SUPABASE_URL}/auth/v1/health`))) {
    throw new Error(
      `Local Supabase stack is not answering at ${LOCAL_SUPABASE_URL}. ` +
        `Start it with \`npx supabase start\` (requires Docker) and re-run.`,
    );
  }

  // 2. Refuse a foreign server: anything already on the port was started
  // outside this setup and therefore with the original (cloud) env files.
  if (await urlAnswers(BASE_URL)) {
    throw new Error(
      `Something is already listening on port ${String(E2E_PORT)}. ` +
        `Stop it first — E2E must boot its own server against the local stack.`,
    );
  }

  // 3. Swap env files, then boot the dev server under the local values.
  swapEnvFilesToLocal();
  mkdirSync(path.join(PROJECT_ROOT, "test-results"), { recursive: true });
  const log = openSync(path.join(PROJECT_ROOT, "test-results", "astro-dev.log"), "w");
  const server = spawn(path.join(PROJECT_ROOT, "node_modules", ".bin", "astro"), ["dev", "--port", String(E2E_PORT)], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  });

  try {
    if (server.pid === undefined) {
      throw new Error("Failed to spawn `astro dev`.");
    }
    writeFileSync(PID_FILE, String(server.pid));

    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(
          `\`astro dev\` exited early with code ${String(server.exitCode)} — see test-results/astro-dev.log.`,
        );
      }
      if (await urlAnswers(BASE_URL)) {
        ready = true;
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    if (!ready) {
      throw new Error(
        `Dev server did not answer on ${BASE_URL} within ${String(READINESS_TIMEOUT_MS)} ms — ` +
          `see test-results/astro-dev.log.`,
      );
    }
  } catch (error) {
    // Leave nothing behind on a failed boot: kill the group, restore env files.
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
    restoreEnvFiles();
    throw error;
  }
}
