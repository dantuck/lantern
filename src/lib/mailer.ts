export interface Mail { to: string; subject: string; text: string; html: string }
export interface Mailer { send(mail: Mail): Promise<void> }

export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    // Wrapped: a bare `fetch` stored on an object loses its receiver in Workers ("Illegal invocation").
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

/** Dev only: prints the mail (including the sign-in link) instead of sending it. */
export class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(`\n[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}\n`);
  }
}

/** Fails closed: in production without an API key there is no mailer, so no link can ever be logged. */
export function selectMailer(env: { RESEND_API_KEY?: string; MAIL_FROM: string }, dev: boolean): Mailer | null {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  return dev ? new ConsoleMailer() : null;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Shared HTML frame: a centred card on a warm background, matching the dashboard's look. Table layout and inline
 * styles because mail clients ignore most modern CSS; the <style> block only adds dark mode where it is supported.
 * `body` must already be escaped.
 */
function shell(preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#12100d !important } .card { background:#1b1814 !important; border-color:#2e2922 !important }
  .fg { color:#f2ede6 !important } .muted { color:#a39a8e !important } .codebox { background:#26211b !important }
  .btn { background:#ff9a3c !important } .btn a { color:#2a1500 !important }
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:#faf7f3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="bg" style="background:#faf7f3"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px">
<tr><td style="padding:0 4px 16px;font:700 15px ${FONT};color:#c2570a;letter-spacing:.2px">Family Dashboard</td></tr>
<tr><td class="card" style="background:#ffffff;border:1px solid #eadfd2;border-radius:16px;padding:32px 28px;font:16px/1.55 ${FONT};color:#1d1813">
${body}
</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td class="btn" style="background:#c2570a;border-radius:10px">
<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:600 16px ${FONT};color:#ffffff;text-decoration:none">${esc(label)}</a>
</td></tr></table>`;

export function loginEmail(link: string, code: string): Omit<Mail, 'to'> {
  const shown = `${code.slice(0, 4)} ${code.slice(4)}`;
  const text = [
    'Use this link to sign in to the Family Dashboard:',
    '',
    link,
    '',
    `Reading this on another device? Type this code into the sign-in page instead: ${shown}`,
    '',
    'The link and the code expire in 10 minutes, work once, and only in the browser where you asked for them.',
    "If you didn't ask to sign in, ignore this email.",
  ].join('\n');
  const html = shell(`Your sign-in code is ${shown}`, `<h1 class="fg" style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#1d1813">Sign in</h1>
<p class="fg" style="margin:0;color:#1d1813">Tap the button to finish signing in to your Family Dashboard.</p>
${button(link, 'Sign in')}
<p class="muted" style="margin:0 0 10px;font-size:14px;color:#6b6258">Reading this on another device? Type this code into the sign-in page instead:</p>
<div class="codebox" style="background:#f6efe6;border-radius:10px;padding:14px 16px;text-align:center"><span class="fg" style="font:700 28px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:4px;color:#1d1813">${shown}</span></div>
<p class="muted" style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b6258">The link and the code expire in 10 minutes, work once, and only in the browser where you asked for them. If you didn't ask to sign in, you can ignore this email.</p>`);
  return { subject: 'Your Family Dashboard sign-in link', text, html };
}

/** Invitation notice. Deliberately contains no token: the invitee signs in through the normal magic-link flow. */
export function inviteEmail(inviterEmail: string, loginUrl: string): Omit<Mail, 'to'> {
  const text = [
    `${inviterEmail} invited you to the Family Dashboard.`,
    '',
    `Go to ${loginUrl}, enter this email address, and we'll send you a sign-in link.`,
    'The invitation expires in 7 days.',
  ].join('\n');
  const html = shell(`${inviterEmail} invited you to the Family Dashboard`, `<h1 class="fg" style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#1d1813">You're invited</h1>
<p class="fg" style="margin:0;color:#1d1813"><strong>${esc(inviterEmail)}</strong> invited you to the Family Dashboard.</p>
<p class="fg" style="margin:12px 0 0;color:#1d1813">Open the dashboard, enter this email address, and we'll send you a sign-in link.</p>
${button(loginUrl, 'Open the dashboard')}
<p class="muted" style="margin:0;font-size:13px;color:#6b6258">The invitation expires in 7 days.</p>`);
  return { subject: "You're invited to the Family Dashboard", text, html };
}
