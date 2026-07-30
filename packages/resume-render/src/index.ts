import React from "react";
import { renderToBuffer, renderToFile } from "@react-pdf/renderer";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeData } from "@ai-job-os/core";
import { TechResume, registerChineseFont } from "./templates/tech.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

export type TemplateName = "tech";

const TEMPLATES: Record<TemplateName, (props: { data: ResumeData }) => React.ReactElement> = {
  tech: TechResume,
};

export interface RenderOptions {
  template?: TemplateName;
  /** 中文字体 TTF 路径。默认找 data/fonts/NotoSansSC-Regular.ttf。 */
  fontPath?: string;
}

let fontRegistered = false;

function ensureFont(fontPath?: string): void {
  if (fontRegistered) return;
  const candidates = [
    fontPath,
    resolve(REPO_ROOT, "data", "fonts", "NotoSansSC-Regular.ttf"),
    // Windows 常见中文字体回退（优先 .ttf，@react-pdf 对 .ttc 支持不稳）
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
    "C:/Windows/Fonts/msyh.ttc",
  ].filter((p): p is string => Boolean(p));

  for (const p of candidates) {
    if (existsSync(p)) {
      registerChineseFont(p);
      fontRegistered = true;
      return;
    }
  }
  throw new Error(
    "未找到中文字体。请把中文 TTF 放到 data/fonts/NotoSansSC-Regular.ttf，" +
      "或在 RenderOptions.fontPath 指定路径（否则 PDF 中文会缺字）。",
  );
}

function element(data: ResumeData, template: TemplateName): React.ReactElement {
  const Tpl = TEMPLATES[template];
  return React.createElement(Tpl, { data });
}

/** 渲染简历为 PDF Buffer。 */
export async function renderResumeToBuffer(
  data: ResumeData,
  opts: RenderOptions = {},
): Promise<Buffer> {
  ensureFont(opts.fontPath);
  return renderToBuffer(element(data, opts.template ?? "tech"));
}

/** 渲染简历并写入 PDF 文件，返回路径。 */
export async function renderResumeToFile(
  data: ResumeData,
  outPath: string,
  opts: RenderOptions = {},
): Promise<string> {
  ensureFont(opts.fontPath);
  await renderToFile(element(data, opts.template ?? "tech"), outPath);
  return outPath;
}

export { TechResume, registerChineseFont } from "./templates/tech.js";
export { skillLabel, SKILL_LABELS } from "./labels.js";
