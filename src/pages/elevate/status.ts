import type { APIRoute } from 'astro';
import { json } from '../../lib/http';

/** Whether this device has been unlocked yet. The page waiting for a manager's approval polls this. */
export const GET: APIRoute = ({ locals }) => json({ elevated: !!locals.elevation });
