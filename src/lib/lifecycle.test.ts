import { describe, expect, it } from "vitest";
import { statusActions } from "./lifecycle";

// Oracles hand-derived from PRD US-04 + FR-008 (never from the implementation):
// - FR-008: the user can change status between active, paused, and cancelled.
// - US-04: pausing removes from totals/renewals; "setting the status back to
//   active restores it" (paused → active), and cancelled behaves like paused —
//   the roadmap's S-04 outcome names the cancelled → active path "reactivate".
// - Cancel is the only destructive-intent action, so it alone confirms
//   (mirroring the FR-007 delete-with-confirmation precedent).

describe("statusActions", () => {
  it("active offers Pause (→ paused) and confirmed Cancel (→ cancelled)", () => {
    expect(statusActions("active")).toEqual([
      { label: "Pause", target: "paused", confirm: false },
      { label: "Cancel", target: "cancelled", confirm: true },
    ]);
  });

  it("paused offers Resume (→ active) and confirmed Cancel (→ cancelled)", () => {
    expect(statusActions("paused")).toEqual([
      { label: "Resume", target: "active", confirm: false },
      { label: "Cancel", target: "cancelled", confirm: true },
    ]);
  });

  it("cancelled offers only Reactivate (→ active)", () => {
    expect(statusActions("cancelled")).toEqual([{ label: "Reactivate", target: "active", confirm: false }]);
  });

  it("never offers a self-transition (a no-op PATCH would be a UI lie)", () => {
    for (const status of ["active", "paused", "cancelled"] as const) {
      for (const action of statusActions(status)) {
        expect(action.target).not.toBe(status);
      }
    }
  });

  it("only Cancel asks for confirmation", () => {
    for (const status of ["active", "paused", "cancelled"] as const) {
      for (const action of statusActions(status)) {
        expect(action.confirm).toBe(action.label === "Cancel");
      }
    }
  });
});
