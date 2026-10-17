export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { usageService } from "@/lib/sensifai/usage";
import { getUserIdFromRequest } from "@/lib/sensifai/auth";

export async function GET(req: NextRequest) {
  const userId =
    req.nextUrl.searchParams.get("userId") ||
    getUserIdFromRequest(req);

  if (!userId) {
    return NextResponse.json(
      { balance: 0, currency: "EUR", hasFunds: false, authenticated: false },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  }

  const wallet = await usageService.checkWalletBalance(userId);
  return NextResponse.json(
    {
      ...wallet,
      authenticated: true,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
