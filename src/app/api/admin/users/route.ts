import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth/guard";
import { noStoreJson } from "@/lib/http/noStore";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// List every registered user (internal admin only) — the roster for the
// "Team & Clients" page.
export async function GET(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  if (auth.profile?.role !== "internal" || !auth.profile.is_admin) {
    return noStoreJson({ error: "forbidden", reason: "internal admins only" }, { status: 403 });
  }
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("profiles")
      .select("id, email, display_name, role, is_admin, advertiser_id, created_at, advertisers(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return noStoreJson({
      users: (data as any[]).map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        role: u.role,
        is_admin: u.is_admin,
        advertiser_id: u.advertiser_id,
        advertiser_name: u.advertisers?.name ?? null,
        created_at: u.created_at,
      })),
    });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

// Register a new user — a client user tied to one advertiser, or an internal
// DynaMo team member (optionally an admin). This IS the "sign-up": there is no
// public self-registration; every account is created here by an internal
// admin, then the invitee gets a magic-link email to set up sign-in.
// Body: { email, role: 'internal'|'client', advertiser_id?, is_admin?, display_name? }
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  if (auth.actor !== "system" && (auth.profile?.role !== "internal" || !auth.profile.is_admin)) {
    return noStoreJson({ error: "forbidden", reason: "internal admins only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, role, advertiser_id, is_admin, display_name } = body;
    if (!email || !role) {
      return noStoreJson({ error: "email and role are required" }, { status: 400 });
    }
    if (!["internal", "client"].includes(role)) {
      return noStoreJson({ error: "role must be 'internal' or 'client'" }, { status: 400 });
    }
    if (role === "client" && !advertiser_id) {
      return noStoreJson({ error: "advertiser_id required for a client user" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const origin = new URL(req.url).origin;
    const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) {
      return noStoreJson({ error: `invite failed: ${error.message}` }, { status: 400 });
    }

    const newUserId = data.user.id;
    const { error: profileErr } = await db.from("profiles").insert({
      id: newUserId,
      email,
      display_name: display_name || null,
      role,
      is_admin: role === "internal" ? Boolean(is_admin) : false,
      advertiser_id: role === "client" ? advertiser_id : null,
      invited_by: auth.profile?.id ?? null,
    });
    if (profileErr) throw profileErr;

    return noStoreJson({ ok: true, user_id: newUserId });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
