#!/usr/bin/env node
/**
 * JobOS MCP Server —— 把求职引擎暴露为 MCP 工具，接入 Claude Code / Cursor 等。
 *
 * MCP 官方参考实现即 TypeScript，用 TS 写 MCP 是最正统的路径。
 * 工具：search / analyze / resume / greeting。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { agents } from "@ai-job-os/core";
import { collectAllJobs, type Platform } from "@ai-job-os/crawlers";

const server = new McpServer({
  name: "jobos",
  version: "0.1.0",
});

/** 把返回值包成 MCP 的 text content。 */
function textResult(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

server.registerTool(
  "jobos_search",
  {
    title: "搜索岗位",
    description: "多平台采集岗位（Boss / 牛客 / 策展兜底），去重后返回列表",
    inputSchema: {
      keyword: z.string().describe("搜索关键词，如「前端开发」"),
      location: z.string().describe("目标城市，如「南京」"),
      platforms: z
        .array(z.enum(["boss", "boss_playwright", "boss_cookie", "nowcoder", "curated"]))
        .optional()
        .describe("指定平台，默认 boss + nowcoder + curated"),
    },
  },
  async ({ keyword, location, platforms }) => {
    const jobs = await collectAllJobs(keyword, location, {
      platforms: platforms as Platform[] | undefined,
    });
    return textResult(
      jobs.map((j) => ({
        dbId: j.dbId,
        platform: j.platform,
        company: j.company,
        title: j.title,
        salary: j.salary,
        location: j.location,
      })),
    );
  },
);

server.registerTool(
  "jobos_analyze",
  {
    title: "分析并评分岗位",
    description: "解析 JD 并做 10 维评分（角色匹配/技能对齐为门槛维度）",
    inputSchema: {
      jdText: z.string().describe("岗位 JD 文本"),
    },
  },
  async ({ jdText }) => {
    const jdInfo = await agents.analyzeJd(jdText);
    const { total, details } = await agents.scoreJob(jdInfo);
    return textResult({ jdInfo, score: total, details });
  },
);

server.registerTool(
  "jobos_resume",
  {
    title: "生成定制简历",
    description: "根据 JD 生成定制简历数据，经起草-审阅-修订闭环（零编造）",
    inputSchema: {
      jdText: z.string().describe("岗位 JD 文本"),
    },
  },
  async ({ jdText }) => {
    const jdInfo = await agents.analyzeJd(jdText);
    const { resume, review, revised } = await agents.tailorResume(jdInfo);
    return textResult({ resume, review, revised });
  },
);

server.registerTool(
  "jobos_greeting",
  {
    title: "生成打招呼语",
    description: "根据 JD 和简历生成 Boss 直聘打招呼语（80 字内）",
    inputSchema: {
      jdText: z.string().describe("岗位 JD 文本"),
    },
  },
  async ({ jdText }) => {
    const jdInfo = await agents.analyzeJd(jdText);
    const { resume } = await agents.tailorResume(jdInfo);
    const greeting = await agents.generateGreeting(jdInfo, resume);
    return textResult(greeting);
  },
);

server.registerTool(
  "jobos_interview",
  {
    title: "生成面试资料包",
    description:
      "根据 JD 生成面试资料包：技能树（三级分类）+ 备考路径 + 八股速查 + 15 题模拟面试",
    inputSchema: {
      jdText: z.string().describe("岗位 JD 文本"),
      withResume: z
        .boolean()
        .optional()
        .describe("是否先生成定制简历供模拟面试题参考，默认 false"),
    },
  },
  async ({ jdText, withResume }) => {
    const jdInfo = await agents.analyzeJd(jdText);
    const resume = withResume
      ? (await agents.tailorResume(jdInfo)).resume
      : undefined;
    const pack = await agents.generateInterviewPack(jdInfo, resume);
    return textResult(pack);
  },
);

server.registerTool(
  "jobos_company",
  {
    title: "生成公司画像",
    description:
      "生成公司画像 JSON：行业/规模/评分/优缺点/平均薪资/加班情况/技术口碑",
    inputSchema: {
      companyName: z.string().describe("公司名称"),
    },
  },
  async ({ companyName }) => {
    const profile = await agents.profileCompany(companyName);
    return textResult(profile);
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio 模式下不能往 stdout 打日志（会污染协议），用 stderr
  console.error("[jobos-mcp] server started on stdio");
}

main().catch((err: unknown) => {
  console.error("[jobos-mcp] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
