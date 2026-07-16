import { NextResponse } from "next/server";

// Forbid caching at every layer (browser, Vercel edge/CDN, any intermediate
// proxy) for read APIs that must always reflect the live decision state.
// `dynamic = "force-dynamic"` opts a route out of Next.js's own data cache,
// but doesn't stamp response headers that a CDN or browser would honor —
// this does that explicitly.
export function noStoreJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}
