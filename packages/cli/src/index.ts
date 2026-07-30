#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, agents } from "@ai-job-os/core";
import { renderResumeToFile } from "@ai-job-os/resume-render";
import { collectAllJobs, type Platform } from "@ai-job-os/crawlers";

// 仓库根：packages/cli/src → ../../../。相对路径统一以仓库根为基准，
// 避免 pnpm --filter 把 cwd 切到包目录导致的路径错乱。
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function resolveOutput(p: string): string {
  const abs = resolve(REPO_ROOT, p);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

const program = new Command();

program
  .name("jobos")
  .description("AI 求职操作系统 —— 岗位分析 / 评分 / 简历 / 面试")
  .version("0.1.0");

program
  .command("analyze")
  .description("分析一段 JD 文本并做 10 维评分")
  .argument("<jdText>", "岗位 JD 文本")
  .action(async (jdText: string) => {
    const cfg = loadConfig().scoring;
    console.log(pc.dim("正在分析 JD…"));
    const jdInfo = await agents.analyzeJd(jdText);
    console.log(pc.cyan(`\n岗位: ${jdInfo.title}  公司: ${jdInfo.company}`));
    console.log(pc.dim(`必需技能: ${jdInfo.requiredSkills.join(", ")}`));

    console.log(pc.dim("\n正在评分…"));
    const { total, details } = await agents.scoreJob(jdInfo);

    const color =
      total >= cfg.displayRecommend
        ? pc.green
        : total >= cfg.displayConsider
          ? pc.yellow
          : pc.red;
    const label =
      total >= cfg.displayRecommend
        ? "✅ 强推"
        : total >= cfg.displayConsider
          ? "⚡ 可投"
          : "❌ 跳过";

    console.log(color(`\n综合评分: ${total.toFixed(2)}  ${label}`));
    console.log(pc.dim(details.reasoning));
  });

program
  .command("search")
  .description("多平台采集岗位（Boss cookie + 牛客网 + 策展兜底）")
  .option("-k, --keyword <keyword>", "搜索关键词", "前端开发")
  .option("-l, --location <city>", "目标城市", "南京")
  .option("-p, --platform <platform>", "平台（逗号分隔）", "boss,nowcoder,curated")
  .action(async (opts: { keyword: string; location: string; platform: string }) => {
    const VALID: Platform[] = [
      "boss",
      "boss_playwright",
      "boss_cookie",
      "nowcoder",
      "liepin",
      "curated",
    ];
    const platforms = opts.platform
      .split(",")
      .map((p) => p.trim())
      .filter((p): p is Platform => (VALID as string[]).includes(p));
    if (!platforms.length) {
      console.error(pc.red(`无有效平台。可选：${VALID.join(", ")}`));
      process.exit(1);
    }
    console.log(pc.dim(`正在搜索「${opts.keyword}」${opts.location}，平台：${platforms.join(", ")}…`));
    const jobs = await collectAllJobs(opts.keyword, opts.location, { platforms });
    console.log(pc.green(`\n✓ 采集完成，共 ${jobs.length} 个岗位\n`));
    for (const [i, j] of jobs.entries()) {
      console.log(
        `${String(i + 1).padStart(2)}. [${pc.cyan(j.platform)}] ${pc.bold(j.company)} | ${j.title} | ${j.salary ?? ""} | ${j.location ?? ""}`,
      );
    }
  });

program
  .command("resume")
  .description("根据 JD 生成定制简历 PDF（起草→事实核查→修订 闭环）")
  .argument("<jdText>", "岗位 JD 文本")
  .option("-o, --output <path>", "输出 PDF 路径", "data/outputs/resume.pdf")
  .action(async (jdText: string, opts: { output: string }) => {
    console.log(pc.dim("正在分析 JD…"));
    const jdInfo = await agents.analyzeJd(jdText);
    console.log(pc.cyan(`岗位: ${jdInfo.title} @ ${jdInfo.company}`));

    console.log(pc.dim("DRAFTER 起草 + REVIEWER 事实核查…"));
    const { resume, review, revised } = await agents.tailorResume(jdInfo);

    const fabs = review.fabrications;
    console.log(
      `审阅判定: ${pc.bold(review.overallVerdict)} | 发现疑似编造/夸大 ${fabs.length} 处` +
        (revised ? pc.dim("（已自动修订）") : ""),
    );
    for (const f of fabs) {
      console.log(pc.yellow(`  · [${f.severity}] ${f.location}: ${f.issue}`));
    }

    const outPath = resolveOutput(opts.output);
    await renderResumeToFile(resume, outPath);
    console.log(pc.green(`\n✓ 简历 PDF 已生成: ${outPath}`));

    const greeting = await agents.generateGreeting(jdInfo, resume);
    console.log(pc.cyan("\nBoss 直聘打招呼语:"));
    console.log(pc.dim(greeting));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red(`\n出错: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
