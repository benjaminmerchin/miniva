/**
 * Transactional email over Resend, from the verified updates.miniva.co domain.
 * Called from convex/auth.ts inside the Better Auth magicLink plugin.
 */
const FROM = "Miniva <login@updates.miniva.co>";

export async function sendMagicLink(to: string, url: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "Your Miniva sign-in link",
      // Plain text alongside HTML: some clients strip the markup, and a link
      // that only exists in HTML is a link some people cannot click.
      text: `Sign in to Miniva:\n\n${url}\n\nThis link expires in 5 minutes. If you didn't ask for it, ignore this email.`,
      html: `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#18181b">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:28px">
    <span style="display:inline-block;width:20px;height:20px;border-radius:5px;background:#5865F2"></span>
    <span style="font-size:15px;font-weight:600;letter-spacing:-0.01em">Miniva</span>
  </div>

  <h1 style="font-size:20px;font-weight:600;letter-spacing:-0.02em;margin:0 0 8px">Sign in to Miniva</h1>
  <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0 0 24px">
    Click the button below and you're in. No password to remember.
  </p>

  <a href="${url}"
     style="display:inline-block;background:#5865F2;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px">
    Sign in
  </a>

  <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:24px 0 0">
    This link expires in 5 minutes and can only be used once.
    If you didn't request it, you can safely ignore this email.
  </p>

  <p style="font-size:12px;line-height:1.6;color:#a1a1aa;margin:16px 0 0;word-break:break-all">
    Or paste this into your browser:<br>
    <span style="color:#71717a">${url}</span>
  </p>
</div>`.trim(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend rejected the send: ${res.status} ${await res.text()}`);
  }
}
