import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  // Null client = env not configured: nothing to sign out OF — middleware
  // cannot validate any session either, so the cookie is inert and the "/"
  // redirect below is honest (Layout's env banner owns the messaging).
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // A failed signOut leaves the session cookie alive (supabase-js returns
      // early without clearing it on network/5xx logout failures), so
      // redirecting to "/" would fake a signed-out state. Surface the failure
      // where the sign-out button lives. Short fixed code on purpose — auth
      // error detail never belongs in a URL (test-plan risk #6); the dashboard
      // maps it to its message via auth-errors.ts.
      return context.redirect("/dashboard?error=signout-failed");
    }
  }
  return context.redirect("/");
};
