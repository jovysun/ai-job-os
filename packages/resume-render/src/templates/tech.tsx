import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ResumeData } from "@ai-job-os/core";
import { skillLabel } from "../labels.js";

/**
 * 注册中文字体。@react-pdf 默认字体不含 CJK，必须注册一个中文 TTF。
 * fontSource 由调用方传入（本地 ttf 路径或 URL），未提供则回退默认（中文会缺字）。
 */
export function registerChineseFont(fontSource: string, family = "Noto Sans SC"): void {
  Font.register({ family, src: fontSource });
}

const ACCENT = "#2563eb";
const INK = "#1f2937";
const MUTED = "#6b7280";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 36,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Noto Sans SC",
    color: INK,
    lineHeight: 1.5,
  },
  name: { fontSize: 22, fontWeight: 700, color: INK },
  contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6, fontSize: 9, color: MUTED },
  contactItem: { marginRight: 10 },
  link: { color: ACCENT, textDecoration: "none" },
  summary: { marginTop: 10, fontSize: 10, color: INK },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: ACCENT,
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingBottom: 3,
  },
  skillRow: { flexDirection: "row", marginBottom: 3 },
  skillCategory: { width: 70, fontWeight: 700, color: INK, fontSize: 9.5 },
  skillItems: { flex: 1, fontSize: 9.5, color: INK },
  project: { marginBottom: 9 },
  projectHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  projectName: { fontSize: 10.5, fontWeight: 700, color: INK },
  projectPeriod: { fontSize: 9, color: MUTED },
  projectDesc: { fontSize: 9.5, color: MUTED, marginTop: 1, marginBottom: 2 },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  bulletDot: { width: 10, fontSize: 9.5, color: ACCENT },
  bulletText: { flex: 1, fontSize: 9.5 },
  techLine: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  eduRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  eduLeft: { fontSize: 10, fontWeight: 700 },
  eduRight: { fontSize: 9, color: MUTED },
});

function Contact({ data }: { data: ResumeData }): React.ReactElement {
  const c = data.contact;
  const items: React.ReactNode[] = [];
  if (c.email) items.push(<Text key="e" style={styles.contactItem}>{c.email}</Text>);
  if (c.phone) items.push(<Text key="p" style={styles.contactItem}>{c.phone}</Text>);
  if (c.github)
    items.push(
      <Link key="g" src={c.github} style={[styles.contactItem, styles.link]}>
        GitHub
      </Link>,
    );
  if (c.location) items.push(<Text key="l" style={styles.contactItem}>{c.location}</Text>);
  return <View style={styles.contactRow}>{items}</View>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** 技术版简历模板：单栏、蓝色主色、突出项目与技能。 */
export function TechResume({ data }: { data: ResumeData }): React.ReactElement {
  const skillEntries = Object.entries(data.skills).filter(([, v]) => v.length > 0);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.name}>{data.name}</Text>
          <Contact data={data} />
          {data.summary ? <Text style={styles.summary}>{data.summary}</Text> : null}
        </View>

        {skillEntries.length > 0 && (
          <Section title="专业技能">
            {skillEntries.map(([cat, items]) => (
              <View key={cat} style={styles.skillRow}>
                <Text style={styles.skillCategory}>{skillLabel(cat)}</Text>
                <Text style={styles.skillItems}>{items.join("  ·  ")}</Text>
              </View>
            ))}
          </Section>
        )}

        {data.projects.length > 0 && (
          <Section title="项目经历">
            {data.projects.map((p, i) => (
              <View key={i} style={styles.project} wrap={false}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName}>{p.name}</Text>
                  <Text style={styles.projectPeriod}>{p.period}</Text>
                </View>
                {p.description ? <Text style={styles.projectDesc}>{p.description}</Text> : null}
                {p.highlights.map((h, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>▸</Text>
                    <Text style={styles.bulletText}>{h}</Text>
                  </View>
                ))}
                {p.technologies.length > 0 && (
                  <Text style={styles.techLine}>技术栈：{p.technologies.join(" / ")}</Text>
                )}
              </View>
            ))}
          </Section>
        )}

        {data.education.length > 0 && (
          <Section title="教育背景">
            {data.education.map((e, i) => (
              <View key={i} style={styles.eduRow}>
                <Text style={styles.eduLeft}>
                  {e.school}
                  {e.major ? `  ·  ${e.major}` : ""}
                  {e.degree ? `  ·  ${e.degree}` : ""}
                </Text>
                <Text style={styles.eduRight}>{e.period}</Text>
              </View>
            ))}
          </Section>
        )}
      </Page>
    </Document>
  );
}
