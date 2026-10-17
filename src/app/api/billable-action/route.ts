export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/sensifai/auth";
import { usageService } from "@/lib/sensifai/usage";
import { callSensifaiAI } from "@/lib/sensifai/ai";

/**
 * Standard Reference Template for Billable AI Actions in Sensifai Marketplace Apps
 *
 * Flow:
 * 1. Resolve customer `sub` (ID) from request session/cookie/token -> return HTTP 401 if unauthenticated.
 * 2. Pre-check prepaid wallet balance, record immediate usage event in Gatekeeper,
 *    and poll until the NATS JetStream ledger commits the deduction (`deductAndSyncWallet`).
 * 3. Return HTTP 402 with `top_up_url` if wallet balance is insufficient.
 * 4. Run the core AI engine through Sensifai LiteLLM Gateway (`callSensifaiAI` -> latest Gemini model).
 * 5. Return payload WITH `wallet: deduction.wallet` so the client Navbar/AppShell syncs verified live balance.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Strict Authentication Check (Zero Free Guest Execution)
    const sub = getUserIdFromRequest(req);
    if (!sub) {
      return NextResponse.json(
        {
          error:
            "Authentication required to perform billable actions. Please sign in with your Sensifai account.",
          code: "UNAUTHORIZED",
          login_url: "/api/auth/login",
        },
        { status: 401 }
      );
    }

    // 2. Parse request body before billing so invalid empty requests are caught early
    const body = await req.json().catch(() => ({}));

    // 3. Atomic Wallet Pre-Check + Immediate Usage Deduction + Verified Post-Balance Sync
    const deduction = await usageService.deductAndSyncWallet({
      logtoUserId: sub,
      operation: body.operation || "ai_action",
      usageUnits: 1,
    });

    if (!deduction.success && deduction.status === 402) {
      return NextResponse.json(
        {
          error:
            deduction.error ||
            "Wallet balance insufficient. Please top up your Sensifai wallet.",
          top_up_url: deduction.topUpUrl || "https://sensifai.com/marketplace",
          code: "PAYMENT_REQUIRED",
          current_balance: deduction.wallet.balance,
          wallet: deduction.wallet,
        },
        { status: 402 }
      );
    }

    // 4. Execute Core AI Logic via LiteLLM Gateway (Latest Gemini Model)
    let aiResult: any = null;
    if (body.prompt) {
      const aiResponse = await callSensifaiAI({
        mode: body.mode === "reasoning" ? "reasoning" : "fast",
        messages: [
          {
            role: "system",
            content:
              body.systemPrompt ||
              "You are an enterprise-grade Sensifai AI intelligence engine. Provide structured, accurate analysis.",
          },
          { role: "user", content: String(body.prompt) },
        ],
      });
      aiResult = aiResponse.content;
    }

    // 5. Return payload + verified Gatekeeper wallet state
    return NextResponse.json(
      {
        success: true,
        identifier: deduction.identifier,
        deducted_eur: deduction.deductedAmount,
        result: aiResult ?? body,
        processed_at: new Date().toISOString(),
        wallet: deduction.wallet,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("[BILLABLE_ACTION] Error:", err);
    return NextResponse.json(
      {
        error: "Unable to complete request at this time.",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
