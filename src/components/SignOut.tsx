"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOut() {
  const router = useRouter();
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={signOut} style={{ padding: "4px 10px" }}>
      Sign out
    </button>
  );
}
