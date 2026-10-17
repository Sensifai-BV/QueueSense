export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { analyzeQueue } from "@/lib/ai/queuesense-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const urls: string[] = body.urls || body.images || [];

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'urls' array in batch request." },
        { status: 400 }
      );
    }

    const reports = await Promise.all(
      urls.slice(0, 5).map(async (url) => {
        return analyzeQueue({ imageUrl: url });
      })
    );

    return NextResponse.json(
      { count: reports.length, reports },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Batch analysis failure.", details: err.message },
      { status: 500 }
    );
  }
}
