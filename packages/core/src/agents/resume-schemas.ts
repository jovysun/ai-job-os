import { z } from "zod";

/** 把可能为对象的列表项压平成字符串，容忍 LLM 输出不稳定。 */
const flexibleStrings = z.preprocess((val) => {
  if (!Array.isArray(val)) return val;
  return val.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      return Object.values(item as Record<string, unknown>)
        .filter((v) => typeof v === "string")
        .join("：");
    }
    return String(item);
  });
}, z.array(z.string()));

/** 简历中的单个项目经历。 */
export const ResumeProjectSchema = z.object({
  name: z.string(),
  period: z.string().default(""),
  description: z.string().default(""),
  highlights: flexibleStrings.default([]),
  technologies: flexibleStrings.default([]),
  /** 标记是否为 AI 补充的虚构内容，供人工审阅。默认 false（严守不编造）。 */
  isFabricated: z.boolean().default(false),
});

export type ResumeProject = z.infer<typeof ResumeProjectSchema>;

export const ResumeEducationSchema = z.object({
  school: z.string(),
  degree: z.string().default(""),
  major: z.string().default(""),
  period: z.string().default(""),
  gpa: z.string().default(""),
});

export type ResumeEducation = z.infer<typeof ResumeEducationSchema>;

export const ResumeContactSchema = z.object({
  email: z.string().default(""),
  phone: z.string().default(""),
  github: z.string().default(""),
  location: z.string().default(""),
});

/** 技能分区：键为分类（frontend/backend/…），值为技能条目。 */
export const ResumeSkillsSchema = z.record(z.string(), z.array(z.string()));

/** 完整简历数据，Tailor 产出、Renderer 消费。 */
export const ResumeDataSchema = z.object({
  name: z.string().default(""),
  contact: ResumeContactSchema.prefault({}),
  summary: z.string().default(""),
  education: z.array(ResumeEducationSchema).default([]),
  skills: ResumeSkillsSchema.default({}),
  projects: z.array(ResumeProjectSchema).default([]),
});

export type ResumeData = z.infer<typeof ResumeDataSchema>;

/**
 * Reviewer 审查报告：事实核查发现 + 判定。
 * 软性字段用 flexibleStrings 归一化，容忍 LLM 返回对象数组。
 */
export const ReviewReportSchema = z.object({
  fabrications: z
    .array(
      z.object({
        location: z.string().default(""),
        issue: z.string().default(""),
        evidence: z.string().default(""),
        severity: z.enum(["高", "中", "低"]).default("中"),
      }),
    )
    .default([]),
  matchGaps: flexibleStrings.default([]),
  overClaims: flexibleStrings.default([]),
  qualitySuggestions: flexibleStrings.default([]),
  overallVerdict: z.enum(["pass", "revise", "reject"]).default("revise"),
  summary: z.string().default(""),
});

export type ReviewReport = z.infer<typeof ReviewReportSchema>;
