# AGENTS.md

本项目的工程规范统一维护在 **[`CLAUDE.md`](./CLAUDE.md)**。

所有 AI Agent（无论何种工具）在迭代本项目前，请先完整阅读 `CLAUDE.md`——它是项目的「工程宪法」，涵盖铁律、包边界、LLM Agent 编写模式、数据层规范、Quality Gate、安全约定和落地检查清单。

改动需与现有代码同构，并在提交前通过 `pnpm typecheck && pnpm test && pnpm -r build`。
