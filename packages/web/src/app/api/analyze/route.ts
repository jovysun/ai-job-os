import { NextResponse } from "next/server";
import { agents } from "@ai-job-os/core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { jdText } = (await req.json()) as { jdText?: string };
    if (!jdText) {
      return NextResponse.json({ error: "jdText 必填" }, { status: 400 });
    }
    const jdInfo = await agents.analyzeJd(jdText);
    const { total, details } = await agents.scoreJob(jdInfo);
    return NextResponse.json({ jdInfo, score: total, details });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}