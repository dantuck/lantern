# MealQ API contract for Lantern

The dashboard's **MealQ plugin** shows a household's meal plan. It needs one new read-only endpoint on the MealQ API and a way to issue a scoped token for it. This document is the contract the plugin is built and tested against. `test/fixtures/mealq-meal-plan.json` is a conforming response; the MealQ API's own tests can validate against the same file.

The dashboard only ever sends `GET`. It never writes to MealQ.

## Authentication

- `Authorization: Bearer <token>` with an opaque, high-entropy **read-only token**.
- Scope: `mealplan:read`, bound to **exactly one household**, which the API takes from the token. The token must not allow any write, and must not reveal anything about other households or members.
- Created by any household member; revocable (and its scope changeable) by its creator or a household manager in MealQ; MealQ should store only a hash of it.
- Long-lived is fine (the dashboard cannot do interactive login), so rotation and revocation matter more than expiry.

## Request

```
GET https://{api-host}/v1/meal-plan?from=2026-10-03&to=2026-10-09
Authorization: Bearer <token>
Accept: application/json
```

| Param | Meaning |
|---|---|
| `from`, `to` | Inclusive calendar dates (`YYYY-MM-DD`) in the household's own calendar. Range is at most 31 days. |

The dashboard sends no cookies and follows no cross-host redirects, so the endpoint must answer directly over HTTPS.

## Response `200`

```json
{
  "days": [
    {
      "date": "2026-10-03",
      "meals": [
        { "id": "m_1", "slot": "dinner", "title": "Chicken tacos", "note": "Double the salsa",
          "ingredients": ["Chicken thighs", "Tortillas"], "prepMinutes": 35, "recipeUrl": "https://recipes.example/tacos" }
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
| `meals[].ingredients` | string[], optional | At most 50 items of 1 to 100 chars. Names only. |
| `meals[].prepMinutes` | integer, optional | 1 to 1440. |
| `meals[].recipeUrl` | string, optional | At most 500 chars, **`https://` only**; anything else fails validation. Shown as an "Open recipe" link. |

The optional fields power the expandable day view. In MealQ they are opt-in per token (Settings → Access Tokens → "Include recipe details"); tokens without it return only the fields above them. Days where no meal has any of them are not expandable.

**Do not include** member emails or names, shopping-list state, or anything else not listed above. The dashboard ignores unknown fields, but they still travel over the wire and sit in a cache for up to 24 hours.

## Errors

| Status | Meaning | Dashboard behaviour |
|---|---|---|
| `401` | Missing, invalid or revoked token | Shows last saved plan, or "couldn't load" |
| `429` | Rate limited (send `Retry-After`) | same |
| `5xx` | MealQ trouble | same |

The dashboard caches a successful response for 15 minutes, so expected load is about 4 requests per hour per household.

## Dashboard setup once the endpoint exists

1. In `dashboard.config.ts`, set the MealQ plugin's `apiHost` to the API's hostname (no scheme, port or path) and its `timeZone`.
2. `npx wrangler secret put MEALQ_API_TOKEN`. No household id is needed; the token identifies the household.

The plugin may talk to that one host only, over HTTPS.
