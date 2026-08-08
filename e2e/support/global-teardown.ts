import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { PROJECT_ROOT, restoreEnvFiles } from "./env";

// Mirror of global-setup: stop the dev server this run started, then put
// `.dev.vars`/`.env` back exactly as they were. Restoration always runs —
// even if the kill fails — so the working tree never stays pointed at the
// local stack after a completed run.

const PID_FILE = path.join(PROJECT_ROOT, "test-results", ".astro-dev.pid");

export default function globalTeardown(): void {
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
      }
      rmSync(PID_FILE, { force: true });
    }
  } finally {
    restoreEnvFiles();
  }
}
