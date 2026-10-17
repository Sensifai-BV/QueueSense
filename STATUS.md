# STATUS — QueueSense (queuesense)

- **Phase:** DONE
- **Date:** 2026-10-17
- **Target Remote:** `https://github.com/Sensifai-BV/QueueSense.git`
- **Target Branch:** `main`

## Application Identifiers
- **App Slug:** `queuesense`
- **App Name:** `QueueSense`
- **Application UUID:** `01a14999-ad43-7ce1-b8b0-63279620e673`
- **Logto Client ID:** `jm1a99kvk05ke3uds67yg`
- **Logto Client Secret:** `Pud0Ml8Pptpw9pIN8GZQh6Jh3DVLHJHu`
- **Price Model ID:** `01a1499a-204d-7f7b-8863-b9762830a488` (Pay-As-You-Go, €0.05 / REQUEST)
- **Gatekeeper API Key:** `smp_live_doq6vnhrpomxoab3oex6jwmfu5735i6fjvtxbjtemilrgb2elzuq`
- **AI Gateway Key:** `sk-0xPh1sWG-nlUAPcNGX9tyQ` (Virtual Key on `https://llm.sensifai.com`)
- **Canonical Domain:** `https://queuesense.sensifai.com`
- **Marketplace Status:** `Published & Active`

## Platform Quality Gates & Verification
- **Audit Suite (7/7 Gates Passed):**
  1. `Audit 1 (Codebase Integrity)`: Zero mock bypasses, strictly real Logto OIDC, 100% English UI copy.
  2. `Audit 2 (Cache Protection)`: Gatekeeper `cache: 'no-store'`, dynamic route revalidation = 0.
  3. `Test 3 (Auth OIDC PKCE)`: S256 challenge, verifier, state, nonce, live Logto discovery verified.
  4. `Test 4 (Gatekeeper Balance)`: Live customer balance query verified (€5.792).
  5. `Test 4b (Wallet Deduction)`: Live usage event deduction verified (€5.792 → €5.742, -€0.050).
  6. `Test 5 (Webhooks)`: HMAC-SHA256 signature verification & 5-minute replay defense window verified.
  7. `Test 6 (Latest Gemini AI)`: LiteLLM Gateway auto-resolves `vertex_ai/gemini-3.8-flash`, successful inference.
- **Production Build:** `npm run build` succeeds cleanly with Next.js 14 standalone output and 0 TypeScript errors.
- **Visual Assets:** 8/8 present, valid, domain-tailored with transparent alpha logo.
- **Containerization:** `docker-compose.yml` configured with `expose: - "3000"` (zero host port publishing).

## Blockers
None. Ready for production deployment on Coolify.
