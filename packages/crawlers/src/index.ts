export { collectAllJobs, type CollectOpts, type StoredJob } from "./aggregator.js";
export { normalizeBossJob, guessJobType } from "./normalize.js";
export { bossCityCode, BOSS_CITY_CODES } from "./constants.js";
export { CuratedSource } from "./sources/curated.js";
export { BossCookieSource } from "./sources/boss-cookie.js";
export { NowcoderSource } from "./sources/nowcoder.js";
// 注意：BossPlaywrightSource 不在此 barrel 导出——它依赖 Playwright（重量级原生依赖），
// 由 aggregator 动态 import。需要直接用时从 "./sources/boss-playwright.js" 引入。
export type { RawJob, Platform, JobSource, SearchOpts } from "./types.js";
