# ai-job-os 迭代待办（TODO Roadmap）

> 记录于 2026-07-29。核心路线（里程碑 1-4）已全部完成并 git 提交（commit c7b19d5）。
> 本文件记录「对照 ai-job-search + JobOS 两个开源库梳理后，尚未在 TS 版实现」的功能，按优先级排列。
> 每项实现后打勾并补充说明；实现过程中的工程故事记入 [project-narrative.md](./project-narrative.md)。

---

## 待实现（按优先级）

### [x] P1. 面试资料生成（coach agent）

**来源**：JobOS 的 `agents/coach.py`（Python 版有完整实现，直接移植）
**价值**：高——把作品补全成"求职全链路"（采集→评分→简历→**面试**）的关键一块，叙事完整
**成本**：中

**已实现**（`packages/core/src/agents/coach.ts`）：
1. ✅ `extractSkillTree(jdInfo)` — 三级技能树（required/preferred/basic），zod 校验
2. ✅ `generateStudyPath(skillTree, targetWeeks=2)` — 按周备考路径
3. ✅ `generateEightPartEssay(skillTree)` — 八股速查
4. ✅ `generateMockQuestions(jdInfo, resumeData?)` — 15 题模拟面试
5. ✅ `generateInterviewPack(jdInfo, resumeData?)` — 组装完整资料包（后三项并行生成）

**落地**：
- ✅ `packages/core/src/agents/coach.ts` + schema（沿用 zod + chatJson/chat 模式）
- ✅ `agents/index.ts` + 顶层 `core/index.ts` 导出
- ✅ CLI `interview` 命令（`--with-resume` 可选，输出 Markdown 资料包）
- ✅ MCP `jobos_interview` 工具
- ✅ 测试：`test/agents-schemas.test.ts` 覆盖技能树 schema 归一化

---

### [x] P2. 公司画像（company profile）

**来源**：JobOS 的 `agents/analyst.py` 里的 `profile_company()`（Python 版现成）
**价值**：中——给候选人公司维度信息（行业/规模/薪资/加班/优缺点/评分）
**成本**：低

**已实现**（作为独立查询能力）：
- ✅ `profileCompany(companyName)` — LLM 生成公司画像（`analyst.ts`）+ `CompanyProfileSchema`（`schemas.ts`）
- ✅ CLI `company` 命令
- ✅ MCP `jobos_company` 工具
- ✅ 测试：公司画像 schema 归一化（null 容忍、对象数组压平）

**范围说明**：当前实现为独立的公司画像查询，不落库、也不并入 10 维评分。
「把公司维度并入评分」是一个更大的产品决策（需要 `companies` 表、评分时联查、权重设计），
暂不做——避免为了"补进评分"而过度设计。真有需要时再作为独立一项立项。

---

### [x] P3. 投递结果追踪（application tracking）

**来源**：ai-job-search 的 `outcome` / `rank` 命令
**价值**：中——让作品从"生成材料"延伸到"闭环管理"，体现产品完整性
**成本**：中

**已实现**：
- ✅ DB 加 `applications` 表（job_id 唯一 / status / applied_at / notes / updated_at）
  - 状态枚举 `APPLICATION_STATUSES`：未投递 / 已投递 / 笔试 / 一面 / 二面 / HR面 / Offer / 拒绝 / 放弃
- ✅ `db/index.ts` CRUD：`upsertApplication` / `updateApplicationStatus` / `getApplicationBoard`（join 岗位信息，可按状态过滤）
  - upsert 用 `ON CONFLICT + COALESCE`：重复投递不覆盖已有 applied_at/notes
- ✅ CLI 命令：`apply`（记录投递）/ `status`（更新状态）/ `board`（投递看板）
- ✅ 已用真实 sqlite 冒烟验证全链路（插入→投递→改状态→看板→过滤）

**注**：`applications` 表结构参考了 Python 版 `db.py` 的设计（去掉 resume_path/interview_pack_path 等暂未用到的列，保持精简）。

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

- ✅ core：LLM 客户端（多 provider + 重试 + zod 校验）+ analyst（10 维评分 + 公司画像）+ tailor（起草-审阅闭环）+ coach（面试资料包）+ node:sqlite（岗位 + 投递追踪）
- ✅ crawlers：多平台采集 + Boss 3 级降级链（Playwright/cookie/curated）+ 去重入库
- ✅ resume-render：React → PDF
- ✅ mcp：MCP Server（6 工具：search/analyze/resume/greeting/interview/company）
- ✅ cli：search / analyze / resume / interview / company / apply / status / board
- ✅ web：Next.js 预览（评分 + 简历 PDF 实时预览）
- ✅ CI：GitHub Actions

## 迭代 2（P1-P3，2026-07-30 完成）

- ✅ P1 面试资料生成（coach agent）
- ✅ P2 公司画像（company profile）
- ✅ P3 投递结果追踪（application tracking）
