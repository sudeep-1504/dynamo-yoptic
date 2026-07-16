"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

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
        shouldCreateUser: false, // invited-user allowlist only
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="loginbox">
      <h2 style={{ marginTop: 0 }}>DynaMo</h2>
      <p className="muted">CoolSip campaign console. Invited users only.</p>
      {sent ? (
        <div className="notice">
          Check <b>{email}</b> for a magic sign-in link.
        </div>
      ) : (
        <form onSubmit={sendLink}>
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
      {err && <p className="stale" style={{ marginTop: 12 }}>{err}</p>}
    </div>
  );
}
