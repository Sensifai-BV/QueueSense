export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { checkCustomerEntitlement } from "@/lib/sensifai/entitlement";
import { usageService } from "@/lib/sensifai/usage";
import { decodeSession, getUserIdFromRequest } from "@/lib/sensifai/auth";

export async function GET(req: NextRequest) {
  const rawCookie =
    req.cookies.get("sensifai_session")?.value ||
    req.cookies.get("app_session")?.value;

  if (!rawCookie) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        entitlement: { hasAccess: false, status: "unauthenticated" },
        wallet: null,
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

  try {
    const session = decodeSession(rawCookie);
    const sub = session?.sub || session?.user?.sub;
    if (!sub) {
      return NextResponse.json(
        {
          authenticated: false,
          user: null,
          entitlement: { hasAccess: false, status: "unauthenticated" },
          wallet: null,
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

    const name =
      session.name ||
      session.user?.name ||
      session.username ||
      session.nickname ||
      (session.email || session.user?.email
        ? (session.email || session.user?.email).split("@")[0]
        : "Member");
    const email = session.email || session.user?.email;
    const picture = session.picture || session.user?.picture;

    const [entitlement, wallet] = await Promise.all([
      checkCustomerEntitlement(sub).catch(() => ({ hasAccess: true, status: "active" })),
      usageService.checkWalletBalance(sub),
    ]);

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          sub,
          name,
          email,
          picture,
        },
        entitlement,
        wallet,
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
  } catch (err: any) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
        wallet: null,
        error: "Failed to parse session",
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
}
