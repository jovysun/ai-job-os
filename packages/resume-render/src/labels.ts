/** 技能分类英文键 → 中文标签。 */
export const SKILL_LABELS: Record<string, string> = {
  frontend: "前端核心",
  engineering: "工程化",
  stateManagement: "状态管理",
  state_management: "状态管理",
  backend: "后端/全栈",
  aiCollaboration: "AI 协同",
  ai_collaboration: "AI 协同",
  testing: "测试与质量",
  languages: "编程语言",
  frameworks: "框架",
  tools: "开发工具",
  others: "其他",
};

export function skillLabel(key: string): string {
  return SKILL_LABELS[key] ?? key;
}
