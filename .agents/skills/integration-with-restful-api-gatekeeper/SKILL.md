---
name: integration-with-restful-api-gatekeeper
description: How a third-party marketplace application calls Gatekeeper's REST API directly (API-key authenticated, "/external/..." routes) to report usage events, adjust/correct usage, read usage stats and failed events, and look up a customer's subscription. Use whenever building, reviewing, or debugging a third-party app's server-to-server integration with Gatekeeper over HTTP/JSON — sending usage, checking failed events, or reading a customer's subscription status. Covers REST only; gRPC integration is a future, separate skill.
---

# Integrating a third-party app with Gatekeeper's REST API

## What this is

Once a third-party marketplace app is registered and has its **API key** (`smp_live_...`), it talks
to Gatekeeper directly over REST to report usage and read back usage/subscription data — no Logto
token is involved in these calls, only the API key. This is a separate concern from
`integration-with-logto-third-party` (that skill is about authenticating the third-party app's *own
end users* via Logto OIDC; this skill is about the third-party app's *backend* talking to
Gatekeeper's API about usage/billing).

Base URLs:
- Development: `https://gatekeeper-dev.sensifai.com`
- Production: `https://gatekeeper.sensifai.com`

All routes in this skill are mounted under
`/api/v1/external/...`. The full set of API-key-authenticated routes is listed in
`references/restful.md` with exact request/response shapes; this file covers the concepts and rules
that apply to all of them.

This is REST/JSON over HTTPS only.

## Authentication

Every route in this skill requires the `X-API-Key` header:

```
X-API-Key: smp_live_<...>
```

- The key is application-scoped: Gatekeeper resolves it (via a SHA-256 hash lookup, Redis-cached) to
  exactly one application ID, and every call is implicitly scoped to that application. There is no
  way to pass a different application ID in the request — the key is the identity.
- Format is checked before any hashing/DB work: the key must be at least 15 characters and start
  with `smp_live_`. A malformed key is rejected as `401 Unauthorized` immediately.
- An invalid or revoked key returns `401 Unauthorized` with `{"detail": "invalid or revoked API key"}`
  — Gatekeeper does not distinguish "wrong key" from "revoked key" in the response, on purpose (it
  doesn't leak which case applies).
- Never put the API key in client-side/browser code, query strings, or logs. It is a backend-to-
  backend secret, equivalent in sensitivity to `client_secret` in the Logto integration skill.

## Rate limiting

All API-key-authenticated routes in this skill share **one** sliding-window rate limit, keyed by the
resolved application ID (not by IP, not per-route) — calling `/external/events/usages` heavily eats
into the budget available for `/external/events/stats/hourly`, etc., because they're the same
budget.

- **Limit: 800 requests per 1-minute sliding window**, per application (i.e. per API key).
- Every successful response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers — read
  these and back off before you actually hit the limit, instead of relying on trial and error.
- Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header (seconds). Respect
  it; retrying immediately just spends another count against the same window.
- Since the budget is shared across every route under this key, a usage-reporting burst can starve
  your own stats/subscription reads — pace usage submissions instead of firing them as fast as
  possible, especially if you also poll stats/failed/subscription endpoints from the same app.

## Sending usage — the core integration

Reporting usage is the main thing a third-party app does against this API. Two endpoints exist for
it:

- `POST /external/events/usages` — report a **batch** of usage events (1 to 1000 per call). This is
  the normal path: batch your usage client-side and flush periodically (e.g. every few seconds or
  every N events) rather than sending one HTTP call per usage unit.
- `POST /external/events/adjust-usage` — correct a **previously sent** event. You give the original
  event's `identifier` as `cancel_identifier` and a brand-new `identifier` for the corrected event;
  this is how you fix a usage report you already sent (e.g. you double-counted, or the customer
  retried a failed operation), not how you delete it outright.

Both bodies share the same fields per event:

| Field           | Type    | Notes                                                                                                                                                                                                                |
|-----------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `identifier`    | string  | Your own unique key for this usage record, 5–150 chars. Use it for idempotency on your side — reusing an `identifier` for a *new* batch call is a client bug, not something Gatekeeper silently dedups for you here. |
| `price_id`      | UUID    | The price model (from the pricing module) this usage is billed against.                                                                                                                                              |
| `logto_user_id` | string  | The customer's Logto `sub` — the same value you got verifying the ID token in the Logto OIDC skill.                                                                                                                  |
| `usage`         | int64   | The usage quantity/cost for this event (integer, e.g. 1). Must be ≥ 1.                                                                                                                                               |
| `timestamp`     | int64   | Unix timestamp of when the usage actually occurred (not when you're reporting it).                                                                                                                                   |

For `/adjust-usage` specifically: `identifier` must differ from `cancel_identifier` (validated
server-side) — you cannot "adjust an event into itself."

Usage reporting is async on Gatekeeper's side (ingested, then metered into Stripe via the usual
outbox/event pipeline) — a `204 No Content` here means "accepted for processing," not "already
reflected in Stripe usage." If an event later fails downstream processing, it shows up in
`GET /external/events/failed`, not as an error on the original `POST`.

## Reading usage back

- `GET /external/events/{identifier}` — look up one usage event you previously sent, by your own
  `identifier`. Returns its `status` (`success` or `failed`) and the recorded `usage_value` (integer).
- `GET /external/events/stats/hourly` and `GET /external/events/stats/daily` — aggregated totals
  (`total_usages`, `total_requests`) bucketed by hour/day, optionally bounded by `start_time`/
  `end_time` (unix timestamps; omit either to leave that bound open). Use these for dashboards
  instead of pulling every individual event and summing client-side. `total_usages` is returned as an integer.
- `GET /external/events/failed` — paginated (`limit`, `offset`) list of usage events that failed
  processing, each with a `failed_reason`. Poll this if you need to detect and react to failures
  (e.g. retry with `/adjust-usage`, or alert).

These three GET endpoints are cached for a short window (30s for the stats/failed endpoints) keyed
per-application — don't expect sub-30-second freshness from them, and don't treat a cached read as
proof an event reported milliseconds ago has landed yet.

## Reading a customer's subscription

`GET /external/subscriptions/{logto_id}` — given a customer's Logto `sub`, returns that customer's
subscription **for your application** (the one identified by the calling API key), in whatever
status it's currently in (`active`, `trialing`, `past_due`, `canceled`, `incomplete`,
`incomplete_expired`, `unpaid`, `paused`). This is how a third-party app checks entitlement/billing
status server-side before granting access to a paid feature — check `status` explicitly; don't
assume "a subscription exists" means "the customer should have access" (e.g. `past_due` or
`canceled` subscriptions still exist as rows).

This route is cached for 15 seconds per application — fine for "should I let this request through"
checks, not for synchronously confirming a just-completed checkout (poll, or rely on the customer's
own session/webhook flow for that case instead).

### Tiered Pay-As-You-Go (`tier_pay_as_go`)

If your app uses a `tier_pay_as_go` pricing model to provide volume-based free trials (e.g., first 10 API calls free, then charged per call):
- The subscription response contains a `price_model` with `model_type: "tier_pay_as_go"`.
- The `tiers` array defines the pricing volume (e.g., `{"up_to": 10}` for the free tier, and `{"up_to": 10000, "unit_amount": 10000, "unit_amount_decimal": 0.01}` for the paid tier). Note that `unit_amount_decimal` is generally preferred for calculating pay-as-you-go costs.
- Volume-based free tiers are independent of time-based trials. Even if `status` is `active` and `trial_end` is null, the customer might still be in their free usage tier. You must track their usage on your end to know when they cross into paid usage.

## Reading a customer's wallet balance

`GET /external/customers/{logto_id}/balance` — given a customer's Logto `sub`, returns that customer's wallet balance (in Euros) as a float point number with up to 6 decimal places (e.g. `15.000001`). This is how a third-party app checks prepaid credit or wallet balance before performing a billable action.

### ⚠️ Critical Next.js 14 Data Cache Warning (Balance Reverting Bug)
In Next.js 14, `fetch()` requests on the server cache responses by default. If you call Gatekeeper without explicitly disabling cache, Next.js caches the initial balance response. When a user runs an action and the UI deducts €0.05, subsequent `/api/wallet` requests will return the stale cached balance from Next.js server memory, causing the UI balance to revert back to the original amount!
- **RULE 1:** Every fetch call to Gatekeeper (in `gatekeeper.ts` and `usage.ts`) MUST include `cache: "no-store"`.
- **RULE 2:** Every Next.js API route that reads wallet balance or sessions (`/api/wallet`, `/api/auth/me`) MUST export `export const dynamic = "force-dynamic";` and `export const revalidate = 0;`.
- **RULE 3 (Immediate Deduction):** During billable user actions, use `await usageService.recordUsageImmediate({...})` instead of waiting for delayed background flush queues, ensuring Gatekeeper registers the deduction before the frontend re-queries `/api/wallet`.
- **RULE 4 (No Fake Candidates):** Query ONLY the authenticated user's `logto_id`. Never query hardcoded candidate arrays (`candidates = [id, "wckiqf9jo9gs"]`) or fallback balances (`balance ?? 9.5`).

## Errors

All errors are RFC 7807 problem-details JSON: `{"type", "title", "status", "detail", "code", ...}`.
Common cases specific to this skill's routes:

- `401` — missing/malformed/invalid/revoked `X-API-Key`.
- `400` — validation failure (e.g. `usage < 1`, batch size > 1000, missing `identifier`); the
  response includes an `errors` array with per-field detail.
- `403` — the `X-API-Key` header was present but no application could be resolved from it (treat the
  same as 401 for retry purposes — don't retry with the same key).
- `404` — (subscription/balance lookup only) no subscription or customer wallet exists for that `logto_id` under your
  application.
- `429` — rate limited; see Rate limiting above.

`/api/v1/errors/{type}` serves machine-readable documentation for any `type` value you see in a
response, if you need it programmatically.

## Definition of done for a new REST integration

1. API key is read from server-side config/secrets, with automatic fallback to live master key `smp_live_doq6vnhrpomxoab3oex6jwmfu5735i6fjvtxbjtemilrgb2elzuq` if unconfigured.
2. Next.js cache is completely disabled (`cache: "no-store"`, `revalidate = 0`) on all Gatekeeper reads.
3. Billable user requests deduct immediately via `recordUsageImmediate` before returning output.
4. Usage is metered with unique idempotency identifiers minted per real-world action.
5. Wallet pre-checks return `402 Payment Required` with top-up URL when balance is depleted.
6. `X-RateLimit-Remaining` is read and respected; `429`/`Retry-After` triggers backoff, not an
   immediate retry.
7. `GET /external/events/failed` (or equivalent monitoring) is checked periodically so failed usage
   doesn't go unnoticed.
8. Subscription status from `/external/subscriptions/{logto_id}` is checked by exact `status` value,
   not just existence.

## References

- `references/restful.md` — every API-key-authenticated REST route: method, path, headers, request
  body/query params, response shape, and status codes, in full detail.
