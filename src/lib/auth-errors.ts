// Fixed ?error= contract for form-post auth flows (error-path-hardening
// follow-up; test-plan §2 risk #6). Routes redirect with a SHORT CODE — raw
// supabase-js error.message never enters a URL — and pages map codes to the
// fixed strings below server-side. A crafted ?error= link can therefore only
// select one of these messages (no content spoofing), and unknown codes
// collapse to the generic one.

export const AUTH_ERROR_MESSAGES = {
  "invalid-credentials": "Invalid email or password.",
  "email-taken": "An account with this email already exists.",
  "rate-limited": "Too many attempts. Please wait a moment and try again.",
  "not-configured": "Supabase is not configured.",
  "signout-failed": "Sign out failed. Please try again.",
  unknown: "Something went wrong. Please try again.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

function isKnownCode(code: string): code is AuthErrorCode {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code);
}

/**
 * Maps a `?error=` query value to its fixed user-facing message.
 * `null`/empty means "no error" (renders nothing); an unknown code renders
 * the generic message, never the attacker-chosen text.
 */
export function authErrorMessage(code: string | null): string | null {
  if (code === null || code === "") {
    return null;
  }
  return isKnownCode(code) ? AUTH_ERROR_MESSAGES[code] : AUTH_ERROR_MESSAGES.unknown;
}
