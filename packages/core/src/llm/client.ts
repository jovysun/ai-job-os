import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";
import { loadConfig, requireApiKey } from "../load-config.js";
import type { AppConfig } from "../config.js";

export interface ChatOptions {
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

const RETRYABLE_HINTS = [
  "rate limit",
  "ratelimit",
  "timeout",
  "timed out",
  "connection",
  "overloaded",
  "econnreset",
  "429",
  "500",
  "502",
  "503",
];

function isRetryable(err: unknown): boolean {
  const text = `${err instanceof Error ? err.name : ""} ${
    err instanceof Error ? err.message : String(err)
  }`.toLowerCase();
  if (text.includes("auth") || text.includes("api_key") || text.includes("401")) {
    return false;
  }
  return RETRYABLE_HINTS.some((h) => text.includes(h));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 去掉 <think>…</think> 包裹、markdown 代码块围栏，提取纯 JSON。 */
export function extractJson(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (t.includes("```")) {
    const lines = t.split("\n");
    const jsonLines: string[] = [];
    let inside = false;
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inside = !inside;
        continue;
      }
      if (inside) jsonLines.push(line);
    }
    if (jsonLines.length) t = jsonLines.join("\n");
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return t.trim();
}

async function callProvider(
  cfg: AppConfig,
  prompt: string,
  opts: ChatOptions,
): Promise<string> {
  const { llm } = cfg;
  const apiKey = requireApiKey(cfg);
  const model = opts.model ?? llm.model;
  const temperature = opts.temperature ?? llm.temperature;
  const maxTokens = opts.maxTokens ?? llm.maxTokens;
  const system = opts.system ?? "你是一个专业的 AI 求职助手。";

  if (llm.provider === "anthropic") {
    const client = new Anthropic({ apiKey, ...(llm.baseUrl ? { baseURL: llm.baseUrl } : {}) });
    const resp = await client.messages.create({
      model,
      system,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    });
    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  const client = new OpenAI({ apiKey, ...(llm.baseUrl ? { baseURL: llm.baseUrl } : {}) });
  const resp = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  return resp.choices[0]?.message.content ?? "";
}

/** 发起一次对话补全，返回清洗后的纯文本。带指数退避重试。 */
export async function chat(prompt: string, opts: ChatOptions = {}): Promise<string> {
  const cfg = loadConfig();
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const raw = await callProvider(cfg, prompt, opts);
      return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const delay = RETRY_BASE_MS * 2 ** attempt;
      console.warn(
        `[llm] 调用失败（第 ${attempt + 1}/${MAX_RETRIES} 次），${delay}ms 后重试：${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * 发起对话并用 zod schema 校验返回的 JSON。
 * LLM 输出不可靠，schema 校验是一等公民而非事后补丁。
 */
export async function chatJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts: ChatOptions = {},
): Promise<T> {
  const system =
    opts.system ?? "你是一个专业的 AI 求职助手。回复必须是合法 JSON，不要包含任何其他内容。";
  const text = await chat(prompt, { ...opts, system });
  const jsonText = extractJson(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `LLM 返回的不是合法 JSON：${err instanceof Error ? err.message : String(err)}\n原文：${jsonText.slice(0, 200)}`,
    );
  }
  return schema.parse(parsed);
}
