import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "undici";
import type { RawJob, JobSource, SearchOpts } from "../types.js";
import { bossCityCode, DEFAULT_UA } from "../constants.js";
import { normalizeBossJob } from "../normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const COOKIE_FILE = resolve(REPO_ROOT, "data", ".boss_cookies.txt");

const SEARCH_URL = "https://www.zhipin.com/wapi/zpgeek/search/joblist.json";

function loadCookie(): string {
  if (existsSync(COOKIE_FILE)) return readFileSync(COOKIE_FILE, "utf-8").trim();
  return "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Boss 直聘 Cookie 数据源：用户从浏览器 DevTools 复制 Cookie，
 * 直接调 Boss 搜索 API。适合 boss-cli / 浏览器方案都不可用时。
 */
export const BossCookieSource: JobSource = {
  name: "boss_cookie",

  async search(keyword: string, city: string, opts: SearchOpts = {}): Promise<RawJob[]> {
    const cookie = loadCookie();
    if (!cookie) {
      console.warn(`[boss_cookie] 未找到 Cookie（${COOKIE_FILE}），跳过。`);
      return [];
    }

    const cityCode = bossCityCode(city);
    const maxPages = opts.maxPages ?? 5;
    const all: RawJob[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("scene", "1");
      url.searchParams.set("query", keyword);
      url.searchParams.set("city", cityCode);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", "30");

      try {
        const res = await request(url.toString(), {
          method: "GET",
          headers: {
            "User-Agent": DEFAULT_UA,
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9",
            Referer: "https://www.zhipin.com/web/geek/job",
            Origin: "https://www.zhipin.com",
            Cookie: cookie,
          },
        });

        if (res.statusCode !== 200) {
          console.warn(`[boss_cookie] HTTP ${res.statusCode}，第 ${page} 页中止`);
          break;
        }

        const body = (await res.body.json()) as {
          code?: number;
          message?: string;
          zpData?: { jobList?: Record<string, unknown>[]; hasMore?: boolean };
        };

        if (body.code !== 0) {
          console.warn(`[boss_cookie] API code=${body.code} msg=${body.message}`);
          break;
        }

        const list = body.zpData?.jobList ?? [];
        if (!list.length) break;

        for (const j of list) all.push(normalizeBossJob(j));

        if (!body.zpData?.hasMore) break;
        await sleep(2000 + Math.random() * 2000);
      } catch (err) {
        console.warn(
          `[boss_cookie] 第 ${page} 页出错：${err instanceof Error ? err.message : String(err)}`,
        );
        break;
      }
    }

    return all;
  },
};