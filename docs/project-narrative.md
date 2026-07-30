# ai-job-os 作品叙事

> 本文件记录这个项目从零到一过程中值得写进简历的工程决策、设计取舍、技术难点和解决思路。
> 每次遇到值得记录的 Workshop 就追加一条，写清楚：**背景 → 决策/方案 → 为什么值得说**。
> 最终可以从中提炼出 3-5 条面试答案或简历亮点。

---

## 架构与技术选型

### 1. 为什么选 TypeScript 而非 Python 重写

**背景**：项目原型是 Python 写的（约 2500 行胶水代码），调用 LLM API、发 HTTP 请求、跑浏览器、读写 SQLite——没有一处用到 Python 的科学计算/ML 生态。而我本人是前端全栈工程师，TypeScript 是主场。

**决策**：用 TypeScript + pnpm workspace 单仓多包重构，而非长期维护 Python+Node 双栈。

**值得说的点**：
- 判断"什么语言不重要"的能力——系统 95% 是胶水代码，选自己最顺手的语言迭代速度最快
- 不是"重写"而是"迁移"——增量策略：先搬核心逻辑（LLM 客户端/Agent），爬虫最后动，过渡期用 subprocess 调用现有 Python 爬虫
- 真实结果：在 TS 环境里迭代简历闭环的修改-验证周期比 Python 快了一倍
- 适合面试说：**"我有 17 年工程经验，但上一个求职系统是 Python 写的。我判断它 95% 是胶水代码、没有科学计算依赖，于是用 TS 重构——不是为了炫技，而是为了我自己的迭代速度。选什么语言不是技术问题，是效率问题。"**

### 2. 零原生依赖：用 Node 内置 `node:sqlite` 取代 `better-sqlite3`

**背景**：原型用 `better-sqlite3`，但它在 Node 24 上无预编译包，需要 Visual Studio C++ 编译。用户（我自己）机器上没装，`pnpm install` 直接失败。

**选项**：
- A. 装 VS C++ 工具链编译——耗时 1h+，且 clone 作品的每个人都要装
- B. 切到 Node 24 内置的 `node:sqlite`——零依赖，开箱即用

**决策**：选 B。Node 24 内置 sqlite 是 2026 年的新特性，API 几乎与 better-sqlite3 对等。

**值得说的点**：
- 判断"一个依赖能不能砍"的标准：功能是否刚需，以及是否有平台内置替代
- 实际效果：从 `pnpm install` 到数据库跑通不到 1 分钟，没有任何编译步骤
- 作品加分：**"clone 即用，无需编译"** 是对一个开源作品最友好的姿态
- 适合面试说：**"我选技术栈的标准是选择权在自己手里。better-sqlite3 让我依赖 C++ 工具链，node:sqlite 让我的项目在任何人的机器上都能 pnpm install 即用。对作品来说，开发和演示的摩擦成本是最大的成本。"**

### 3. pnpm workspace 单仓多包设计

**背景**：项目涵盖 LLM 客户端、爬虫、数据库、简历渲染、CLI 等多个模块，需要清晰的模块边界。

**决策**：分成 `core`（引擎）+ `resume-render`（React PDF）+ `cli`（入口）。

**值得说的点**：
- 模块边界清晰——`core` 不知道 `resume-render` 的存在，`cli` 只是胶水层
- 每个包有独立的 `exports` 和类型定义，天然支持 tree-shaking
- 面试时可以说：**"我设计的 monorepo 结构，让简历渲染和 CLI 都可以独立被别的项目复用——比如 resume-render 包可以单独发布给其他求职工具调用。"**

---

## LLM 工程化

### 4. 用 zod 校验 LLM 输出，而不是信任它

**背景**：LLM 返回的 JSON 不稳定——字段名可能从 snake_case 变成 camelCase，数组里的项可能是对象而不是字符串，嵌套结构可能缺字段。

**决策**：每个 LLM 调用不是 `chat()` 再加 `JSON.parse()`，而是 `chatJson(prompt, zodSchema)`——schema 是"一等公民"，在数据进入渲染前就拦住脏数据。

**阻止的 bug**：DeepSeek 把 `qualitySuggestions` 返回成对象数组 `[{location, suggestion}, ...]` 而非字符串数组 `["...", "..."]`。如果没有 zod 校验，这个对象数组会直接传给 React PDF 渲染，导致 `renderToString` 崩溃。在 CLI 上线前就拦住了。

**值得说的点**：
- 这不是"加了 TypeScript 类型定义"——zod 是**运行时校验**，在数据进入 React 渲染前就把它拦住了
- 数据路径：`LLM raw JSON → zod parse → 类型安全的 ResumeData → React PDF`
- 对`软性字段`（建议/缺口/项目亮点）加了防御性归一化——如果 LLM 返回对象，自动压平为字符串，而不是整个校验失败
- 适合面试说：**"LLM 天然不可靠，你不能像信任 JSON.parse 那样信任它。我在项目中做了一个通用的 `chatJson<T>(prompt, schema)` 模式——每个 agent 返回的数据都经过 zod 校验，schema 在数据进入渲染前就拦住脏数据。上线后确实拦住了 DeepSeek 把字符串数组返回成对象数组的情况。"**

### 5. 多 Provider 抽象 + 指数退避重试

**背景**：项目需要支持 Anthropic 和 OpenAI 兼容两种后端（用户可能切换 DeepSeek / Claude / 国内代理），且 LLM API 不稳定（429/503 常见）。

**决策**：`chat()` 内部路由到对应 provider，外层包指数退避重试（3 次，2s/4s/8s）。

**值得说的点**：
- 配置驱动：`config.local.yaml` 里改一行 `provider: openai → anthropic` 就能切换，无需改代码
- API key 优先走环境变量（`OPENAI_API_KEY`），回退到 YAML 文件——修复了原型里 key 明文存储的问题
- 可重试 vs 不可重试的错误区分：认证错误直接抛出，不浪费重试次数
- 适合面试说：**"LLM API 是系统的最薄弱环节。我做了 three things：多 provider 抽象让切换后端只需改配置，指数退避重试应对瞬时故障，以及用错误类型判断什么该重试、什么该直接报错——认证失败不重试，限流才重试。"**

---

## 简历与 Agent 设计

### 6. Drafter-Reviewer 事实核查闭环

**背景**：LLM 在生成简历时天然倾向于"编造"亮点——它会把"了解 TypeScript"写成"精通 TypeScript"，把"参与过"写成"主导了"。求职者很难察觉，但面试时一问就露馅。

**决策**：双 Agent 闭环——Drafter（起草）→ Reviewer（事实核查）→（必要时）Revise（修订）。

**工作流**：
1. `Drafter` 以 `profile.yaml` 为唯一事实来源，生成草稿
2. `Reviewer` 拿着原始档案逐条比对，输出：fabrications（编造/夸大/无出处）+ matchGaps（匹配缺口）+ overClaims（堆砌）+ verdict（pass/revise/reject）
3. 只有当判定 `revise/reject` 或发现 fabrication 时，才触发 `Revise` 修订
4. 修订后所有内容仍必须在档案中有出处，循环保证不引入新编造

**真实测试结果**：对一个南京高级前端岗位运行，Reviewer 判定 pass，0 处编造——说明 Drafter 在约束下表现良好。

**值得说的点**：
- 这不是"AI 帮我写简历"，而是"AI 帮我审简历"——后者的价值更大
- 零编造铁律在设计上强制执行，而非口头约定：`isFabricated` 字段默认 false，且只有 `profile.yaml` 是数据源
- 适合面试说：**"AI 简历工具最大的坑是它默默帮你编造。我设计了一个双 Agent 闭环——一个 Agent 起草，另一个独立 Agent 拿着你的真实档案逐条做事实核查。只有在发现编造时才触发修订。这样不是 AI 替你吹牛，而是 AI 帮你确认没有吹牛。"**

### 7. React → PDF 简历渲染（而非 LaTeX）

**背景**：原型用 LaTeX 渲染简历 PDF，但编译依赖 xelatex 环境，排版调试是黑盒，demo 时别人跑不起来。

**决策**：用 `@react-pdf/renderer` 组件化渲染 PDF。保留 LaTeX 作为可选导出。

**值得说的点**：
- 前端用 React 写简历模板——**这是前端工程师的绝对主场**
- 可扩展多模板设计：`TEMPLATES` 注册表，调用方只需 `renderResumeToFile(data, path, { template: 'tech' })`
- 中文字体自动回退：优先项目目录的 NotoSansSC，然后 Windows 系统字体
- 面试时讲：**"我把简历渲染从 LaTeX 换成了 React 组件——因为我是前端工程师，用 React 写模板才是我的优势。而且这也让未来做 Web 实时预览变得天然可能。"**

---

## 工程实践

### 8. 配置安全：从 YAML 明文到环境变量

**背景**：原型的 API key 写在 `config.local.yaml` 里，虽然被 gitignore 了，但仍在磁盘上明文存储。

**决策**：`loadConfig()` 优先级：环境变量 > YAML 文件。YAML 文件中的占位符（"YOUR_API_KEY"）视为未配置，会抛出可读错误提示用户设置环境变量。

**值得说的点**：
- 这是一个"你不可能在产品里犯的安全错误，但个人项目里太常见了"
- 环境变量是不需要额外工具的"安全基线"
- 适合面试说：**"我改的第一个东西是 API key 的存储方式。原型里它写在 YAML 里，我改成了环境变量优先——不需要额外工具，不用配置 secrets manager，就把安全基线拉到了生产级。"**

### 9. 防御性编程：从"类型定义"到"运行时校验"

**背景**：TypeScript 只能在编译时保证类型安全，但 LLM 的 JSON 输出是运行时才确定的，TS 类型定义在这里是"纸老虎"。

**决策**：在数据流的关键边界（LLM 输出 → 应用逻辑、Agent 输出 → 简历渲染）加 zod 运行时校验，把"类型定义"变成"类型强制执行"。

**具体做法**：
- 每个 LLM 调用用 `chatJson(prompt, schema)` 而非 `chat(prompt) + JSON.parse()`
- review 报告中的软性字段用 `preprocess` 归一化
- 简历数据的每个字段都有默认值，LLM 漏掉某个字段也不会崩溃

**值得说的点**：
- "TypeScript 的类型在运行时不存在"——这句话每个 TS 开发者都懂，但真正用 zod 在每个 LLM 调用入口做校验的并不多
- 这不是"加了点校验"，而是在数据流架构上把"LLM 输出不可靠"当作一等公民处理

### 10. monorepo 中 tsx 跨包解析 JSX 的兼容问题

**背景**：`packages/cli` 从 `@ai-job-os/resume-render` 引入模板代码，后者包含 `.tsx` 文件。但 CLI 的 tsconfig 没开 `jsx`，tsc 报错 `TS6142: Module './templates/tech.js' was resolved to 'tech.tsx', but '--jsx' is not set`。

**决策**：给 `packages/cli/tsconfig.json` 加 `jsx: "react-jsx"` 和 `lib: ["ES2023", "DOM"]`。

**值得说的点**：
- 在 monorepo 中，跨包引入源码时，消费者的 tsconfig 必须兼容提供者的源码格式——这是"源码级依赖"的 cost
- 这个问题的本质是"pnpm workspace 的源码级调试"带来的一个工程 trade-off：开发和调试快，但类型检查配置需要更精细
- 长期解决方案：`resume-render` 构建出 `dist/` 后，CLI 消费构建产物，不再依赖源码——但开发周期内保留源码级引用

### 11. 运行时拦截：zod 校验在 e2e 测试中抓住 DeepSeek 的脏数据

**背景**：第一次跑 `pnpm jobos resume` 端到端测试时，完整的 Drafter → Reviewer → Revise 闭环跑通了，但在渲染 PDF 前崩溃了。

**错误信息**：zod 校验失败，`qualitySuggestions` 字段期望 `string[]`，但 DeepSeek 返回了 `[{location, suggestion}, ...]` 对象数组。

**修复**：对软性字段（建议/缺口/项目亮点）加 `z.preprocess` 归一化——如果 LLM 返回对象，提取所有字符串值并拼接为可读文本，而不是整个校验失败。

**值得说的点**：
- 这不是"bug"，而是"被 zod 在渲染前拦住的脏数据"——如果没这套校验，脏数据会直接传给 React PDF 渲染，崩溃时间晚、更难排查
- 加了单元测试锁定这个行为（`test/resume-schemas.test.ts`）
- 面试时讲：**"zod 在 e2e 测试中抓到 DeepSeek 把字符串数组返回成对象数组。如果我没做运行时校验，这个脏数据会直接传给 React PDF 渲染，用户看到的是白屏崩溃。我加了防御性归一化——LLM 输出的软性字段做预处理，不平格的校验策略。"**

---

## 爬虫与数据采集

### 12. 多平台爬虫架构：统一接口 + 降级链

**背景**：多平台求职采集需要统一的数据格式，但各平台（Boss/牛客/猎聘）的 API 和 HTML 结构完全不同，反爬策略也各异。

**决策**：定义 `JobSource` 接口（`search(keyword, city) => RawJob[]`），每个数据源实现该接口。聚合器 `collectAllJobs` 循环调用各数据源，经过一次去重后统一入库。

**降级链**：Boss 直聘的多级 fallback 设计（cookie → 策展兜底，Playwright 浏览器方案将在里程碑 3 补入最前面）——每一级失败自动降级到下一级，保证总有一条路通。

**值得说的点**：
- `JobSource` 接口加 `SearchOpts` 参数，新数据源只需实现一个 `search` 函数即可接入
- 归一化函数 `normalizeBossJob()` 放在独立模块，多个 Boss 爬虫共享——单点维护，字段变更只改一处
- 去重策略：`(company, title)` 组合 + `jobId` 双重去重，且 `INSERT OR IGNORE` + 回查现有 id 保证 `dbId` 稳定
- 适合面试说：**"我设计了统一的 JobSource 接口，每个平台是一个实现。Boss 直聘有多级降级链——Playwright → cookie → 策展，任何一级失败自动降级到下一级。新增一个平台只需实现一个 search 函数。"**

### 13. 策展数据作为离线兜底

**背景**：实时爬虫可能因网络/反爬/平台变更而不可用，但项目不能因此"不能演示"。

**决策**：内置手工整理的岗位数据，按城市+关键词双重过滤。不匹配时返回空数组而非全部（避免"搜南京出现北京岗位"的 bug）。

**值得说的点**：
- 这解决了 Python 版里"策展数据不按城市过滤"的问题
- 数据量小（3-5 条/城市），但足够让评分/简历/面试功能在完全离线时也能演示
- 面试时讲：**"我的爬虫有多级降级链，最底层是内置的策展数据——永远能用。这保证了即使 Boss 改了反爬策略，项目仍然能完整演示。"**

### 14. Playwright 浏览器反爬方案

**背景**：Boss 直聘是国内反爬最严格的招聘平台，纯 HTTP 请求（cookie 方案）可被多种指纹检测拦截。真实浏览器是最可靠的绕过方式。

**决策**：用 Playwright 的 `launchPersistentContext()` 持久化 Chrome 用户数据目录，实现"扫一次码，之后免登录"。拦截搜索 API 的 JSON 响应来获取数据，而非解析 HTML。

**遇到的挑战**：
- 登录态检测：通过检查页面 URL 是否包含 `user/?ka=header-login` 和页面元素 `.nav-figure img` 来判断是否已登录
- Profile 持久化：Playwright 的 persistent context 自动管理 Cookie，用户只需扫一次码
- 系统 Chrome 集成：`channel: "chrome"` 复用用户已安装的 Chrome，而非下载 Playwright 专用 Chromium

**降级链位置**：Playwright 是 Boss 降级链的第一优先级，失败后自动降级到 cookie → 策展。

**值得说的点**：
- 这是 Python 版 DrissionPage 方案在 TS 生态里的对应实现，使用 Playwright（行业标准，比 DrissionPage 更主流）
- 真实浏览器 + 持久化 Profile 的结合，让扫码一次后长期免登录
- 面试时讲：**"Boss 直聘的反爬是国内最严格的。我用 Playwright 启动真实 Chrome 浏览器来绕过反爬，持久化用户数据目录让 Cookie 跨会话保留——用户只需扫一次码，之后每次运行都是免登录的。如果浏览器方案不可用，自动降级到 cookie 调用 API，再不行就回退到内置策展数据。"**

### 15. git 安全检查抓出的路径 bug + 数据库写错目录

**背景**：里程碑 3 收尾时，我在 `git add --dry-run` 里做了一个安全检查——grep 是否有数据库/密钥/浏览器 profile 被误纳入版本控制。结果它报出 `packages/data/jobs.db` 要被追踪。

**根因**：`db/index.ts` 位于 `packages/core/src/db/`，比 `load-config.ts`（在 `src/`）深一层。我复制了 `REPO_ROOT` 的相对路径计算却没调整层数——写了 `../../..`（3 层，落在 `packages/`）而非 `../../../..`（4 层，仓库根）。导致数据库被创建在 `packages/data/jobs.db`，而 gitignore 只匹配根目录的 `data/*.db`。

**修复**：改成 `../../../..`，数据库回到 `data/jobs.db`（正确被 gitignore）。

**值得说的点**：
- 两个 bug 叠加才暴露：路径算错 + gitignore 只覆盖预期路径。任一单独存在都不会被发现——数据库照样能用，只是位置不对
- 真正救了场的是**把"敏感文件不进 git"做成一个可执行的检查**（`git add --dry-run | grep`），而不是靠人肉记得
- 面试时讲：**"我在提交前会跑一个安全检查，grep 有没有数据库、密钥、Cookie 被误加进 git。这次它抓出了一个 bug——数据库因为相对路径算错层数，被写到了错误的目录，绕过了 gitignore。这类问题靠自觉是防不住的，得让工具来兜底。"**

---

## MCP 与集成

### 16. MCP Server：把求职引擎暴露给 AI 编辑器

**背景**：作品要体现"懂 Agent 时代的接口标准"。MCP（Model Context Protocol）是 Anthropic 主推的标准，且官方参考实现就是 TypeScript——用 TS 写 MCP 是最正统的路径，正好是我的主场。

**决策**：新建 `packages/mcp`，用 `@modelcontextprotocol/sdk` 的高层 `McpServer` API + `registerTool`，暴露 4 个工具：`jobos_search` / `jobos_analyze` / `jobos_resume` / `jobos_greeting`。stdio transport 接入 Claude Code / Cursor。

**值得说的点**：
- 复用了 core 和 crawlers 包——MCP 层只是薄薄的适配器，业务逻辑零重复。这正是 monorepo 分包设计的回报
- zod schema 直接作为工具的 `inputSchema`，SDK 内部转 JSON Schema——类型定义和运行时校验用同一份 schema
- stdio 模式下日志必须走 stderr（stdout 是协议通道，打日志会污染 JSON-RPC）——这是个容易踩的坑
- 面试时讲：**"我把求职引擎封装成了 MCP Server，4 个工具接入 Claude Code。因为 core 和 crawlers 是独立的包，MCP 层只是一个几十行的适配器——这就是我一开始做 monorepo 分包的回报：同一套引擎，CLI 能用、MCP 能用、未来 Web 也能用。"**

### 17. 被 MCP SDK 逼着升级 Zod 3 → 4

**背景**：接入 MCP SDK 1.30 后，服务器启动即崩溃：`ERR_PACKAGE_PATH_NOT_EXPORTED: subpath './v3' is not defined`。

**根因**：MCP SDK 1.30 的 peer dependency 是 `zod: ^3.25 || ^4.0`，它内部 import `zod/v3` 兼容层——这个子路径只在 Zod 4 里存在。我项目用的是 Zod 3.23，没有这个导出。

**迁移中的 Zod 4 破坏性变更**：`.default({})` 对"所有字段都有默认值的对象 schema"不再接受空对象——类型系统要求传入完整 shape。Zod 4 为此新增了 `.prefault()`（把输入过一遍 schema，让字段级默认值生效）。把 3 处 `.default({})` 改成 `.prefault({})` 解决。

**值得说的点**：
- 依赖升级不是"改个版本号"——Zod 4 有真实的破坏性变更，靠全量 typecheck + 测试才敢确认没漏
- `.prefault()` vs `.default()` 的区别值得记：default 是"值缺失时用这个值"，prefault 是"值缺失时用这个值再过一遍 schema"
- 面试时讲：**"接 MCP SDK 时被逼着从 Zod 3 升到 4，因为 SDK 依赖 Zod 4 的 v3 兼容层。升级踩到了 default 的破坏性变更——我全量 typecheck + 跑测试来确认迁移没漏，最后用 Zod 4 新增的 prefault API 解决。依赖升级从来不是改版本号那么简单。"**

### 18. GitHub Actions CI

**背景**：作品要有绿色的 CI 徽章——它是"这个项目是认真做的"最直接的信号。

**决策**：GitHub Actions 流水线跑 typecheck + test + build 三道关卡，用 `--frozen-lockfile` 保证依赖可复现。

**值得说的点**：
- `pnpm -r build` 只对有 build 脚本的包（core/crawlers/resume-render）生效，自动跳过 CLI/MCP 这类 tsx 直跑的入口——不需要为每个包写重复配置
- `--frozen-lockfile` 强制 lockfile 与 package.json 一致，防止"我本地能跑，CI 挂了"
- 本地先跑一遍 `pnpm install --frozen-lockfile` 验证 CI 会通过，而不是推上去等它红

---

## Web 界面

### 19. Next.js Web 预览：monorepo 源码消费的三个真实坑

**背景**：里程碑 4 要做 Web 预览界面——粘贴 JD，实时看到评分和简历 PDF。选了 Next.js（App Router + API 路由），把 core/crawlers/resume-render 通过 `transpilePackages` 以源码方式引入。

**踩到的三个坑（依次解决）**：

1. **NodeNext 的 `.js` 扩展名 webpack 解析不了**
   - 现象：`Module not found: Can't resolve './llm/index.js'`
   - 根因：workspace 包源码遵循 NodeNext 规范，import 时写 `./llm/index.js`（实际文件是 `.ts`）。TS 编译器懂这个映射，但 Next 的 webpack 不懂。
   - 解法：`config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] }`

2. **Playwright 被 webpack 静态打包**
   - 现象：`Can't resolve 'chromium-bidi/lib/cjs/...'`——webpack 顺着 crawlers → Playwright 的 import 链，试图打包整个浏览器驱动。
   - 解法两步：① 把 Playwright 数据源从 barrel 静态导出改成 aggregator 里**动态 `import()`**；② webpack `externals` 把 playwright/playwright-core/chromium-bidi 标为外部依赖（运行时从 node_modules require，不进 bundle）
   - 关键领悟：`transpilePackages` 会让 `serverExternalPackages` 失效，必须在 webpack config 里手动加 externals

3. **pnpm 11 的 build 脚本审批 + sharp**
   - 现象：`next build` 的 preflight 跑 `pnpm install` 失败，因为 sharp 的 build 被 pnpm 默认拦截
   - 解法：`onlyBuiltDependencies: [sharp]` —— 注意 pnpm 11 把这个配置从 package.json 移到了 `pnpm-workspace.yaml`

**值得说的点**：
- 这三个坑本质都是"monorepo 里以源码方式跨包消费"的代价——换来的是开发时无需预构建、改一处即时生效
- 动态 import + externals 的组合是"重量级可选依赖不拖累主构建"的通用手法
- 面试时讲：**"把引擎接进 Next.js 时踩了三个坑：NodeNext 的 .js 扩展名 webpack 不认、Playwright 被静态打包、pnpm 11 的构建审批。最有意思的是 Playwright——我用动态 import 加 webpack externals 把它从主 bundle 里摘出去，只在真正调用浏览器方案时才加载。这是处理重量级可选依赖的通用模式。"**

### 20. 前后端职责分离：API 路由把引擎和 UI 解耦

**背景**：Web 界面需要调用 LLM（分析/评分/简历），这些必须在服务端跑（有 API key、有 Node 原生依赖）。

**决策**：3 个 Next API 路由（`/api/analyze`、`/api/resume`、`/api/search`）作为服务端边界，前端是纯客户端组件通过 fetch 调用。简历 PDF 用 base64 传给前端，`<iframe>` 直接预览 + 一键下载。

**值得说的点**：
- API 路由标 `runtime = "nodejs"` + `maxDuration`（简历生成含多次 LLM 调用，耗时长）
- 引擎逻辑零改动——core 的 `agents.tailorResume()` 在 CLI、MCP、Web 三处复用，这是分包设计的最大回报
- 面试时讲：**"同一套 tailorResume 引擎，CLI 调它、MCP 调它、Web 的 API 路由也调它——三种入口零重复。一开始花力气做 monorepo 分包，到这里全部回本了。"**

### 21. Web 简历生成崩溃：一个报错背后的三个 bug

**背景**：Web 界面里"分析评分"能跑，但"生成定制简历"报 `Cannot read properties of undefined (reading 'S')`。CLI 里同样的简历生成是好的——只有 Web bundle 环境崩。

**层层剥开的三个 bug**：

1. **`reading 'S'` —— @react-pdf/renderer 被 webpack 打包后损坏**
   - react-pdf 含 yoga (wasm) 布局引擎，被 webpack 打包压缩后内部结构被破坏（'S' 是被 minify 的属性名）
   - 第一步解法：加进 `serverExternalPackages` + webpack `externals`

2. **React error #31 —— 模块实例不一致**
   - react-pdf externalize 后走 commonjs，但 `resume-render` 的 tsx 被 Next 转译打包，两边创建的 React 元素 `$$typeof` symbol 对不上，react-pdf 的 reconciler 不认
   - 根治解法：把 `resume-render` 也做成"编译产物消费"——`exports` 用条件导出（`source` 给 tsx 开发、`import`/`default` 给 dist），从 `transpilePackages` 移出并加进 externals。这样 PDF 渲染完全在 Node 模块体系里发生，和 CLI 跑通时的环境一致

3. **`company: null` —— 顺带暴露的 schema 漏洞**
   - 换了 JD 文本后，LLM 对模糊公司名返回 `null`，而 `.default("")` 只在字段**缺失**时生效、对显式 null 无效
   - 解法：抽了个 `nullableString()` / `flexibleStringArray()` zod helper（preprocess 把 null/undefined 归一化），Jd schema 全字段替换

**值得说的点**：
- 一个用户报的错（reading 'S'）背后是三个独立 bug，只有一层层剥开才见底——最外层的 bundle 问题遮住了里层的 schema 问题
- 核心领悟：**"CLI 能跑、Web 崩"往往是模块打包环境差异**。含 wasm/原生/独立 reconciler 的库（react-pdf、playwright）在 bundler 里都得 externalize，让它们回到 Node 的模块体系
- 条件 `exports`（source/import 分流）是 monorepo 里"开发消费源码、生产消费编译产物"的标准解法
- 面试时讲：**"用户报简历生成崩溃，一个 reading 'S' 的错。剥开发现是三层：react-pdf 被 webpack 打包破坏了 wasm 引擎、externalize 后又和转译代码的 React 实例对不上、修完这些又暴露出 LLM 返回 null 的 schema 漏洞。最外层的问题把里层全遮住了。最后用条件 exports 让 PDF 渲染回到 Node 模块体系——和 CLI 能跑通的环境一致。"**

---

## 迭代 2：把作品补成求职全链路（P1-P3，2026-07-30）

### 22. 对照两个 Python 开源库做「差距分析」，只挑对作品加分的功能移植

**背景**：核心路线（里程碑 1-4）完成后，我把 TS 版对照了两个参考库——JobOS（`agents/coach.py`、`analyst.py`）和 ai-job-search（`outcome`/`rank` 命令），逐一列出「Python 有、TS 还没有」的能力，写进 `docs/todo-roadmap.md` 并按优先级排序。

**决策**：不做全量对齐，而是按「对作品叙事的价值 / 成本」筛选。三项入选：P1 面试资料生成（把链路补全成 采集→评分→简历→**面试**）、P2 公司画像（补进评分维度）、P3 投递追踪（从"生成材料"延伸到"闭环管理"）。**明确不做自动投递**——封号风险高，且对作品是减分项（易被视为灰产工具）。

**值得说的点**：
- "会做"和"该做"是两回事——自动投递技术上最容易移植，但我主动放弃，因为它伤害作品定位
- 差距分析落成一份带优先级和「明确不做」清单的 roadmap 文档，而不是拍脑袋加功能
- 面试时讲：**"我对照参考实现做了差距分析，但没有全量对齐。我按'对作品价值'筛选功能——把面试准备补进链路是加分的，自动投递技术上最简单但我删掉了，因为它会让作品看起来像灰产工具。取舍比堆功能更能体现判断力。"**

### 23. coach agent：把「一次串行」改成「一次并行」

**背景**：移植 JobOS 的 `coach.py` 时，`generate_interview_pack` 原本是四步串行——提技能树 → 学习路径 → 八股速查 → 模拟面试。后三步都只依赖第一步产出的技能树（模拟面试还额外吃 JD 和简历），彼此之间没有依赖。

**决策**：TS 版 `generateInterviewPack` 里，先 `await extractSkillTree`，然后把后三个生成用 `Promise.all` 并行。四次 LLM 调用（每次可能十几秒）从"串行累加"变成"技能树 + 三者并行"，墙钟时间大致砍掉一半多。

**值得说的点**：
- 移植不是逐行翻译——识别出 Python 版里可以并行却被写成串行的地方，是"迁移"高于"翻译"的体现
- 依赖关系判断：技能树是三者的共同输入，必须先算；三者之间无依赖，可并行
- 沿用了项目既有的 LLM 工程约定——技能树走 `chatJson(prompt, SkillTreeSchema)`（结构化、要校验），三段长文本走 `chat(prompt, { maxTokens: 8000 })`（Markdown，不需要 schema）
- 面试时讲：**"移植 Python 版面试资料生成时，我发现它四步串行，但后三步只依赖第一步的技能树、彼此独立。我改成技能树先算、后三段并行 Promise.all——四次 LLM 调用的墙钟时间砍掉一半多。移植代码时顺手把能并行的串行逻辑并行掉，这是翻译代码不会做、迁移代码才会做的事。"**

### 24. 投递追踪：用 `ON CONFLICT + COALESCE` 让「重复投递」变成安全的幂等更新

**背景**：P3 要给每个岗位记录投递进展（未投递→已投递→笔试→一面→…→Offer/拒绝/放弃）。问题是：用户可能对同一岗位反复调 `apply`/`status`，怎么保证不产生重复记录、也不误删已填的信息？

**决策**：`applications` 表对 `job_id` 加唯一约束，`upsertApplication` 用 `INSERT ... ON CONFLICT(job_id) DO UPDATE`。关键在 update 分支用 `COALESCE`：`applied_at = COALESCE(applications.applied_at, excluded.applied_at)`——已有的首投时间不被覆盖；`notes = COALESCE(excluded.notes, applications.notes)`——这次没传备注就保留上次的。首次进入非「未投递」状态时自动补 `applied_at`。

**值得说的点**：
- 幂等性放在 SQL 层，而不是应用层写一堆 if/else 先查后改——一条语句既是插入也是更新，无竞态
- `COALESCE` 的两个方向刚好相反：`applied_at` 保护"已有的旧值"（首投时间只记一次），`notes` 优先"新传的值、否则留旧的"——这个不对称是刻意的
- 状态枚举 `APPLICATION_STATUSES` 用 `as const` 定成联合类型，CLI 侧 `assertStatus` 做运行时校验，非法状态直接报错列出可选值——和项目"LLM/用户输入都不可信"的一贯风格一致
- 用真实 sqlite 冒烟验证了全链路（插入岗位→投递→改状态→看板 join→按状态过滤），确认 `applied_at`/`notes` 在状态更新后确实被 COALESCE 保住
- 面试时讲：**"投递追踪我把幂等性做在 SQL 层——job_id 唯一约束 + ON CONFLICT DO UPDATE，一条语句既插入又更新。关键是 COALESCE 的两个方向是反的：首投时间用 COALESCE 保护旧值只记一次，备注用 COALESCE 优先新值、没传就留旧的。用户怎么反复调 apply 都不会丢数据、不会产生重复行。"**

### 25. 移植也要做减法：applications 表砍掉参考库里暂时用不上的列

**背景**：Python 版 `db.py` 的 `applications` 表有 `resume_path`、`interview_pack_path` 等列，还有一张独立的 `interview_materials` 表存面试资料。

**决策**：TS 版的 `applications` 表只保留 `job_id / status / applied_at / notes / updated_at`——投递追踪当前需要的最小集。面试资料（P1）目前直接输出成 Markdown 文件，没有落库需求，所以不建 `interview_materials` 表，也不加 `interview_pack_path` 列。

**值得说的点**：
- 参考实现的表结构是"它当时的需求"的产物，照搬会引入用不上的字段——移植时按"我现在真的需要什么"裁剪
- 留了扩展余地但不预先埋字段：真要给投递关联简历/资料包时再加列（sqlite 加列成本低），而不是现在放一堆空列
- 面试时讲：**"移植不是照抄表结构。参考库的投递表有简历路径、面试资料路径等列，我砍到只剩投递追踪真正需要的五个字段。用不上的字段现在不建——真需要时加列成本很低，预先埋一堆空列反而是负债。"**

---

## 迭代 3：以 PM 视角自审 + 上线 GitHub（CI 打通，2026-07-30）

### 26. 用 PM 视角给自己的作品做一次评审，先修"闭环断裂"再修"门面"

**背景**：迭代 2 的三块功能（面试/公司画像/投递追踪）都"能跑"，但我没急着提交，而是切换成资深 PM 视角，把工程从包边界、数据流、测试、CI、文档整体过了一遍。

**审出的问题分级处理**：
- 🔴 P0：**投递追踪的数据链路是断的**——`apply` 要一个 `jobId`，但这个 id 只有跑 `search` 采集才产生；`analyze`/`resume` 对粘贴的 JD 文本操作、全程不落库，用户根本拿不到 id。于是加了 `analyze --save`（落库返回 dbId）+ `list` 命令，把 `analyze --save → list → apply` 闭环打通。
- 🔴 P0：**孤儿数据**——`node:sqlite` 默认不开外键，`apply 一个不存在的岗位`会静默插入、又被看板 INNER JOIN 藏起来。开 `PRAGMA foreign_keys=ON` + upsert 前置校验岗位存在并给可读报错。
- 🟡 P1：DB 路径硬编码导致业务逻辑没法写测试——改成支持 `JOBOS_DB_PATH` 注入（含 `:memory:`），补了 5 个投递 CRUD 单测。
- 🟢 P2：`engines.node` 写 `>=20` 但 `node:sqlite` 要 `>=22.5`——`>=20` 的用户 clone 直接跑不起来，修正。

**主动不做**：公司画像原计划"补进 10 维评分"，评审后判断这是需要 `companies` 表 + 联查 + 权重设计的更大决策，**改 roadmap 措辞标注为独立查询能力**，而不是为了对齐描述去过度设计。

**值得说的点**：
- "功能能跑"和"功能可用"是两回事——投递追踪单独看每个命令都对，但串起来发现用户拿不到 jobId，这种"闭环断裂"只有站在用户全流程视角才看得见
- 评审结论落成带优先级的清单（P0 可用性 > P1 完整性 > P2 打磨），先修让功能真正可用的，再修门面
- 面试时讲：**"我写完功能不急着提交，会切成 PM/用户视角再审一遍。这次就审出投递追踪的数据链路是断的——每个命令单独都对，但用户根本拿不到串联它们的 jobId。我按'可用性 > 完整性 > 打磨'分级修，还主动把一个会过度设计的功能从计划里降级。判断什么不该做，和做本身一样重要。"**

### 27. CI 连抓两个"本地能跑、干净环境挂"的 bug——这就是 CI 存在的理由

**背景**：项目一直有 CI 配置和绿徽章，但仓库还没推上 GitHub，CI 从未真正运行过——等于挂了块招牌、机器却没通电。这次推上 GitHub 后 CI 首次真跑，**连挂两次**，每次都逮到一个我本地完全没暴露的问题。

**第一个 bug——pnpm 构建脚本审批（19 秒挂在 install）**：
- 现象：干净环境 `pnpm install --frozen-lockfile` 报 `ERR_PNPM_IGNORED_BUILDS: esbuild, sharp` 退出码 1
- 根因：我升级 vite 时引入了新版 esbuild。本地因为有缓存和历史批准，install 直接"Already up to date"跳过检查；CI 从零装才触发。更深一层：pnpm 11.17 已经把批准机制从旧的 `onlyBuiltDependencies` 列表换成了 `allowBuilds` 映射，我一直在维护过时的字段，而 pnpm 自动生成的 `allowBuilds: { esbuild: set this to true or false }` 提示块被我忽略了
- 修复：`allowBuilds: { esbuild: true, sharp: true }`——精确白名单，而非 `dangerouslyAllowAllBuilds` 那种放行一切

**第二个 bug——typecheck 依赖构建产物（38 秒挂在 typecheck）**：
- 现象：`cli/src/index.ts: TS2307: Cannot find module '@ai-job-os/resume-render'`
- 根因：CI 里 typecheck 在 build 之前跑，而 `resume-render` 的 `exports.types` 指向 `./dist/index.d.ts`——全新环境 `dist/` 还不存在。本地能过是因为之前 build 过、`dist/` 有残留。对比之下 `core` 包的 exports 直连 `./src/index.ts`，任何时候都不依赖 build——`resume-render` 是那个不一致的"另类"
- 修复：把 `resume-render` 的 `types`/`source` 都指向 `./src/index.ts`（与 core 对齐），typecheck 走源码；`import`/`default` 仍走 `dist` 供生产消费

**关键方法**：两个修复我都不是盲改——**清空 `node_modules` + 所有 `dist` 本地复现 CI 的干净环境**，验证通过再推。第三次 CI 一次过。

**值得说的点**：
- CI 的核心价值就是"用全新环境模拟别人 clone 你的仓库"——本地的缓存、残留 `dist`、历史批准，全是骗你"没问题"的假象。招聘方 clone 你的作品用的正是干净环境
- 两个 bug 都源于同一类问题：**本地状态泄漏**（依赖缓存、构建产物残留）掩盖了真实的可复现性缺陷
- 修 CI 问题的正确姿势是在本地重建那个干净环境去复现，而不是"改一版推上去碰运气"——碰运气会把 CI 历史搞得一堆红叉，本身就是减分
- 面试时讲：**"我把作品推上 GitHub 后 CI 连挂两次，都是本地缓存和残留 dist 掩盖掉的可复现性 bug——一个是 pnpm 新版换了构建审批机制、一个是 typecheck 依赖了还没生成的 dist。我的修法是本地清空 node_modules 和所有 dist、复现 CI 的干净环境、验证通过再推，第三次一次过。CI 的意义就是替你模拟别人 clone 你代码的场景，本地那些'能跑'很多时候是状态泄漏骗你的。"**