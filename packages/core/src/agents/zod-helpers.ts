import { z } from "zod";

/**
 * 容忍 null 的字符串：LLM 常把"未知"字段返回成 null 而非省略，
 * `.default()` 只在字段缺失时生效、对 null 无效，故用 preprocess 把 null/undefined 归一化为空串。
 */
export function nullableString(fallback = "") {
  return z.preprocess(
    (v) => (v === null || v === undefined ? fallback : v),
    z.string(),
  );
}

/**
 * 容忍 null 的字符串数组：null/undefined → []，
 * 且数组内的对象项压平为字符串（LLM 有时把字符串项返回成结构化对象）。
 */
export function flexibleStringArray() {
  return z.preprocess((v) => {
    if (v === null || v === undefined) return [];
    if (!Array.isArray(v)) return v;
    return v.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        return Object.values(item as Record<string, unknown>)
          .filter((x) => typeof x === "string")
          .join("：");
      }
      return String(item);
    });
  }, z.array(z.string()));
}
