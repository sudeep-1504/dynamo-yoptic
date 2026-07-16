import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/auth/guard";
import { noStoreJson } from "@/lib/http/noStore";
import { sendWelcomeEmail } from "@/lib/email/resend";

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

// Register a new user with a real password — a client user tied to one
// advertiser, or an internal DynaMo team member. Either user type can be an
// admin (full read/write in their scope) or a normal user (view-only). This
// IS the "sign-up": there is no public self-registration; every account is
// created here by an internal admin, with a password set immediately (email
// is pre-confirmed since an admin is vouching for it — no confirmation email
// needed, they can sign in right away).
// Body: { email, password, user_type: 'internal'|'client', advertiser_id?, is_admin?, display_name? }
export async function POST(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (!auth.ok) return noStoreJson({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  if (auth.actor !== "system" && (auth.profile?.role !== "internal" || !auth.profile.is_admin)) {
    return noStoreJson({ error: "forbidden", reason: "internal admins only" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { email, password, user_type, advertiser_id, is_admin, display_name } = body;
    if (!email || !password || !user_type) {
      return noStoreJson({ error: "email, password, and user_type are required" }, { status: 400 });
    }
    if (!["internal", "client"].includes(user_type)) {
      return noStoreJson({ error: "user_type must be 'internal' or 'client'" }, { status: 400 });
    }
    if (password.length < 8) {
      return noStoreJson({ error: "password must be at least 8 characters" }, { status: 400 });
    }
    if (user_type === "client" && !advertiser_id) {
      return noStoreJson({ error: "advertiser_id required for a client user" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      return noStoreJson({ error: `account creation failed: ${error.message}` }, { status: 400 });
    }

    const newUserId = data.user.id;
    const { error: profileErr } = await db.from("profiles").insert({
      id: newUserId,
      email,
      display_name: display_name || null,
      role: user_type,
      is_admin: Boolean(is_admin),
      advertiser_id: user_type === "client" ? advertiser_id : null,
      invited_by: auth.profile?.id ?? null,
    });
    if (profileErr) throw profileErr;

    // Best-effort welcome email — a plain link to /login, never an auto-login
    // token. Failure here doesn't fail registration; the admin just relays
    // the login link and password manually instead.
    const origin = new URL(req.url).origin;
    const emailResult = await sendWelcomeEmail({
      to: email,
      displayName: display_name,
      loginUrl: `${origin}/login`,
    });

    return noStoreJson({ ok: true, user_id: newUserId, email: emailResult });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
