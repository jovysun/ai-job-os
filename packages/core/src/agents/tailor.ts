import { stringify as yamlStringify } from "yaml";
import { chatJson, chat } from "../llm/index.js";
import { loadProfile } from "./profile.js";
import type { JdInfo } from "./schemas.js";
import {
  ResumeDataSchema,
  ReviewReportSchema,
  type ResumeData,
  type ReviewReport,
} from "./resume-schemas.js";

/** 剔除 preferences（求职偏好，仅本人可见），避免混入简历。 */
function profileForResume(): string {
  const profile = loadProfile();
  const { preferences: _omit, ...rest } = profile;
  return yamlStringify(rest, { indent: 2 });
}

/**
 * DRAFTER：根据个人档案 + JD 生成定制简历草稿。
 * 严守不编造铁律：所有内容必须能在档案中找到出处。
 */
export async function generateTailoredResume(jdInfo: JdInfo): Promise<ResumeData> {
  const profileDump = profileForResume();
  const jdDump = JSON.stringify(jdInfo, null, 2);

  const prompt = `你是一个专业的简历顾问，服务对象是有 17 年经验的资深前端/全栈工程师（社招）。
请根据个人档案和目标岗位 JD，生成一份高度定制化的简历内容。

## 个人档案 (YAML)
${profileDump}

## 目标岗位 JD
${jdDump}

## 硬性铁律（违反视为严重错误）
- **不编造**：不得虚构或夸大任何项目、公司、职位、时间、数据、头衔、学历。所有内容必须能在上面的「个人档案」中找到出处。
- 允许做的是：**重新组织、突出、措辞优化**——把真实经历中与 JD 最相关的部分提到前面、用更贴合 JD 的表述改写，但事实本身不能变。

## 定制要求
1. 用 STAR 法则润色真实项目经历，突出与 JD 匹配的技能（不改变事实）
2. 按 JD 关键词重新排列技能顺序，最相关的排前面
3. 生成一段精炼的个人总结（2-3 句话）
4. 所有内容用中文
5. skills 只输出技术能力，严禁把求职偏好（如"稳定现金流""通勤便利"）写进 skills

返回 JSON（camelCase 键）：
{
  "name": "姓名",
  "contact": { "email": "", "phone": "", "github": "", "location": "" },
  "summary": "个人总结",
  "education": [{ "school": "", "degree": "", "major": "", "period": "", "gpa": "" }],
  "skills": { "frontend": [], "engineering": [], "backend": [], "aiCollaboration": [], "others": [] },
  "projects": [{ "name": "", "period": "", "description": "", "highlights": [], "technologies": [], "isFabricated": false }]
}`;

  return chatJson(prompt, ResumeDataSchema, {
    system: "你是专业简历顾问，恪守不编造原则。必须返回合法 JSON，不要包含其他内容。",
  });
}

/**
 * REVIEWER：以个人档案为唯一事实来源，审查简历草稿。
 * 抓出虚构/夸大/无出处表述、匹配缺口、过度堆砌。不改稿。
 */
export async function reviewResume(
  resume: ResumeData,
  jdInfo: JdInfo,
): Promise<ReviewReport> {
  const profileDump = profileForResume();
  const resumeDump = JSON.stringify(resume, null, 2);
  const jdDump = JSON.stringify(jdInfo, null, 2);

  const prompt = `你是一位严格的招聘经理兼简历审查官。下面有一份简历草稿、求职者的【真实档案】和目标岗位 JD。
审查草稿，确保它既有竞争力、又完全真实。

## 真实档案（唯一事实来源，草稿中一切都必须能在此找到出处）
${profileDump}

## 简历草稿（待审查）
${resumeDump}

## 目标岗位 JD
${jdDump}

## 审查维度
1. **事实核查（最高优先级）**：逐条检查项目、数据、时间、头衔、技能、成果，凡在档案中找不到出处、与档案矛盾、或明显夸大的，列为 fabrication。
2. **匹配缺口**：JD 要求且求职者真实具备、但草稿没突出的能力。
3. **表达质量**：STAR 是否清晰、量化是否有力、总结是否精准。

返回 JSON（camelCase）：
{
  "fabrications": [{ "location": "", "issue": "", "evidence": "档案中的真实情况或'档案中无此内容'", "severity": "高/中/低" }],
  "matchGaps": [],
  "overClaims": [],
  "qualitySuggestions": [],
  "overallVerdict": "pass / revise / reject",
  "summary": "一句话总评"
}`;

  return chatJson(prompt, ReviewReportSchema, {
    system: "你是严格的简历审查官，事实核查零容忍。必须返回合法 JSON，不要包含其他内容。",
  });
}

/**
 * REVISE：依审查报告修订草稿（删编造、补缺口、精简堆砌）。
 * 修订后所有内容仍必须能在档案中找到出处。
 */
export async function reviseResume(
  resume: ResumeData,
  review: ReviewReport,
  jdInfo: JdInfo,
): Promise<ResumeData> {
  const profileDump = profileForResume();
  const resumeDump = JSON.stringify(resume, null, 2);
  const reviewDump = JSON.stringify(review, null, 2);
  const jdDump = JSON.stringify(jdInfo, null, 2);

  const prompt = `你是简历顾问。请根据审查报告修订简历草稿，输出修订后的完整简历 JSON。

## 真实档案（唯一事实来源）
${profileDump}

## 原始草稿
${resumeDump}

## 审查报告
${reviewDump}

## 目标 JD
${jdDump}

## 修订规则
1. **删除或改正**审查报告中所有 fabrications，改为档案中的真实表述。
2. **补齐** matchGaps 中档案确实支持的真实能力。
3. **精简** overClaims 中的无关堆砌。
4. 应用合理的 qualitySuggestions。
5. 修订后所有内容仍必须能在档案中找到出处，绝不引入新的编造。

返回与原草稿相同结构的完整简历 JSON（camelCase 键）。`;

  return chatJson(prompt, ResumeDataSchema, {
    system: "你是简历顾问，恪守不编造原则。必须返回合法 JSON，不要包含其他内容。",
  });
}

export interface TailorResult {
  resume: ResumeData;
  review: ReviewReport;
  revised: boolean;
}

/**
 * 完整的起草-审阅闭环：Drafter → Reviewer → （必要时）Revise。
 * 当判定 revise/reject 或发现 fabrication 时才触发修订。
 */
export async function tailorResume(jdInfo: JdInfo): Promise<TailorResult> {
  let resume = await generateTailoredResume(jdInfo);
  const review = await reviewResume(resume, jdInfo);

  const needsRevision =
    review.overallVerdict !== "pass" || review.fabrications.length > 0;
  if (needsRevision) {
    resume = await reviseResume(resume, review, jdInfo);
  }

  return { resume, review, revised: needsRevision };
}

/** 生成 Boss 直聘打招呼语（80 字内，真诚自然）。 */
export async function generateGreeting(
  jdInfo: JdInfo,
  resume: ResumeData,
): Promise<string> {
  const prompt = `根据以下岗位信息和简历，生成一段 Boss 直聘打招呼语（80 字以内，真诚自然，不要套话）。

岗位: ${jdInfo.title} @ ${jdInfo.company}
核心要求: ${jdInfo.requiredSkills.join(", ")}
我的亮点: ${resume.summary}

要求：
- 直接说明匹配度
- 提到 1-2 个具体的相关项目/技能
- 表达热情但不过分
- 80 字以内`;

  return chat(prompt, {
    system: "你是求职者，正在 Boss 直聘上给 HR 发打招呼消息。简洁真诚。",
  });
}
