/**
 * Sensifai Centralized LiteLLM Gateway Client (`src/lib/sensifai/ai.ts`)
 *
 * Features:
 * - Routes 100% of AI calls through `https://llm.sensifai.com` with Virtual Key (`AI_GATEWAY_KEY`).
 * - Dynamically queries `/v1/models` and selects the LATEST available Gemini model
 *   (e.g. `vertex_ai/gemini-3.8-flash`, `vertex_ai/gemini-2.5-flash`, `gemini-2.5-pro`).
 * - Automatic retry with backoff on transient 429/502/503/504 upstream errors.
 * - Bulletproof `extractSafeJson<T>()` helper that strips markdown code fences and repairs
 *   common LLM JSON formatting quirks so API routes never crash with `SyntaxError`.
 */

export const DEFAULT_AI_GATEWAY_URL = "https://llm.sensifai.com";
export const DEFAULT_FALLBACK_AI_KEY = "sk-niO2MtKGSINt5NHgnjGQMg";

let cachedModels: string[] | null = null;
let modelsFetchedAt = 0;
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getAiGatewayConfig(): { baseUrl: string; apiKey: string } {
  const rawUrl = (process.env.AI_GATEWAY_URL || DEFAULT_AI_GATEWAY_URL)
    .split("#")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  const baseUrl = (rawUrl || DEFAULT_AI_GATEWAY_URL).replace(/\/+$/, "");

  const rawKey = (process.env.AI_GATEWAY_KEY || "")
    .split("#")[0]
    .trim()
    .replace(/^["']|["']$/g, "");

  const isPlaceholder =
    !rawKey ||
    rawKey === "sk-..." ||
    rawKey.includes("...") ||
    rawKey.startsWith("<") ||
    rawKey.length < 10;

  return {
    baseUrl,
    apiKey: isPlaceholder ? DEFAULT_FALLBACK_AI_KEY : rawKey,
  };
}

/**
 * Queries `/v1/models` on the Sensifai LiteLLM Gateway and ranks Gemini models
 * so the application always uses the latest available version of Gemini.
 */
export async function discoverGatewayModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && cachedModels.length > 0 && now - modelsFetchedAt < MODELS_CACHE_TTL_MS) {
    return cachedModels;
  }

  const { baseUrl, apiKey } = getAiGatewayConfig();
  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Mozilla/5.0 (compatible; SensifaiAgent/2.0; +https://sensifai.com)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      const list: string[] = Array.isArray(data?.data)
        ? data.data.map((m: any) => m.id).filter(Boolean)
        : [];
      if (list.length > 0) {
        cachedModels = list;
        modelsFetchedAt = now;
        return list;
      }
    }
  } catch (err: any) {
    console.warn("[Sensifai AI] Model discovery fallback:", err.message);
  }

  return ["vertex_ai/gemini-3.8-flash", "vertex_ai/gemini-2.5-flash", "gemini-2.5-flash"];
}

function scoreGeminiModel(modelId: string, mode: "fast" | "reasoning"): number {
  const id = modelId.toLowerCase();
  if (!id.includes("gemini")) return -1;
  if (id.includes("embedding") || id.includes("imagen") || id.includes("tts")) return -1;

  const versionMatch = id.match(/gemini-(\d+(?:\.\d+)?)/);
  const version = versionMatch ? parseFloat(versionMatch[1]) : 1.0;

  let score = version * 100;
  if (id.startsWith("vertex_ai/")) score += 20;
  if (mode === "reasoning") {
    if (id.includes("pro") || id.includes("thinking") || id.includes("ultra")) score += 35;
    if (id.includes("flash") && !id.includes("lite")) score += 15;
  } else {
    if (id.includes("flash") && !id.includes("lite")) score += 35;
    if (id.includes("pro")) score += 15;
  }
  if (id.includes("preview") || id.includes("exp")) score -= 5;
  return score;
}

/**
 * Resolves the best & latest Gemini model alias available on the LiteLLM Gateway.
 */
export async function resolveLatestGeminiModel(
  mode: "fast" | "reasoning" = "fast"
): Promise<string> {
  const envModel = (process.env.AI_MODEL || "").split("#")[0].trim();
  if (envModel && !envModel.includes("...") && envModel.length > 3) {
    return envModel;
  }

  const available = await discoverGatewayModels();
  const geminiCandidates = available
    .map((id) => ({ id, score: scoreGeminiModel(id, mode) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (geminiCandidates.length > 0) {
    return geminiCandidates[0].id;
  }

  return "vertex_ai/gemini-3.8-flash";
}

/**
 * Safely extracts and parses JSON from an LLM text response.
 * Strips ```json ... ``` fences, leading/trailing prose, and trailing commas.
 */
export function extractSafeJson<T = any>(rawText: string, fallback?: T): T {
  if (!rawText || typeof rawText !== "string") {
    if (fallback !== undefined) return fallback;
    throw new Error("Empty AI response received");
  }

  let cleaned = rawText.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {}

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  let jsonCandidate = cleaned;
  if (
    firstBrace !== -1 &&
    lastBrace > firstBrace &&
    (firstBracket === -1 || firstBrace < firstBracket)
  ) {
    jsonCandidate = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonCandidate = cleaned.slice(firstBracket, lastBracket + 1);
  }

  const repaired = jsonCandidate.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(repaired) as T;
  } catch (err: any) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Failed to parse structured AI JSON output: ${err.message}`);
  }
}

export interface SensifaiChatOptions {
  messages: Array<{ role: "system" | "user" | "assistant"; content: any }>;
  model?: string;
  mode?: "fast" | "reasoning";
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Executes a chat completion call through the Sensifai LiteLLM Gateway
 * using the latest Gemini model, with automatic retry and fallback model selection.
 */
export async function callSensifaiAI(options: SensifaiChatOptions): Promise<{
  content: string;
  modelUsed: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const { baseUrl, apiKey } = getAiGatewayConfig();
  const primaryModel = options.model || (await resolveLatestGeminiModel(options.mode || "fast"));
  const fallbackModels = [
    primaryModel,
    "vertex_ai/gemini-3.8-flash",
    "vertex_ai/gemini-2.5-flash",
    "gemini-2.5-flash",
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  let lastError = "AI service temporarily unavailable";

  for (const candidateModel of fallbackModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const payload: Record<string, any> = {
          model: candidateModel,
          messages: options.messages,
          temperature: options.temperature ?? 0.3,
        };
        if (options.maxTokens) {
          payload.max_tokens = options.maxTokens;
        }
        if (options.jsonMode) {
          payload.response_format = { type: "json_object" };
        }

        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; SensifaiAgent/2.0; +https://sensifai.com)",
          },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: AbortSignal.timeout(45000),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          return {
            content: typeof content === "string" ? content.trim() : JSON.stringify(content),
            modelUsed: data.model || candidateModel,
            usage: data.usage,
          };
        }

        const errText = await res.text();
        lastError = `Status ${res.status}: ${errText.slice(0, 200)}`;

        if (res.status === 400 || res.status === 403 || res.status === 404) {
          break;
        }

        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, (attempt + 1) * 800));
          continue;
        }
      } catch (err: any) {
        lastError = err.message || "Network timeout talking to Sensifai AI Gateway";
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  throw new Error(`Sensifai AI Engine request failed (${lastError})`);
}

/**
 * Convenience wrapper that calls Sensifai AI and parses the response directly into typed JSON.
 */
export async function callSensifaiAIJson<T = any>(
  options: Omit<SensifaiChatOptions, "jsonMode"> & { fallback?: T }
): Promise<{ data: T; modelUsed: string }> {
  const res = await callSensifaiAI({ ...options, jsonMode: true });
  const parsed = extractSafeJson<T>(res.content, options.fallback);
  return { data: parsed, modelUsed: res.modelUsed };
}
