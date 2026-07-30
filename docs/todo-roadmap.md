# ai-job-os 迭代待办（TODO Roadmap）

> 记录于 2026-07-29。核心路线（里程碑 1-4）已全部完成并 git 提交（commit c7b19d5）。
> 本文件记录「对照 ai-job-search + JobOS 两个开源库梳理后，尚未在 TS 版实现」的功能，按优先级排列。
> 每项实现后打勾并补充说明；实现过程中的工程故事记入 [project-narrative.md](./project-narrative.md)。

---

## 待实现（按优先级）

### [ ] P1. 面试资料生成（coach agent）

**来源**：JobOS 的 `agents/coach.py`（Python 版有完整实现，直接移植）
**价值**：高——把作品补全成"求职全链路"（采集→评分→简历→**面试**）的关键一块，叙事完整
**成本**：中

**要移植的四个能力**（对应 Python `coach.py`）：
1. `extractSkillTree(jdInfo)` — 从 JD 提取技能树，三级分类（required / preferred / basic）
2. `generateStudyPath(skillTree, targetWeeks)` — 按周学习路径（面向资深工程师，查漏补缺而非从零）
3. `generateEightPartEssay(skillTree)` — 八股文速查（每技能点 3-5 高频题 + 核心答案 + 追问方向，标注[必背]/[了解]）
4. `generateMockQuestions(jdInfo, resumeData)` — 15 题模拟面试（项目拷打6 + 技术深度5 + 工程素养2 + 行为2）
5. `generateInterviewPack(jdInfo, resumeData)` — 组装完整资料包

**落地位置**：
- `packages/core/src/agents/coach.ts` + schema（沿用 zod + chatJson 模式）
- `packages/core/src/agents/index.ts` 导出
- CLI 加 `interview` 命令
- MCP 加 `jobos_interview` 工具（Python 版 MCP 有此工具，参照）
- Web 可加"面试准备"tab（可选）

**参考源文件**：`D:\workspace\job-search\agents\coach.py`

---

### [ ] P2. 公司画像（company profile）

**来源**：JobOS 的 `agents/analyst.py` 里的 `profile_company()`（Python 版现成）
**价值**：中——补进评分体系，给候选人公司维度信息（行业/规模/薪资/加班/优缺点/评分）
**成本**：低

**要移植**：
- `profileCompany(companyName)` — LLM 生成公司画像 JSON（industry/size/rating/pros/cons/avgSalary/workLifeBalance/techReputation）
- 落地：`packages/core/src/agents/analyst.ts` 加函数 + zod schema
- CLI/MCP 可加 `company` 命令/工具

**参考源文件**：`D:\workspace\job-search\agents\analyst.py`（`profile_company` 函数）

---

### [ ] P3. 投递结果追踪（application tracking）

**来源**：ai-job-search 的 `outcome` / `rank` 命令
**价值**：中——让作品从"生成材料"延伸到"闭环管理"，体现产品完整性
**成本**：中

**要实现**：
- DB 加 `applications` 表（job_id / status / applied_at / notes / updated_at）
  - 状态枚举：未投递 / 已投递 / 笔试 / 一面 / 二面 / HR面 / Offer / 拒绝 / 放弃
- `packages/core/src/db/` 加投递记录的 CRUD
- CLI 加命令：记录投递、更新状态、列出投递看板
- 可选：投递复盘（哪些岗位卡在哪个环节）

**注**：`applications` 表结构可参考 Python 版 `db.py` 里已有的 applications / interview_materials 表设计。

---

## 明确不做

- **自动投递**（AIHawk/JobOS 风格）——封号风险高，且对作品是减分项（易被视为灰产工具）。放弃。

## 其他低优先级（想到再说）

- HTML 报告导出（ai-job-search 有）
- Notion / Gmail 同步（ai-job-search 有）
- Cover Letter 生成（国内用得少）
- 批量/定时调度（JobOS batch 模式）

---

## 已完成（里程碑 1-4，仅备查）

- ✅ core：LLM 客户端（多 provider + 重试 + zod 校验）+ analyst（10 维评分）+ tailor（起草-审阅闭环）+ node:sqlite
- ✅ crawlers：多平台采集 + Boss 3 级降级链（Playwright/cookie/curated）+ 去重入库
- ✅ resume-render：React → PDF
- ✅ mcp：MCP Server（4 工具）
- ✅ cli：search / analyze / resume
- ✅ web：Next.js 预览（评分 + 简历 PDF 实时预览）
- ✅ CI：GitHub Actions
