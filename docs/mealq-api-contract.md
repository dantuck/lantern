# MealQ API contract for the Family Dashboard

The dashboard's **MealQ plugin** shows a household's meal plan. It needs one new read-only endpoint on the MealQ API and a way to issue a scoped token for it. This document is the contract the plugin is built and tested against. `test/fixtures/mealq-meal-plan.json` is a conforming response; the MealQ API's own tests can validate against the same file.

The dashboard only ever sends `GET`. It never writes to MealQ.

## Authentication

- `Authorization: Bearer <token>` with an opaque, high-entropy **read-only token**.
- Scope: `mealplan:read`, bound to **exactly one household**. The token must not allow any write, and must not reveal anything about other households or members.
- Revocable by a household manager in MealQ; MealQ should store only a hash of it.
- Long-lived is fine (the dashboard cannot do interactive login), so rotation and revocation matter more than expiry.

## Request

```
GET https://{api-host}/v1/households/{householdId}/meal-plan?from=2026-10-03&to=2026-10-09
Authorization: Bearer <token>
Accept: application/json
```

| Param | Meaning |
|---|---|
| `householdId` | The household the token is bound to. A different id returns `404` (not `403`, so ids can't be probed). |
| `from`, `to` | Inclusive calendar dates (`YYYY-MM-DD`) in the household's own calendar. Range is at most 31 days. |

The dashboard sends no cookies and follows no cross-host redirects, so the endpoint must answer directly over HTTPS.

## Response `200`

```json
{
  "days": [
    {
      "date": "2026-10-03",
      "meals": [
        { "id": "m_1", "slot": "dinner", "title": "Chicken tacos", "note": "Double the salsa" }
      ]
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `days[]` | array | At most 31. Days with no meals may be omitted or sent with `"meals": []`. |
| `days[].date` | string | `YYYY-MM-DD`, within `from`..`to`. |
| `days[].meals[]` | array | At most 20 per day. |
| `meals[].id` | string | Stable id, at most 64 chars. |
| `meals[].slot` | string | One of `breakfast`, `lunch`, `dinner`, `snack`. Anything else is shown as "Other". |
| `meals[].title` | string | 1 to 200 chars. The recipe or meal name. |
| `meals[].note` | string, optional | At most 300 chars. |

**Do not include** member emails or names, ingredient or shopping lists, recipe URLs, or anything else not listed above. The dashboard ignores unknown fields, but they still travel over the wire and sit in a cache for up to 24 hours.

## Errors

| Status | Meaning | Dashboard behaviour |
|---|---|---|
| `401` | Missing, invalid or revoked token | Shows last saved plan, or "couldn't load" |
| `404` | Unknown household | same |
| `429` | Rate limited (send `Retry-After`) | same |
| `5xx` | MealQ trouble | same |

The dashboard caches a successful response for 15 minutes, so expected load is about 4 requests per hour per household.

## Dashboard setup once the endpoint exists

1. In `dashboard.config.ts`, set the MealQ plugin's `apiHost` to the API's hostname (no scheme, port or path) and its `timeZone`.
2. `npx wrangler secret put MEALQ_API_TOKEN` and `npx wrangler secret put MEALQ_HOUSEHOLD_ID`.

The plugin may talk to that one host only, over HTTPS.
