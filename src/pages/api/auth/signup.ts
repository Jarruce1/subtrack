import type { APIRoute } from "astro";
import type { AuthErrorCode } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signup?error=not-configured");
  }
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Short code only — backend error detail never belongs in a URL
    // (test-plan risk #6). /auth/signup maps codes to fixed messages via
    // auth-errors.ts.
    const code: AuthErrorCode =
      error.code === "user_already_exists" || error.code === "email_exists"
        ? "email-taken"
        : error.status === 429
          ? "rate-limited"
          : "unknown";
    return context.redirect(`/auth/signup?error=${code}`);
  }

  return context.redirect("/auth/confirm-email");
};
