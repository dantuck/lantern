#!/usr/bin/env bash
# End-to-end smoke test of invites, roles and device management against a fresh local dev server.
# Usage: scripts/smoke-admin.sh   (resets local D1 state; needs BOOTSTRAP_MANAGER_EMAIL=mom@example.com in .dev.vars)
. "$(dirname "$0")/lib.sh"
start_dev

echo "manager"
M=$(login mom@example.com)
check "manager signs in" "$([ -n "$M" ] && echo y)" y
check "admin page renders for manager" "$(get "$M" /admin | grep -c 'Household admin')" 1
check "invite kid as member" "$(post "$M" -d 'action=invite&email=Kid@Example.com&role=member' $B/admin/action)" "303 $B/admin?msg=invite_sent"
check "invite shows as pending" "$(get "$M" /admin | grep -c 'kid@example.com')" 1
check "invite mail logged, no token in it" "$(npx astro dev logs 2>&1 | grep -A4 'invited you' | grep -c token)" 0
check "inviting existing user rejected" "$(post "$M" -d 'action=invite&email=mom@example.com' $B/admin/action)" "303 $B/admin?msg=already_a_user"
check "bad email rejected" "$(post "$M" -d 'action=invite&email=nope' $B/admin/action)" "303 $B/admin?msg=invalid_email"
check "unknown flash code not reflected" "$(get "$M" '/admin?msg=<script>alert(1)</script>' | grep -c 'alert(1)')" 0

echo "member"
K=$(login kid@example.com)
check "member signs in via invite" "$([ -n "$K" ] && echo y)" y
check "member blocked from /admin" "$(code -H "Cookie: __Host-session=$K" $B/admin)" 403
check "member blocked from admin action" "$(code -X POST -H "$O" -H "Cookie: __Host-session=$K" -d 'action=invite&email=x@y.zz' $B/admin/action)" 403
check "member has no Admin nav link" "$(get "$K" / | grep -c 'href="/admin"')" 0
check "member sees devices page" "$(get "$K" /devices | grep -c 'Your devices')" 1
check "invite was single use" "$(post "$M" -d 'action=revoke_invite&id=whatever' $B/admin/action)" "303 $B/admin?msg=not_found"

echo "roles and safety"
KID_ID=$(npx wrangler d1 execute lantern --local --json --command "select id from users where email='kid@example.com'" 2>/dev/null | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
MOM_ID=$(npx wrangler d1 execute lantern --local --json --command "select id from users where email='mom@example.com'" 2>/dev/null | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)
check "cannot disable the only manager" "$(post "$M" -d "action=set_disabled&id=$MOM_ID&disabled=1" $B/admin/action)" "303 $B/admin?msg=last_manager"
check "cannot demote the only manager" "$(post "$M" -d "action=set_role&id=$MOM_ID&role=member" $B/admin/action)" "303 $B/admin?msg=last_manager"
check "invalid role ignored" "$(post "$M" -d "action=set_role&id=$KID_ID&role=root" $B/admin/action)" "303 $B/admin?msg=bad_request"
check "promote kid" "$(post "$M" -d "action=set_role&id=$KID_ID&role=manager" $B/admin/action)" "303 $B/admin?msg=role_changed"
check "promoted user can open /admin" "$(code -H "Cookie: __Host-session=$K" $B/admin)" 200
check "now mom can be demoted" "$(post "$K" -d "action=set_role&id=$MOM_ID&role=member" $B/admin/action)" "303 $B/admin?msg=role_changed"
check "demoted manager loses /admin immediately" "$(code -H "Cookie: __Host-session=$M" $B/admin)" 403
check "demote kid back (kid is last manager now: blocked)" "$(post "$K" -d "action=set_role&id=$KID_ID&role=member" $B/admin/action)" "303 $B/admin?msg=last_manager"

echo "devices"
K2=$(login kid@example.com)
check "second kid device signs in" "$([ -n "$K2" ] && echo y)" y
check "kid sees two devices" "$(get "$K2" /devices | grep -o 'name="action" value="revoke"' | wc -l | tr -d ' ')" 2 # one revoke form per device
check "sign out others keeps current" "$(post "$K2" -d 'action=revoke_others' $B/devices/action)" "303 $B/devices?msg=others_revoked"
check "old device is dead" "$(code -H "Cookie: __Host-session=$K" $B/devices)" 302
check "current device alive" "$(code -H "Cookie: __Host-session=$K2" $B/devices)" 200
check "disable removes access at once" "$(post "$K2" -d "action=set_disabled&id=$MOM_ID&disabled=1" $B/admin/action)" "303 $B/admin?msg=user_disabled"
check "audit log records actions" "$(get "$K2" /admin | grep -c 'user.updated')" 1


echo "cookie hygiene"
LOGOUT_HDRS=$(curl -s -D - -o /dev/null -X POST -H "$O" -H "Cookie: __Host-session=$K2" $B/auth/logout | grep -i '^set-cookie: __Host-session')
check "logout clears the session cookie" "$(echo "$LOGOUT_HDRS" | grep -ci 'max-age=0')" 1
check "...with Secure (browsers ignore __Host- changes without it)" "$(echo "$LOGOUT_HDRS" | grep -ci '; secure')" 1
check "...HttpOnly and Path=/" "$(echo "$LOGOUT_HDRS" | grep -ci 'httponly' )$(echo "$LOGOUT_HDRS" | grep -ci 'path=/')" 11
check "...and no Domain attribute" "$(echo "$LOGOUT_HDRS" | grep -ci 'domain=')" 0
check "the old session no longer works" "$(code -H "Cookie: __Host-session=$K2" $B/devices)" 302

summary
