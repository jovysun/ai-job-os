import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { resolveJdText, stripBom } from "../src/jd-input.js";

const created: string[] = [];
function tmpFile(name: string, content: string): string {
  const p = join(tmpdir(), `jd-${process.pid}-${name}`);
  writeFileSync(p, content, "utf-8");
  created.push(p);
  return p;
}

afterEach(() => {
  while (created.length) {
    const p = created.pop()!;
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
  }
});

const BASE = tmpdir();
const noPipe = async () => "";

describe("stripBom", () => {
  it("去掉 UTF-8 BOM", () => {
    expect(stripBom("﻿前端工程师")).toBe("前端工程师");
  });
  it("无 BOM 时原样返回", () => {
    expect(stripBom("前端工程师")).toBe("前端工程师");
  });
});

describe("resolveJdText 来源优先级", () => {
  it("优先读文件（多行 + 特殊字符原样保留）", async () => {
    const multi = '高级前端\n要求：\n- React/Vue（"精通"）\n- 薪资 $20k & 期权\n(南京)';
    const f = tmpFile("multi.txt", multi);
    const text = await resolveJdText({ file: f, baseDir: BASE, readPiped: noPipe });
    expect(text).toBe(multi);
  });

  it("文件带 BOM 时被清理", async () => {
    const f = tmpFile("bom.txt", "﻿前端工程师 JD");
    const text = await resolveJdText({ file: f, baseDir: BASE, readPiped: noPipe });
    expect(text.startsWith("前端")).toBe(true);
  });

  it("空文件报可读错误", async () => {
    const f = tmpFile("empty.txt", "   \n  ");
    await expect(
      resolveJdText({ file: f, baseDir: BASE, readPiped: noPipe }),
    ).rejects.toThrow(/JD 文件为空/);
  });

  it("无文件时读 stdin 管道", async () => {
    const text = await resolveJdText({
      baseDir: BASE,
      readPiped: async () => "来自管道的 JD",
    });
    expect(text).toBe("来自管道的 JD");
  });

  it("文件优先于管道", async () => {
    const f = tmpFile("prio.txt", "来自文件");
    const text = await resolveJdText({
      file: f,
      baseDir: BASE,
      readPiped: async () => "来自管道",
    });
    expect(text).toBe("来自文件");
  });

  it("管道优先于位置参数", async () => {
    const text = await resolveJdText({
      arg: "来自参数",
      baseDir: BASE,
      readPiped: async () => "来自管道",
    });
    expect(text).toBe("来自管道");
  });

  it("仅位置参数时兜底使用", async () => {
    const text = await resolveJdText({
      arg: "单行 JD",
      baseDir: BASE,
      readPiped: noPipe,
    });
    expect(text).toBe("单行 JD");
  });

  it("三者皆空报可读错误并给出用法", async () => {
    await expect(
      resolveJdText({ baseDir: BASE, readPiped: noPipe }),
    ).rejects.toThrow(/未提供 JD/);
  });
});
