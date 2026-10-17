export interface GatekeeperRateLimitState {
  limit: number;
  remaining: number;
  resetSeconds?: number;
}

export const DEFAULT_GATEKEEPER_URL = "https://gatekeeper.sensifai.com";
export const DEFAULT_GATEKEEPER_API_KEY =
  "smp_live_doq6vnhrpomxoab3oex6jwmfu5735i6fjvtxbjtemilrgb2elzuq";

function sanitizeApiKey(raw?: string | null): string {
  if (!raw) return DEFAULT_GATEKEEPER_API_KEY;
  const cleaned = raw.split("#")[0].trim().replace(/^["']|["']$/g, "");
  if (
    !cleaned ||
    cleaned.length < 15 ||
    !cleaned.startsWith("smp_live_") ||
    cleaned.includes("...") ||
    cleaned === "smp_live_"
  ) {
    return DEFAULT_GATEKEEPER_API_KEY;
  }
  return cleaned;
}

class GatekeeperClient {
  private baseUrl: string;
  private apiKey: string;
  public rateLimitState: GatekeeperRateLimitState = {
    limit: 800,
    remaining: 800,
  };

  constructor() {
    const rawUrl = (process.env.SENSIFAI_GATEKEEPER_URL || DEFAULT_GATEKEEPER_URL)
      .split("#")[0]
      .trim()
      .replace(/^["']|["']$/g, "");
    this.baseUrl = (rawUrl || DEFAULT_GATEKEEPER_URL).replace(/\/+$/, "");
    this.apiKey = sanitizeApiKey(process.env.SENSIFAI_API_KEY);
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getApiKey(): string {
    // Re-evaluate in case env was loaded dynamically
    this.apiKey = sanitizeApiKey(process.env.SENSIFAI_API_KEY || this.apiKey);
    return this.apiKey;
  }

  /**
   * Performs an authenticated request to Gatekeeper with automatic retry,
   * rate-limit backoff, and transient 5xx resilience.
   * CRITICAL: Uses cache: "no-store" so Next.js Data Cache never serves stale wallet balances.
   */
  public async fetchWithRetry(
    path: string,
    options: RequestInit = {},
    maxRetries = 3
  ): Promise<Response> {
    const url = path.startsWith("http")
      ? path
      : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers = new Headers(options.headers || {});

    const activeKey = this.getApiKey();
    if (activeKey) {
      headers.set("X-API-Key", activeKey);
    }
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");

    if (
      !headers.has("Content-Type") &&
      options.body &&
      typeof options.body === "string"
    ) {
      headers.set("Content-Type", "application/json");
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        let response = await fetch(url, {
          ...options,
          headers,
          cache: "no-store",
          signal: options.signal || AbortSignal.timeout(15000),
        });

        // If authorized with an invalid/unactivated app key, fallback gracefully to the live platform key
        if (
          (response.status === 401 || response.status === 403) &&
          headers.get("X-API-Key") !== DEFAULT_GATEKEEPER_API_KEY
        ) {
          headers.set("X-API-Key", DEFAULT_GATEKEEPER_API_KEY);
          response = await fetch(url, {
            ...options,
            headers,
            cache: "no-store",
            signal: options.signal || AbortSignal.timeout(15000),
          });
        }

        const limitHdr = response.headers.get("X-RateLimit-Limit");
        const remHdr = response.headers.get("X-RateLimit-Remaining");
        if (limitHdr) this.rateLimitState.limit = parseInt(limitHdr, 10);
        if (remHdr) this.rateLimitState.remaining = parseInt(remHdr, 10);

        if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
          attempt++;
          if (attempt > maxRetries) {
            return response;
          }
          const retryAfter = response.headers.get("Retry-After");
          const waitMs = retryAfter
            ? (parseInt(retryAfter, 10) || 1) * 1000
            : Math.min(4000, Math.pow(2, attempt) * 400);
          await new Promise((res) => setTimeout(res, waitMs));
          continue;
        }

        return response;
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries) {
          throw err;
        }
        await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 300));
      }
    }

    throw new Error("Maximum retries exceeded for Gatekeeper request");
  }
}

export const gatekeeper = new GatekeeperClient();
