import type {
  ConversationMemoryDocument,
  ConversationProjectSnapshot,
  MaintenanceReport,
  SkillDraft,
  StudioRuntimeState,
} from "./types";

const MEMORY_RESULT_LIMIT = 3;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  const latinTokens = normalize(value).split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((token) => token.length >= 2);
  const cjkBigrams = Array.from(normalize(value).replace(/[^a-z0-9\u4e00-\u9fa5]/g, ""))
    .flatMap((_, index, chars) => {
      if (index >= chars.length - 1) return [];
      return [`${chars[index]}${chars[index + 1]}`];
    });
  return Array.from(new Set([...latinTokens, ...cjkBigrams]));
}

function truncate(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export function buildMemoryDocumentsFromSnapshot(
  snapshot: ConversationProjectSnapshot,
): ConversationMemoryDocument[] {
  const summaryText = [
    snapshot.title,
    snapshot.projectKind,
    snapshot.derivedStage,
    snapshot.currentObjective,
    snapshot.agentSummary,
    snapshot.recommendedActions.join("；"),
  ]
    .filter(Boolean)
    .join("\n");

  const baseDocument: ConversationMemoryDocument = {
    id: `memory:${snapshot.projectId}:summary`,
    projectId: snapshot.projectId,
    projectKind: snapshot.projectKind,
    title: `${snapshot.title} · 项目摘要`,
    kind: "project-summary",
    text: summaryText,
    summary: truncate(snapshot.agentSummary || snapshot.currentObjective || snapshot.title, 150),
    updatedAt: snapshot.updatedAt ?? snapshot.artifacts[0]?.updatedAt ?? new Date().toISOString(),
    tags: [snapshot.projectKind, snapshot.derivedStage, ...snapshot.recommendedActions].filter(Boolean),
  };

  const artifactDocuments = snapshot.artifacts.map<ConversationMemoryDocument>((artifact) => ({
    id: `memory:${snapshot.projectId}:artifact:${artifact.id}`,
    projectId: snapshot.projectId,
    projectKind: snapshot.projectKind,
    title: `${snapshot.title} · ${artifact.label}`,
    kind: "artifact",
    text: [artifact.label, artifact.summary, artifact.content ?? ""].filter(Boolean).join("\n"),
    summary: truncate(artifact.summary || artifact.content || artifact.label, 150),
    updatedAt: artifact.updatedAt,
    tags: [snapshot.projectKind, snapshot.derivedStage, artifact.kind, artifact.label].filter(Boolean),
  }));

  return [baseDocument, ...artifactDocuments];
}

function buildMaintenanceMemoryDocuments(reports: MaintenanceReport[]): ConversationMemoryDocument[] {
  return reports.slice(0, 6).map((report) => ({
    id: `memory:maintenance:${report.id}`,
    title: "维护报告",
    kind: "maintenance-report",
    text: [report.summary, ...report.notes].filter(Boolean).join("\n"),
    summary: truncate(report.summary, 150),
    updatedAt: report.createdAt,
    tags: ["maintenance", "cleanup", "summary"],
  }));
}

function buildSkillDraftMemoryDocuments(drafts: SkillDraft[]): ConversationMemoryDocument[] {
  return drafts.slice(0, 6).map((draft) => ({
    id: `memory:skill:${draft.id}`,
    title: `技能草案 · ${draft.proposedSkillName}`,
    kind: "skill-draft",
    text: [draft.proposedSkillName, draft.reason, draft.proposedContent].filter(Boolean).join("\n"),
    summary: truncate(draft.reason || draft.proposedSkillName, 150),
    updatedAt: draft.createdAt,
    tags: ["skill", draft.status, draft.proposedSkillName].filter(Boolean),
  }));
}

export function buildConversationMemoryCorpus(runtime: Pick<
  StudioRuntimeState,
  "recentProjects" | "currentProjectSnapshot" | "maintenanceReports" | "skillDrafts"
>): ConversationMemoryDocument[] {
  const projectSnapshots = [
    runtime.currentProjectSnapshot,
    ...runtime.recentProjects.filter(
      (snapshot) => snapshot.projectId !== runtime.currentProjectSnapshot?.projectId,
    ),
  ].filter((snapshot): snapshot is ConversationProjectSnapshot => Boolean(snapshot));

  const projectDocuments = projectSnapshots.flatMap((snapshot) => buildMemoryDocumentsFromSnapshot(snapshot));
  return [
    ...projectDocuments,
    ...buildMaintenanceMemoryDocuments(runtime.maintenanceReports),
    ...buildSkillDraftMemoryDocuments(runtime.skillDrafts),
  ];
}

function scoreDocument(queryTokens: string[], document: ConversationMemoryDocument, currentProjectId?: string): number {
  const haystack = normalize([document.title, document.summary, document.text, document.tags.join(" ")].join(" "));
  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  if (!matches) return 0;

  let score = matches * 10;
  if (document.kind === "project-summary") score += 6;
  if (document.kind === "artifact") score += 4;
  if (document.projectId && document.projectId === currentProjectId) score += 3;
  return score;
}

export function searchConversationMemory(
  query: string,
  documents: ConversationMemoryDocument[],
  currentProjectId?: string,
): ConversationMemoryDocument[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  return documents
    .map((document) => ({
      document,
      score: scoreDocument(queryTokens, document, currentProjectId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.document.updatedAt).getTime() - new Date(a.document.updatedAt).getTime();
    })
    .slice(0, MEMORY_RESULT_LIMIT)
    .map((entry) => entry.document);
}

export function buildConversationMemoryPrompt(documents: ConversationMemoryDocument[]): string | undefined {
  if (!documents.length) return undefined;
  return [
    "以下是与当前输入相关的历史记忆，仅在确实相关时复用，不要生硬套用：",
    ...documents.map((document) =>
      [
        `- ${document.title}`,
        `  类型：${document.kind}`,
        `  摘要：${document.summary}`,
      ].join("\n"),
    ),
  ].join("\n");
}
