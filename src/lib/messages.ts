/** Flash messages are looked up by code, so query-string text can never be reflected into the page. */
export const MESSAGES = {
  invite_sent: { text: 'Invitation created and emailed.', ok: true },
  invite_revoked: { text: 'Invitation revoked.', ok: true },
  role_changed: { text: 'Role updated.', ok: true },
  user_disabled: { text: 'User disabled and signed out everywhere.', ok: true },
  user_enabled: { text: 'User re-enabled.', ok: true },
  session_revoked: { text: 'Device signed out.', ok: true },
  others_revoked: { text: 'All other devices signed out.', ok: true },
  invalid_email: { text: 'That email address does not look valid.', ok: false },
  already_a_user: { text: 'That person already has access.', ok: false },
  last_manager: { text: 'The household needs at least one active manager.', ok: false },
  not_found: { text: 'That item no longer exists.', ok: false },
  forbidden: { text: 'You are not allowed to do that.', ok: false },
  rate_limited: { text: 'Too many invitations today. Try again tomorrow.', ok: false },
  too_large: { text: 'That request was too large.', ok: false },
  bad_request: { text: 'Something was wrong with that request.', ok: false },
} as const satisfies Record<string, { text: string; ok: boolean }>;

export type FlashCode = keyof typeof MESSAGES;

/** Resolves an untrusted `?msg=` value. Unknown codes (including prototype names) resolve to nothing. */
export function flashFor(code: string | null): { text: string; ok: boolean } | undefined {
  return code !== null && Object.hasOwn(MESSAGES, code) ? MESSAGES[code as FlashCode] : undefined;
}
