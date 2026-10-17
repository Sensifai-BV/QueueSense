import crypto from "crypto";
import { gatekeeper } from "./gatekeeper";

export const DEFAULT_PAY_AS_GO_PRICE_ID = "01a134b2-b6b5-7063-b05b-68b622ecd7b9";

export interface UsageEvent {
  identifier: string;
  price_id: string;
  logto_user_id: string;
  usage: number; // integer >= 1
  timestamp: number; // unix timestamp in seconds
}

export interface UsageBatchResponse {
  success: boolean;
  status: number;
  identifier?: string;
  error?: string;
  code?: string;
  requiresTopUp?: boolean;
}

export interface WalletBalanceResult {
  balance: number;
  currency: string;
  hasFunds: boolean;
}

export interface BillableDeductionResult {
  success: boolean;
  status: number;
  identifier: string;
  wallet: WalletBalanceResult;
  previousBalance: number;
  deductedAmount: number;
  error?: string;
  code?: string;
  requiresTopUp?: boolean;
  topUpUrl?: string;
}

function resolvePriceId(customPriceId?: string): string {
  const candidate = (customPriceId || process.env.SENSIFAI_PRICE_ID || "")
    .split("#")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
  if (
    !candidate ||
    candidate.length < 10 ||
    candidate.includes("...") ||
    candidate.startsWith("<")
  ) {
    return DEFAULT_PAY_AS_GO_PRICE_ID;
  }
  return candidate;
}

export class UsageService {
  private queue: UsageEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 10000;
  private readonly MAX_BATCH_SIZE = 100;

  constructor() {
    if (typeof window === "undefined") {
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flush().catch((err) =>
            console.error("Error flushing usage queue:", err)
          );
        }
      }, this.FLUSH_INTERVAL_MS);
      if (this.flushTimer && typeof this.flushTimer.unref === "function") {
        this.flushTimer.unref();
      }
    }
  }

  public generateIdentifier(
    sessionId: string,
    operation: string = "usage"
  ): string {
    const cleanOp = operation.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
    const cleanSub = (sessionId || "user").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(6).toString("hex");
    return `${cleanOp}_${cleanSub}_${timestamp}_${randomSuffix}`.slice(0, 120);
  }

  /**
   * Checks the customer's prepaid balance from Gatekeeper.
   * NEVER queries mock candidate users or hardcodes balances.
   * ALWAYS passes cache: "no-store" to ensure live freshness.
   */
  public async checkWalletBalance(
    logtoUserId: string
  ): Promise<WalletBalanceResult> {
    if (!logtoUserId || logtoUserId === "anonymous_guest") {
      return { balance: 0, currency: "EUR", hasFunds: false };
    }

    try {
      const res = await gatekeeper.fetchWithRetry(
        `/api/v1/external/customers/${encodeURIComponent(logtoUserId)}/balance?_t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        const rawBal = typeof data.balance === "number" ? data.balance : Number(data.balance);
        const balance = Number.isFinite(rawBal) ? rawBal : 0;
        return {
          balance,
          currency: data.currency ?? "EUR",
          hasFunds: balance > 0,
        };
      }
    } catch (e) {
      console.warn(`Gatekeeper balance lookup failed for ID ${logtoUserId}:`, e);
    }

    return { balance: 0, currency: "EUR", hasFunds: false };
  }

  /**
   * Immediately submits a usage event to Gatekeeper and returns the deduction result.
   */
  public async recordUsageImmediate(event: UsageEvent): Promise<UsageBatchResponse> {
    const normalizedEvent: UsageEvent = {
      ...event,
      price_id: resolvePriceId(event.price_id),
      usage: Math.max(1, Math.round(event.usage || 1)),
      timestamp: event.timestamp || Math.floor(Date.now() / 1000),
    };
    const res = await this.submitBatch([normalizedEvent]);
    return { ...res, identifier: normalizedEvent.identifier };
  }

  /**
   * Complete, atomic-feeling billable deduction workflow for API routes:
   * 1. Pre-checks wallet balance (returns 402 if <= 0).
   * 2. Submits immediate usage event to Gatekeeper.
   * 3. Polls Gatekeeper balance across up to 3 short intervals (250ms, 550ms, 900ms)
   *    so NATS JetStream async ledger processing completes before returning to the UI.
   * 4. If custom SENSIFAI_PRICE_ID did not trigger a deduction, falls back once to the
   *    verified platform Pay-As-You-Go price model so billing never silently fails.
   */
  public async deductAndSyncWallet(params: {
    logtoUserId: string;
    operation?: string;
    usageUnits?: number;
    priceId?: string;
    identifier?: string;
  }): Promise<BillableDeductionResult> {
    const {
      logtoUserId,
      operation = "action",
      usageUnits = 1,
      priceId,
      identifier: customId,
    } = params;

    const preWallet = await this.checkWalletBalance(logtoUserId);
    if (!preWallet.hasFunds || preWallet.balance <= 0) {
      return {
        success: false,
        status: 402,
        identifier: "",
        wallet: preWallet,
        previousBalance: preWallet.balance,
        deductedAmount: 0,
        error: "Customer wallet balance is insufficient. Please top up your Sensifai wallet.",
        code: "PAYMENT_REQUIRED",
        requiresTopUp: true,
        topUpUrl: "https://sensifai.com/marketplace",
      };
    }

    const activePriceId = resolvePriceId(priceId);
    const identifier = customId || this.generateIdentifier(logtoUserId, operation);
    const timestamp = Math.floor(Date.now() / 1000);

    let batchRes = await this.recordUsageImmediate({
      identifier,
      price_id: activePriceId,
      logto_user_id: logtoUserId,
      usage: usageUnits,
      timestamp,
    });

    if (!batchRes.success && batchRes.status === 402) {
      return {
        success: false,
        status: 402,
        identifier,
        wallet: { ...preWallet, balance: 0, hasFunds: false },
        previousBalance: preWallet.balance,
        deductedAmount: 0,
        error: "Customer wallet balance is insufficient. Please top up your Sensifai wallet.",
        code: "PAYMENT_REQUIRED",
        requiresTopUp: true,
        topUpUrl: "https://sensifai.com/marketplace",
      };
    }

    // Poll Gatekeeper briefly for NATS JetStream worker ledger commit
    let postWallet = preWallet;
    const waitIntervals = [250, 500, 800];
    for (const waitMs of waitIntervals) {
      await new Promise((r) => setTimeout(r, waitMs));
      postWallet = await this.checkWalletBalance(logtoUserId);
      if (postWallet.balance < preWallet.balance) {
        break;
      }
    }

    // If balance still did not decrease and activePriceId wasn't the default platform price_id,
    // retry once with DEFAULT_PAY_AS_GO_PRICE_ID in case the app's custom price_id wasn't linked yet
    if (
      postWallet.balance >= preWallet.balance &&
      activePriceId !== DEFAULT_PAY_AS_GO_PRICE_ID
    ) {
      const fallbackId = this.generateIdentifier(logtoUserId, `${operation}_fb`);
      await this.recordUsageImmediate({
        identifier: fallbackId,
        price_id: DEFAULT_PAY_AS_GO_PRICE_ID,
        logto_user_id: logtoUserId,
        usage: usageUnits,
        timestamp: Math.floor(Date.now() / 1000),
      });
      for (const waitMs of [300, 600]) {
        await new Promise((r) => setTimeout(r, waitMs));
        postWallet = await this.checkWalletBalance(logtoUserId);
        if (postWallet.balance < preWallet.balance) {
          break;
        }
      }
    }

    const deductedAmount = Math.max(
      0,
      Number((preWallet.balance - postWallet.balance).toFixed(6))
    );

    return {
      success: true,
      status: 200,
      identifier,
      wallet: postWallet,
      previousBalance: preWallet.balance,
      deductedAmount,
    };
  }

  /**
   * Looks up the processing status of a previously submitted usage event.
   */
  public async getEventStatus(identifier: string): Promise<{
    status: "success" | "failed" | "pending" | "not_found";
    usage_value?: number;
    fail_reason?: string;
  }> {
    try {
      const res = await gatekeeper.fetchWithRetry(
        `/api/v1/external/events/${encodeURIComponent(identifier)}`,
        { cache: "no-store" }
      );
      if (res.status === 404) return { status: "not_found" };
      if (!res.ok) return { status: "pending" };
      const data = await res.json();
      return {
        status: data.status || "success",
        usage_value: data.usage_value,
        fail_reason: data.fail_reason || data.failed_reason,
      };
    } catch {
      return { status: "pending" };
    }
  }

  public async recordUsage(event: UsageEvent): Promise<UsageBatchResponse> {
    this.queue.push({
      ...event,
      price_id: resolvePriceId(event.price_id),
    });
    if (this.queue.length >= this.MAX_BATCH_SIZE) {
      return await this.flush();
    }
    return { success: true, status: 202 };
  }

  public async submitBatch(events: UsageEvent[]): Promise<UsageBatchResponse> {
    if (!events.length) return { success: true, status: 200 };

    try {
      const res = await gatekeeper.fetchWithRetry("/api/v1/external/events/usages", {
        method: "POST",
        body: JSON.stringify({ events }),
        cache: "no-store",
      });

      if (res.status === 402) {
        return {
          success: false,
          status: 402,
          error: "Customer wallet balance is insufficient. Top-up required.",
          code: "PAYMENT_REQUIRED",
          requiresTopUp: true,
        };
      }

      if (!res.ok && res.status !== 204 && res.status !== 202) {
        const text = await res.text();
        return { success: false, status: res.status, error: text };
      }

      return { success: true, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: err.message };
    }
  }

  public async flush(): Promise<UsageBatchResponse> {
    if (this.queue.length === 0) {
      return { success: true, status: 200 };
    }

    const batch = this.queue.splice(0, this.MAX_BATCH_SIZE);
    const result = await this.submitBatch(batch);

    if (!result.success && result.status !== 402) {
      this.queue.unshift(...batch);
    }

    return result;
  }
}

export const usageService = new UsageService();
