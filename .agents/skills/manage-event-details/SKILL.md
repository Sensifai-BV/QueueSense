---
name: manage-event-details
description: Deep reference for a third-party marketplace application's usage-event API — reporting usage against prepaid pay-as-you-go price models (pay_as_go, tier_pay_as_go), correcting/adjusting previously sent events, looking events back up, reading hourly/daily usage stats, checking customer wallet balances, and listing failed events. Use whenever implementing or debugging metered/usage-based billing integration, usage reporting bugs, double-counted usage, or customer balance deductions.
---

# Managing usage events for prepaid pay-as-you-go price models

## What this is

If your application sells access through a **prepaid usage-based price model** (`pay_as_go` or
`tier_pay_as_go` — see the `price-models` skill), you are responsible for reporting the usage units
each customer generates. The marketplace does not observe your application's internal activity
directly; it rates and deducts funds based on the usage events you report through this API.

Unlike post-billed Stripe subscription meters, prepaid usage models in Gatekeeper deduct in real time
from the customer's prepaid wallet/ledger balance in Euros. Everything in this skill covers that
reporting and metering lifecycle: sending usage batches, correcting mistakes, querying processing
outcomes, checking customer wallet balances, and monitoring aggregated statistics or failed events.

All routes here are authenticated with your application's `X-API-Key` and operate only on your own
application's events and customers — see `integration-with-gatekeeper` for the auth and rate-limiting
rules shared by all API-key routes (800 requests/minute budget shared across all endpoints).

## The identifier is the whole idempotency model

Every usage event you send carries an `identifier` you generate (5–150 characters). This is the
single mechanism the system gives you for safety, so its discipline matters more than any other
field:

- Generate it once per real-world usage occurrence, before you make the HTTP call. If your HTTP
  call times out or you retry it, **resend the same identifier** — don't mint a new one just
  because the first attempt looked like it failed. Minting a fresh identifier on every retry turns
  a transient network blip into double-billed usage.
- An identifier is scoped to your application, not to any single price model or customer — don't
  reuse one across genuinely different usage occurrences just because they happen to share a
  customer or time window.
- There is no client-visible dedup check on the write path itself — sending two *different* events
  under the same identifier in two separate calls is a logic bug on your side, not something the
  API will catch and merge for you. Treat identifier collisions as something your own code must
  prevent.
- Identifiers are how you look an event back up later (`GET /external/events/{identifier}`) and how
  you reference an event when correcting it (`adjust-usage`'s `cancel_identifier`). Keep them
  around in your own system (e.g. against the order/operation that generated the usage) so you can
  do both later without re-deriving them.

## Reporting usage — `POST /external/events/usages`

This is the primary call. It accepts a **batch** of 1–1000 events in one request:

```json
{
  "events": [
    {
      "identifier": "id_abc1234",
      "price_id": "123e4567-e89b-12d3-a456-426614174000",
      "logto_user_id": "e1zqbrcb1q1x",
      "usage": 1,
      "timestamp": 1780297305
    }
  ]
}
```

- `identifier` — your unique tracking key for this event (5–150 chars).
- `price_id` — the UUID of the active usage-based price model (`pay_as_go` or `tier_pay_as_go`) this usage bills against. It must exist and belong to your application.
- `logto_user_id` — the customer's Logto subject identifier (`sub`). This identifies whose wallet is charged.
- `usage` — the quantity of units consumed for this event, an integer ≥ 1 (e.g., number of API calls, compute seconds, tokens, MB).
- `timestamp` — unix timestamp (seconds) of when the usage actually occurred.

### Synchronous Pre-Validation Check
Before queuing the batch, Gatekeeper performs a synchronous balance check for each customer in the batch. If any customer has no wallet or a wallet balance `≤ 0`, the entire request is rejected immediately with **`402 Payment Required`** (`"customer wallet balance is insufficient"`). This prevents uncollectible usage from entering the pipeline.

### Asynchronous Processing Pipeline
A `204 No Content` response indicates the batch was validated and accepted into the ingestion queue (NATS JetStream). Background workers then process each event:
1. **Subscription Check**: Verifies the customer has an active subscription/entitlement for the specified `price_id`.
2. **Pricing Evaluation**:
   - For `pay_as_go`: Uses the fixed unit rate configured on the price model (in Euros, float up to 6 decimal places).
   - For `tier_pay_as_go`: Computes the customer's cumulative total usage (historical usage + current event usage) to determine the applicable volume tier's unit rate and any tier flat fee.
3. **Ledger Deduction**: Computes `costEUR = round(usage * unitPrice * 1e6) / 1e6`. If `costEUR > 0`, deducts the amount from the customer's prepaid ledger. If `costEUR == 0` (e.g., free tiers), the deduction step is skipped.
4. **Failure Handling**: If downstream deduction fails (e.g. balance was exhausted between the initial check and worker execution, or price model is invalid), the event is recorded with status `failed` and logged in `GET /external/events/failed`.

Practical batching guidance: accumulate usage client-side (in memory or a local queue) and flush on a steady cadence — every few seconds, or every N events, whichever comes first — rather than firing one HTTP call per individual usage unit.

## Correcting usage — `POST /external/events/adjust-usage`

Use this when a previously sent event was wrong — wrong quantity, wrong customer, double-sent, or the underlying operation was reversed/refunded. It is **not** a hard delete; it cancels the previous event and reports a replacement event under a new identifier:

```json
{
  "cancel_identifier": "id_abc1234",
  "identifier": "id_abc1234_corrected",
  "price_id": "123e4567-e89b-12d3-a456-426614174000",
  "logto_user_id": "e1zqbrcb1q1x",
  "usage": 2,
  "timestamp": 1780297999
}
```

- `cancel_identifier` — the `identifier` of the original event you're correcting (5–150 chars).
- `identifier` — a brand-new identifier for the corrected event (must differ from `cancel_identifier`).
- `price_id`, `logto_user_id`, `usage`, `timestamp` — describe the *corrected* event, with the same constraints as the original report.

### Adjustment Execution
Like regular usage reporting, the endpoint validates that the customer's balance is `> 0` before accepting (returning `402 Payment Required` if not). When processed:
- The worker fetches the original event and its calculated unit price.
- It computes the cost difference: `origCostEUR = usage(old) * unitPrice` and `newCostEUR = usage(new) * unitPrice`.
- If `differenceEUR = newCostEUR - origCostEUR` is non-zero, it adjusts the customer's wallet balance (deducting additional funds if positive, or issuing a refund credit if negative).

## Reading a single event back — `GET /external/events/{identifier}`

Look up the processing outcome for one event you sent, by your own `identifier`.

```json
{
  "timestamp": 1780297305,
  "identifier": "id_abc1234",
  "usage_value": 1,
  "status": "success"
}
```

If the event failed downstream processing:

```json
{
  "timestamp": 1780297305,
  "identifier": "id_abc1234",
  "usage_value": 1,
  "status": "failed",
  "fail_reason": "insufficient_balance"
}
```

Because event reporting is asynchronous (`204 No Content`), applications can query this endpoint or `GET /external/events/failed` to verify whether an event succeeded or why it failed.

Cached for 30 seconds per application (`usage_stats` cache).

## Aggregated stats — `GET /external/events/stats/hourly` and `.../stats/daily`

Both return the same response structure (`total_usages`, `total_requests` per bucket), differing only in bucket duration (1 hour vs 1 day).

Query parameters:
- `start_time` (int64, optional) — unix timestamp (seconds) lower bound.
- `end_time` (int64, optional) — unix timestamp (seconds) upper bound.

```json
{
  "total": 2,
  "stats": [
    { "timestamp": 1780290000, "total_usages": 100, "total_requests": 10 },
    { "timestamp": 1780293600, "total_usages": 42, "total_requests": 4 }
  ]
}
```

- `total_usages` is the summed `usage` units across events in that bucket.
- `total_requests` is the total count of reported event items.

Cached for 30 seconds per application.

## Failed events — `GET /external/events/failed`

Paginated list of usage events that failed downstream processing for your application.

Query parameters:
- `start_time` (int64, optional) — unix timestamp lower bound.
- `end_time` (int64, optional) — unix timestamp upper bound.
- `limit` (int, optional, default 10) — 1–100 items per page.
- `offset` (int, optional, default 0) — pagination offset.

```json
{
  "total": 1,
  "events": [
    {
      "timestamp": 1780297305,
      "identifier": "id_abc1234",
      "usage_value": 1,
      "status": "failed",
      "failed_reason": "insufficient_balance"
    }
  ]
}
```

Inspect `failed_reason` for diagnostics (e.g. `"customer not have subscription for this price"`, `"insufficient_balance"`, `"price model not found"`). If failure was caused by a client-side issue (e.g. wrong `price_id`), submit a corrected event via `POST /external/events/adjust-usage`.

Cached for 30 seconds per application.

## Reading customer balance — `GET /external/customers/{logto_id}/balance`

Retrieve the current prepaid wallet balance of a customer by their Logto ID.

- `logto_id` — (path parameter) the customer's Logto user ID (`sub`).

The response returns the current ledger balance of the customer's wallet in **Euros as a floating-point number** (with up to 6 decimal places):

```json
{
  "balance": 15.000000
}
```

Applications should call this API to check a customer's wallet balance before performing costly operations or reporting usage. If a customer's balance is `≤ 0`, usage event reporting will immediately be rejected with `402 Payment Required`.

This endpoint is not cached (live balance lookup).

## How this ties back to the price model

The `price_id` on every event must point to an active prepaid usage price model belonging to your application:
- **`pay_as_go`**: Charges a flat unit rate in Euros (`amount` float with up to 6 decimal places, e.g. `0.000010` EUR/unit).
- **`tier_pay_as_go`**: Charges based on cumulative usage volume across 1–10 tiers. Each tier defines `up_to` (integer boundary) and `unit_amount`/`flat_amount` (float in Euros with up to 6 decimal places).

Unlike subscription-based models where recurring fees are billed as integer cents via Stripe invoices, prepaid usage prices represent fractional Euro rates directly (`float64` in Go DTOs and JSON).

## Errors

Standard problem-details JSON (`type`, `title`, `status`, `detail`, `code`, optionally `errors`):

```json
{
  "type": "/errors/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "customer wallet balance is insufficient",
  "code": "PAYMENT_REQUIRED",
  "timestamp": 1780297305
}
```

| HTTP status | Typical cause on these routes |
|---|---|
| `400` | Validation failure: invalid `usage` (< 1), batch size outside 1–1000, missing/short `identifier`, `identifier == cancel_identifier` on adjustment, invalid timestamps or pagination params. |
| `401` | Missing, malformed, invalid, or revoked `X-API-Key`. |
| `402` | Customer prepaid wallet balance is insufficient (`≤ 0` EUR). Customer must top up their balance before further usage can be reported. |
| `403` | API key is valid format but cannot resolve to an active marketplace application. |
| `404` | Resource not found: event identifier not found (`GET /external/events/{identifier}`) or customer wallet not found. |
| `429` | Rate limit exceeded (800 requests/minute per application API key); inspect `Retry-After` header. |
| `500` | Internal server error; safe to retry with the same identifier. |

## Definition of done for a usage-reporting integration

1. Every `identifier` is generated once per real usage occurrence, stored locally, and reused verbatim on retries.
2. Usage events are batched (1–1000 items) and flushed on a regular schedule rather than 1 HTTP call per single unit.
3. `price_id` points to a valid, active `pay_as_go` or `tier_pay_as_go` price model belonging to your application.
4. Customer wallet balance is checked via `GET /external/customers/{logto_id}/balance` before initiating balance-consuming operations to avoid synchronous `402 Payment Required` rejections.
5. `402 Payment Required` errors are handled by notifying the customer to top up their prepaid wallet.
6. `timestamp` reflects the actual occurrence time (unix seconds), not the reporting time.
7. Downstream async failures are monitored via `GET /external/events/failed` or checked via `GET /external/events/{identifier}`.
8. Corrections are submitted via `POST /external/events/adjust-usage` with a distinct replacement `identifier`.
9. Rate-limit headers and `429`/`Retry-After` responses are respected.
