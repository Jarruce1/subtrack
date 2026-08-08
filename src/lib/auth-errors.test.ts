import { describe, expect, it } from "vitest";
import { AUTH_ERROR_MESSAGES, authErrorMessage } from "@/lib/auth-errors";

// Pins the page side of the ?error= code contract (test-plan §2 risk #6,
// error-path-hardening follow-up): pages render only fixed strings selected
// by a short code — a crafted ?error= link can never choose its own text.

describe("authErrorMessage", () => {
  it("returns null when no code is present (nothing to render)", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("maps known codes to their fixed messages", () => {
    expect(authErrorMessage("invalid-credentials")).toBe("Invalid email or password.");
    expect(authErrorMessage("signout-failed")).toBe("Sign out failed. Please try again.");
  });

  it("collapses unknown codes to the generic message — content spoofing via ?error= is dead", () => {
    const crafted = "Your account is locked, call +00 000 000 000";
    expect(authErrorMessage(crafted)).toBe(AUTH_ERROR_MESSAGES.unknown);
    expect(authErrorMessage(crafted)).not.toContain("locked");
  });

  it("never resolves prototype members as codes", () => {
    expect(authErrorMessage("toString")).toBe(AUTH_ERROR_MESSAGES.unknown);
  });
});
