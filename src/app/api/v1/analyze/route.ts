export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/sensifai/auth";
import { usageService } from "@/lib/sensifai/usage";
import { analyzeQueue } from "@/lib/ai/queuesense-engine";

export async function POST(req: NextRequest) {
  try {
    // 1. Mandatory Auth Check
    const sub = getUserIdFromRequest(req);
    if (!sub) {
      return NextResponse.json(
        {
          error:
            "Authentication required to perform custom queue analysis. Please sign in with your Sensifai account.",
          code: "UNAUTHORIZED",
          login_url: "/api/auth/login",
        },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json().catch(() => ({}));

    // 3. Atomic Wallet Deduction & Sync
    const deduction = await usageService.deductAndSyncWallet({
      logtoUserId: sub,
      operation: "queuesense_analysis",
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

    // 4. Run Queue Intelligence Engine via LiteLLM Gateway
    const report = await analyzeQueue({
      image: body.image,
      imageUrl: body.imageUrl,
      audioText: body.audioText,
      notes: body.notes,
    });

    // 5. Return report with atomic verified wallet
    return NextResponse.json(
      {
        success: true,
        identifier: deduction.identifier,
        deducted_eur: deduction.deductedAmount,
        report,
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
    console.error("[QueueSense API /analyze] Error:", err.message);
    return NextResponse.json(
      {
        error: "Internal error processing queue analysis request.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
