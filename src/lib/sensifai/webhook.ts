import crypto from "crypto";

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
  duplicate?: boolean;
}

// In-memory idempotency cache with 24-hour TTL for deduplicating webhook deliveries
const processedIdempotencyKeys = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function pruneIdempotencyCache() {
  const now = Date.now();
  for (const [key, ts] of processedIdempotencyKeys.entries()) {
    if (now - ts > IDEMPOTENCY_TTL_MS) {
      processedIdempotencyKeys.delete(key);
    }
  }
}

export function isDuplicateWebhookEvent(idempotencyKey?: string | null): boolean {
  if (!idempotencyKey) return false;
  pruneIdempotencyCache();
  if (processedIdempotencyKeys.has(idempotencyKey)) {
    return true;
  }
  processedIdempotencyKeys.set(idempotencyKey, Date.now());
  return false;
}

/**
 * Verifies Sensifai marketplace webhook signature.
 * Header format: Sensifai-Signature: t=1700000000,v1=abcdef...
 * Rejects payloads older than 5 minutes (300 seconds) to prevent replay attacks.
 */
export function verifySensifaiWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  webhookSecret?: string,
  idempotencyKey?: string | null
): WebhookVerificationResult {
  const secret = (webhookSecret || process.env.SENSIFAI_WEBHOOK_SECRET || "")
    .split("#")[0]
    .trim();
  if (!secret || secret.includes("...")) {
    return { valid: false, reason: "missing_webhook_secret" };
  }
  if (!signatureHeader) {
    return { valid: false, reason: "missing_signature_header" };
  }

  const parts = signatureHeader.split(",");
  let t: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx !== -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key === "t") t = val;
      if (key === "v1") v1 = val;
    }
  }

  if (!t || !v1) {
    return { valid: false, reason: "malformed_signature_header" };
  }

  const timestamp = parseInt(t, 10);
  if (Number.isNaN(timestamp)) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const now = Math.floor(Date.now() / 1000);

  // 5-minute replay window tolerance (300 seconds)
  if (Math.abs(now - timestamp) > 300) {
    return { valid: false, reason: "timestamp_out_of_window" };
  }

  const bodyBuffer =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const payloadToSign = Buffer.concat([Buffer.from(`${t}.`, "utf8"), bodyBuffer]);

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadToSign)
    .digest("hex");

  try {
    const v1Buf = Buffer.from(v1, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (v1Buf.length !== expectedBuf.length) {
      return { valid: false, reason: "signature_mismatch" };
    }
    const isMatch = crypto.timingSafeEqual(v1Buf, expectedBuf);
    if (!isMatch) {
      return { valid: false, reason: "signature_mismatch" };
    }
    if (idempotencyKey && isDuplicateWebhookEvent(idempotencyKey)) {
      return { valid: true, duplicate: true };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "comparison_error" };
  }
}
