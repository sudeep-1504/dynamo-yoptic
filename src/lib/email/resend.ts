// Plain transactional email via Resend's REST API (no SDK — same "raw fetch,
// one adapter module" pattern as the weather provider). Deliberately NOT tied
// to Supabase Auth's own email templates: those are built for auto-login
// tokens, which is exactly the fragility (single-use codes, hash-fragment
// vs code-param, email-scanner prefetch) that password auth was adopted to
// escape. This is just a notification with a plain link to /login.
//
// Injection-first: if RESEND_API_KEY isn't set, sending is skipped (reported
// back to the caller) rather than failing user registration — the account is
// still created and usable, the admin just relays the login link manually.

export interface SendResult {
  attempted: boolean;
  ok: boolean;
  error?: string;
}

export async function sendWelcomeEmail(opts: {
  to: string;
  displayName?: string | null;
  loginUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { attempted: false, ok: false, error: "RESEND_API_KEY not set" };
  }

  const name = opts.displayName || opts.to;
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto;">
      <p>Hi ${name},</p>
      <p>Your DynaMo account is ready. Sign in with <strong>${opts.to}</strong> and the
      password your DynaMo contact shared with you.</p>
      <p style="margin: 24px 0;">
        <a href="${opts.loginUrl}"
           style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">
          Sign in to DynaMo
        </a>
      </p>
      <p style="color:#666;font-size:13px;">If the button doesn't work, copy this link:<br>${opts.loginUrl}</p>
    </div>
  `.trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "DynaMo <onboarding@resend.dev>",
        to: [opts.to],
        subject: "Your DynaMo account is ready",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { attempted: true, ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { attempted: true, ok: true };
  } catch (e: any) {
    return { attempted: true, ok: false, error: String(e?.message ?? e) };
  }
}
