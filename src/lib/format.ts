import type { BillingCycle } from "@/types";

// Display formatting. formatMoney is the ONLY place the app rounds money:
// billing.ts keeps every intermediate value unrounded (NFR: totals never show
// rounding artifacts), and Intl applies each currency's minor-unit digits
// (2 for PLN/EUR/USD, 0 for JPY) — the PRD's "correct rounding per currency".

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
}

export function formatCycle(cycle: BillingCycle, intervalMonths: number | null): string {
  switch (cycle) {
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
    case "custom":
      return `every ${String(intervalMonths ?? "?")} months`;
  }
}
