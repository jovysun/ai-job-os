import { describe, it, expect } from "vitest";
import { CompanyProfileSchema } from "../src/agents/schemas.js";
import { SkillTreeSchema as CoachSkillTree } from "../src/agents/coach.js";

describe("SkillTreeSchema（coach 技能树）", () => {
  it("缺失分类默认空数组，importance 缺省为「中」", () => {
    const parsed = CoachSkillTree.parse({
      required: [{ skill: "React", category: "前端框架" }],
    });
    expect(parsed.required[0]?.importance).toBe("中");
    expect(parsed.preferred).toEqual([]);
    expect(parsed.basic).toEqual([]);
  });

  it("category 为 null 时归一化为空串", () => {
    const parsed = CoachSkillTree.parse({
      required: [{ skill: "TS", category: null, importance: "高" }],
    });
    expect(parsed.required[0]?.category).toBe("");
  });
});

describe("CompanyProfileSchema（公司画像）", () => {
  it("软性字段容忍 null，rating 缺省为 0，pros/cons 缺省为空数组", () => {
    const parsed = CompanyProfileSchema.parse({
      name: "某公司",
      industry: null,
      description: null,
    });
    expect(parsed.industry).toBe("");
    expect(parsed.rating).toBe(0);
    expect(parsed.pros).toEqual([]);
    expect(parsed.cons).toEqual([]);
  });

  it("对象数组的 pros 项被压平为字符串", () => {
    const parsed = CompanyProfileSchema.parse({
      name: "某公司",
      pros: ["技术氛围好", { point: "弹性工作" }],
    });
    expect(parsed.pros[0]).toBe("技术氛围好");
    expect(typeof parsed.pros[1]).toBe("string");
    expect(parsed.pros[1]).toContain("弹性工作");
  });
});
