---
name: get-customer-subscription
description: How a third-party marketplace application looks up a customer's subscription and price-model detail for its own app, displays it in its own dashboard, and handles the case where the customer has no subscription yet (show a message and redirect to the application's marketplace page). Use whenever building or debugging a third-party app's "my plan"/billing dashboard view, or any entitlement check that depends on subscription status.
---

# Showing a customer's subscription in your own dashboard

## What this is

A third-party marketplace application can look up one of its customers' subscriptions directly,
using the customer's Logto user ID. This is how an application builds its own "my plan" / billing
page instead of sending the customer back to the marketplace site for that — you fetch the
subscription and its price model, then render whatever UI fits your app.

This call is authenticated with your application's API key (`X-API-Key`), the same key used for
usage reporting. It is always scoped to your own application — you cannot look up a subscription
for any other application with your key.

## Getting the subscription

`GET /api/v1/external/subscriptions/{logto_id}`

- `logto_id` is the customer's Logto user ID (the same identity value you already have from
  authenticating that customer in your own app).
- On success you get the subscription's status, its current billing period, trial dates (if any),
  cancellation state, currency, and the attached price model (name, pricing type, amount/tiers,
  billing interval).
- Use the price-model detail to show the customer what plan they're on and what it costs; use the
  subscription fields to show renewal/trial dates and whether they're mid-cancellation.

The response is cached briefly per application, so don't expect it to reflect a checkout that
completed a second ago — if you need to confirm a just-completed checkout, rely on your own
post-checkout flow (redirect/webhook) rather than polling this endpoint in a tight loop.

## Reading the status correctly

A subscription row existing does not mean the customer currently has access — check the status
value itself:

- `active` / `trialing` — customer should have access.
- `past_due`, `unpaid` — payment is failing; the row still exists but you should treat access as
  at risk or already revoked, per your own app's policy.
- `canceled`, `incomplete_expired` — no access; this is functionally the same situation as "no
  subscription" for the purposes of the redirect flow below.
- `incomplete` — checkout was started but not finished; the customer hasn't paid yet.
- `paused` — subscription exists but billing/access is paused.

Decide your app's access rule from this status value explicitly. Don't infer access just from the
presence of a response.

## Handling Tiered Pay-As-You-Go (`tier_pay_as_go`)

Applications can offer a `tier_pay_as_go` pricing model, which often includes a "free tier" acting as a usage-based trial (e.g., the first 10 calls are free, and subsequent calls cost a specific unit price).

When a customer is on this plan:
- Look at `price_model.model_type` which will be `tier_pay_as_go`.
- The `price_model.tiers` array defines the pricing structure. For example, a free tier might be represented as `{"up_to": 10}` with no `unit_amount` or `unit_amount_decimal` (meaning free), and the next tier as `{"up_to": 10000, "unit_amount": 10000, "unit_amount_decimal": 0.01}`. Note that for pay-as-you-go pricing, `unit_amount_decimal` is often the more precise and commonly used field for the unit cost.
- Do not solely rely on the subscription's `trial_end` or `status == "trialing"` for trial status if your application offers this type of usage-based free tier, as the "trial" is volume-based rather than time-based. Instead, track the customer's usage against the free tier limit.

## Handling "no subscription"

If the customer has never subscribed to your application, the lookup returns a not-found response
instead of a subscription. When that happens:

1. Don't show a billing dashboard with empty/placeholder data — show the customer a clear message
   that they don't have an active subscription for this application.
2. Redirect (or link) the customer to your application's page on the marketplace site, so they can
   subscribe:

   ```
   https://sensifai.com/marketplace/spi-{app_id}
   ```

   where `{app_id}` is your application's marketplace ID. This sends the customer to the
   marketplace's checkout/plan-selection flow for your app instead of leaving them stuck inside
   your dashboard with no way to subscribe.

Treat `canceled` and `incomplete_expired` statuses the same way for this redirect — the customer
effectively has no usable subscription, even though a row exists.

## Errors

Errors come back as standard problem-details JSON (`type`, `title`, `status`, `detail`, `code`).
The cases specific to this lookup:

- `401` / `403` — missing, malformed, invalid, or revoked API key.
- `400` — missing or malformed `logto_id`.
- `404` — no subscription exists for that customer under your application; follow the "no
  subscription" handling above.

This call shares the same per-application rate limit as the rest of your API-key-authenticated
calls — don't poll it on every page load for every customer; cache it on your own side for at
least the lookup's own cache window, and rely on your post-checkout flow to refresh sooner when
needed.

## Definition of done

1. Subscription detail (status, period, trial, price model) renders in your own dashboard without
   relying on the marketplace site.
2. Access decisions are based on the explicit status value, not just whether the lookup succeeded.
3. A `404`, `canceled`, or `incomplete_expired` result shows a clear "no active subscription"
   message and links/redirects to `https://sensifai.com/marketplace/spi-{app_id}`.
4. The lookup isn't re-fetched more often than the rate limit and cache window comfortably allow.
