import { copyFileSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// E2E environment plumbing (test-plan §6.3). The dev server must talk to the
// LOCAL Supabase stack, but `.dev.vars` and `.env` point at the cloud project,
// and with the Cloudflare adapter `.dev.vars` overrides any process env passed
// to `astro dev`. The stable solution is a file swap for the duration of the
// run: back both files up, write local values, restore in global teardown.
// Swapping BOTH files sidesteps the dev-mode precedence question entirely.

export const E2E_PORT = 4406;
export const BASE_URL = `http://localhost:${String(E2E_PORT)}`;

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
// The standard supabase-demo anon JWT every local stack ships with — public
// by design (printed by `npx supabase status`), safe to commit.
export const LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const LOCAL_ENV_CONTENT = `SUPABASE_URL=${LOCAL_SUPABASE_URL}\nSUPABASE_KEY=${LOCAL_SUPABASE_ANON_KEY}\n`;
const SWAPPED_FILES = [".dev.vars", ".env"] as const;
const BACKUP_SUFFIX = ".e2e-backup";

/**
 * Point `.dev.vars` and `.env` at the local stack. A pre-existing backup is
 * never overwritten: after a crashed run the backup still holds the user's
 * original (cloud) values, and re-running keeps them restorable.
 */
export function swapEnvFilesToLocal(): void {
  for (const name of SWAPPED_FILES) {
    const file = path.join(PROJECT_ROOT, name);
    const backup = file + BACKUP_SUFFIX;
    if (existsSync(file) && !existsSync(backup)) {
      copyFileSync(file, backup);
    }
    writeFileSync(file, LOCAL_ENV_CONTENT);
  }
}

/**
 * Restore the original files from their backups. When a file had no backup
 * (it did not exist before the swap), delete it only if it still holds
 * exactly the content we wrote — never destroy user edits.
 */
export function restoreEnvFiles(): void {
  for (const name of SWAPPED_FILES) {
    const file = path.join(PROJECT_ROOT, name);
    const backup = file + BACKUP_SUFFIX;
    if (existsSync(backup)) {
      renameSync(backup, file);
    } else if (existsSync(file) && readFileSync(file, "utf8") === LOCAL_ENV_CONTENT) {
      rmSync(file);
    }
  }
}
