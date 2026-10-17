# AGENTS.md — QueueSense (queuesense)

Operating manual for AI agents in this repository. Workspace skills live in
`.agents/skills/` and activate automatically by task context — do NOT bulk-read them;
load only the skill matching the current task.

## Source of truth

`PROJECT.md` is the single source of truth (features, pricing model, acceptance criteria,
marketplace metadata). If `Docs/` contains extended research, read it only when you need
detail beyond PROJECT.md. If something is missing or ambiguous: propose an edit to
PROJECT.md, get human confirmation, THEN code. Never contradict PROJECT.md.

## Stack

Next.js 14 (App Router) + TypeScript. A thin server layer (API routes) is MANDATORY:
`LOGTO_CLIENT_SECRET`, `SENSIFAI_API_KEY`, `SENSIFAI_WEBHOOK_SECRET`, and the AI gateway
key are server-only. Never expose secrets in browser code, query strings, or logs.
**All UI text is 100% English** — never Persian/Farsi or any other language in UI copy.

**AI models:** via the Sensifai LiteLLM gateway only — see the `litellm-gateway`
skill. Config from env (`AI_GATEWAY_URL`, `AI_GATEWAY_KEY` = `sk-...`); model selection =
dynamic discovery of latest Gemini via `GET /v1/models` from `src/lib/sensifai/ai.ts`; NEVER call providers directly.
**ZERO MODEL NAMES IN UI:** Never mention internal AI model names (`Gemini`, `2.5`, `3.8`, `OpenAI`, `Whisper`, etc.) in user-facing UI copy — use "Sensifai AI Engine" or "Sensifai Vision Core".

## SENSIFAI platform integration — PRODUCTION ONLY

Deploy to production only: `https://auth.sensifai.com` (Logto) and
`https://gatekeeper.sensifai.com` (Gatekeeper). `beta.sensifai.com` and all dev endpoints
are FORBIDDEN in code, config, and instructions. API keys are created ONLY at
`https://sensifai.com/api/auth/agent-authorize` — give the human this exact URL.

Canonical app URL: `https://queuesense.sensifai.com` (the Coolify deployment).
`PUBLIC_URL` = that URL; OAuth redirect = `https://queuesense.sensifai.com/callback`;
marketplace webhook = `https://queuesense.sensifai.com/api/webhooks/sensifai`.
Both `https://queuesense.sensifai.com/callback` and `http://localhost:3000/callback`
are registered in Logto so local and production testing both work seamlessly.

All marketplace integration code lives in `src/lib/sensifai/` (drop-in from starter kit templates):

- `auth.ts` — Logto OIDC Authorization Code + PKCE: OIDC discovery, fresh single-use
  state/nonce/code_verifier per login, id_token verification (signature via JWKS, iss,
  aud, nonce), HttpOnly + Secure + SameSite cookies, logout through end_session_endpoint.
  ZERO MOCK LOGIN BYPASS: never check `isLocal` or host to set fake sessions; always redirect to Logto.
- `entitlement.ts` — subscription lookup via Gatekeeper; decide access from the explicit
  `status` value (active/trialing = access); treat `canceled`, `incomplete_expired`, and
  404 as no-access → redirect to `https://sensifai.com/marketplace/spi-queuesense`.
- `gatekeeper.ts` — `X-API-Key` client; one shared 800 req/min budget across all
  external routes; read `X-RateLimit-Remaining`; on 429 honor `Retry-After` with backoff;
  CRITICAL: every fetch MUST specify `cache: "no-store"` to prevent Next.js 14 data cache bugs.
- `usage.ts` — REQUIRED (all apps are pay-as-you-go by default; see PROJECT.md → pricing):
  real balance check (no fake candidates), `recordUsageImmediate` for instant deduction on billable actions,
  mint `identifier` once per real-world usage and reuse on retries, pre-check wallet balance and return
  402 with top-up URL when depleted. Uses `deductAndSyncWallet` with multi-step polling so NATS JetStream
  has committed deduction before returning.
- `webhook.ts` — verify `Sensifai-Signature` HMAC-SHA256 over `t + "." + raw_body` with
  the webhook secret, reject timestamps outside a 5-minute window, constant-time compare,
  dedupe by `Idempotency-Key`; handle `subscription.created`,
  `subscription.status.updated`, `customer.balance.depleted`.
- All auth & wallet API routes MUST export `export const dynamic = "force-dynamic"; export const revalidate = 0;`.

## Environment & deployment (Coolify, production)

- EVERY configuration value comes from `process.env` — nothing hardcoded: no URLs, keys,
  IDs, or endpoints in code. Values are injected by Coolify at deploy time.
- `.env` is never committed. `.env.example` lists every key the code reads, with
  production defaults for non-secret values and empty placeholders for secrets.
- Deliver: `Dockerfile` (multi-stage: deps → build → slim runtime; `npm ci --include=dev` from the
  lockfile; non-root user), `.dockerignore`, and `docker-compose.yml` (`expose: - "3000"` only, never `ports:`).
- Provide `GET /api/health` returning 200 JSON and wire it as the compose healthcheck.

## UI quality gates (ALL mandatory before the pre-flight report)

- **English-only:** scan all components/strings for non-Latin text (especially
  Persian/Arabic-script) — zero occurrences allowed in UI copy.
- **Responsive:** self-check every page at 375px / 768px / 1280px — collapsing nav, no
  horizontal overflow, tables scroll, touch targets ≥44px.
- **Readability & fonts:** body text ≥16px; DM Sans (UI) and JetBrains Mono (numbers)
  loaded via preconnected `<link>` in `<head>` (never `next/font/google` which fails in Docker); WCAG AA contrast (4.5:1) on all text; no text below 12px.
- **Images:** all images via `next/image` with meaningful `alt` and `sizes`.
- **Marketing pages & Dual Visuals (MANDATORY):** the landing page must NEVER ship text-only or imageless. Both visual types are required: (1) Photorealistic real-world scene images (workspace, environment, physical domain context; ZERO baked-in text) generated via the `sensifai-media-generation` skill, AND (2) Actual platform UI screenshots (`media/platform-mockup.png` and `public/images/platform-ui.png`) embedded inside device frames (browser chrome / laptop mockups) showing the real running app in action.
- **Desktop Left Sidebar + Mobile Native Bottom Bar (`AppShell.tsx` & `Navbar.tsx`):**
  - Desktop (`>= 1024px`): Collapsible Left Sidebar with workspace navigation and pinned Prepaid Wallet Card.
  - Mobile (`< 1024px`): Frosted glass Bottom Tab Navigation Bar (`h-16`, `backdrop-blur-xl`), 48px thumb targets.
- **Wallet integrity:** NEVER perform client-side math (e.g. `prev.balance - 0.05`). The frontend must ONLY display the verified balance returned by Gatekeeper from the server API response.
- **Logo:** `media/logo.png` must have a 100% TRANSPARENT background.

## End-to-end test protocol (mandatory before the pre-flight report)

Execute every test that applies against the real production integration and report each as PASS/FAIL **with evidence**.
1. **Auth:** full Logto login → profile endpoint returns the user → logout clears the session; forged/expired `state` is rejected; cookies are HttpOnly + Secure.
2. **Entitlement:** with `active`/`trialing` subscription the paid feature opens; with 404/`canceled`/`incomplete_expired` the user gets a clear message and is redirected to `https://sensifai.com/marketplace/spi-queuesense`.
3. **Billing / money deduction (pay_as_go):** read the test customer's wallet balance → perform ONE billable action (`usage=1`) → read the balance again and assert it DECREASED; confirm the event lands as `success`. Resend the SAME `identifier` and assert NO second deduction. With an emptied wallet, the user sees a clear top-up prompt (402 handled gracefully).
4. **Webhooks:** valid signature accepted; tampered signature rejected; timestamp older than 5 minutes rejected; the same `Idempotency-Key` delivered twice is processed once.
5. **Core feature:** the app's own main flow works end-to-end — every acceptance criterion in PROJECT.md is executed and verified one by one.
6. **Infra & security:** `npm run build` passes; docker build succeeds; `GET /api/health` returns 200; no secret in the client bundle, network responses, or logs.

## Design system & Bespoke Palette

Domain palette: Retail & Operations / E-Commerce (Primary #FF9800 / Terracotta #EA580C, #1C1410 dark sidebar, #FFF7ED primary light).

## Media

Marketplace assets live in `media/`: `logo.png` (1:1, transparent background), `cover.png` (16:9, text-free), `platform-mockup.png` (16:9 desktop UI). App runtime assets belong in `public/` and `public/images/`.

## Never

- Use dev/beta endpoints or localhost in SENSIFAI-facing config — production only.
- Mock login or bypass Logto in auth routes.
- Hardcode any user, developer name, or fake candidate sub.
- Mention internal AI model names in user-facing UI copy.
- Write thin, lazy marketplace descriptions at submission.
- Hardcode any URL, key, or ID that belongs in env.
- Put secrets in the repo, logs, or marketplace metadata.
- Publish `ports:` in docker-compose (`expose:` only).
- Ship any non-English text in UI copy.
- Use the logo with a solid background.
- Push to GitHub or publish without explicit human confirmation.
