export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { analyzeQueue } from "@/lib/ai/queuesense-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = body.image_url || body.imageUrl || body.url;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing required parameter 'image_url'." },
        { status: 400 }
      );
    }

    const report = await analyzeQueue({
      imageUrl,
      notes: body.notes,
    });

    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to process image URL queue analysis.", details: err.message },
      { status: 500 }
    );
  }
}
