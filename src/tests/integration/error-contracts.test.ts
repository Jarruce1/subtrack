import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { createClient, type TypedSupabaseClient } from "@/lib/supabase";
import { POST as createSubscriptionRoute } from "@/pages/api/subscriptions/index";
import { DELETE as deleteSubscriptionRoute, PATCH as updateSubscriptionRoute } from "@/pages/api/subscriptions/[id]";
import { GET as duplicateCheckRoute } from "@/pages/api/subscriptions/duplicate-check";
import { POST as signInRoute } from "@/pages/api/auth/signin";
import { POST as signOutRoute } from "@/pages/api/auth/signout";
import { POST as signUpRoute } from "@/pages/api/auth/signup";

// Route-level error contracts under INDUCED failures (test-plan §2 risk #3,
// §3 Phase 3): a forced backend failure must yield a non-2xx response with a
// usable `{ error }` body that leaks no backend detail, and the sign-out
// form-post must never fake success. The islands only report success on the
// exact success status (audited in research.md), so pinning the routes pins
// the user-visible behavior.
//
// Mocking carve-out (§6.4): unlike the RLS/ACL suites, these tests DO stub
// the Supabase client — `@/lib/supabase` is the single seam every route uses,
// and a real local database cannot be made to fail on demand deterministically.
// The no-mocks policy in §6.2 is scoped to proving RLS; the subject here is
// the routes' error-translation layer, nothing about the database itself.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const createClientMock = vi.mocked(createClient);

/** Marker string for induced failures — must never surface in a response. */
const INDUCED_MESSAGE = "induced backend failure: connection refused";

interface InducedError {
  message: string;
  code: string;
}

function inducedError(code = "XX000"): InducedError {
  return { message: INDUCED_MESSAGE, code };
}

/**
 * Chainable, thenable stand-in for a PostgREST query builder: every method
 * call returns the same proxy, and awaiting it (at any chain depth) resolves
 * to `{ data: null, error }` — the shape the service layer checks.
 */
function failingQuery(error: InducedError): unknown {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: unknown) => void) => {
            resolve({ data: null, error });
          };
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

function failingDbClient(error: InducedError): TypedSupabaseClient {
  return { from: () => failingQuery(error) } as unknown as TypedSupabaseClient;
}

function authClient(result: { error: { message: string } | null }): TypedSupabaseClient {
  return { auth: { signOut: () => Promise.resolve(result) } } as unknown as TypedSupabaseClient;
}

/** supabase-js AuthError essentials for the signin/signup mapping. */
interface InducedAuthError {
  message: string;
  code?: string;
  status?: number;
}

function signInClient(error: InducedAuthError | null): TypedSupabaseClient {
  return { auth: { signInWithPassword: () => Promise.resolve({ error }) } } as unknown as TypedSupabaseClient;
}

function signUpClient(error: InducedAuthError | null): TypedSupabaseClient {
  return { auth: { signUp: () => Promise.resolve({ error }) } } as unknown as TypedSupabaseClient;
}

const TEST_USER = { id: "8f7f0f7e-0000-4000-8000-000000000001" };
const VALID_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

/** A payload subscriptionCreateSchema accepts — failures below it are all induced. */
const validCreateBody = {
  name: "Contract Probe",
  amount: 9.99,
  currency: "PLN",
  billing_cycle: "monthly",
  start_date: "2026-01-15",
  category: "Software",
};

interface ContextInit {
  method?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
  /** Defaults to a signed-in user; pass null for the anonymous case. */
  user?: { id: string } | null;
}

function apiContext(init: ContextInit = {}): APIContext {
  const url = new URL(init.path ?? "/api/subscriptions", "http://localhost:4321");
  const request = new Request(url, {
    method: init.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const context = {
    request,
    url,
    params: init.params ?? {},
    locals: { user: init.user === undefined ? TEST_USER : init.user },
    cookies: {},
    redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
  };
  return context as unknown as APIContext;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Form-encoded POST context — the shape a browser form submit produces. */
function formPostContext(path: string, fields: Record<string, string>): APIContext {
  const url = new URL(path, "http://localhost:4321");
  const request = new Request(url, { method: "POST", body: new URLSearchParams(fields) });
  const context = {
    request,
    url,
    params: {},
    locals: { user: null },
    cookies: {},
    redirect: (target: string, status = 302) => new Response(null, { status, headers: { Location: target } }),
  };
  return context as unknown as APIContext;
}

const SIGNIN_FIELDS = { email: "probe@example.com", password: "wrong-password" };

beforeEach(() => {
  createClientMock.mockReset();
});

describe("subscriptions routes under induced backend failure", () => {
  it("POST /api/subscriptions answers 500 with a usable { error } body when the insert fails", async () => {
    createClientMock.mockReturnValue(failingDbClient(inducedError()));
    const response = await createSubscriptionRoute(apiContext({ body: validCreateBody }));
    expect(response.status).toBe(500);
    const payload = await readJson(response);
    expect(typeof payload.error).toBe("string");
    expect(payload.error).not.toBe("");
    // Backend detail stays server-side (risk #6: no internals in error bodies).
    expect(JSON.stringify(payload)).not.toContain("induced");
  });

  it("PATCH /api/subscriptions/[id] answers 500 with { error } when the update fails", async () => {
    createClientMock.mockReturnValue(failingDbClient(inducedError()));
    const response = await updateSubscriptionRoute(
      apiContext({ method: "PATCH", params: { id: VALID_ID }, body: { status: "paused" } }),
    );
    expect(response.status).toBe(500);
    const payload = await readJson(response);
    expect(typeof payload.error).toBe("string");
    expect(JSON.stringify(payload)).not.toContain("induced");
  });

  it("PATCH /api/subscriptions/[id] keeps the honest 404 mapping for PGRST116 (no rows)", async () => {
    createClientMock.mockReturnValue(failingDbClient(inducedError("PGRST116")));
    const response = await updateSubscriptionRoute(
      apiContext({ method: "PATCH", params: { id: VALID_ID }, body: { status: "paused" } }),
    );
    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ error: "Not found" });
  });

  it("DELETE /api/subscriptions/[id] answers 500 with { error } when the delete fails", async () => {
    createClientMock.mockReturnValue(failingDbClient(inducedError()));
    const response = await deleteSubscriptionRoute(apiContext({ method: "DELETE", params: { id: VALID_ID } }));
    expect(response.status).toBe(500);
    const payload = await readJson(response);
    expect(typeof payload.error).toBe("string");
    expect(JSON.stringify(payload)).not.toContain("induced");
  });

  it("GET /api/subscriptions/duplicate-check answers 500 with { error } when the read fails", async () => {
    createClientMock.mockReturnValue(failingDbClient(inducedError()));
    const response = await duplicateCheckRoute(
      apiContext({ method: "GET", path: "/api/subscriptions/duplicate-check?name=Netflix" }),
    );
    expect(response.status).toBe(500);
    const payload = await readJson(response);
    expect(typeof payload.error).toBe("string");
    expect(JSON.stringify(payload)).not.toContain("induced");
  });
});

describe("subscriptions routes pin the 401 { error } contract shape", () => {
  it("POST /api/subscriptions", async () => {
    const response = await createSubscriptionRoute(apiContext({ user: null, body: validCreateBody }));
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Authentication required" });
  });

  it("PATCH /api/subscriptions/[id]", async () => {
    const response = await updateSubscriptionRoute(
      apiContext({ user: null, method: "PATCH", params: { id: VALID_ID }, body: { status: "paused" } }),
    );
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Authentication required" });
  });

  it("DELETE /api/subscriptions/[id]", async () => {
    const response = await deleteSubscriptionRoute(
      apiContext({ user: null, method: "DELETE", params: { id: VALID_ID } }),
    );
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Authentication required" });
  });

  it("GET /api/subscriptions/duplicate-check", async () => {
    const response = await duplicateCheckRoute(
      apiContext({ user: null, method: "GET", path: "/api/subscriptions/duplicate-check?name=Netflix" }),
    );
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Authentication required" });
  });
});

describe("POST /api/auth/signout error contract", () => {
  it("surfaces a failed sign-out instead of faking success", async () => {
    createClientMock.mockReturnValue(authClient({ error: { message: INDUCED_MESSAGE } }));
    const response = await signOutRoute(apiContext({ path: "/api/auth/signout" }));
    const location = response.headers.get("Location") ?? "";
    // A failed signOut leaves the session cookie alive (supabase-js returns
    // early without clearing it) — redirecting to the signed-out landing page
    // would be a fake success.
    expect(location).not.toBe("/");
    expect(location).toContain("error=");
  });

  it("carries the fixed signout-failed code in the failure redirect, never backend detail", async () => {
    createClientMock.mockReturnValue(authClient({ error: { message: INDUCED_MESSAGE } }));
    const response = await signOutRoute(apiContext({ path: "/api/auth/signout" }));
    const location = response.headers.get("Location") ?? "";
    // Short code, mapped to its message by the dashboard (auth-errors.ts) —
    // free text in ?error= would be a content-spoofing surface (risk #6).
    expect(location).toBe("/dashboard?error=signout-failed");
  });

  it("still redirects to the landing page on success", async () => {
    createClientMock.mockReturnValue(authClient({ error: null }));
    const response = await signOutRoute(apiContext({ path: "/api/auth/signout" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
  });
});

// signin/signup redirect with SHORT CODES, never error.message — the
// error-path-hardening follow-up closing the last raw-detail-in-URL path
// (risk #6). The auth pages map codes to fixed messages via auth-errors.ts,
// so a wrong password still reads clearly in the UI.
describe("POST /api/auth/signin error contract", () => {
  it("maps invalid credentials to the invalid-credentials code, never backend detail", async () => {
    createClientMock.mockReturnValue(
      signInClient({ message: INDUCED_MESSAGE, code: "invalid_credentials", status: 400 }),
    );
    const response = await signInRoute(formPostContext("/api/auth/signin", SIGNIN_FIELDS));
    const location = response.headers.get("Location") ?? "";
    expect(location).toBe("/auth/signin?error=invalid-credentials");
    expect(location).not.toContain("induced");
  });

  it("collapses any other failure to the unknown code", async () => {
    createClientMock.mockReturnValue(
      signInClient({ message: INDUCED_MESSAGE, code: "unexpected_failure", status: 500 }),
    );
    const response = await signInRoute(formPostContext("/api/auth/signin", SIGNIN_FIELDS));
    expect(response.headers.get("Location")).toBe("/auth/signin?error=unknown");
  });

  it("still redirects to the dashboard on success", async () => {
    createClientMock.mockReturnValue(signInClient(null));
    const response = await signInRoute(formPostContext("/api/auth/signin", SIGNIN_FIELDS));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
  });
});

describe("POST /api/auth/signup error contract", () => {
  it("maps an already-registered email to the email-taken code, never backend detail", async () => {
    createClientMock.mockReturnValue(
      signUpClient({ message: INDUCED_MESSAGE, code: "user_already_exists", status: 422 }),
    );
    const response = await signUpRoute(formPostContext("/api/auth/signup", SIGNIN_FIELDS));
    const location = response.headers.get("Location") ?? "";
    expect(location).toBe("/auth/signup?error=email-taken");
    expect(location).not.toContain("induced");
  });

  it("collapses any other failure to the unknown code", async () => {
    createClientMock.mockReturnValue(
      signUpClient({ message: INDUCED_MESSAGE, code: "unexpected_failure", status: 500 }),
    );
    const response = await signUpRoute(formPostContext("/api/auth/signup", SIGNIN_FIELDS));
    expect(response.headers.get("Location")).toBe("/auth/signup?error=unknown");
  });

  it("still redirects to confirm-email on success", async () => {
    createClientMock.mockReturnValue(signUpClient(null));
    const response = await signUpRoute(formPostContext("/api/auth/signup", SIGNIN_FIELDS));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/confirm-email");
  });
});
