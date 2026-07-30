import { db } from "@ai-job-os/core";
import type { RawJob, Platform, SearchOpts } from "./types.js";
import { CuratedSource } from "./sources/curated.js";
import { BossCookieSource } from "./sources/boss-cookie.js";
import { NowcoderSource } from "./sources/nowcoder.js";

const DEFAULT_PLATFORMS: Platform[] = ["boss", "nowcoder", "curated"];

/**
 * 动态加载 Playwright 数据源。
 * Playwright 是重量级原生依赖，用动态 import 避免它被 bundler（如 Next.js webpack）
 * 在构建时静态解析——只有真正用到浏览器方案时才加载。
 */
async function loadBossPlaywright() {
  const mod = await import("./sources/boss-playwright.js");
  return mod.BossPlaywrightSource;
}

/**
 * Boss 直聘降级链：Playwright 浏览器 → cookie → 策展兜底。
 * 每一级失败或无数据时自动降级到下一级，保证总有一条路通。
 */
async function fetchBossWithFallback(
  keyword: string,
  city: string,
  opts: SearchOpts,
): Promise<RawJob[]> {
  // 1. Playwright 真实浏览器（最稳定，反爬检测几乎无效）
  try {
    const source = await loadBossPlaywright();
    const jobs = await source.search(keyword, city, opts);
    if (jobs.length) {
      console.log(`[boss] Playwright 方案成功，${jobs.length} 个岗位`);
      return jobs;
    }
    console.log("[boss] Playwright 无数据，回退 cookie…");
  } catch (err) {
    console.log(
      `[boss] Playwright 失败（${err instanceof Error ? err.message : err}），回退 cookie…`,
    );
  }

  // 2. Cookie 直接调 API
  try {
    const jobs = await BossCookieSource.search(keyword, city, opts);
    if (jobs.length) {
      console.log(`[boss] cookie 方案成功，${jobs.length} 个岗位`);
      return jobs;
    }
    console.log("[boss] cookie 无数据，回退策展数据…");
  } catch (err) {
    console.log(`[boss] cookie 方案失败（${err instanceof Error ? err.message : err}），回退策展…`);
  }

  // 3. 策展数据兜底（永远可用）
  return CuratedSource.search(keyword, city);
}

async function fetchPlatform(
  platform: Platform,
  keyword: string,
  city: string,
  opts: SearchOpts,
): Promise<RawJob[]> {
  switch (platform) {
    case "boss":
      return fetchBossWithFallback(keyword, city, opts);
    case "boss_playwright": {
      const source = await loadBossPlaywright();
      return source.search(keyword, city, opts);
    }
    case "boss_cookie":
      return BossCookieSource.search(keyword, city, opts);
    case "nowcoder":
      return NowcoderSource.search(keyword, city, opts);
    case "curated":
      return CuratedSource.search(keyword, city);
    default:
      console.warn(`[aggregator] 未知平台：${platform as string}`);
      return [];
  }
}

/** 基于 (company, title) 与 jobId 双重去重。 */
function dedupe(jobs: RawJob[]): RawJob[] {
  const seenIds = new Set<string>();
  const seenCompanyTitle = new Set<string>();
  const unique: RawJob[] = [];

  for (const job of jobs) {
    const keyCt = `${job.company}|${job.title}`.toLowerCase().trim();
    if (job.jobId && seenIds.has(job.jobId)) continue;
    if (seenCompanyTitle.has(keyCt)) continue;
    if (job.jobId) seenIds.add(job.jobId);
    seenCompanyTitle.add(keyCt);
    unique.push(job);
  }
  return unique;
}

export interface StoredJob extends RawJob {
  dbId: number;
}

/** 存入 SQLite，附上 dbId。 */
function storeJobs(jobs: RawJob[]): StoredJob[] {
  return jobs.map((job) => {
    const dbId = db.insertJob({
      platform: job.platform,
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      jobType: job.jobType,
      description: job.description,
      requirements: job.requirements,
      url: job.url,
      postedDate: job.postedDate,
      skills: job.skills,
      degree: job.degree,
      experience: job.experience,
      companySize: job.companySize,
      companyIndustry: job.companyIndustry,
      companyStage: job.companyStage,
      welfare: job.welfare,
      hrName: job.hrName,
      hrTitle: job.hrTitle,
      chatUrl: job.chatUrl,
      fullJd: job.fullJd,
      sourceUrl: job.sourceUrl,
    });
    return { ...job, dbId };
  });
}

export interface CollectOpts extends SearchOpts {
  platforms?: Platform[];
}

/**
 * 从多平台采集岗位，去重后存库。返回带 dbId 的岗位列表。
 * 单个平台失败不影响其他平台。
 */
export async function collectAllJobs(
  keyword: string,
  city: string,
  opts: CollectOpts = {},
): Promise<StoredJob[]> {
  const platforms = opts.platforms ?? DEFAULT_PLATFORMS;
  const all: RawJob[] = [];

  for (const platform of platforms) {
    try {
      const jobs = await fetchPlatform(platform, keyword, city, opts);
      console.log(`[${platform}] 采集到 ${jobs.length} 个岗位`);
      all.push(...jobs);
    } catch (err) {
      console.error(`[${platform}] 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const deduped = dedupe(all);
  console.log(`去重：${all.length} → ${deduped.length} 个岗位`);
  return storeJobs(deduped);
}