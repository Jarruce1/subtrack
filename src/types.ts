import type { Database } from "@/db/database.types";

// Domain entity/DTO aliases curated from the generated Database types.
// Later slices import from here, never from src/db/database.types.ts directly.

export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type SubscriptionInsert = Database["public"]["Tables"]["subscriptions"]["Insert"];
export type SubscriptionUpdate = Database["public"]["Tables"]["subscriptions"]["Update"];

export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
export type BillingCycle = Database["public"]["Enums"]["subscription_billing_cycle"];
export type SubscriptionCategory = Database["public"]["Enums"]["subscription_category"];

// Services never accept caller-supplied identity/audit fields — the database
// fills id/user_id/timestamps (user_id via its auth.uid() default under RLS).
export type CreateSubscriptionInput = Omit<SubscriptionInsert, "id" | "user_id" | "created_at" | "updated_at">;
export type UpdateSubscriptionInput = Omit<SubscriptionUpdate, "id" | "user_id" | "created_at" | "updated_at">;

// Computed billing results (src/lib/billing.ts) — shared by the dashboard
// (S-01), lifecycle totals (S-04), and category breakdown (S-06).
export interface NormalizedCost {
  monthly: number; // unrounded
  yearly: number; // unrounded
}
export interface CurrencyTotal {
  currency: string;
  monthly: number;
  yearly: number;
}
export interface CategoryTotal {
  category: SubscriptionCategory;
  currency: string;
  monthly: number; // unrounded, same semantics as CurrencyTotal
  yearly: number; // unrounded
}
export interface UpcomingRenewal {
  subscription: Subscription;
  renewalDate: string; // ISO YYYY-MM-DD, nextRenewalDate output
}
