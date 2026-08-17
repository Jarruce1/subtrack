import { describe, expect, it } from "vitest";
import { AUTH_ERROR_KEYS, authErrorKey } from "@/lib/auth-errors";

// Pins the page side of the ?error= code contract (test-plan §2 risk #6,
// error-path-hardening follow-up): pages render only fixed i18n keys selected
// by a short code — a crafted ?error= link can never choose its own text.

describe("authErrorKey", () => {
  it("returns null when no code is present (nothing to render)", () => {
    expect(authErrorKey(null)).toBeNull();
    expect(authErrorKey("")).toBeNull();
  });

  it("maps known codes to their fixed message keys", () => {
    expect(authErrorKey("invalid-credentials")).toBe("autherr.invalid-credentials");
    expect(authErrorKey("signout-failed")).toBe("autherr.signout-failed");
  });

  it("collapses unknown codes to the generic key — content spoofing via ?error= is dead", () => {
    const crafted = "Your account is locked, call +00 000 000 000";
    expect(authErrorKey(crafted)).toBe(AUTH_ERROR_KEYS.unknown);
    expect(authErrorKey(crafted)).not.toContain("locked");
  });

  it("never resolves prototype members as codes", () => {
    expect(authErrorKey("toString")).toBe(AUTH_ERROR_KEYS.unknown);
  });
});
