"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false, // no public signup — accounts are registered by the DynaMo team
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-lg font-bold">D</span>
          </div>
          <CardTitle className="text-xl">Sign in to DynaMo</CardTitle>
          <CardDescription>Invited access only — no public sign-up.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/40 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm">
                Check <span className="font-medium">{email}</span> for a magic sign-in link.
              </p>
            </div>
          ) : (
            <form onSubmit={sendLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send magic link"}
              </Button>
              {err && <p className="text-sm text-destructive">{err}</p>}
              <p className="text-center text-xs text-muted-foreground">
                Not registered yet? Ask your DynaMo contact to add you.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
