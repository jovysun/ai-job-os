import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const PROFILE_PATH = resolve(REPO_ROOT, "data", "profile.yaml");

/** 求职者档案（data/profile.yaml）。结构保持灵活，评分/简历按需读取。 */
export interface Profile {
  basics?: Record<string, unknown>;
  skills?: Record<string, string[]>;
  projects?: Array<{ name: string; description?: string; [k: string]: unknown }>;
  preferences?: Record<string, unknown>;
  [k: string]: unknown;
}

let cached: Profile | null = null;

export function loadProfile(): Profile {
  if (cached) return cached;
  if (!existsSync(PROFILE_PATH)) {
    throw new Error(`找不到求职者档案：${PROFILE_PATH}`);
  }
  cached = parseYaml(readFileSync(PROFILE_PATH, "utf-8")) as Profile;
  return cached;
}

export function clearProfileCache(): void {
  cached = null;
}
