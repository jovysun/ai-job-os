import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// db/index.ts 位于 packages/core/src/db → 上溯 4 层到仓库根
const REPO_ROOT = resolve(__dirname, "../../../..");
const DEFAULT_DB_PATH = resolve(REPO_ROOT, "data", "jobs.db");

/**
 * 数据库文件路径。优先读环境变量 JOBOS_DB_PATH（测试可指向临时库或 ":memory:"），
 * 回退到仓库根的 data/jobs.db。与配置"环境变量优先"的一贯风格一致。
 */
function resolveDbPath(): string {
  const override = process.env["JOBOS_DB_PATH"];
  if (override && override.trim()) return override.trim();
  return DEFAULT_DB_PATH;
}

export interface JobRecord {
  id?: number;
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
  score?: number | null;
  scoreDetails?: string | null;
  status?: string;
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
  deadline?: string;
  sourceUrl?: string;
}

/** 投递状态枚举。从「未投递」到终态（Offer/拒绝/放弃），覆盖国内面试全流程。 */
export const APPLICATION_STATUSES = [
  "未投递",
  "已投递",
  "笔试",
  "一面",
  "二面",
  "HR面",
  "Offer",
  "拒绝",
  "放弃",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** 投递记录。一条对应一个岗位的投递进展。 */
export interface ApplicationRecord {
  id?: number;
  jobId: number;
  status: ApplicationStatus;
  appliedAt?: string | null;
  notes?: string | null;
  updatedAt?: string;
}

/** 投递看板行：投递记录 + join 出的岗位信息，供 CLI 列表展示。 */
export interface ApplicationBoardRow extends ApplicationRecord {
  company: string;
  title: string;
  salary?: string;
  location?: string;
  score?: number | null;
}

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  const dbPath = resolveDbPath();
  // ":memory:" 无需建目录；文件库才建父目录。
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  // Node 24+ 内置 sqlite，零原生依赖、零编译，clone 即用。
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(conn: DatabaseSync): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      job_id TEXT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      salary TEXT,
      job_type TEXT,
      description TEXT,
      requirements TEXT,
      url TEXT,
      posted_date TEXT,
      scraped_at TEXT DEFAULT (datetime('now')),
      score REAL,
      score_details TEXT,
      status TEXT DEFAULT 'new',
      skills TEXT,
      degree TEXT,
      experience TEXT,
      company_size TEXT,
      company_industry TEXT,
      company_stage TEXT,
      welfare TEXT,
      hr_name TEXT,
      hr_title TEXT,
      chat_url TEXT,
      full_jd TEXT,
      deadline TEXT,
      source_url TEXT,
      UNIQUE(platform, job_id)
    );
  `);

  conn.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      status TEXT NOT NULL DEFAULT '未投递',
      applied_at TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id)
    );
  `);
}

/**
 * 插入岗位（去重）。命中已存在行时回查其 id，保证调用方总能拿到 id 回写评分。
 * 返回岗位在库中的主键 id。
 */
export function insertJob(job: JobRecord): number {
  const conn = getDb();
  const resolvedJobId = job.jobId || `${job.company}_${job.title}`;
  const stmt = conn.prepare(
    `INSERT OR IGNORE INTO jobs
      (platform, job_id, title, company, location, salary, job_type,
       description, requirements, url, posted_date, skills, degree, experience,
       company_size, company_industry, company_stage, welfare, hr_name, hr_title,
       chat_url, full_jd, deadline, source_url)
     VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(
    job.platform,
    resolvedJobId,
    job.title,
    job.company,
    job.location ?? "",
    job.salary ?? "",
    job.jobType ?? "",
    job.description ?? "",
    job.requirements ?? "",
    job.url ?? "",
    job.postedDate ?? "",
    job.skills ?? "",
    job.degree ?? "",
    job.experience ?? "",
    job.companySize ?? "",
    job.companyIndustry ?? "",
    job.companyStage ?? "",
    job.welfare ?? "",
    job.hrName ?? "",
    job.hrTitle ?? "",
    job.chatUrl ?? "",
    job.fullJd ?? "",
    job.deadline ?? "",
    job.sourceUrl ?? "",
  );

  if (Number(info.changes) > 0) return Number(info.lastInsertRowid);

  const row = conn
    .prepare("SELECT id FROM jobs WHERE platform = ? AND job_id = ?")
    .get(job.platform, resolvedJobId) as { id: number } | undefined;
  return row?.id ?? -1;
}

export function updateJobScore(id: number, score: number, details: unknown): void {
  getDb()
    .prepare("UPDATE jobs SET score = ?, score_details = ? WHERE id = ?")
    .run(score, JSON.stringify(details), id);
}

export function getAllJobs(): JobRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM jobs ORDER BY score DESC NULLS LAST, scraped_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToJob);
}

function rowToJob(r: Record<string, unknown>): JobRecord {
  return {
    id: r["id"] as number,
    platform: r["platform"] as string,
    jobId: (r["job_id"] as string) ?? "",
    title: r["title"] as string,
    company: r["company"] as string,
    location: r["location"] as string,
    salary: r["salary"] as string,
    jobType: r["job_type"] as string,
    score: (r["score"] as number | null) ?? null,
    scoreDetails: (r["score_details"] as string | null) ?? null,
    skills: r["skills"] as string,
  };
}

// ── 投递记录（applications） ───────────────────────────────────────

/**
 * 记录一次投递（或更新已存在的投递状态）。
 * 每个岗位仅一条投递记录（job_id 唯一）；重复调用等价于更新状态/备注。
 * status 为「已投递」及之后阶段时，首次记录会补上 applied_at。
 * 返回投递记录的主键 id。
 */
export function upsertApplication(app: {
  jobId: number;
  status: ApplicationStatus;
  notes?: string | null;
  appliedAt?: string | null;
}): number {
  const conn = getDb();

  // 前置校验：岗位必须已在库中，否则 FK 约束会静默生成孤儿记录、被看板 INNER JOIN 隐藏。
  const job = conn.prepare("SELECT id FROM jobs WHERE id = ?").get(app.jobId) as
    | { id: number }
    | undefined;
  if (!job) {
    throw new Error(
      `岗位 #${app.jobId} 不在本地库中。请先用 \`jobos search\` 采集，或 \`jobos analyze <jd> --save\` 存入后再记录投递。`,
    );
  }

  const isApplied = app.status !== "未投递";
  const appliedAt = app.appliedAt ?? (isApplied ? new Date().toISOString() : null);

  conn
    .prepare(
      `INSERT INTO applications (job_id, status, applied_at, notes, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(job_id) DO UPDATE SET
         status = excluded.status,
         applied_at = COALESCE(applications.applied_at, excluded.applied_at),
         notes = COALESCE(excluded.notes, applications.notes),
         updated_at = datetime('now')`,
    )
    .run(app.jobId, app.status, appliedAt, app.notes ?? null);

  const row = conn
    .prepare("SELECT id FROM applications WHERE job_id = ?")
    .get(app.jobId) as { id: number } | undefined;
  return row?.id ?? -1;
}

/** 更新投递状态（岗位需已有投递记录，否则等价于新建）。 */
export function updateApplicationStatus(
  jobId: number,
  status: ApplicationStatus,
  notes?: string | null,
): number {
  return upsertApplication({ jobId, status, notes });
}

/** 列出投递看板：join 岗位信息，按更新时间倒序。可按状态过滤。 */
export function getApplicationBoard(status?: ApplicationStatus): ApplicationBoardRow[] {
  const conn = getDb();
  const base = `
    SELECT a.id, a.job_id, a.status, a.applied_at, a.notes, a.updated_at,
           j.company, j.title, j.salary, j.location, j.score
    FROM applications a
    JOIN jobs j ON j.id = a.job_id`;
  const sql = status
    ? `${base} WHERE a.status = ? ORDER BY a.updated_at DESC`
    : `${base} ORDER BY a.updated_at DESC`;
  const stmt = conn.prepare(sql);
  const rows = (status ? stmt.all(status) : stmt.all()) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r["id"] as number,
    jobId: r["job_id"] as number,
    status: r["status"] as ApplicationStatus,
    appliedAt: (r["applied_at"] as string | null) ?? null,
    notes: (r["notes"] as string | null) ?? null,
    updatedAt: r["updated_at"] as string,
    company: r["company"] as string,
    title: r["title"] as string,
    salary: r["salary"] as string,
    location: r["location"] as string,
    score: (r["score"] as number | null) ?? null,
  }));
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
