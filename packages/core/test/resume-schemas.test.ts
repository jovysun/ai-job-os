import { describe, it, expect } from "vitest";
import { ReviewReportSchema, ResumeProjectSchema } from "../src/agents/resume-schemas.js";

describe("ReviewReportSchema 防御性归一化", () => {
  it("对象数组的建议项被压平为字符串", () => {
    const parsed = ReviewReportSchema.parse({
      qualitySuggestions: [
        "直接的字符串建议",
        { location: "summary", suggestion: "更精炼" },
      ],
      overallVerdict: "revise",
    });
    expect(parsed.qualitySuggestions[0]).toBe("直接的字符串建议");
    expect(typeof parsed.qualitySuggestions[1]).toBe("string");
    expect(parsed.qualitySuggestions[1]).toContain("更精炼");
  });

  it("缺失字段用默认值填充", () => {
    const parsed = ReviewReportSchema.parse({});
    expect(parsed.fabrications).toEqual([]);
    expect(parsed.overallVerdict).toBe("revise");
  });
});

describe("ResumeProjectSchema", () => {
  it("highlights 容忍对象项", () => {
    const parsed = ResumeProjectSchema.parse({
      name: "测试项目",
      highlights: ["要点一", { text: "要点二" }],
    });
    expect(parsed.highlights).toHaveLength(2);
    expect(parsed.highlights.every((h) => typeof h === "string")).toBe(true);
  });

  it("isFabricated 默认 false（不编造铁律）", () => {
    const parsed = ResumeProjectSchema.parse({ name: "x" });
    expect(parsed.isFabricated).toBe(false);
  });
});
