import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Prefix-gated pages (startsWith): "/subscriptions" covers /subscriptions/new
// and future S-03 pages without touching /api/subscriptions — the API
// endpoint answers its own 401 (a redirect is wrong for an API).
const PROTECTED_ROUTES = ["/dashboard", "/subscriptions"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
