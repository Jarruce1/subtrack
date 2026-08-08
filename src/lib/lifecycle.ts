import type { SubscriptionStatus } from "@/types";

// FR-008 / US-04 status lifecycle as pure data: which quick actions each
// status offers, where each one lands, and whether it asks for confirmation.
// The single source of truth the list-page island renders from — the UI cannot
// invent or drop a transition without failing the unit suite. Client-safe:
// no I/O, type-only imports.
//
// Cancel is the only confirmed action: it signals "this subscription ended"
// (though the row stays listed — delete remains the removal path), while
// pause/resume/reactivate are instantly reversible one-click toggles.

export interface StatusAction {
  /** Button label shown on the subscription list. */
  label: string;
  /** Status the subscription transitions to. */
  target: SubscriptionStatus;
  /** Ask for confirmation before performing the transition. */
  confirm: boolean;
}

const STATUS_ACTIONS: Record<SubscriptionStatus, readonly StatusAction[]> = {
  active: [
    { label: "Pause", target: "paused", confirm: false },
    { label: "Cancel", target: "cancelled", confirm: true },
  ],
  paused: [
    { label: "Resume", target: "active", confirm: false },
    { label: "Cancel", target: "cancelled", confirm: true },
  ],
  cancelled: [{ label: "Reactivate", target: "active", confirm: false }],
};

/** Quick actions available for a subscription in the given status. */
export function statusActions(status: SubscriptionStatus): readonly StatusAction[] {
  return STATUS_ACTIONS[status];
}
