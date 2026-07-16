import { NextRequest, NextResponse } from "next/server";
import { getWeatherProvider } from "@/lib/weather/provider";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Diagnostic endpoint. Reports what the server runtime actually sees — presence
// of env vars (never their values), a live weather probe, and DB reachability.
// Gated by the cron secret so it isn't world-readable:
//   GET /api/health?secret=<CRON_SECRET>
// Remove this route once the deployment is confirmed healthy.
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Which commit is actually live? Vercel injects these at build time.
  const build = {
    deployed_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "unknown",
    // Marker: this value only exists in the auto-refresh build (c6ff384+).
    has_auto_refresh: true,
  };

  const env = {
    NEXT_PUBLIC_SUPABASE_URL_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL_value: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY_set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_SERVICE_ROLE_KEY_len: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length,
    CRON_SECRET_set: Boolean(process.env.CRON_SECRET),
    WEATHERAPI_KEY_set: Boolean(process.env.WEATHERAPI_KEY),
    WEATHERAPI_KEY_len: (process.env.WEATHERAPI_KEY ?? "").length,
  };

  // Live weather probe for Mumbai (does NOT write to the DB).
  let weather: any = { attempted: false };
  const provider = getWeatherProvider();
  if (!provider) {
    weather = { attempted: false, reason: "no WEATHERAPI_KEY in runtime" };
  } else {
    try {
      const w = await provider.fetch(19.076, 72.8777);
      weather = { attempted: true, ok: true, precip_now: w.precip_now, apparent_temp: w.apparent_temp, condition: w.condition };
    } catch (e: any) {
      weather = { attempted: true, ok: false, error: String(e?.message ?? e) };
    }
  }

  // DB reachability (service role).
  let db: any = { ok: false };
  try {
    const { count, error } = await supabaseAdmin()
      .from("line_items")
      .select("*", { count: "exact", head: true });
    db = error ? { ok: false, error: error.message } : { ok: true, line_items: count };
  } catch (e: any) {
    db = { ok: false, error: String(e?.message ?? e) };
  }

  return NextResponse.json({ build, env, weather, db });
}
