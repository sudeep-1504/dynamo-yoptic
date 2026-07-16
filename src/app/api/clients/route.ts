import { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth/guard";
import { listAdvertisers } from "@/lib/db/repo";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Internal-team-only: the list of tenants, for the "client hidden behind a
// click" picker. A client-role user never needs this — they land on their own
// dashboard directly.
export async function GET(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  if (auth.profile?.role !== "internal") {
    return noStoreJson({ error: "forbidden", reason: "internal users only" }, { status: 403 });
  }
  try {
    const advertisers = await listAdvertisers();
    return noStoreJson({ advertisers });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
