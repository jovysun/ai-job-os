import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { AppConfigSchema, type AppConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 仓库根：packages/core/src → ../../../
const REPO_ROOT = resolve(__dirname, "../../..");

const LOCAL_CONFIG = resolve(REPO_ROOT, "config.local.yaml");
const BASE_CONFIG = resolve(REPO_ROOT, "config.yaml");

const PLACEHOLDER_KEYS = new Set([
  "",
  "YOUR_API_KEY",
  "YOUR_ANTHROPIC_API_KEY",
  "sk-your-key",
]);

let cached: { config: AppConfig; at: number } | null = null;
const TTL_MS = 60_000;

/** camelCase 归一：把 YAML 里的 snake_case 键转成 schema 期望的 camelCase。 */
function normalizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(normalizeKeys);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[camel] = normalizeKeys(v);
    }
    return out;
  }
  return input;
}

function readRawConfig(): unknown {
  const path = existsSync(LOCAL_CONFIG) ? LOCAL_CONFIG : BASE_CONFIG;
  if (!existsSync(path)) {
    throw new Error(
      `找不到配置文件：${BASE_CONFIG}。请复制 config.example.yaml 为 config.local.yaml 并填入配置。`,
    );
  }
  return parseYaml(readFileSync(path, "utf-8"));
}

/**
 * 加载并校验配置（带 60s 缓存）。
 * API key 解析优先级：环境变量 > 配置文件。占位符视为未配置。
 */
export function loadConfig(): AppConfig {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.config;

  const raw = normalizeKeys(readRawConfig());
  const config = AppConfigSchema.parse(raw);

  // 环境变量优先（推荐做法，避免 key 明文落在配置文件里）
  const envKey =
    config.llm.provider === "anthropic"
      ? process.env["ANTHROPIC_API_KEY"]
      : process.env["OPENAI_API_KEY"] ?? process.env["LLM_API_KEY"];
  if (envKey) config.llm.apiKey = envKey;

  cached = { config, at: now };
  return config;
}

/** 校验 LLM key 已配置，否则抛出可读错误。 */
export function requireApiKey(cfg: AppConfig): string {
  const key = (cfg.llm.apiKey ?? "").trim();
  if (PLACEHOLDER_KEYS.has(key)) {
    throw new Error(
      "LLM api_key 尚未配置。请设置环境变量（OPENAI_API_KEY / ANTHROPIC_API_KEY）" +
        "或在 config.local.yaml 中填入真实 key。",
    );
  }
  return key;
}

export function clearConfigCache(): void {
  cached = null;
}
