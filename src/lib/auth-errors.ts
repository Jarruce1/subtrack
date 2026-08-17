// Fixed ?error= contract for form-post auth flows (error-path-hardening
// follow-up; test-plan §2 risk #6). Routes redirect with a SHORT CODE — raw
// supabase-js error.message never enters a URL — and pages map codes to a
// fixed i18n key below, rendered via `translator(lang)`. A crafted ?error=
// link can therefore only select one of these messages (no content spoofing),
// and unknown codes collapse to the generic one.

import type { MessageKey } from "@/lib/i18n";

export const AUTH_ERROR_KEYS = {
  "invalid-credentials": "autherr.invalid-credentials",
  "email-taken": "autherr.email-taken",
  "rate-limited": "autherr.rate-limited",
  "not-configured": "autherr.not-configured",
  "signout-failed": "autherr.signout-failed",
  unknown: "autherr.unknown",
} as const satisfies Record<string, MessageKey>;

export type AuthErrorCode = keyof typeof AUTH_ERROR_KEYS;

function isKnownCode(code: string): code is AuthErrorCode {
  return Object.hasOwn(AUTH_ERROR_KEYS, code);
}

/**
 * Maps a `?error=` query value to the i18n key of its fixed user-facing
 * message. `null`/empty means "no error" (renders nothing); an unknown code
 * resolves to the generic key, never attacker-chosen text.
 */
export function authErrorKey(code: string | null): MessageKey | null {
  if (code === null || code === "") {
    return null;
  }
  return isKnownCode(code) ? AUTH_ERROR_KEYS[code] : AUTH_ERROR_KEYS.unknown;
}
