export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    return NextResponse.json(
      {
        success: true,
        message: "Queue telemetry feedback recorded for model calibration.",
        feedback_id: `fb_${Date.now().toString(36)}`,
        recorded_at: new Date().toISOString(),
        details: body,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to record feedback.", details: err.message },
      { status: 500 }
    );
  }
}
