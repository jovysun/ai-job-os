/** Boss 直聘城市编码（用于搜索 URL 的 city 参数）。单一权威来源。 */
export const BOSS_CITY_CODES: Record<string, string> = {
  武汉: "101200100", 北京: "101010100", 上海: "101020100",
  杭州: "101210100", 深圳: "101280600", 广州: "101280100",
  成都: "101270100", 南京: "101190100", 西安: "101110100",
  合肥: "101220100", 重庆: "101040100", 天津: "101030100",
  苏州: "101190400", 厦门: "101230200", 长沙: "101250100",
  青岛: "101120200", 郑州: "101180100", 大连: "101070200",
  宁波: "101210400", 福州: "101230100", 昆明: "101290100",
  哈尔滨: "101050100", 济南: "101120100", 沈阳: "101070100",
  珠海: "101280700", 佛山: "101280800", 东莞: "101281600",
};

export const DEFAULT_BOSS_CITY_CODE = "101200100";

export function bossCityCode(city: string): string {
  return BOSS_CITY_CODES[city] ?? DEFAULT_BOSS_CITY_CODE;
}

/** 浏览器 UA，减少被简单反爬拦截。 */
export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
