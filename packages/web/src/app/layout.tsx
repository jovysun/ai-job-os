import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ai-job-os — AI 求职操作系统",
  description: "多平台岗位采集、10 维评分、简历定制、面试准备",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}