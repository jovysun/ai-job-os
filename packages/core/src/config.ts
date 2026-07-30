import { z } from "zod";

/** LLM provider 配置。API key 优先从环境变量读取，回退到配置文件。 */
export const LlmConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai"]).default("openai"),
  model: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

/** 10 维评分权重。键名与评分 prompt 中的维度一一对应。 */
export const ScoringConfigSchema = z.object({
  weights: z.record(z.string(), z.number()),
  gateThreshold: z.number().min(0).max(1).default(0.4),
  displayRecommend: z.number().min(0).max(1).default(0.65),
  displayConsider: z.number().min(0).max(1).default(0.45),
});

export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

export const SearchConfigSchema = z.object({
  defaultLocation: z.string().default("南京"),
  defaultKeywords: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default(["boss"]),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

export const AppConfigSchema = z.object({
  llm: LlmConfigSchema,
  scoring: ScoringConfigSchema,
  search: SearchConfigSchema.prefault({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
