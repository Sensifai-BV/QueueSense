export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { verifySensifaiWebhook } from "@/lib/sensifai/webhook";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get("Sensifai-Signature") ||
      req.headers.get("sensifai-signature");
    const idempotencyKey =
      req.headers.get("Idempotency-Key") ||
      req.headers.get("idempotency-key");

    const verification = verifySensifaiWebhook(
      rawBody,
      signatureHeader,
      process.env.SENSIFAI_WEBHOOK_SECRET,
      idempotencyKey
    );

    if (!verification.valid) {
      return NextResponse.json(
        { error: "Invalid webhook signature", reason: verification.reason },
        { status: 401 }
      );
    }

    if (verification.duplicate) {
      return NextResponse.json(
        { received: true, duplicate: true, status: "already_processed" },
        { status: 200 }
      );
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event_type || payload.type || "unknown";
    const eventId = payload.id || idempotencyKey || "evt_unknown";

    return NextResponse.json(
      { received: true, id: eventId, event_type: eventType, duplicate: false },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Webhook processing failed", details: err.message },
      { status: 400 }
    );
  }
}
