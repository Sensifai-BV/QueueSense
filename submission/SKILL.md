---
name: sensifai-marketplace-submission
description: Final stage of the SENSIFAI pipeline — registers, configures, and publishes the application to the SENSIFAI Marketplace via `scripts/marketplace-manage.mjs` or connected MCP tools (deduplicated registration, rich B2B metadata, dual localhost/prod OAuth redirect URIs, branding, consent scopes, €0.05 Pay-As-You-Go price model, secret retrieval into .env, and catalog publish).
---

# SENSIFAI Marketplace Submission & Automated Provisioning

## How to Obtain `SENSIFAI_ACCESS_TOKEN` (Automatic or Manual)

To register the application, create its price model, and fetch its dedicated `LOGTO_CLIENT_ID` and `LOGTO_CLIENT_SECRET`, you need a `SENSIFAI_ACCESS_TOKEN`:

1. **Check `.env` or the kickoff prompt first**: If `SENSIFAI_ACCESS_TOKEN` was already provided, use it directly.
2. **Automatic Browser Retrieval (Preferred when browser tool is available)**:
   - Navigate to `https://sensifai.com/api/auth/agent-authorize` using your browser tool.
   - If the user's browser session is logged into Sensifai, click the **Copy / Generate Token** button on `https://sensifai.com/api/auth/agent-authorize` (or read the displayed token string from the page DOM/clipboard) and save it to `.env` as `SENSIFAI_ACCESS_TOKEN`.
3. **Manual Fallback**:
   - If the browser is not logged in or unavailable, ask the user once:
     *"Please open https://sensifai.com/api/auth/agent-authorize, click the Copy button to copy your token, and paste it here (or let me know if you want to enter the credentials manually)."*

---

## Fast & Error-Free Automated Execution (`scripts/marketplace-manage.mjs`)

Every project bootstrapped from `sensifai-starter-kit` includes `scripts/marketplace-manage.mjs`, which automates the entire registration and credential sync pipeline directly from `PROJECT.md`:

```bash
# Run full registration, price model creation, secret sync into .env, and publish:
SENSIFAI_ACCESS_TOKEN="<token>" node scripts/marketplace-manage.mjs

# Or provision app + Logto credentials + Price ID BEFORE publishing:
SENSIFAI_ACCESS_TOKEN="<token>" node scripts/marketplace-manage.mjs --provision-only
```

### What `scripts/marketplace-manage.mjs` Does Automatically:
1. **Parses `PROJECT.md` directly**: Extracts app name, slug (`app_id`), tagline, rich Overview/Problem/Solution/Capabilities long description, key features, tags, and use cases — never failing if `Docs/sensifai_marketplace_submission.json` is absent.
2. **Provisions LiteLLM Virtual Key (`AI_GATEWAY_KEY`)**: If `AI_GATEWAY_KEY` is missing, automatically generates a dedicated `sk-...` key with a $50 budget on `https://llm.sensifai.com/key/generate`.
3. **Deduplicated App Registration / Update**: Checks `marketplace_list_applications` first. If the app already exists, calls `marketplace_update_application`; otherwise calls `marketplace_register_application`.
4. **Dual OAuth Redirect URIs (Zero Login Errors)**: Automatically registers **both** `https://<app_id>.sensifai.com/callback` AND `http://localhost:3000/callback` in `redirect_uris` and `post_logout_redirect_uris` so Logto OIDC login works seamlessly on both local dev servers and production Coolify deployments.
5. **Default Pay-As-You-Go Pricing (€0.05/request)**: Automatically checks `marketplace_list_price_models` and creates a `pay_as_go` model (`amount: 0.05`, `unit: "REQUEST"`) if none exists, saving the resulting UUID as `SENSIFAI_PRICE_ID`.
6. **Automatic Secret Sync to `.env` & `.env.production`**: Calls `marketplace_get_application_secrets` and writes `LOGTO_CLIENT_ID`, `LOGTO_CLIENT_SECRET`, `SENSIFAI_API_KEY`, `SENSIFAI_WEBHOOK_SECRET`, and `SENSIFAI_PRICE_ID` directly into `.env` and `.env.production`.
7. **Consent Scopes & Publish**: Sets minimal OIDC scopes (`openid`, `profile`, `email`) and publishes the listing to the Sensifai Marketplace catalog.

---

## Manual MCP Tool Rules (When Calling MCP Tools Directly)

If you invoke MCP tools directly instead of (or in addition to) `scripts/marketplace-manage.mjs`, read `references/submission-agent-system-prompt.md` and enforce these non-negotiable rules:

1. **Rich B2B Copy**: Build the listing from `PROJECT.md`'s `marketplace` section in full (Overview / The Problem / The Solution / Key Capabilities / Business Benefits / Use Cases / Who It's For / How It Works / Why This Application). Thin or abbreviated descriptions are a failure.
2. **Redirect URIs**: Always pass `redirect_uris: ["https://<app_id>.sensifai.com/callback", "http://localhost:3000/callback"]` and `post_logout_redirect_uris: ["https://<app_id>.sensifai.com", "http://localhost:3000"]`.
3. **Documentation URL**: Always set `documentation_url: "https://<app_id>.sensifai.com#how-it-works"`.
4. **Verify Every Write**: After registration, pricing creation, and secret retrieval, verify that `.env` and `.env.production` contain the real `LOGTO_CLIENT_ID`, `LOGTO_CLIENT_SECRET`, `SENSIFAI_API_KEY`, `SENSIFAI_PRICE_ID`, and `AI_GATEWAY_KEY`, then re-run `node scripts/test-sensifai.mjs` to confirm live wallet deduction passes with the newly created `SENSIFAI_PRICE_ID`.
