import { z } from "zod";
import { nullableString, flexibleStringArray } from "./zod-helpers.js";

/** analyze_jd 返回的结构化 JD 信息。字符串字段容忍 LLM 返回 null。 */
export const JdInfoSchema = z.object({
  title: nullableString(),
  company: nullableString(),
  location: nullableString(),
  salary: nullableString(),
  jobType: nullableString(),
  requiredSkills: flexibleStringArray(),
  preferredSkills: flexibleStringArray(),
  basicRequirements: flexibleStringArray(),
  responsibilities: flexibleStringArray(),
  keywords: flexibleStringArray(),
});

export type JdInfo = z.infer<typeof JdInfoSchema>;

/** 10 维评分 LLM 返回结构。每维 0-10，外加一段理由。 */
export const RawScoreSchema = z.object({
  roleMatch: z.number(),
  skillAlignment: z.number(),
  salary: z.number(),
  cashFlowStability: z.number(),
  location: z.number(),
  techStack: z.number(),
  growthPotential: z.number(),
  companyStage: z.number(),
  interviewDifficulty: z.number(),
  workLifeBalance: z.number(),
  reasoning: nullableString(),
});

export type RawScore = z.infer<typeof RawScoreSchema>;

export interface ScoreResult {
  total: number;
  details: RawScore & { total: number };
}
