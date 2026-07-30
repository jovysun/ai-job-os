import type { RawJob } from "./types.js";

/** 从 jobLabels / jobExperience 推断岗位类型。 */
export function guessJobType(raw: Record<string, unknown>): string {
  const labels = (raw["jobLabels"] as string[]) ?? [];
  const exp = (raw["jobExperience"] as string) ?? "";
  const text = labels.join(" ") + " " + exp;
  if (text.includes("实习")) return "实习";
  if (text.includes("应届") || text.includes("校招")) return "校招";
  return "社招";
}

/**
 * 将 Boss 直聘 API 单条原始 job 转为 RawJob 统一格式。
 * 三个 Boss 爬虫共享此归一化函数，字段变更只改一处。
 */
export function normalizeBossJob(raw: Record<string, unknown>): RawJob {
  const encryptJobId = (raw["encryptJobId"] as string) ?? (raw["jobId"] as string) ?? "";
  const encryptBossId = (raw["encryptBossId"] as string) ?? "";
  const securityId = (raw["securityId"] as string) ?? "";
  const chatUrl =
    encryptBossId && securityId
      ? `https://www.zhipin.com/web/geek/chat?id=${encryptBossId}&securityId=${securityId}`
      : "";
  const detailUrl = encryptJobId
    ? `https://www.zhipin.com/job_detail/${encryptJobId}.html`
    : "";
  const location = [
    raw["cityName"] ?? "",
    raw["areaDistrict"] ?? "",
    raw["businessDistrict"] ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const skills = (raw["skills"] as string[]) ?? [];
  const welfare = (raw["welfareList"] as string[]) ?? [];

  return {
    platform: "boss",
    jobId: encryptJobId,
    title: (raw["jobName"] as string) ?? "",
    company: (raw["brandName"] as string) ?? "",
    location,
    salary: (raw["salaryDesc"] as string) ?? "",
    jobType: guessJobType(raw),
    description: (raw["jobName"] as string) ?? "",
    requirements: "",
    url: detailUrl,
    postedDate: String(raw["lastModifyTime"] ?? ""),
    skills: skills.join(","),
    degree: (raw["jobDegree"] as string) ?? "",
    experience: (raw["jobExperience"] as string) ?? "",
    companySize: (raw["brandScaleName"] as string) ?? "",
    companyIndustry: (raw["brandIndustry"] as string) ?? "",
    companyStage: (raw["brandStageName"] as string) ?? "",
    welfare: welfare.join(","),
    hrName: (raw["bossName"] as string) ?? "",
    hrTitle: (raw["bossTitle"] as string) ?? "",
    chatUrl,
    fullJd: "",
    sourceUrl: detailUrl,
  };
}