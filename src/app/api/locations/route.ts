import { NextRequest } from "next/server";
import { noStoreJson } from "@/lib/http/noStore";
import { isAuthorized } from "@/lib/auth/guard";
import { getLocations } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Every shared location (city) DynaMo tracks — reference data, not
// tenant-scoped (PRD BE-5/BE-17). Any registered user can see the list; it's
// used to pick which cities a new campaign should target.
export async function GET(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  try {
    const locations = await getLocations();
    return noStoreJson({ locations });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
