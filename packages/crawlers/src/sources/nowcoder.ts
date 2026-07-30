import { request } from "undici";
import { load } from "cheerio";
import type { RawJob, JobSource, SearchOpts } from "../types.js";
import { DEFAULT_UA } from "../constants.js";

const SEARCH_URL = "https://www.nowcoder.com/search";
const BASE_URL = "https://www.nowcoder.com";

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_000;
  return `nc_${h}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseHtml(html: string, city: string): RawJob[] {
  const $ = load(html);
  const jobs: RawJob[] = [];

  $(".js-nc-card, .job-item, .search-result-item, [class*='job']").each((_, el) => {
    const card = $(el);
    const titleEl = card.find("a[href*='/jobs/'], .title, h3 a, .job-name").first();
    const title = titleEl.text().trim();
    if (!title) return;

    let href = titleEl.attr("href") ?? "";
    if (href && !href.startsWith("http")) href = BASE_URL + href;

    const company = card.find(".company-name, .corp-name, [class*='company']").first().text().trim();
    if (!company) return;

    const salary = card.find(".salary, .pay, [class*='salary']").first().text().trim();
    const location = card.find(".job-city, .city, [class*='location']").first().text().trim() || city;
    const desc = card.find(".job-desc, .desc, [class*='desc']").first().text().trim();
    const tags = card.find(".tag, .label, [class*='tag']").map((_, t) => $(t).text().trim()).get();

    jobs.push({
      platform: "nowcoder",
      jobId: href ? hashId(href) : hashId(title + company),
      title,
      company,
      location,
      salary,
      jobType: (tags.join(" ") + title).includes("暑期") ? "暑期实习" : "实习",
      description: desc,
      url: href,
      skills: tags.slice(0, 5).join(","),
      sourceUrl: href,
    });
  });

  return jobs;
}

const CURATED_FALLBACK: RawJob[] = [
  {
    platform: "nowcoder",
    jobId: "nc_cur_001",
    title: "前端开发工程师-2026 校招",
    company: "某互联网大厂",
    location: "南京",
    salary: "20-35K",
    jobType: "校招",
    description: "负责 C 端产品前端开发，React 技术栈",
    skills: "React,TypeScript,Webpack",
    sourceUrl: "https://www.nowcoder.com/",
  },
];

/** 牛客网数据源：HTML 解析，失败回退策展数据。 */
export const NowcoderSource: JobSource = {
  name: "nowcoder",

  async search(keyword: string, city: string, opts: SearchOpts = {}): Promise<RawJob[]> {
    const maxPages = opts.maxPages ?? 2;
    const all: RawJob[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("type", "job");
      url.searchParams.set("query", `${keyword} ${city}`);
      url.searchParams.set("page", String(page));

      try {
        const res = await request(url.toString(), {
          headers: { "User-Agent": DEFAULT_UA, "Accept-Language": "zh-CN,zh;q=0.9" },
        });
        if (res.statusCode !== 200) break;
        const html = await res.body.text();
        const pageJobs = parseHtml(html, city);
        if (!pageJobs.length) break;
        all.push(...pageJobs);
        await sleep(1500 + Math.random() * 1500);
      } catch {
        break;
      }
    }

    if (!all.length) {
      const kw = keyword.toLowerCase();
      return CURATED_FALLBACK.filter(
        (j) =>
          j.location?.includes(city) &&
          `${j.title} ${j.description} ${j.skills}`.toLowerCase().includes(kw.split(/\s+/)[0] ?? ""),
      );
    }
    return all;
  },
};