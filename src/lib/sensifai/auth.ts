import { createRemoteJWKSet, jwtVerify } from "jose";
import crypto from "crypto";
import { NextRequest } from "next/server";

export interface LogtoUserSession {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  expiresAt?: number;
  user?: any;
  username?: string;
  nickname?: string;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  issuer: string;
}

let cachedDiscovery: OidcDiscovery | null = null;
let discoveryFetchedAt = 0;
const DISCOVERY_TTL = 3600 * 1000; // 1 hour

export const DEFAULT_LOGTO_CLIENT_ID = "6c31pa37h3l3a1v3lje1c";
export const DEFAULT_LOGTO_ENDPOINT = "https://auth.sensifai.com";

function isPlaceholderValue(val?: string | null): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return (
    trimmed === "" ||
    trimmed.includes("...") ||
    trimmed.startsWith("<") ||
    trimmed.startsWith("[") ||
    trimmed.toLowerCase() === "changeme" ||
    trimmed.toLowerCase() === "your_client_id" ||
    trimmed.toLowerCase() === "your_client_secret"
  );
}

/**
 * Resolves the safe base URL for OIDC redirects.
 * - On localhost / 127.0.0.1: returns http://localhost:<port> so local testing works seamlessly.
 * - On production: returns canonical https://<app_id>.sensifai.com (from PUBLIC_URL or x-forwarded-host).
 */
export function getSafeBaseUrl(req?: NextRequest): string {
  const forwardedHost = req?.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = req?.headers.get("host")?.trim();
  const host = forwardedHost || hostHeader || "";

  // 1. Seamless local development & E2E verification support
  if (host && (host.includes("localhost") || host.includes("127.0.0.1"))) {
    const proto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  // 2. Configured canonical production URL
  const envUrl = (process.env.PUBLIC_URL || "").split("#")[0].trim();
  if (
    envUrl &&
    !isPlaceholderValue(envUrl) &&
    !envUrl.includes("0.0.0.0") &&
    !envUrl.includes("localhost") &&
    !envUrl.includes("127.0.0.1")
  ) {
    return envUrl.replace(/\/+$/, "");
  }

  // 3. Dynamic production host header (excluding container internal bind addresses)
  if (host && !host.includes("0.0.0.0") && !host.startsWith("10.") && !host.startsWith("172.")) {
    const proto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  if (envUrl && !isPlaceholderValue(envUrl)) {
    return envUrl.replace(/\/+$/, "");
  }

  return "https://sensifai.com";
}

export function decodeSession(raw?: string | null): LogtoUserSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    if (json.startsWith("{")) return JSON.parse(json);
  } catch {}
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    if (json.startsWith("{")) return JSON.parse(json);
  } catch {}
  return null;
}

/**
 * Extracts the authenticated customer's Logto `sub` ID from request cookies or headers.
 * Never returns mock or hardcoded fallback IDs.
 */
export function getUserIdFromRequest(req: NextRequest): string | null {
  const customerHeader = req.headers.get("X-Sensifai-Customer-Id")?.trim();
  if (customerHeader && !isPlaceholderValue(customerHeader)) {
    return customerHeader;
  }

  const raw =
    req.cookies.get("sensifai_session")?.value ||
    req.cookies.get("app_session")?.value;
  if (raw) {
    const session = decodeSession(raw);
    const sub = session?.sub || (session as any)?.user?.sub;
    if (sub && typeof sub === "string" && sub.trim().length > 0) {
      return sub.trim();
    }
  }

  const cookieUserId = req.cookies.get("sensifai_user_id")?.value?.trim();
  if (cookieUserId && !isPlaceholderValue(cookieUserId)) {
    return cookieUserId;
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const decoded = decodeSession(token);
    if (decoded?.sub) return decoded.sub;
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
        if (payload.sub && typeof payload.sub === "string") return payload.sub;
      }
    } catch {}
  }

  return null;
}

export async function getOidcDiscovery(): Promise<OidcDiscovery> {
  const now = Date.now();
  if (cachedDiscovery && now - discoveryFetchedAt < DISCOVERY_TTL) {
    return cachedDiscovery;
  }

  const rawEndpoint = (process.env.LOGTO_ENDPOINT || DEFAULT_LOGTO_ENDPOINT).split("#")[0].trim();
  const endpoint = isPlaceholderValue(rawEndpoint) ? DEFAULT_LOGTO_ENDPOINT : rawEndpoint;
  const base = endpoint.replace(/\/+$/, "");
  const discoveryUrl = `${base}/oidc/.well-known/openid-configuration`;

  try {
    const res = await fetch(discoveryUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch OIDC discovery: ${res.statusText}`);
    }
    const data = (await res.json()) as OidcDiscovery;
    cachedDiscovery = data;
    discoveryFetchedAt = now;
    return data;
  } catch {
    return {
      authorization_endpoint: `${base}/oidc/auth`,
      token_endpoint: `${base}/oidc/token`,
      userinfo_endpoint: `${base}/oidc/me`,
      jwks_uri: `${base}/oidc/jwks`,
      end_session_endpoint: `${base}/oidc/session/end`,
      issuer: `${base}/oidc`,
    };
  }
}

export function generatePkce() {
  const code_verifier = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(code_verifier).digest();
  const code_challenge = hash.toString("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(16).toString("hex");
  return { code_verifier, code_challenge, state, nonce };
}

export function validateOidcState(
  receivedState?: string | null,
  cookieState?: string | null
): { valid: boolean; error?: string } {
  if (!receivedState || !cookieState) {
    return { valid: false, error: "missing_state" };
  }
  if (receivedState !== cookieState) {
    return { valid: false, error: "state_mismatch" };
  }
  return { valid: true };
}

export function getLogtoClientId(): string {
  const envId = (process.env.LOGTO_CLIENT_ID || "").split("#")[0].trim();
  if (isPlaceholderValue(envId)) {
    return DEFAULT_LOGTO_CLIENT_ID;
  }
  return envId;
}

export function getLogtoClientSecret(): string {
  const rawSecret = (process.env.LOGTO_CLIENT_SECRET || "").split("#")[0].trim();
  if (isPlaceholderValue(rawSecret)) {
    return "";
  }
  return rawSecret;
}

export async function verifyIdToken(idToken: string, expectedNonce?: string): Promise<any> {
  const discovery = await getOidcDiscovery();
  const JWKS = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const clientId = getLogtoClientId();

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: discovery.issuer,
    audience: clientId,
    clockTolerance: 120, // 2 minutes clock skew tolerance
  });

  if (expectedNonce && payload.nonce && payload.nonce !== expectedNonce) {
    throw new Error("Nonce mismatch in ID token");
  }

  return payload;
}

export async function getUserInfo(accessToken: string): Promise<any> {
  const discovery = await getOidcDiscovery();
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`UserInfo failed: ${res.status}`);
  return await res.json();
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
) {
  const discovery = await getOidcDiscovery();
  const clientId = getLogtoClientId();
  const clientSecret = getLogtoClientSecret();

  const buildParams = (includeSecretInBody: boolean) => {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);
    params.append("client_id", clientId);
    params.append("code_verifier", codeVerifier);
    if (includeSecretInBody && clientSecret) {
      params.append("client_secret", clientSecret);
    }
    return params;
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (clientSecret) {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }

  let res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers,
    body: buildParams(false).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  // Fallback: if Basic auth fails with 401 (e.g. public client or client_secret_post), retry with body/PKCE-only
  if (res.status === 401 && clientSecret) {
    res = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildParams(true).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    id_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
  };
}
