# CLAUDE.md — ai-job-os 工程规范

> 本文件是项目的「工程宪法」，供所有 AI Agent 迭代前阅读。目标：让任何 Agent 都能产出**与现有代码同构**的改动。
> 规范源自代码里已经稳定运行的模式，不是理想化清单。改动前先读本文件，遇到与本文件冲突的现状以**代码现状**为准并回来更新本文件。

---

## 1. 这是什么项目

AI 求职操作系统：多平台岗位采集 → 10 维评分 → 简历定制 → 面试准备 → 投递追踪。
面向有经验的工程师（社招）自用，同时是一份**求职作品**——因此"工程严谨性"本身就是产品价值的一部分，叙事记录在 `docs/project-narrative.md`。

**技术栈**：TypeScript(strict) · pnpm workspace 单仓多包 · Node `node:sqlite`(内置) · zod · React + `@react-pdf/renderer` · Playwright · MCP SDK · Next.js · vitest。

---

## 2. 铁律（违反 = 严重错误）

1. **不编造简历内容**。简历相关 Agent 的唯一事实来源是 `data/profile.yaml`。任何项目/数据/头衔/时间都必须能在档案中找到出处。允许"重组、突出、措辞优化"，不允许无中生有。这是产品的信任底线，见 `tailor.ts` 的 Drafter-Reviewer-Revise 闭环。
2. **不信任 LLM 输出**。每个返回结构化数据的 LLM 调用必须走 `chatJson(prompt, zodSchema)`，schema 校验是一等公民而非事后补丁。禁止 `chat()` + `JSON.parse()` 裸用。
3. **不信任用户/外部输入**。CLI 参数、DB 外键、爬取数据在进入核心逻辑前都要校验并给**可读的中文错误**。
4. **密钥零硬编码**。API key、cookie 一律从环境变量或 gitignore 的文件读取。提交前扫描（见 §9）。
5. **提交/推送前必过 quality gate**：`pnpm typecheck && pnpm test && pnpm -r build` 全绿（见 §8）。

---

## 3. 目录与包边界

```
packages/
  core/          # 引擎：llm/ db/ agents/ config。不依赖任何其他包
  crawlers/      # 爬虫：依赖 core。JobSource 接口 + 聚合去重
  resume-render/ # React→PDF：依赖 core
  mcp/           # MCP Server：薄适配层，依赖 core + crawlers
  cli/           # 命令行入口：薄适配层，依赖 core + resume-render + crawlers
  web/           # Next.js 预览：API 路由复用 core
docs/            # project-narrative.md(工程叙事) + todo-roadmap.md(待办)
data/            # profile.yaml / jobs.db / fonts / cookies —— 全部 gitignore
```

**依赖方向铁律**：`core` 是根，谁都能依赖它，它不依赖任何业务包。`cli`/`mcp`/`web` 是**薄适配层**——业务逻辑写在 `core`，适配层只做参数解析和输出格式化。新功能优先落在 `core`，让三个入口都能复用。

**判断落点**：可复用的业务逻辑 → `core/agents` 或 `core/db`；采集逻辑 → `crawlers`；仅 CLI/MCP/Web 的展示逻辑 → 对应入口包。

---

## 4. LLM Agent 编写模式（core/agents）

新增一个 Agent 能力时，严格照此模式（参考 `analyst.ts` / `coach.ts`）：

1. **Schema 先行**。在 `schemas.ts`（或就近的 `*-schemas.ts`）用 zod 定义返回结构。软性字段（列表、可能为 null 的字符串）用 `zod-helpers.ts` 的 `nullableString()` / `flexibleStringArray()` 做防御性归一化——LLM 常把字符串数组返回成对象数组、把"未知"返回成 null，这些必须在 schema 层吸收，而不是让校验整个失败。
2. **结构化输出走 `chatJson(prompt, Schema, opts?)`**；长文本(Markdown 八股/学习路径等)走 `chat(prompt, opts?)`。
3. **prompt 里内联期望的 JSON 形状**（camelCase 键），并在 `system` 里强调"必须返回合法 JSON"。
4. **有依赖关系才串行，无依赖必并行**。如 `generateInterviewPack`：先 `await extractSkillTree`，再 `Promise.all` 并行三个下游生成。移植/重构时主动识别可并行的串行代码。
5. **导出三处对齐**：`agents/<name>.ts` 实现 → `agents/index.ts` 导出 → 需要跨包用则在 `core/src/index.ts` 平铺导出类型。
6. **面向"17 年经验资深工程师(社招)"写 prompt**——这是全项目统一的用户画像，措辞（查漏补缺而非从零、STAR 润色等）要一致。

---

## 5. 数据层规范（core/db）

- **Node 内置 `node:sqlite`**，零原生依赖。禁止引入 `better-sqlite3` 等需编译的库。
- **连接惰性单例**：`getDb()` 首次调用才打开，`PRAGMA journal_mode=WAL` + `PRAGMA foreign_keys=ON` 必须都开。
- **DB 路径可注入**：优先 `process.env.JOBOS_DB_PATH`（测试用临时库或 `:memory:`），回退仓库根 `data/jobs.db`。**新代码不要再硬编码路径**。
- **写操作要幂等 + 防孤儿**：
  - 去重/更新用 `INSERT ... ON CONFLICT(...) DO UPDATE`；需要保护已有值时用 `COALESCE`（注意方向：`applied_at` 保护旧值、`notes` 优先新值，这类不对称是刻意的）。
  - 插入带外键的记录前，**先校验父行存在**并抛可读错误（见 `upsertApplication`）——光靠 FK 约束会静默失败或被 JOIN 隐藏。
- **字段命名**：DB 列用 `snake_case`，TS 接口用 `camelCase`，在 `rowToXxx()` 映射函数里转换。爬虫 `RawJob` 字段与 `db.JobRecord` 对齐。

---

## 6. 爬虫规范（crawlers）

- 每个数据源实现 `JobSource` 接口（`{ name, search(keyword, city, opts?) }`），放在 `sources/`。
- 新增平台：实现一个 `search` → 在 `aggregator.ts` 注册 → 加进 `Platform` 联合类型。
- **重量级/可选依赖(Playwright)用动态 `import()`**，不要在 barrel 静态导出——否则会被 webpack 静态打包拖垮 web 构建（见 narrative #19）。
- 降级链思想：多级 fallback，任一级失败自动降级，最底层是离线可用的 `curated` 策展数据。
- 归一化逻辑（如 `normalizeBossJob`）单点维护，多个同源爬虫共享。

---

## 6.5 CLI 输入约定（cli）

- **大段文本输入（如 JD）不走命令行位置参数**——多行/引号/`$`/括号会被 shell 截断或误解析。统一用 `jd-input.ts` 的 `resolveJdText()`：优先级 **`--file` 文件 > stdin 管道 > 位置参数**，三者皆空抛可读错误并给出三平台（Windows/macOS/Linux）用法示例。
- 吃 JD 的命令（`analyze`/`resume`/`interview`）位置参数用 `[jdText]`（可选）而非 `<jdText>`（必填），并加 `-f, --file <path>` 选项。
- 输入解析逻辑抽成独立模块（`jd-input.ts`）并单测（`test/jd-input.test.ts`，注入 `readPiped` 模拟 stdin）——**不要把逻辑埋在 `.action()` 里导致无法测试**。处理 UTF-8 BOM（Windows 记事本另存常带）。

---

## 7. TypeScript / 代码风格

- **全项目 strict**，且 `tsconfig.base.json` 开了 `noUncheckedIndexedAccess` / `noImplicitOverride` / `noFallthroughCasesInSwitch`。所有包 `extends` 这个 base。
- **模块系统 NodeNext**：相对 import **必须带 `.js` 扩展名**（即使源文件是 `.ts`）。例：`import { chat } from "../llm/index.js"`。
- **workspace 包类型入口指向源码**（`exports.types` → `./src/index.ts`），与 `core` 一致，保证 typecheck 不依赖 `dist/`（见 narrative #27 的踩坑）。含 tsx 的消费方 tsconfig 需设 `jsx: "react-jsx"`。
- 注释写"为什么"，不写"是什么"。中文注释，与现有风格一致。
- 不引入格式化/lint 工具改动既有风格；新代码匹配周边代码的命名、注释密度、缩进。
- 错误信息面向使用者、用中文、给出下一步动作（"请先用 `jobos search` 采集…"）。

---

## 8. Quality Gate（提交前必做）

CI（`.github/workflows/ci.yml`，触发分支 `main` + `master`）跑这三步，本地必须先全绿：

```bash
pnpm typecheck   # 全包类型检查
pnpm test        # vitest
pnpm -r build    # 全包构建（含 web）
```

**CI 的本质是模拟"别人 clone 你的干净环境"**。本地的依赖缓存、残留 `dist/`、历史批准都会骗你"能跑"。修 CI 问题的正确姿势：

```bash
rm -rf node_modules packages/*/dist && pnpm install --frozen-lockfile
```

在这个干净环境里复现、验证通过再推——**不要"改一版推上去碰运气"**，红叉历史本身减分（见 narrative #27）。

- **pnpm 11 的构建脚本审批**用 `pnpm-workspace.yaml` 的 `allowBuilds: { esbuild: true, sharp: true }`（不是旧的 `onlyBuiltDependencies` 列表）。新增带 install 脚本的依赖若 CI 报 `ERR_PNPM_IGNORED_BUILDS`，在此追加。
- **测试用真实 sqlite**：新 DB 逻辑写单测时，在 import db 模块前设 `process.env.JOBOS_DB_PATH` 指向临时库，`afterAll` 清理（见 `test/db-applications.test.ts`）。`vitest.config.ts` 里有 `node:sqlite` 的虚拟模块垫片，勿删。

---

## 9. 安全与隐私

- **gitignore 已覆盖**：`config.local.yaml`、`data/profile.yaml`、`data/*.db`、`.env`、`data/.boss_cookies.txt`、`data/.boss_browser_profile/`。新增敏感文件先加 gitignore。
- **提交前扫描密钥**（推送公开仓库尤其重要）：
  ```bash
  git ls-files | xargs grep -inE "sk-[a-z0-9]{20}|api[_-]?key.*[:=].*['\"][a-z0-9]{15}|__zp_stoken__" | grep -v "process.env\|YOUR_\|example"
  ```
- **API key 解析优先级**：环境变量 > 配置文件。占位符（`YOUR_API_KEY` 等）视为未配置并抛错。见 `load-config.ts`。

---

## 10. 工作流约定

- **改动前用 TaskCreate 拆任务**（≥3 步的工作）；按 P0(可用性) > P1(完整性) > P2(打磨) 排优先级。
- **完成一块功能后，切"PM/用户视角"自审再提交**：功能能跑 ≠ 功能可用。重点查"闭环是否打通"（如数据链路：用户能否拿到串联各命令所需的 id）。
- **值得写进简历的工程决策记入 `docs/project-narrative.md`**，沿用「背景 → 决策/方案 → 值得说的点 + 面试话术」格式，编号递增。待办勾选更新 `docs/todo-roadmap.md`。
- **主动做减法**：移植参考实现时按"现在真的需要什么"裁剪，不预先埋用不上的字段/表。判断"什么不该做"和实现同等重要。
- **提交信息**：`type(scope): 中文摘要` + 正文说清 what/why。类型用 `feat/fix/docs/refactor/test/chore`。
- **提交/推送需用户明确要求**才做（外向、难撤销的操作）。当前默认工作分支 `master`，仓库 `github.com/jovysun/ai-job-os`（公开）。国内推送可能需 git 代理。

---

## 11. 新功能落地检查清单

复制一份需要的：

- [ ] 业务逻辑落在 `core`（而非入口包）？
- [ ] LLM 返回结构走了 `chatJson` + zod schema？软性字段做了归一化？
- [ ] 相对 import 带 `.js` 扩展名？
- [ ] 三处导出对齐（实现 → agents/index → core/index）？
- [ ] DB 写操作幂等 + 外键父行校验？路径未硬编码？
- [ ] CLI/MCP/Web 三个入口按需接入（薄适配）？
- [ ] 核心逻辑补了 vitest 单测（用临时 DB）？
- [ ] `pnpm typecheck && pnpm test && pnpm -r build` 全绿？
- [ ] 密钥扫描干净？新敏感文件已 gitignore？
- [ ] roadmap 勾选 + narrative 记录（若是值得说的决策）？
