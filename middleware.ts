import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Access gate (PRD P0-12): every dashboard route and dashboard-facing API
// requires a logged-in Supabase user. There is no public self-signup — every
// account is created by an internal admin via /api/admin/users (see that
// route for the invite flow). Fine-grained authorization (which advertiser a
// user may see, whether they're an internal admin) happens per-route via
// src/lib/auth/guard.ts and src/lib/auth/scope.ts — this gate only checks
// "is there a session at all".
const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/api/cron", "/api/consumer"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res; // not configured yet — don't hard-lock

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API calls get a 401; page navigations get redirected to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
