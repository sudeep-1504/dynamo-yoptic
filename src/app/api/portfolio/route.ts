import { NextResponse } from "next/server";
import { buildPortfolio } from "@/lib/db/read";

export const dynamic = "force-dynamic";

// Read API for the portfolio grid (polled by the client for the live glance).
export async function GET() {
  try {
    const portfolio = await buildPortfolio();
    return NextResponse.json(portfolio);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
