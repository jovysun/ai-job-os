import { z } from "zod";
import { chatJson, chat } from "../llm/index.js";
import type { JdInfo } from "./schemas.js";
import type { ResumeData } from "./resume-schemas.js";
import { nullableString } from "./zod-helpers.js";

// ── Zod Schemas ────────────────────────────────────────────────────

/** 技能树节点。 */
export const SkillNodeSchema = z.object({
  skill: z.string(),
  category: nullableString(),
  importance: z.enum(["高", "中", "低", "门槛"]).default("中"),
});
export type SkillNode = z.infer<typeof SkillNodeSchema>;

/** 技能树：三级分类。 */
export const SkillTreeSchema = z.object({
  required: z.array(SkillNodeSchema).default([]),
  preferred: z.array(SkillNodeSchema).default([]),
  basic: z.array(SkillNodeSchema).default([]),
});
export type SkillTree = z.infer<typeof SkillTreeSchema>;

/** 完整面试资料包。 */
export interface InterviewPack {
  skillTree: SkillTree;
  studyPath: string;
  eightPartEssay: string;
  mockQuestions: string;
}

// ── Agent Functions ───────────────────────────────────────────────

/**
 * 从 JD 信息提取技能树，三级分类（required / preferred / basic）。
 */
export async function extractSkillTree(jdInfo: JdInfo): Promise<SkillTree> {
  const prompt = `分析以下前端/全栈岗位要求，提取技能树，分为三级。

岗位信息:
${JSON.stringify(jdInfo, null, 2)}

返回JSON:
{
  "required": [
    {"skill": "技能名", "category": "分类(如前端框架/工程化/状态管理/后端/系统设计/AI应用)", "importance": "高/中"}
  ],
  "preferred": [
    {"skill": "加分技能", "category": "分类", "importance": "中/低"}
  ],
  "basic": [
    {"skill": "基础要求(学历/软素质等)", "category": "基础", "importance": "门槛"}
  ]
}`;

  return chatJson(prompt, SkillTreeSchema);
}

/**
 * 按周生成面试备考学习路径（面向资深工程师，查漏补缺而非从零）。
 */
export async function generateStudyPath(
  skillTree: SkillTree,
  targetWeeks: number = 2,
): Promise<string> {
  const prompt = `你是资深前端/全栈面试辅导专家，辅导对象是有 17 年经验的资深工程师（社招，非应届）。
根据以下技能要求，生成 ${targetWeeks} 周的面试备考计划。

技能要求:
${JSON.stringify(skillTree, null, 2)}

要求：
1. 面向有经验的资深工程师——重点是「查漏补缺 + 项目故事梳理 + 高频考点复习」，
   而不是从零学起。假设候选人主栈 React/Vue/TypeScript/Node 已经很熟。
2. 每周有明确主题和目标；优先覆盖 JD 里候选人可能生疏的点
3. 推荐具体、务实的复习资源（官方文档、经典源码、面试题库）
4. 安排「用真实项目讲清楚某个技术决策」的准备任务
5. 最后阶段用于模拟面试和高频八股查漏

格式用Markdown，标题层次清晰。`;

  return chat(prompt, {
    system: "你是资深前端/全栈面试辅导专家，擅长为有经验的工程师做精准备考。",
    maxTokens: 8000,
  });
}

/**
 * 生成八股文速查手册：每技能点 3-5 高频题 + 核心答案 + 追问方向，标注[必背]/[了解]。
 */
export async function generateEightPartEssay(skillTree: SkillTree): Promise<string> {
  const skillsList = [
    ...skillTree.required.map((s) => s.skill),
    ...skillTree.preferred.map((s) => s.skill),
  ];

  const prompt = `你是资深前端/全栈面试官。针对以下技能点，生成面试八股文速查手册。

技能点: ${skillsList.join(", ")}

要求：
1. 每个技能点 3-5 个高频面试题
2. 每题包含：题目、核心答案（200字以内）、追问方向
3. 区分"必背"和"了解即可"
4. 覆盖资深前端常考点：React/Vue 原理与 diff、Hooks 机制、TypeScript 类型体操、
   前端工程化（Webpack/Vite 构建原理、Tree-shaking、HMR）、状态管理选型、
   性能优化、浏览器渲染与事件循环、Node.js 与 BFF、系统设计，以及 AI 协同开发实践
5. 在每个知识点后标注[必背]或[了解]
6. 可包含大厂真实面试题风格

格式用Markdown，结构清晰。`;

  return chat(prompt, {
    system: "你是资深前端/全栈面试官，熟悉一线互联网公司的前端面试风格。",
    maxTokens: 8000,
  });
}

/**
 * 生成 15 题模拟面试（项目拷打 6 + 技术深度 5 + 工程素养 2 + 行为 2）。
 */
export async function generateMockQuestions(
  jdInfo: JdInfo,
  resumeData?: ResumeData,
): Promise<string> {
  let resumeContext = "";
  if (resumeData) {
    resumeContext = `
求职者简历摘要: ${resumeData.summary ?? ""}
项目经历: ${JSON.stringify(resumeData.projects ?? [], null, 2)}
`;
  }

  const prompt = `你是一位严格的资深前端/全栈岗位面试官（一线互联网公司二面风格），
面对的是有 17 年经验的资深候选人，标准要高、追问要深。

岗位信息:
${JSON.stringify(jdInfo, null, 2)}

${resumeContext}

请生成一套完整的模拟面试题（共15题），包括：

## 一、项目拷打（6题）
- 针对简历中的真实项目深入追问（跨境电商前台百万级 SKU、5 套中后台 0→1、
  webpack→Vite 迁移、Redux→Zustand、通用列表配置系统、MCP 工具链等）
- 不接受模糊回答，每题附带 2 个追问方向
- 关注：架构决策、技术权衡、遇到的困难、量化结果、如何带团队/带新人

## 二、前端/全栈技术深度（5题）
- 覆盖：React/Vue 原理、TypeScript、前端工程化与构建优化、状态管理选型、
  性能优化、Node.js/全栈、系统设计
- 每题有标准答案要点和评分标准(1-5分)
- 可含手写题（如手写 debounce/深拷贝、设计一个前端配置化方案）

## 三、工程素养与协作（2题）
- 代码规范、Code Review、技术方案评审、跨团队协作、AI 协同开发实践

## 四、行为面试 + 反问（2题）
- 用 STAR 法则准备的行为面试题（尤其针对资深/年龄相关的软性问题，如稳定性、
  是否甘于一线编码、如何持续学习）
- 推荐的反问问题

格式用Markdown，每题标注难度(简单/中等/困难)和考查重点。`;

  return chat(prompt, {
    system: "你是严格的资深前端/全栈技术面试官，不接受模糊回答，会深入追问细节。",
    maxTokens: 8000,
  });
}

/**
 * 组装完整面试资料包（skillTree → studyPath + eightPartEssay + mockQuestions）。
 */
export async function generateInterviewPack(
  jdInfo: JdInfo,
  resumeData?: ResumeData,
): Promise<InterviewPack> {
  const skillTree = await extractSkillTree(jdInfo);
  const [studyPath, eightPartEssay, mockQuestions] = await Promise.all([
    generateStudyPath(skillTree),
    generateEightPartEssay(skillTree),
    generateMockQuestions(jdInfo, resumeData),
  ]);

  return {
    skillTree,
    studyPath,
    eightPartEssay,
    mockQuestions,
  };
}