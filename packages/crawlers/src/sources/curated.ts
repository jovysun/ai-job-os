import type { RawJob, JobSource } from "../types.js";

const CURATED_JOBS: Record<string, RawJob[]> = {
  nanjing: [
    {
      platform: "curated",
      jobId: "cur_nj_001",
      title: "高级前端开发工程师",
      company: "某科技公司（南京）",
      location: "南京雨花台区",
      salary: "15-20K",
      jobType: "社招",
      description: "负责公司核心产品的前端架构设计与开发，React/TypeScript 技术栈",
      requirements: "5 年以上前端经验;精通 React/Vue/TypeScript;熟悉工程化",
      skills: "React,Vue,TypeScript,Webpack,Vite",
    },
    {
      platform: "curated",
      jobId: "cur_nj_002",
      title: "全栈开发工程师",
      company: "南京某互联网公司",
      location: "南京江宁区",
      salary: "18-25K",
      jobType: "社招",
      description: "参与公司 AI 中台的前后端全栈开发",
      requirements: "3 年以上全栈经验;React/Node.js;有 AI 应用开发经验优先",
      skills: "React,Node.js,TypeScript,MySQL,AI",
    },
    {
      platform: "curated",
      jobId: "cur_nj_003",
      title: "前端技术专家",
      company: "南京某 AI 公司",
      location: "南京江北新区",
      salary: "20-30K",
      jobType: "社招",
      description: "负责前端架构演进与工程化建设，推动团队技术升级",
      requirements: "8 年以上前端经验;精通工程化体系;有架构设计能力",
      skills: "React,Vue,TypeScript,Webpack,Vite,Monorepo",
    },
  ],
  wuhan: [
    {
      platform: "curated",
      jobId: "cur_wh_001",
      title: "AI 应用开发工程师",
      company: "武汉光谷 AI 公司",
      location: "武汉光谷",
      salary: "15-25K",
      jobType: "社招",
      description: "负责 AI Agent 系统设计与开发，MCP 工具链集成",
      requirements: "熟悉 LLM/Agent;有 Python 或 Node.js 全栈能力",
      skills: "Node.js,Agent,LLM,MCP,React",
    },
    {
      platform: "curated",
      jobId: "cur_wh_002",
      title: "前端开发工程师",
      company: "武汉某科技公司",
      location: "武汉洪山区",
      salary: "12-18K",
      jobType: "社招",
      description: "负责公司 SaaS 产品前端开发",
      requirements: "3 年以上前端经验;React/Vue",
      skills: "React,Vue,TypeScript",
    },
  ],
};

/**
 * 策展数据源：内置手工整理的岗位数据，离线兜底。
 * 关键词和城市双重过滤，无匹配时返回空数组而非全部数据。
 */
export const CuratedSource: JobSource = {
  name: "curated",

  async search(keyword: string, city: string): Promise<RawJob[]> {
    const kw = keyword.toLowerCase();
    const cityLower = city.toLowerCase();
    const kwTokens = kw.replace(/[\/\-]/g, " ").split(/\s+/).filter(Boolean);

    // 中文城市名 → 策展数据 key 的映射
    const CITY_KEY_MAP: Record<string, string> = {
      南京: "nanjing",
      nanjing: "nanjing",
      武汉: "wuhan",
      wuhan: "wuhan",
    };
    const cityKey = CITY_KEY_MAP[city] ?? CITY_KEY_MAP[cityLower];
    if (!cityKey) return [];

    const jobs = CURATED_JOBS[cityKey]!;
    if (!kwTokens.length) return jobs;

    return jobs.filter((j) => {
      const text = `${j.title} ${j.description} ${j.skills}`.toLowerCase();
      return kwTokens.some((t) => text.includes(t));
    });
  },
};