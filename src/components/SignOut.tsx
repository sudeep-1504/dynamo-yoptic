"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOut() {
  const router = useRouter();
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={signOut}>
      <LogOut className="mr-1.5 h-3.5 w-3.5" />
      Sign out
    </Button>
  );
}
