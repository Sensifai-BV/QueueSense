export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { analyzeQueue } from "@/lib/ai/queuesense-engine";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let imageBase64: string | undefined;
    let audioText: string | undefined;
    let notes: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      notes = (formData.get("notes") as string) || undefined;
      audioText = (formData.get("audio_text") as string) || undefined;

      if (file) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        imageBase64 = buffer.toString("base64");
      }
    } else {
      const body = await req.json().catch(() => ({}));
      imageBase64 = body.image || body.file;
      audioText = body.audioText || body.audio_text;
      notes = body.notes;
    }

    const report = await analyzeQueue({
      image: imageBase64,
      audioText,
      notes,
    });

    return NextResponse.json(report, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to process queue analysis.", details: err.message },
      { status: 500 }
    );
  }
}
