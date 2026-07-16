import { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth/guard";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// The logged-in user's profile, for client-side role routing: a client-role
// user goes straight to their own dashboard, an internal user gets the client
// picker (PRD-per-conversation requirement: "client hidden behind a click").
export async function GET(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok || auth.actor === "system" || !auth.profile) {
    return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }
  return noStoreJson({ profile: auth.profile });
}
