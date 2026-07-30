#!/usr/bin/env node
import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, agents, db } from "@ai-job-os/core";
import { renderResumeToFile } from "@ai-job-os/resume-render";
import { collectAllJobs, type Platform } from "@ai-job-os/crawlers";
import { resolveJdText } from "./jd-input.js";

// 仓库根：packages/cli/src → ../../../。相对路径统一以仓库根为基准，
// 避免 pnpm --filter 把 cwd 切到包目录导致的路径错乱。
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function resolveOutput(p: string): string {
  const abs = resolve(REPO_ROOT, p);
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

/** 统一读取 JD（文件 > stdin > 位置参数），基准目录为仓库根。 */
function readJd(arg: string | undefined, file: string | undefined): Promise<string> {
  return resolveJdText({ arg, file, baseDir: REPO_ROOT });
}

const program = new Command();

program
  .name("jobos")
  .description("AI 求职操作系统 —— 岗位分析 / 评分 / 简历 / 面试")
  .version("0.1.0");

program
  .command("analyze")
  .description("分析一段 JD 文本并做 10 维评分")
  .argument("[jdText]", "岗位 JD 文本（可省略，改用 -f 文件或 stdin 管道）")
  .option("-f, --file <path>", "从文件读取 JD（推荐，避免多行文本被 shell 截断）")
  .option("--save", "把岗位与评分存入本地库，输出 dbId（供 apply 追踪投递）", false)
  .action(async (jdArg: string | undefined, opts: { file?: string; save: boolean }) => {
    const jdText = await readJd(jdArg, opts.file);
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

    if (opts.save) {
      const dbId = db.insertJob({
        platform: "manual",
        jobId: "",
        title: jdInfo.title || "未命名岗位",
        company: jdInfo.company || "未知公司",
        location: jdInfo.location,
        salary: jdInfo.salary,
        jobType: jdInfo.jobType,
      });
      db.updateJobScore(dbId, total, details);
      console.log(pc.green(`\n✓ 已存入本地库，dbId=${dbId}`));
      console.log(pc.dim(`  记录投递：jobos apply ${dbId}`));
    }
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
  .argument("[jdText]", "岗位 JD 文本（可省略，改用 -f 文件或 stdin 管道）")
  .option("-f, --file <path>", "从文件读取 JD（推荐，避免多行文本被 shell 截断）")
  .option("-o, --output <path>", "输出 PDF 路径", "data/outputs/resume.pdf")
  .action(async (jdArg: string | undefined, opts: { file?: string; output: string }) => {
    const jdText = await readJd(jdArg, opts.file);
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

program
  .command("interview")
  .description("根据 JD 生成面试资料包（技能树 + 备考路径 + 八股速查 + 模拟面试）")
  .argument("[jdText]", "岗位 JD 文本（可省略，改用 -f 文件或 stdin 管道）")
  .option("-f, --file <path>", "从文件读取 JD（推荐，避免多行文本被 shell 截断）")
  .option("-o, --output <path>", "输出 Markdown 路径", "data/outputs/interview.md")
  .option("--with-resume", "先生成定制简历，供模拟面试题参考", false)
  .action(
    async (
      jdArg: string | undefined,
      opts: { file?: string; output: string; withResume: boolean },
    ) => {
      const jdText = await readJd(jdArg, opts.file);
      console.log(pc.dim("正在分析 JD…"));
      const jdInfo = await agents.analyzeJd(jdText);
      console.log(pc.cyan(`岗位: ${jdInfo.title} @ ${jdInfo.company}`));

      let resume;
      if (opts.withResume) {
        console.log(pc.dim("生成定制简历（供模拟面试参考）…"));
        resume = (await agents.tailorResume(jdInfo)).resume;
      }

      console.log(pc.dim("提取技能树 + 生成备考路径 / 八股速查 / 模拟面试…"));
      const pack = await agents.generateInterviewPack(jdInfo, resume);

      console.log(
        pc.green(
          `\n✓ 技能树: 必需 ${pack.skillTree.required.length} / 加分 ${pack.skillTree.preferred.length} / 基础 ${pack.skillTree.basic.length}`,
        ),
      );

      const md = [
        `# 面试资料包 — ${jdInfo.title} @ ${jdInfo.company}`,
        "",
        "## 技能树",
        "",
        "```json",
        JSON.stringify(pack.skillTree, null, 2),
        "```",
        "",
        "## 备考路径",
        "",
        pack.studyPath,
        "",
        "## 八股速查",
        "",
        pack.eightPartEssay,
        "",
        "## 模拟面试",
        "",
        pack.mockQuestions,
        "",
      ].join("\n");

      const outPath = resolveOutput(opts.output);
      writeFileSync(outPath, md, "utf-8");
      console.log(pc.green(`✓ 面试资料包已生成: ${outPath}`));
    },
  );

program
  .command("company")
  .description("生成公司画像（行业/规模/评分/优缺点/薪资/加班/技术口碑）")
  .argument("<companyName>", "公司名称")
  .action(async (companyName: string) => {
    console.log(pc.dim(`正在生成「${companyName}」公司画像…`));
    const p = await agents.profileCompany(companyName);
    console.log(pc.cyan(`\n${p.name}  ${pc.dim(`评分 ${p.rating}/10`)}`));
    console.log(pc.dim(`${p.industry} | ${p.size}`));
    if (p.description) console.log(p.description);
    if (p.pros.length) console.log(pc.green(`\n优点:\n${p.pros.map((x) => `  + ${x}`).join("\n")}`));
    if (p.cons.length) console.log(pc.yellow(`\n缺点:\n${p.cons.map((x) => `  - ${x}`).join("\n")}`));
    console.log(pc.dim(`\n平均月薪: ${p.avgSalary}`));
    console.log(pc.dim(`加班情况: ${p.workLifeBalance}`));
    console.log(pc.dim(`技术口碑: ${p.techReputation}`));
  });

const APP_STATUSES = db.APPLICATION_STATUSES;

function assertStatus(s: string): db.ApplicationStatus {
  if ((APP_STATUSES as readonly string[]).includes(s)) {
    return s as db.ApplicationStatus;
  }
  console.error(pc.red(`无效状态「${s}」。可选：${APP_STATUSES.join(" / ")}`));
  process.exit(1);
}

program
  .command("list")
  .description("列出本地库里的岗位（含 dbId，供 apply 追踪投递）")
  .action(() => {
    const jobs = db.getAllJobs();
    if (!jobs.length) {
      console.log(
        pc.dim("本地库为空。用 `jobos search` 采集，或 `jobos analyze <jd> --save` 存入。"),
      );
      return;
    }
    console.log(pc.bold(`\n本地岗位库（${jobs.length} 条）\n`));
    for (const j of jobs) {
      const score = j.score != null ? j.score.toFixed(2) : "—";
      console.log(
        `#${String(j.id).padStart(4)} [${pc.cyan(j.platform)}] ${pc.bold(j.company)} | ${j.title} | ${j.salary ?? ""} | 评分 ${score}`,
      );
    }
  });

program
  .command("apply")
  .description("记录一次投递（写入投递看板）")
  .argument("<jobId>", "岗位在库中的 id（search 结果的 dbId）")
  .option("-s, --status <status>", `投递状态（${APP_STATUSES.join("/")}）`, "已投递")
  .option("-n, --notes <notes>", "备注")
  .action((jobIdStr: string, opts: { status: string; notes?: string }) => {
    const jobId = Number(jobIdStr);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      console.error(pc.red(`无效岗位 id：${jobIdStr}`));
      process.exit(1);
    }
    const status = assertStatus(opts.status);
    db.upsertApplication({ jobId, status, notes: opts.notes });
    console.log(pc.green(`✓ 已记录投递：岗位 #${jobId} → ${status}`));
  });

program
  .command("status")
  .description("更新某岗位的投递状态")
  .argument("<jobId>", "岗位在库中的 id")
  .argument("<status>", `新状态（${APP_STATUSES.join("/")}）`)
  .option("-n, --notes <notes>", "备注")
  .action((jobIdStr: string, statusStr: string, opts: { notes?: string }) => {
    const jobId = Number(jobIdStr);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      console.error(pc.red(`无效岗位 id：${jobIdStr}`));
      process.exit(1);
    }
    const status = assertStatus(statusStr);
    db.updateApplicationStatus(jobId, status, opts.notes);
    console.log(pc.green(`✓ 岗位 #${jobId} 状态已更新为 ${status}`));
  });

program
  .command("board")
  .description("列出投递看板")
  .option("-s, --status <status>", "只看某状态")
  .action((opts: { status?: string }) => {
    const filter = opts.status ? assertStatus(opts.status) : undefined;
    const rows = db.getApplicationBoard(filter);
    if (!rows.length) {
      console.log(pc.dim("投递看板为空。用 `jobos apply <jobId>` 记录第一条投递。"));
      return;
    }
    console.log(pc.bold(`\n投递看板（${rows.length} 条）\n`));
    for (const r of rows) {
      const applied = r.appliedAt ? r.appliedAt.slice(0, 10) : "—";
      console.log(
        `#${String(r.jobId).padStart(4)} [${pc.cyan(r.status)}] ${pc.bold(r.company)} | ${r.title} | ${r.salary ?? ""} | 投递 ${applied}`,
      );
      if (r.notes) console.log(pc.dim(`        备注: ${r.notes}`));
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red(`\n出错: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
