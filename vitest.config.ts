import { defineConfig } from "vitest/config";

/**
 * node:sqlite 是 Node 22.5+ 的内置模块，但只以带前缀的 "node:sqlite" 形式存在。
 * vite 会把 "node:" 前缀剥掉、再按裸名 "sqlite" 解析，找不到就当文件加载并报错。
 * 这里用虚拟模块拦下它，改成运行期用 Node 原生 createRequire 加载真正的内置模块。
 */
function externalizeNodeSqlite() {
  const VIRTUAL = "\0node-sqlite-native";
  return {
    name: "externalize-node-sqlite",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id === "node:sqlite" || id === "sqlite") return VIRTUAL;
      return null;
    },
    load(id: string) {
      if (id === VIRTUAL) {
        return [
          `import { createRequire } from "node:module";`,
          `const require = createRequire(import.meta.url);`,
          `const mod = require("node:sqlite");`,
          `export const DatabaseSync = mod.DatabaseSync;`,
          `export default mod;`,
        ].join("\n");
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalizeNodeSqlite()],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
