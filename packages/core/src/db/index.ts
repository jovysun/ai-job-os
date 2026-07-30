import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// db/index.ts 位于 packages/core/src/db → 上溯 4 层到仓库根
const REPO_ROOT = resolve(__dirname, "../../../..");
const DB_PATH = resolve(REPO_ROOT, "data", "jobs.db");

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

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  // Node 24+ 内置 sqlite，零原生依赖、零编译，clone 即用。
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
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

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
