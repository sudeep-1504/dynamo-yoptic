import { buildPortfolio } from "@/lib/db/read";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Read API for the portfolio grid (polled by the client for the live glance).
// no-store headers stamped explicitly so no CDN/browser layer ever serves a
// cached snapshot of live decision state.
export async function GET() {
  try {
    const portfolio = await buildPortfolio();
    return noStoreJson(portfolio);
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
