import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { deleteSubscription, updateSubscription } from "@/lib/services/subscriptions";
import { subscriptionUpdateSchema } from "@/lib/validation/subscriptions";

// PATCH/DELETE /api/subscriptions/[id] — the S-03 item write paths (FR-006,
// FR-007). Same conventions as the collection route: middleware sets
// locals.user but does not redirect API routes, so each handler owns its 401;
// the injected client carries the caller's session and RLS scopes every
// statement. Foreign, nonexistent, and malformed ids all answer an identical
// 404 — RLS makes foreign and nonexistent indistinguishable (deliberate), and
// the uuid pre-check keeps malformed ids from surfacing as Postgres 500s.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const idSchema = z.uuid();

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const id = idSchema.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Not found" }, 404);
  }

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = subscriptionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    // Wire contract shared with the form island: { errors: { formErrors, fieldErrors } }.
    // The empty-patch guard (F-01 review F2) surfaces here as a formError.
    return json({ errors: z.flattenError(parsed.error) }, 400);
  }

  try {
    const subscription = await updateSubscription(supabase, id.data, parsed.data);
    if (!subscription) {
      return json({ error: "Not found" }, 404);
    }
    return json(subscription, 200);
  } catch {
    // DB details stay server-side; zod pre-empts every CHECK on the happy path.
    return json({ error: "Could not update subscription" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  const id = idSchema.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Not found" }, 404);
  }

  try {
    const deleted = await deleteSubscription(supabase, id.data);
    if (!deleted) {
      return json({ error: "Not found" }, 404);
    }
    return new Response(null, { status: 204 });
  } catch {
    return json({ error: "Could not delete subscription" }, 500);
  }
};
