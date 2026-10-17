---
name: price-models
description: How a third-party marketplace application defines, publishes, and manages its price models (flat-rate, tiered, package-based, and prepaid pay-as-you-go/ledger pricing) through the marketplace API. Use whenever building, reviewing, or debugging an application's pricing/catalog setup, checkout pricing, or prepaid billing configuration.
---

# Price models for a marketplace application

## What this is

Every application listed on the marketplace sells access through one or more **price models** —
the marketplace's abstraction over a billable plan, attached to that application's product
catalog. A price model defines how much a customer pays and how that amount is calculated: a
fixed recurring fee, a quantity picked at checkout, or metered usage that deducts from a
customer's prepaid wallet. This skill is for an application owner configuring their own catalog
through the marketplace API — it does not cover how the marketplace implements or stores price
models internally.

An application can hold up to **20 active price models** at a time, of any mix of types. Each
price model belongs to exactly one application and bills in that application's configured
currency.

## The six price model types

| Type                             | Customer picks quantity at checkout? | Billed against reported usage? | Use it for                                                                                                                                    |
|----------------------------------|--------------------------------------|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `flat_rate`                      | No                                   | No                             | Fixed-price subscription plans (Basic/Pro/Ultimate style tiers)                                                                               |
| `tiered_volume`                  | Yes                                  | No                             | A subscription whose price depends on a quantity chosen up front, with one rate applied to the whole quantity based on which tier it falls in |
| `tiered_graduated`               | Yes                                  | No                             | Same as tiered volume, but each tier's portion of the quantity is billed at that tier's own rate (progressive pricing)                        |
| `package_based`                  | Yes                                  | No                             | A fixed price per bundle of units (e.g. "10 seats for €50"), quantity rounded up to whole bundles                                             |
| `pay_as_go`                      | No                                   | Yes                            | Prepaid metered billing charging a flat rate per unit of reported usage, deducting directly from the customer's prepaid wallet/balance        |
| `tier_pay_as_go`                 | No                                   | Yes                            | Prepaid metered billing supporting tiered pricing (up to 10 tiers) based on the customer's usage volume, deducting from the prepaid wallet    |

The two prepaid `*_pay_as_go` types bypass Stripe Checkout and Stripe subscription provisioning entirely. They act as local entitlements that instantly charge against the customer's local prepaid wallet balance (which must be > €0.00 to activate/renew). The application reports usage events, which are rated in real time and deducted from the wallet.

### Flat rate

A subscription-style fixed price, billed every interval regardless of usage.

Example: Basic plan €10/month, Pro plan €30/month, Ultimate plan €100/month.

Required fields: `name`, `amount` (in the smallest currency unit, e.g. cents), `interval`
(`day`/`week`/`month`/`year`), `interval_count` (how many intervals per billing cycle — `1` +
`month` = monthly). Optional: `trial_period` (days).

### Tiered volume

The customer (or the application, on the customer's behalf) selects a quantity at checkout. One
tier applies to the *entire* quantity, chosen by which tier's upper bound (`up_to`) the quantity
falls under. Each tier can combine a flat fee plus a per-unit rate.

Example — SaaS API platform:
- Tier 1: 1–1,000 calls = $0.01/call + $10 flat fee
- Tier 2: 1,001–10,000 calls = $0.008/call + $50 flat fee
- Tier 3: 10,001+ calls = $0.005/call + $100 flat fee

A customer selecting 5,000 calls falls in tier 2: `(5,000 × $0.008) + $50 = $90` total.

Required fields: `name`, `interval`, `interval_count`, `tiered_price` (1–10 tiers, each with
`up_to`, and `flat_amount` and/or `unit_amount`).

### Tiered graduated

Same tier table shape as tiered volume, but the quantity is split across the tiers it passes
through, and each portion is billed at its own tier's rate (progressive, like an income-tax
bracket).

Using the same tier table, a customer at 5,000 calls is billed:
- Tier 1 portion (1,000 calls): `(1,000 × $0.01) + $10 = $20`
- Tier 2 portion (4,000 calls): `(4,000 × $0.008) + $50 = $82`
- Total: `$20 + $82 = $102`

Same required fields as tiered volume.

### Package-based (non-metered)

A fixed price for a fixed-size bundle of units, where the customer chooses how many bundles at
checkout (not driven by reported usage).

Example: €50 per pack of 10 seats; a customer buying 3 packs pays €150 for 30 seats.

Required fields: `name`, `interval`, `interval_count`, `unit_amount` (price per package),
`quantity` (units per package).

### Pay-as-go (Prepaid)

Prepaid metered billing where a flat rate is charged per unit of usage reported by the application. Instead of generating a Stripe subscription invoice at the end of a cycle, each reported unit of usage deducts instantly from the customer's prepaid ledger.

Example: €0.05 per unit of usage. Customer reports 50 units → €2.50 is immediately deducted from their prepaid wallet balance.

Required fields: `name`, `amount` (price per unit in Euros as a float point number, e.g., `0.000001` or `0.05`. Supports up to 6 decimal places with a minimum of `0.000001`). Prepaid models do not take intervals, billing meters, or event names on creation.

### Tier-pay-as-go (Prepaid)

Similar to prepaid pay-as-you-go, but the unit rate depends on the customer's usage volume using a tiered scheme (up to 10 tiers). Usage charges deduct from the customer's prepaid ledger.

Example:
- Tier 1: up to 1,000 units = €0.01/unit
- Tier 2: 1,001–10,000 units = €0.008/unit
- Tier 3: 10,001+ units = €0.005/unit

Required fields: `name`, `tiered_price` (1–10 tiers, each with `up_to`, and `flat_amount` and/or `unit_amount` as float point numbers in Euros with up to 6 decimal places).

## Managing the catalog

A price model goes through a simple lifecycle: **create** it, optionally **publish** the
application's catalog to make it purchasable, and **delete** (deactivate) it when retired.

- Creating a price model registers it against the application but does not by itself make the
  application's offering live — publish the catalog when the application's pricing is ready for
  customers to see and purchase.
- Deleting a price model deactivates it; it stops being offered to new customers but existing
  subscriptions on it are unaffected by the deletion itself (manage subscription transitions
  separately).
- Listing price models returns only the active ones for an application.

## Required authorization

Every price-model endpoint requires a bearer token scoped for the owning application:

- `applications:write` — create or delete a price model.
- `applications:read` — list an application's price models, or fetch one by ID.

The marketplace's standard rate limits apply to all of these calls; expect throttling on bursty
catalog-management scripts and back off on a 429.

## Common validation rules

- `name`: 2–100 characters, required on every create call.
- `amount` / `unit_amount` / `flat_amount`: 
  - For recurring models (`flat_rate`, `tiered_volume`, `tiered_graduated`, `package_based`), these are **integers** in the smallest currency unit (no decimals, no floating point — e.g. `1000` means 10.00 in a two-decimal currency).
  - For prepaid models (`pay_as_go`, `tier_pay_as_go`), these are **float point numbers** representing Euros directly (up to 6 decimal places allowed, minimum of `0.000001`).
- `interval` + `interval_count`: every recurring price model (flat-rate, tiered, package-based) needs both; `interval_count: 1` with
  `interval: month` is "monthly." Prepaid models (`pay_as_go` and `tier_pay_as_go`) do not use intervals.
- `tiered_price`: 1–10 tiers; tiers must be supplied in ascending `up_to` order with no gaps.
- A single application cannot exceed 20 active price models — retire unused ones before adding
  new ones.

## Definition of done for a pricing change
 
 1. Pick the price model type that matches the actual billing shape (fixed subscription vs. prepaid pay-as-you-go vs. tiered).
 2. For prepaid models, verify that the customer ledger and auto-recharge settings are supported for execution (subscriptions will bypass Stripe Checkout entirely).
 3. Double-check amounts are in the correct format (integers in the smallest currency unit for recurring models, or float point numbers with up to 6 decimal places for prepaid models).
 4. Confirm `interval`/`interval_count` matches the intended billing cadence for recurring models.
 5. After the catalog is final for this release, publish it so customers can actually purchase the new plan(s).
 6. Confirm the count of active price models on the application is still within the 20-model cap before scripting bulk creates.
 
+## Autonomous Pipeline Default (Zero Human Halts)
+
+In the autonomous pipeline, the agent defaults to **Prepaid Pay-As-You-Go** (`pay_as_go`)
+at **€0.05 per request/session** (`amount: 0.05`, `unit: "REQUEST"`).
+The agent creates this model automatically during registration and does not halt to ask
+the human for confirmation.
