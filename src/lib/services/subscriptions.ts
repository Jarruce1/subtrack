import type { TypedSupabaseClient } from "@/lib/supabase";
import type { CreateSubscriptionInput, Subscription, UpdateSubscriptionInput } from "@/types";

// All reads/writes of the subscriptions table go through this module — no page
// or endpoint calls .from("subscriptions") directly. The injected client
// carries the caller's session, so RLS scopes every statement: this layer
// never passes or filters user_id (inserts rely on the column's auth.uid()
// default) and never uses a service-role key. Database errors other than the
// not-found cases mapped below are surfaced as thrown Errors carrying the
// Postgres message; input validation beyond types belongs to the first
// validated API route (S-01), not here.

/** PostgREST error code for "JSON object requested, multiple (or no) rows returned" — .single() found no row. */
const NO_ROWS_CODE = "PGRST116";

export async function listSubscriptions(supabase: TypedSupabaseClient): Promise<Subscription[]> {
  const { data, error } = await supabase.from("subscriptions").select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/** Resolves to null when the row does not exist or is not owned by the caller — RLS makes these indistinguishable (deliberate). */
export async function getSubscription(supabase: TypedSupabaseClient, id: string): Promise<Subscription | null> {
  const { data, error } = await supabase.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createSubscription(
  supabase: TypedSupabaseClient,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  const { data, error } = await supabase.from("subscriptions").insert(input).select().single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/** Resolves to null when the row does not exist or is not owned by the caller. */
export async function updateSubscription(
  supabase: TypedSupabaseClient,
  id: string,
  input: UpdateSubscriptionInput,
): Promise<Subscription | null> {
  const { data, error } = await supabase.from("subscriptions").update(input).eq("id", id).select().single();
  if (error) {
    if (error.code === NO_ROWS_CODE) {
      return null;
    }
    throw new Error(error.message);
  }
  return data;
}

/** Resolves to false when the row does not exist or is not owned by the caller. */
export async function deleteSubscription(supabase: TypedSupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("subscriptions").delete().eq("id", id).select("id");
  if (error) {
    throw new Error(error.message);
  }
  return data.length > 0;
}
