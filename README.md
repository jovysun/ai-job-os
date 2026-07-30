# ai-job-os

> AI 求职操作系统 —— 多平台岗位采集、10 维智能评分、简历定制、面试准备，一条龙。

面向有经验的工程师（社招），用 AI 把「找工作」这件事工程化：从岗位发现到面试通关的全链路辅助。

[![CI](https://github.com/jovysun/ai-job-os/actions/workflows/ci.yml/badge.svg)](https://github.com/jovysun/ai-job-os/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-green.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

## 特性

- **10 维岗位评分** —— 角色匹配 / 技能对齐为门槛维度，加权综合打分，一眼看出该不该投
- **LLM 工程化** —— 多 provider 抽象（Anthropic / OpenAI 兼容）、指数退避重试、zod 校验 LLM 输出、think 标签清洗
- **MCP Server** —— 4 个工具接入 Claude Code / Cursor，用自然语言调用求职引擎
- **零编造简历定制** —— 以个人档案为唯一事实来源，起草-审阅-修订闭环抓出夸大表述
- **React → PDF 简历渲染** —— 用 `@react-pdf/renderer` 组件化渲染，支持中文，可扩展多模板
- **面试资料生成** —— 技能树 / 学习路径 / 八股 / 模拟面试（规划中）
- **MCP Server** —— 接入 Claude Code / Cursor 等 Agent 客户端（规划中）
- **零原生依赖** —— 数据层用 Node 内置 `node:sqlite`，clone 即用，无需编译

## 技术栈

TypeScript（strict）· pnpm workspace 单仓多包 · Node 24 `node:sqlite` · zod · React + `@react-pdf/renderer`（简历渲染）· Playwright（爬虫）· MCP SDK · vitest

## MCP Server

接入 Claude Code / Cursor / Windsurf 等 AI 编辑器，用自然语言直接调用求职引擎。

```json
{
  "mcpServers": {
    "jobos": {
      "command": "pnpm",
      "args": ["--filter", "@ai-job-os/mcp", "start"],
      "cwd": "/path/to/ai-job-os"
    }
  }
}
```

**暴露的工具**：

| 工具 | 说明 |
|------|------|
| `jobos_search` | 多平台搜索岗位（Boss/牛客/策展） |
| `jobos_analyze` | 分析 JD 并做 10 维评分 |
| `jobos_resume` | 生成定制简历（起草-审阅闭环，零编造） |
| `jobos_greeting` | 生成 Boss 直聘打招呼语 |

## 项目结构

```
ai-job-os/
├── packages/
│   ├── core/              # 核心引擎
│   │   ├── src/llm/       # LLM 客户端（多 provider + 重试 + zod 校验）
│   │   ├── src/db/        # node:sqlite 数据层
│   │   ├── src/agents/    # 分析师（评分）+ 裁缝（起草-审阅简历）Agent
│   │   └── src/config.ts  # zod 定义的配置 schema
│   ├── resume-render/     # React → PDF 简历渲染（多模板）
│   ├── crawlers/          # 多平台爬虫（Playwright/cookie/HTML）+ 聚合去重
│   ├── mcp/               # MCP Server（接入 Claude Code / Cursor）
│   ├── web/               # Next.js Web 预览（评分 + 简历实时预览）
│   └── cli/               # 命令行入口（commander）
├── data/
│   ├── profile.yaml       # 个人档案（单一数据源，AI 生成 N 份简历）
│   ├── fonts/             # 中文字体（渲染 PDF 用）
│   └── jobs.db            # SQLite 岗位库
└── config.example.yaml    # 配置模板
```

## 快速开始

```bash
# 前置：Node >= 20（推荐 24，内置 node:sqlite）、pnpm
pnpm install

# 配置：复制模板，填入 LLM key（推荐用环境变量）
cp config.example.yaml config.local.yaml
export OPENAI_API_KEY=sk-xxx    # 或写进 config.local.yaml

# 分析一段 JD 并评分
pnpm jobos analyze "高级前端开发工程师，React/Vue/TS，南京，15-20K"

# 根据 JD 生成定制简历 PDF（起草→事实核查→修订 闭环）
pnpm jobos resume "高级前端开发工程师，React/Vue/TS，南京，15-20K" -o data/outputs/resume.pdf

# 多平台采集岗位（默认 boss,nowcoder,curated）
pnpm jobos search -k "前端开发" -l "南京"

# 强制走 Boss 真实浏览器（首次需用 Boss App 扫码，之后 Cookie 持久化免登录）
pnpm jobos search -k "前端开发" -l "南京" -p boss_playwright

# 启动 Web 界面（粘贴 JD → 评分 + 简历实时预览）
pnpm --filter @ai-job-os/web dev   # http://localhost:3000
```

> 简历渲染需要中文字体：把中文 TTF 放到 `data/fonts/NotoSansSC-Regular.ttf`，
> 或依赖 Windows 系统字体（simhei/simsun）自动回退。

## 开发

```bash
pnpm typecheck   # 全包类型检查
pnpm test        # vitest 单元测试
```

## 路线图

- [x] 里程碑 1：TS 骨架 + LLM 客户端 + JD 分析 + 10 维评分
- [x] 里程碑 2：起草-审阅简历闭环 + React → PDF 简历渲染
- [x] 里程碑 2（续）：多平台爬虫（Boss cookie / 牛客 / 策展兜底）+ 去重入库
- [x] 里程碑 3：Boss 直聘 Playwright 浏览器反爬方案（降级链最优先级）
- [x] 里程碑 4：MCP Server + GitHub Actions CI
- [x] 里程碑 4（续）：Next.js Web 预览（岗位评分 + 简历实时预览）

## License

MIT

---

<sub>本项目在早期原型阶段参考过 [ai-job-search](https://github.com/) 与 [JobOS](https://github.com/) 两个开源项目的思路，现已用 TypeScript 完整重写。</sub>
