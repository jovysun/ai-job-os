import { NextResponse } from "next/server";
import { collectAllJobs, type Platform } from "@ai-job-os/crawlers";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { keyword, location, platforms } = (await req.json()) as {
      keyword?: string;
      location?: string;
      platforms?: Platform[];
    };
    if (!keyword || !location) {
      return NextResponse.json({ error: "keyword 和 location 必填" }, { status: 400 });
    }
    const jobs = await collectAllJobs(keyword, location, { platforms });
    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}