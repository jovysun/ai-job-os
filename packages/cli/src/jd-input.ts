import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 去掉 UTF-8 BOM（Windows 记事本另存常带），避免污染首行。 */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 读取管道输入（stdin）。非管道（TTY）直接返回空串，不阻塞。 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export interface JdSources {
  /** 位置参数传入的 JD（可能为空）。 */
  arg?: string;
  /** --file 指定的文件路径（相对 baseDir 解析）。 */
  file?: string;
  /** 相对路径基准目录（仓库根）。 */
  baseDir: string;
  /** 读取 stdin 的函数，默认 readStdin；测试可注入。 */
  readPiped?: () => Promise<string>;
}

/**
 * 解析 JD 文本来源，优先级：--file 文件 > stdin 管道 > 位置参数。
 * 三者皆空时抛出可读错误，指引正确用法。
 * 让带换行/引号/特殊字符的整段 JD 无需与 shell 转义较劲。
 */
export async function resolveJdText(sources: JdSources): Promise<string> {
  const { arg, file, baseDir, readPiped = readStdin } = sources;

  if (file) {
    const abs = resolve(baseDir, file);
    const text = stripBom(readFileSync(abs, "utf-8")).trim();
    if (!text) throw new Error(`JD 文件为空：${abs}`);
    return text;
  }

  const piped = stripBom(await readPiped()).trim();
  if (piped) return piped;

  if (arg && arg.trim()) return arg.trim();

  throw new Error(
    "未提供 JD。三种方式任选其一：\n" +
      "  1) 文件： jobos analyze -f jd.txt\n" +
      "  2) 管道： (Windows) powershell -c Get-Clipboard | jobos analyze\n" +
      "           (macOS)   pbpaste | jobos analyze\n" +
      "           (Linux)   xclip -o -selection clipboard | jobos analyze\n" +
      '  3) 参数： jobos analyze "单行 JD 文本"',
  );
}
