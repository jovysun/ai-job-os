import { describe, it, expect, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// 用临时库跑真实 sqlite，避免污染仓库的 data/jobs.db。
// DB 连接是惰性的（首次 getDb 才打开），故只要在任何 db 调用前设好环境变量即可。
const TMP_DB = join(tmpdir(), `jobos-test-${process.pid}-${Date.now()}.db`);
process.env["JOBOS_DB_PATH"] = TMP_DB;

import * as db from "../src/db/index.js";

afterAll(() => {
  db.closeDb();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(TMP_DB + suffix, { force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
});

function seedJob(company: string): number {
  return db.insertJob({
    platform: "test",
    jobId: `t-${company}`,
    title: "前端工程师",
    company,
    location: "南京",
    salary: "20-30K",
  });
}

describe("投递追踪 CRUD", () => {
  it("upsertApplication 首次记录会补上 applied_at", () => {
    const jobId = seedJob("A公司");
    db.upsertApplication({ jobId, status: "已投递", notes: "首投" });
    const row = db.getApplicationBoard().find((r) => r.jobId === jobId);
    expect(row?.status).toBe("已投递");
    expect(row?.appliedAt).toBeTruthy();
    expect(row?.notes).toBe("首投");
  });

  it("状态更新时 COALESCE 保住已有的 applied_at 与 notes", () => {
    const jobId = seedJob("B公司");
    db.upsertApplication({ jobId, status: "已投递", notes: "原备注" });
    const first = db.getApplicationBoard().find((r) => r.jobId === jobId);
    const firstApplied = first?.appliedAt;

    // 只改状态，不传 notes/appliedAt
    db.updateApplicationStatus(jobId, "一面");
    const second = db.getApplicationBoard().find((r) => r.jobId === jobId);
    expect(second?.status).toBe("一面");
    expect(second?.appliedAt).toBe(firstApplied); // 首投时间未被覆盖
    expect(second?.notes).toBe("原备注"); // 备注保留
  });

  it("重复 upsert 不产生重复行（job_id 唯一）", () => {
    const jobId = seedJob("C公司");
    db.upsertApplication({ jobId, status: "已投递" });
    db.upsertApplication({ jobId, status: "笔试" });
    db.upsertApplication({ jobId, status: "二面" });
    const rows = db.getApplicationBoard().filter((r) => r.jobId === jobId);
    expect(rows.length).toBe(1);
    expect(rows[0]?.status).toBe("二面");
  });

  it("按状态过滤看板", () => {
    const jobId = seedJob("D公司");
    db.upsertApplication({ jobId, status: "Offer" });
    const offers = db.getApplicationBoard("Offer");
    expect(offers.some((r) => r.jobId === jobId)).toBe(true);
    const rejects = db.getApplicationBoard("拒绝");
    expect(rejects.some((r) => r.jobId === jobId)).toBe(false);
  });

  it("对不存在的岗位记录投递会抛错（防孤儿数据）", () => {
    expect(() => db.upsertApplication({ jobId: 999999, status: "已投递" })).toThrow(
      /不在本地库中/,
    );
  });
});
