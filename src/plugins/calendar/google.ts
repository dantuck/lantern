import { z } from 'zod';
import { addDays } from '../../lib/dates';
import type { CalEvent } from './types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const MAX_PAGES = 4;

const serviceAccountSchema = z.object({
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
});
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

export function parseServiceAccount(json: string): ServiceAccount {
  // Messages deliberately omit the input: it contains a private key.
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  const parsed = serviceAccountSchema.safeParse(raw);
  if (!parsed.success) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  return parsed.data;
}

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** RS256-signed JWT assertion for Google's service-account OAuth flow. */
export async function signJwt(sa: ServiceAccount, now: number): Promise<string> {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

export async function getAccessToken(fetchFn: typeof fetch, sa: ServiceAccount, now: number): Promise<string> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await signJwt(sa, now),
    }),
  });
  if (!res.ok) throw new Error(`Google token endpoint ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || !body.access_token) throw new Error('Google token response had no access_token');
  return body.access_token;
}

interface GoogleEvent {
  id?: string; status?: string; summary?: string; location?: string;
  start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Maps a Google event to our minimal shape. Descriptions and attendees are intentionally dropped. */
export function normalizeEvent(g: GoogleEvent): CalEvent | null {
  if (!g.id || g.status === 'cancelled') return null;
  const title = clip((g.summary ?? '').trim() || '(No title)', 200);
  const loc = g.location?.trim() ? { location: clip(g.location.trim(), 120) } : {};
  if (g.start?.date && g.end?.date) {
    // Google's all-day end date is exclusive.
    let endDate = addDays(g.end.date, -1);
    if (endDate < g.start.date) endDate = g.start.date;
    return { id: g.id, title, ...loc, allDay: true, startDate: g.start.date, endDate };
  }
  if (g.start?.dateTime) {
    const start = Date.parse(g.start.dateTime);
    const end = Date.parse(g.end?.dateTime ?? g.start.dateTime);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return { id: g.id, title, ...loc, allDay: false, start, end: Math.max(start, end) };
  }
  return null;
}

export async function listEvents(
  fetchFn: typeof fetch, accessToken: string, calendarId: string, timeMin: number, timeMax: number,
): Promise<CalEvent[]> {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const events: CalEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(),
      fields: 'nextPageToken,items(id,status,summary,location,start,end)',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await fetchFn(`${base}?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google Calendar API ${res.status}`);
    const body = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    for (const item of body.items ?? []) {
      const ev = normalizeEvent(item);
      if (ev) events.push(ev);
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}
