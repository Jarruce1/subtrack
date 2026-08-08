import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      // A failed signOut leaves the session cookie alive (supabase-js returns
      // early without clearing it on network/5xx logout failures), so
      // redirecting to "/" would fake a signed-out state. Surface the failure
      // where the sign-out button lives. Fixed generic message on purpose —
      // auth error detail never belongs in a URL (test-plan risk #6).
      return context.redirect(`/dashboard?error=${encodeURIComponent("Sign out failed. Please try again.")}`);
    }
  }
  return context.redirect("/");
};
