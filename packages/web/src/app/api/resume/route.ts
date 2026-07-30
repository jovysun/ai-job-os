import { NextResponse } from "next/server";
import { agents } from "@ai-job-os/core";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 简历 PDF 渲染：动态 import 方式。
 * @react-pdf/renderer 含有 yoga wasm 布局引擎，被 webpack 打包会破坏其内部结构，
 * 需要运行时从 node_modules 加载。动态 import 绕过 webpack 的静态分析。
 */
async function renderPdfBuffer(
  resume: import("@ai-job-os/core").ResumeData,
): Promise<Buffer> {
  const { renderResumeToBuffer } = await import("@ai-job-os/resume-render");
  return renderResumeToBuffer(resume);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { jdText } = (await req.json()) as { jdText?: string };
    if (!jdText) {
      return NextResponse.json({ error: "jdText 必填" }, { status: 400 });
    }
    const jdInfo = await agents.analyzeJd(jdText);
    const { resume, review, revised } = await agents.tailorResume(jdInfo);
    const pdf = await renderPdfBuffer(resume);
    return NextResponse.json({
      resume,
      review,
      revised,
      pdfBase64: pdf.toString("base64"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}