import { supabaseAdmin } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: "internal" | "client";
  is_admin: boolean;
  advertiser_id: string | null;
}

// Looked up with the service-role client (bypasses RLS) so it works from any
// server context, not just ones with the caller's own cookies attached.
export async function getProfileById(userId: string): Promise<Profile | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select("id, email, display_name, role, is_admin, advertiser_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
