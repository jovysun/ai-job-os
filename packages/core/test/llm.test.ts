import { describe, it, expect } from "vitest";
import { extractJson } from "../src/llm/client.js";

describe("extractJson", () => {
  it("剥离 markdown 代码块围栏", () => {
    const input = '```json\n{"a": 1}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ a: 1 });
  });

  it("去掉 <think> 包裹", () => {
    const input = '<think>让我想想</think>\n{"b": 2}';
    expect(JSON.parse(extractJson(input))).toEqual({ b: 2 });
  });

  it("从噪声中截取花括号范围", () => {
    const input = '这是结果：{"c": 3} 完毕';
    expect(JSON.parse(extractJson(input))).toEqual({ c: 3 });
  });

  it("处理嵌套对象", () => {
    const input = '```\n{"x": {"y": [1, 2]}}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ x: { y: [1, 2] } });
  });
});
