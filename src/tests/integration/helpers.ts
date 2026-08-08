import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

// Shared infrastructure for the integration suites (test-plan §3 Phase 1).
// Everything here talks to the REAL local Supabase stack — no mocks, ever:
// a mocked client proves nothing about RLS (test-plan §2 risk #2
// anti-pattern). Keys and URLs are discovered at runtime from
// `npx supabase status` so the suites stay honest across CLI upgrades.
//
// Conventions:
// - test users use the `tst-` local-part prefix and a per-run unique suffix,
//   so interrupted teardowns never make re-runs collide;
// - the service-role client is used ONLY for admin teardown
//   (auth.admin.deleteUser → the subscriptions FK cascade removes rows),
//   never for assertions — it bypasses RLS by design;
// - SQL assertions go through psql (execFileSync arg-array: no shell
//   quoting) against the local DB URL.

export interface LocalStack {
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

export type TestClient = SupabaseClient<Database>;

let cachedStack: LocalStack | null = null;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function assertLocal(label: string, url: string): void {
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`${label} points at "${host}" — integration tests only ever run against the local stack.`);
  }
}

/** Discover local stack URLs/keys once per process; fail loudly when the stack is down. */
export function getStack(): LocalStack {
  if (cachedStack) {
    return cachedStack;
  }
  let raw: string;
  try {
    raw = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      // Sync child processes block the worker, so Vitest's testTimeout
      // cannot fire mid-call — the timeout must live on the call itself.
      timeout: 15_000,
    });
  } catch (cause) {
    throw new Error(
      "Could not read `npx supabase status` — is the local stack running? Start it with `npx supabase start`.",
      {
        cause,
      },
    );
  }
  const status = JSON.parse(raw) as Partial<Record<string, string>>;
  const { API_URL, DB_URL, ANON_KEY, SERVICE_ROLE_KEY } = status;
  if (!API_URL || !DB_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    throw new Error(
      `supabase status is missing API_URL/DB_URL/ANON_KEY/SERVICE_ROLE_KEY — got keys: ${Object.keys(status).join(", ")}`,
    );
  }
  // Hard locality guard: sql() runs as the postgres superuser and
  // cleanupTestUsers() deletes auth users — refuse to aim either at
  // anything but the local stack, whatever `supabase status` reports.
  assertLocal("API_URL", API_URL);
  assertLocal("DB_URL", DB_URL);
  cachedStack = { apiUrl: API_URL, dbUrl: DB_URL, anonKey: ANON_KEY, serviceRoleKey: SERVICE_ROLE_KEY };
  return cachedStack;
}

/** Run a SQL statement as the postgres superuser via psql; returns trimmed stdout (`-tA`: tuples-only, unaligned). */
export function sql(query: string): string {
  const { dbUrl } = getStack();
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-tA", "-c", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
    env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
  }).trim();
}

/** Session-less client: requests run as the `anon` role. */
export function createAnonClient(): TestClient {
  const { apiUrl, anonKey } = getStack();
  return createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createAdminClient(): TestClient {
  const { apiUrl, serviceRoleKey } = getStack();
  return createClient<Database>(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  /** Client whose requests carry this user's session (role `authenticated`). */
  client: TestClient;
  userId: string;
  email: string;
}

const createdUserIds: string[] = [];

/**
 * Sign up a fresh throwaway user through the real auth API and return a
 * session-bearing client. Local config has `enable_confirmations = false`,
 * so signUp returns a live session immediately. The id is registered for
 * `cleanupTestUsers()`.
 */
export async function createTestUser(): Promise<TestUser> {
  const email = `tst-${Date.now().toString()}-${randomUUID().slice(0, 8)}@example.com`;
  const password = "tst-password-123";
  const client = createAnonClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw new Error(`auth signUp failed for ${email}: ${error.message}`);
  }
  if (!data.user || !data.session) {
    throw new Error(
      `auth signUp for ${email} returned no live session — is [auth.email] enable_confirmations still false locally?`,
    );
  }
  createdUserIds.push(data.user.id);
  return { client, userId: data.user.id, email };
}

/**
 * Delete every user this process created (service-role admin API). The
 * subscriptions FK (`on delete cascade`) removes their rows with them.
 * Call from each suite's afterAll.
 */
export async function cleanupTestUsers(): Promise<void> {
  const admin = createAdminClient();
  const failures: string[] = [];
  // Iterate a snapshot and only drop ids that actually deleted, so a
  // failed teardown keeps its ids registered for a later retry in-process.
  for (const id of [...createdUserIds]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      failures.push(`${id}: ${error.message}`);
    } else {
      createdUserIds.splice(createdUserIds.indexOf(id), 1);
    }
  }
  if (failures.length > 0) {
    throw new Error(`cleanup failed for test users:\n${failures.join("\n")}`);
  }
}

export type SubscriptionInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];

/**
 * A valid subscriptions insert payload (DB-level shape); override per test.
 * Typed against the generated Insert row — malicious payloads in the parity
 * suite are wrong VALUES of the right TYPES (negative amount, oversized
 * note, mismatched cycle/interval), so they stay type-checkable while still
 * bypassing zod entirely.
 */
export function validSubscription(overrides: Partial<SubscriptionInsert> = {}): SubscriptionInsert {
  return {
    name: "Integration Test Service",
    amount: 9.99,
    currency: "PLN",
    billing_cycle: "monthly",
    start_date: "2026-01-15",
    category: "Software",
    ...overrides,
  };
}
