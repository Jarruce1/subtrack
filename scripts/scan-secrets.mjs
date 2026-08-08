// Deterministic secret-leak scan of the client bundle (test-plan §2 risk #6,
// §3 Phase 3). Scans every file under dist/client/ — the assets browsers can
// download — for:
//   1. the actual VALUES of SUPABASE_URL / SUPABASE_KEY, collected from
//      process.env, .env, and .dev.vars (whichever exist);
//   2. new-format Supabase secret keys (sb_secret_…);
//   3. the literal `service_role` and any JWT whose decoded payload names
//      the service_role (legacy service keys are JWTs, so a plain grep on
//      the literal would miss them — the payload is base64url-encoded).
//
// Exit codes: 0 clean · 1 setup error (dist/client missing — run the build)
// · 2 at least one hit. A hit prints the file and the NAME of the needle,
// never the matched value — the scanner must not become the leak.
//
// Run via `npm run scan:secrets` (build + scan) or `npm run scan:secrets:dist`
// (scan an existing build — what CI runs right after its own build step).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const clientDir = join(projectRoot, "dist", "client");

if (!existsSync(clientDir)) {
  console.error(`scan-secrets: ${relative(projectRoot, clientDir)} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const SECRET_ENV_KEYS = ["SUPABASE_URL", "SUPABASE_KEY"];
/** Values shorter than this are skipped as false-positive bait (e.g. empty or placeholder values). */
const MIN_VALUE_LENGTH = 12;

/** @returns {Map<string, string>} KEY=VALUE pairs from a dotenv-style file (quotes stripped). */
function parseEnvFile(path) {
  const pairs = new Map();
  if (!existsSync(path)) {
    return pairs;
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const value = match[2].replace(/^["']|["']$/g, "").trim();
    if (value) {
      pairs.set(match[1], value);
    }
  }
  return pairs;
}

/** @type {{ name: string, value: string }[]} */
const secretValues = [];
const sources = [
  ["process.env", new Map(SECRET_ENV_KEYS.map((key) => [key, process.env[key] ?? ""]))],
  [".env", parseEnvFile(join(projectRoot, ".env"))],
  [".dev.vars", parseEnvFile(join(projectRoot, ".dev.vars"))],
];
for (const [sourceName, pairs] of sources) {
  for (const key of SECRET_ENV_KEYS) {
    const value = pairs.get(key);
    if (typeof value === "string" && value.length >= MIN_VALUE_LENGTH) {
      secretValues.push({ name: `${key} value (${sourceName})`, value });
    }
  }
}

if (secretValues.length === 0) {
  // Do not fail: pattern scanning below still runs — but make the hollow
  // value-scan visible so a clean exit can't be mistaken for a full check.
  console.warn(
    "scan-secrets: WARNING — no SUPABASE_URL/SUPABASE_KEY values found in process.env, .env, or .dev.vars; only pattern checks will run.",
  );
}

/** JWT-shaped token; the payload (2nd segment) is decoded and checked for service_role. */
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}\b/g;

/** @returns {string[]} names of pattern needles found in the content. */
function patternHits(content) {
  const hits = [];
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(content)) {
    hits.push("sb_secret_… key pattern");
  }
  if (content.includes("service_role")) {
    hits.push("service_role literal");
  }
  for (const match of content.matchAll(JWT_PATTERN)) {
    try {
      const payload = Buffer.from(match[1], "base64url").toString("utf8");
      if (payload.includes("service_role")) {
        hits.push("JWT with service_role payload");
        break;
      }
    } catch {
      // Not decodable — not a JWT payload; ignore.
    }
  }
  return hits;
}

/** @returns {string[]} every file path under dir, recursively. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(clientDir);
/** @type {{ file: string, needle: string }[]} */
const findings = [];

for (const file of files) {
  // Fail-closed: a file the scanner cannot read must fail the scan (exit 2),
  // not crash past it — an unscanned file is an unverified file.
  let content;
  try {
    content = readFileSync(file).toString("utf8");
  } catch {
    findings.push({ file: relative(projectRoot, file), needle: "unreadable file (fail-closed)" });
    continue;
  }
  for (const { name, value } of secretValues) {
    if (content.includes(value)) {
      findings.push({ file: relative(projectRoot, file), needle: name });
    }
  }
  for (const needle of patternHits(content)) {
    findings.push({ file: relative(projectRoot, file), needle });
  }
}

if (findings.length > 0) {
  console.error(`scan-secrets: FAIL — ${findings.length} hit(s) in the client bundle:`);
  for (const { file, needle } of findings) {
    // Needle NAME only — never the matched value.
    console.error(`  ${file}: ${needle}`);
  }
  process.exit(2);
}

console.log(
  `scan-secrets: OK — ${files.length} client files scanned, 0 hits (${secretValues.length} secret value(s) + 3 patterns checked).`,
);
