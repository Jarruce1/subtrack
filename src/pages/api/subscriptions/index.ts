import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { createSubscription } from "@/lib/services/subscriptions";
import { subscriptionCreateSchema } from "@/lib/validation/subscriptions";

// POST /api/subscriptions — the US-01 write path: authenticated, zod-validated
// create, persistence delegated to the F-01 service (RLS scopes the insert;
// user_id comes from the column's auth.uid() default). Middleware sets
// locals.user for API routes but does not redirect them — this endpoint owns
// its 401.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Supabase is not configured" }, 500);
  }

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = subscriptionCreateSchema.safeParse(body);
  if (!parsed.success) {
    // Wire contract with the form island: { errors: { formErrors, fieldErrors } }.
    return json({ errors: z.flattenError(parsed.error) }, 400);
  }

  try {
    const subscription = await createSubscription(supabase, parsed.data);
    return json(subscription, 201);
  } catch {
    // DB details stay server-side; zod pre-empts every CHECK on the happy path.
    return json({ error: "Could not create subscription" }, 500);
  }
};
