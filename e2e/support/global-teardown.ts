import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { PROJECT_ROOT, restoreEnvFiles } from "./env";

// Mirror of global-setup: stop the dev server this run started, then put
// `.dev.vars`/`.env` back exactly as they were. Restoration always runs —
// even if the kill fails — so the working tree never stays pointed at the
// local stack after a completed run.

const PID_FILE = path.join(PROJECT_ROOT, "test-results", ".astro-dev.pid");
const EXIT_WAIT_MS = 5_000;
const EXIT_POLL_MS = 100;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export default async function globalTeardown(): Promise<void> {
  try {
    if (existsSync(PID_FILE)) {
      const pid = Number(readFileSync(PID_FILE, "utf8").trim());
      if (Number.isInteger(pid) && pid > 0) {
        try {
          // Negative pid: the detached server owns its process group.
          process.kill(-pid, "SIGTERM");
        } catch {
          // already gone
        }
        // Wait for the port to actually free up so an immediately following
        // run's port-in-use guard cannot trip on a dying server; escalate to
        // SIGKILL if the group ignores SIGTERM.
        const deadline = Date.now() + EXIT_WAIT_MS;
        while (isAlive(pid) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, EXIT_POLL_MS));
        }
        if (isAlive(pid)) {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // already gone
          }
        }
      }
      rmSync(PID_FILE, { force: true });
    }
  } finally {
    restoreEnvFiles();
  }
}
