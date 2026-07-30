import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { RawJob, JobSource, SearchOpts } from "../types.js";
import { bossCityCode } from "../constants.js";
import { normalizeBossJob } from "../normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
// 持久化用户目录：扫一次码，之后免登录（Cookie 存这里）
const USER_DATA_DIR = resolve(REPO_ROOT, "data", ".boss_browser_profile");

const SEARCH_API = "wapi/zpgeek/search/joblist";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BossOpts extends SearchOpts {
  /** 未登录时是否等待扫码登录。默认 true。 */
  autoLogin?: boolean;
  /** 扫码登录等待秒数。默认 120。 */
  loginTimeout?: number;
  /** 是否显示浏览器窗口。登录需要看到二维码，默认 false（有头）。 */
  headless?: boolean;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    if (url.includes("user/?ka=header-login") || url.includes("/web/user/")) return false;
    const el = await page.$(".nav-figure img, .user-nav .figure, [class*='nav-info']");
    return el !== null;
  } catch {
    return false;
  }
}

async function ensureLogin(page: Page, timeout: number): Promise<boolean> {
  await page.goto("https://www.zhipin.com/web/geek/job", { waitUntil: "domcontentloaded" });
  await sleep(3000);
  if (await isLoggedIn(page)) {
    console.log("[boss_playwright] 已登录");
    return true;
  }

  console.log("[boss_playwright] 未登录，打开扫码页…");
  await page.goto("https://www.zhipin.com/web/user/?ka=header-login", {
    waitUntil: "domcontentloaded",
  });
  console.log("\n" + "=".repeat(50));
  console.log("  请在弹出的浏览器窗口里用 Boss 直聘 App 扫码登录");
  console.log("  (不是微信/QQ)");
  console.log("=".repeat(50) + "\n");

  const checks = Math.floor(timeout / 2);
  for (let i = 0; i < checks; i++) {
    await sleep(2000);
    if (await isLoggedIn(page)) {
      console.log(`[boss_playwright] 登录成功（${(i + 1) * 2}s）`);
      return true;
    }
    if (i > 0 && i % 5 === 0) console.log(`  等待登录… (${(i + 1) * 2}s)`);
  }
  console.error(`[boss_playwright] 登录超时（${timeout}s）`);
  return false;
}

/**
 * Boss 直聘 Playwright 数据源：真实浏览器拦截 API 响应。
 * 反爬检测几乎无效（真实浏览器），Cookie 持久化实现「扫一次码之后免登录」。
 * 这是 Boss 降级链的最优先级（最稳定）。
 */
export const BossPlaywrightSource: JobSource = {
  name: "boss_playwright",

  async search(keyword: string, city: string, opts: BossOpts = {}): Promise<RawJob[]> {
    const maxPages = opts.maxPages ?? 3;
    const autoLogin = opts.autoLogin ?? true;
    const loginTimeout = opts.loginTimeout ?? 120;
    const headless = opts.headless ?? false;

    mkdirSync(USER_DATA_DIR, { recursive: true });
    const cityCode = bossCityCode(city);
    const baseUrl = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(keyword)}&city=${cityCode}`;

    let context: BrowserContext | null = null;
    const all: RawJob[] = [];

    try {
      context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless,
        channel: "chrome",
        args: ["--disable-blink-features=AutomationControlled"],
        viewport: { width: 1280, height: 900 },
      });
      const page = context.pages()[0] ?? (await context.newPage());

      if (autoLogin && !(await ensureLogin(page, loginTimeout))) {
        console.error("[boss_playwright] 登录失败，放弃");
        return [];
      }

      for (let pg = 1; pg <= maxPages; pg++) {
        const target = pg === 1 ? baseUrl : `${baseUrl}&page=${pg}`;

        // 拦截搜索 API 响应
        const respPromise = page
          .waitForResponse((r) => r.url().includes(SEARCH_API), { timeout: 20000 })
          .catch(() => null);
        await page.goto(target, { waitUntil: "domcontentloaded" });
        const resp = await respPromise;

        if (!resp) {
          console.warn(`[boss_playwright] 第 ${pg} 页未捕获到 API 响应`);
          break;
        }

        let body: {
          code?: number;
          zpData?: { jobList?: Record<string, unknown>[]; hasMore?: boolean };
        };
        try {
          body = (await resp.json()) as typeof body;
        } catch {
          console.warn(`[boss_playwright] 第 ${pg} 页响应非 JSON`);
          break;
        }

        if (body.code !== 0) {
          console.warn(`[boss_playwright] 第 ${pg} 页 API code=${body.code}`);
          break;
        }

        const list = body.zpData?.jobList ?? [];
        if (!list.length) break;
        for (const j of list) all.push(normalizeBossJob(j));
        console.log(`[boss_playwright] 第 ${pg} 页：${list.length} 个岗位`);

        if (!body.zpData?.hasMore) break;
        await sleep(3000 + Math.random() * 3000);
      }
    } catch (err) {
      console.error(
        `[boss_playwright] 出错：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {
          /* ignore */
        }
      }
    }

    console.log(`[boss_playwright] 共 ${all.length} 个岗位（${keyword} @ ${city}）`);
    return all;
  },
};