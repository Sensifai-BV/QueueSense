---
name: litellm-gateway
description: >-
  Route ALL AI/LLM calls through Sensifai's self-hosted LiteLLM gateway (`https://llm.sensifai.com`)
  using the drop-in `src/lib/sensifai/ai.ts` client. Automatically discovers and selects the
  LATEST version of Gemini (`vertex_ai/gemini-3.8-flash`, `vertex_ai/gemini-2.5-flash`, etc.),
  handles structured JSON extraction safely, and provisions per-app Virtual Keys.
---

# LiteLLM Gateway (Sensifai Centralized AI Engine)

Sensifai's LiteLLM proxy (`https://llm.sensifai.com`) is the single AI integration point for every Marketplace application. It exposes an **OpenAI-compatible API** (`/v1/...`) authenticated with a per-app **Virtual Key (`AI_GATEWAY_KEY`)**.

## 1. Use the Drop-In `src/lib/sensifai/ai.ts` Client (Zero Model or JSON Errors)

The starter kit copies `src/lib/sensifai/ai.ts` into every project during Phase 0. **Always use `callSensifaiAI` or `callSensifaiAIJson` from `@/lib/sensifai/ai`** instead of writing raw `fetch` or `JSON.parse` calls from scratch:

```ts
import { callSensifaiAI, callSensifaiAIJson } from "@/lib/sensifai/ai";

// 1. Structured JSON output (automatically strips ```json fences & repairs trailing commas):
const { data, modelUsed } = await callSensifaiAIJson<{
  overallScore: number;
  summary: string;
  findings: Array<{ title: string; severity: string; recommendation: string }>;
}>({
  mode: "fast", // "fast" -> latest Gemini Flash | "reasoning" -> latest Gemini Pro/Flash
  messages: [
    { role: "system", content: "Return a valid JSON object with overallScore, summary, and findings." },
    { role: "user", content: userPrompt },
  ],
});
```

### Why `src/lib/sensifai/ai.ts` Eliminates Runtime Bugs:
1. **Dynamic Latest Gemini Model Discovery**: Queries `GET https://llm.sensifai.com/v1/models` and automatically selects the highest-version Gemini model alias permitted for the app's key (e.g., `vertex_ai/gemini-3.8-flash`, `vertex_ai/gemini-2.5-flash`, `gemini-2.5-pro`).
2. **Automatic Model Failover & Retry**: If a specific model alias is temporarily rate-limited or unavailable, it transparently retries with the next best Gemini alias.
3. **Bulletproof JSON Extraction (`extractSafeJson`)**: Strips Markdown code fences (` ```json ... ``` `) and repairs trailing commas so API routes never crash with `SyntaxError: Unexpected token`.

---

## 2. Configuration (Env-Only, Server-Side Only)

```bash
AI_GATEWAY_URL=https://llm.sensifai.com    # Default gateway endpoint
AI_GATEWAY_KEY=sk-xxxxxxxxxxxxxxxx         # Per-app LiteLLM Virtual Key
```

---

## 3. Autonomous Virtual Key Provisioning (Zero Human Interruption)

When bootstrapping a new app, provision the app's dedicated Virtual Key automatically using `node scripts/marketplace-manage.mjs` or via `curl` against `https://llm.sensifai.com/key/generate`:

```bash
curl -s -X POST "https://llm.sensifai.com/key/generate" \
  -H "Authorization: Bearer sk-EGSXOIkl4X2dqQqaBL_Uyw" \
  -H "Content-Type: application/json" \
  -d '{
    "key_alias": "<app_id>",
    "metadata": {
      "app_id": "<app_id>",
      "source": "autonomous-setup"
    },
    "max_budget": 50.0,
    "budget_duration": "30d"
  }'
```

- Store the returned `key` (`sk-...`) in `.env` and `.env.production` as `AI_GATEWAY_KEY`.
- **SECURITY RULE**: The Master Key (`sk-EGSXOIkl4X2dqQqaBL_Uyw`) is used ONLY during initial provisioning. Never commit `.env` or expose the Master Key in application runtime code.

---

## 4. Mandatory Rules

1. **100% Gateway Routing**: All AI calls go through `https://llm.sensifai.com` — never call Google, OpenAI, or Anthropic endpoints directly.
2. **Latest Gemini Models Only**: Always use the latest Gemini model resolved from `GET /v1/models` (handled automatically by `resolveLatestGeminiModel()` in `src/lib/sensifai/ai.ts`).
3. **ZERO Model Names in UI Copy**: Never display internal AI model names (`Gemini`, `2.5`, `3.8`, `OpenAI`, `Whisper`, `Vertex`) anywhere in user-facing UI components, badges, or marketing text. Use enterprise branding like **"Sensifai AI Engine"**, **"Sensifai Vision AI"**, or **"Sensifai Neural Core"**.
4. **Graceful Error Handling**: On 401/403/429/400 Budget Exceeded, return a clean English message (`"Sensifai AI Engine is currently at capacity — please try again shortly"`); never leak API keys or raw stack traces to the client.
