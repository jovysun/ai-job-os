import { chatJson } from "../llm/index.js";
import { loadConfig } from "../load-config.js";
import { loadProfile } from "./profile.js";
import {
  JdInfoSchema,
  RawScoreSchema,
  CompanyProfileSchema,
  type JdInfo,
  type ScoreResult,
  type CompanyProfile,
} from "./schemas.js";

/** 把岗位对象拼成供 analyzeJd 使用的 JD 文本（统一各处拼接）。 */
export function formatJdText(job: {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  description?: string;
  requirements?: string;
  skills?: string;
}): string {
  return [
    `岗位: ${job.title ?? ""}`,
    `公司: ${job.company ?? ""}`,
    `地点: ${job.location ?? ""}`,
    `薪资: ${job.salary ?? ""}`,
    `描述: ${job.description ?? ""}`,
    `要求: ${job.requirements ?? ""}`,
    `技能: ${job.skills ?? ""}`,
  ].join("\n");
}

/** 从招聘 JD 提取结构化信息。 */
export async function analyzeJd(jdText: string): Promise<JdInfo> {
  const prompt = `分析以下招聘 JD，提取结构化信息。

JD 内容：
${jdText}

请返回 JSON 格式（字段用 camelCase）：
{
  "title": "岗位名称",
  "company": "公司名",
  "location": "工作地点",
  "salary": "薪资范围",
  "jobType": "类型(全职/实习/校招/社招)",
  "requiredSkills": ["必需技能"],
  "preferredSkills": ["加分技能"],
  "basicRequirements": ["学历要求", "其他基础要求"],
  "responsibilities": ["职责"],
  "keywords": ["关键词"]
}`;
  return chatJson(prompt, JdInfoSchema);
}

/**
 * 10 维评分。role_match / skill_alignment 为门槛维度，
 * 任一低于 gateThreshold 则总分判 0。返回加权总分与明细。
 */
export async function scoreJob(jdInfo: JdInfo): Promise<ScoreResult> {
  const profile = loadProfile();
  const cfg = loadConfig().scoring;

  const skillsText = JSON.stringify(profile.skills ?? {}, null, 0);
  const projectsText = (profile.projects ?? [])
    .map((p) => `- ${p.name}: ${p.description ?? ""}`)
    .join("\n");
  const basics = (profile.basics ?? {}) as Record<string, unknown>;

  const prompt = `你是一个资深求职顾问，服务对象是有 17 年经验的资深前端/全栈工程师（社招）。请对以下岗位进行 10 维度评分（0-10 分）。

## 求职者背景
技能: ${skillsText}
项目:
${projectsText}
目标: ${basics["targetRole"] ?? basics["target_role"] ?? ""}
地点偏好: ${basics["location"] ?? ""}
薪资期望: ${basics["salaryExpectation"] ?? basics["salary_expectation"] ?? "面议"}

## 岗位信息
${JSON.stringify(jdInfo, null, 2)}

## 评分维度（每个 0-10 分）
1. roleMatch: 岗位方向是否匹配前端/全栈/AI 应用落地（门槛维度）
2. skillAlignment: 必需技能覆盖率，重点看 React/Vue/TS/Node/工程化（门槛维度）
3. salary: 薪资竞争力
4. cashFlowStability: 公司现金流与稳定性
5. location: 地理便利性（南京优先，远程可加分）
6. techStack: 技术栈匹配度
7. growthPotential: 长期成长空间
8. companyStage: 公司发展阶段
9. interviewDifficulty: 面试通过可能性（10=很可能通过）
10. workLifeBalance: 工作生活平衡

返回 JSON（camelCase 键 + reasoning）：
{
  "roleMatch": 8, "skillAlignment": 7, "salary": 6, "cashFlowStability": 7,
  "location": 9, "techStack": 8, "growthPotential": 7, "companyStage": 7,
  "interviewDifficulty": 6, "workLifeBalance": 7, "reasoning": "简要理由"
}`;

  const scores = await chatJson(prompt, RawScoreSchema);
  const gate = cfg.gateThreshold;
  const roleGate = scores.roleMatch / 10;
  const skillGate = scores.skillAlignment / 10;

  let total = 0;
  if (roleGate >= gate && skillGate >= gate) {
    for (const [dim, weight] of Object.entries(cfg.weights)) {
      const raw = (scores as Record<string, unknown>)[dim];
      if (typeof raw === "number") total += (raw / 10) * weight;
    }
  }
  total = Math.round(total * 1000) / 1000;

  return { total, details: { ...scores, total } };
}

/**
 * 生成公司画像：行业/规模/评分/优缺点/薪资/加班/技术口碑。
 * 补进评分体系，给候选人公司维度的信息。
 */
export async function profileCompany(companyName: string): Promise<CompanyProfile> {
  const prompt = `分析公司"${companyName}"，生成公司画像。

请返回JSON:
{
  "name": "${companyName}",
  "industry": "所属行业",
  "size": "公司规模(人数)",
  "description": "一句话描述",
  "rating": 7.5,
  "pros": ["优点1", "优点2"],
  "cons": ["缺点1", "缺点2"],
  "avgSalary": "该公司前端/全栈岗平均月薪",
  "workLifeBalance": "加班情况描述",
  "techReputation": "技术口碑"
}`;

  return chatJson(prompt, CompanyProfileSchema);
}
