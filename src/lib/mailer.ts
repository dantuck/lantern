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

export function loginEmail(link: string): Omit<Mail, 'to'> {
  const text = [
    'Use this link to sign in to the Family Dashboard:',
    '',
    link,
    '',
    'It expires in 10 minutes, works once, and only in the browser where you asked for it.',
    "If you didn't ask to sign in, ignore this email.",
  ].join('\n');
  const html = `<p>Use this link to sign in to the Family Dashboard:</p>
<p><a href="${link}">Sign in</a></p>
<p style="color:#555">It expires in 10 minutes, works once, and only in the browser where you asked for it.<br>
If you didn't ask to sign in, ignore this email.</p>`;
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
  const html = `<p>${inviterEmail.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)} invited you to the Family Dashboard.</p>
<p><a href="${loginUrl}">Open the dashboard</a>, enter this email address, and we'll send you a sign-in link.</p>
<p style="color:#555">The invitation expires in 7 days.</p>`;
  return { subject: "You're invited to the Family Dashboard", text, html };
}
