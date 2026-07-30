/** 采集到的岗位统一结构，字段与 core 的 db.JobRecord 对齐。 */
export interface RawJob {
  platform: string;
  jobId: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  jobType?: string;
  description?: string;
  requirements?: string;
  url?: string;
  postedDate?: string;
  skills?: string;
  degree?: string;
  experience?: string;
  companySize?: string;
  companyIndustry?: string;
  companyStage?: string;
  welfare?: string;
  hrName?: string;
  hrTitle?: string;
  chatUrl?: string;
  fullJd?: string;
  sourceUrl?: string;
}

export type Platform =
  | "boss"
  | "boss_playwright"
  | "boss_cookie"
  | "nowcoder"
  | "liepin"
  | "curated";

/** 单个数据源的统一接口。 */
export interface JobSource {
  readonly name: string;
  search(keyword: string, city: string, opts?: SearchOpts): Promise<RawJob[]>;
}

export interface SearchOpts {
  maxPages?: number;
}
