"use client";

import { useState } from "react";

interface ScoreDetails {
  reasoning: string;
  [k: string]: number | string;
}

interface AnalyzeResult {
  jdInfo: { title: string; company: string; requiredSkills: string[] };
  score: number;
  details: ScoreDetails;
}

interface Fabrication {
  location: string;
  issue: string;
  severity: string;
}

interface ResumeResult {
  resume: {
    name: string;
    summary: string;
    skills: Record<string, string[]>;
    projects: { name: string; period: string; highlights: string[] }[];
  };
  review: { overallVerdict: string; fabrications: Fabrication[]; summary: string };
  revised: boolean;
  pdfBase64: string;
}

const SCORE_DIMENSIONS: Record<string, string> = {
  roleMatch: "角色匹配",
  skillAlignment: "技能对齐",
  salary: "薪资",
  cashFlowStability: "现金流稳定",
  location: "地点",
  techStack: "技术栈",
  growthPotential: "成长空间",
  companyStage: "公司阶段",
  interviewDifficulty: "面试难度",
  workLifeBalance: "工作生活平衡",
};

function scoreBadge(score: number): { cls: string; label: string } {
  if (score >= 0.65) return { cls: "badge-green", label: "✅ 强推" };
  if (score >= 0.45) return { cls: "badge-yellow", label: "⚡ 可投" };
  return { cls: "badge-red", label: "❌ 跳过" };
}

const SAMPLE_JD = `高级前端开发工程师
公司：某科技公司（南京）
薪资：15-20K
要求：5 年以上前端经验，精通 React/Vue/TypeScript，熟悉工程化，有 Node.js 全栈能力优先`;

export default function Home(): React.ReactElement {
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [resume, setResume] = useState<ResumeResult | null>(null);
  const [error, setError] = useState("");

  async function callApi<T>(path: string): Promise<T | null> {
    setError("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jdText }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "请求失败");
      return null;
    }
    return data as T;
  }

  async function onAnalyze(): Promise<void> {
    setAnalyzing(true);
    const data = await callApi<AnalyzeResult>("/api/analyze");
    if (data) setAnalysis(data);
    setAnalyzing(false);
  }

  async function onGenerate(): Promise<void> {
    setGenerating(true);
    const data = await callApi<ResumeResult>("/api/resume");
    if (data) setResume(data);
    setGenerating(false);
  }

  const pdfUrl = resume ? `data:application/pdf;base64,${resume.pdfBase64}` : "";

  return (
    <div className="container">
      <h1>ai-job-os</h1>
      <p style={{ color: "#64748b", marginTop: 4, fontSize: "0.875rem" }}>
        粘贴 JD → AI 分析评分 + 生成定制简历（起草-审阅闭环，零编造）
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>岗位 JD</h3>
        <textarea value={jdText} onChange={(e) => setJdText(e.target.value)} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onAnalyze} disabled={analyzing || !jdText.trim()}>
            {analyzing ? "分析中…" : "分析并评分"}
          </button>
          <button onClick={onGenerate} disabled={generating || !jdText.trim()}>
            {generating ? "生成中…（含事实核查）" : "生成定制简历"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "#fca5a5", background: "#fef2f2" }}>
          <strong style={{ color: "#991b1b" }}>出错：</strong> {error}
        </div>
      )}

      {analysis && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            评分结果{" "}
            <span className={`badge ${scoreBadge(analysis.score).cls}`}>
              {analysis.score.toFixed(2)} {scoreBadge(analysis.score).label}
            </span>
          </h2>
          <p style={{ color: "#475569", fontSize: "0.875rem", marginBottom: 12 }}>
            {analysis.jdInfo.title} @ {analysis.jdInfo.company}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
            {Object.entries(SCORE_DIMENSIONS).map(([key, label]) => {
              const v = analysis.details[key];
              if (typeof v !== "number") return null;
              return (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{v}/10</span>
                </div>
              );
            })}
          </div>
          <p style={{ marginTop: 12, fontSize: "0.85rem", color: "#475569" }}>
            {analysis.details.reasoning}
          </p>
        </div>
      )}

      {resume && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            定制简历{" "}
            <span className={`badge ${resume.review.overallVerdict === "pass" ? "badge-green" : "badge-yellow"}`}>
              审阅：{resume.review.overallVerdict}
            </span>
            {resume.revised && <span className="badge badge-blue" style={{ marginLeft: 6 }}>已修订</span>}
          </h2>

          {resume.review.fabrications.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h3 style={{ color: "#854d0e" }}>事实核查发现（{resume.review.fabrications.length}）</h3>
              {resume.review.fabrications.map((f, i) => (
                <p key={i} style={{ fontSize: "0.8rem", color: "#78716c" }}>
                  · [{f.severity}] {f.location}: {f.issue}
                </p>
              ))}
            </div>
          )}

          <a href={pdfUrl} download="resume.pdf">
            <button>下载 PDF</button>
          </a>

          <div style={{ marginTop: 12 }}>
            <iframe
              src={pdfUrl}
              style={{ width: "100%", height: 600, border: "1px solid #e2e8f0", borderRadius: 6 }}
              title="简历预览"
            />
          </div>
        </div>
      )}
    </div>
  );
}