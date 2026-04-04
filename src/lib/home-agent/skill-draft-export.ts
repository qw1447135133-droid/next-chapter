import { getResolvedFilesStoragePath } from "@/lib/storage-path";
import type { SkillDraft } from "./types";

const EXPORT_SUBDIR = "home-agent/skills-drafts/approved";
const INSTALL_CANDIDATE_SUBDIR = "home-agent/skills-candidates/pending-install";

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
  const compact = normalized.replace(/\s+/g, "-");
  return compact.slice(0, 80) || "skill-draft";
}

function joinPath(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/[\\/]+$/g, "");
  const trimmedSegments = segments.map((segment) => segment.replace(/^[\\/]+|[\\/]+$/g, ""));
  return [trimmedBase, ...trimmedSegments].join("/");
}

export function buildApprovedSkillDraftExportDirectory(rootPath: string): string {
  return joinPath(rootPath, EXPORT_SUBDIR);
}

export function buildApprovedSkillInstallCandidateDirectory(rootPath: string): string {
  return joinPath(rootPath, INSTALL_CANDIDATE_SUBDIR);
}

export async function resolveApprovedSkillDraftExportDirectory(): Promise<string> {
  const rootPath = await getResolvedFilesStoragePath();
  if (!rootPath) {
    throw new Error("当前环境无法获取本地文件目录，无法定位技能候选目录。");
  }

  return buildApprovedSkillDraftExportDirectory(rootPath);
}

export async function resolveApprovedSkillInstallCandidateDirectory(): Promise<string> {
  const rootPath = await getResolvedFilesStoragePath();
  if (!rootPath) {
    throw new Error("当前环境无法获取本地文件目录，无法定位正式 Skill 候选目录。");
  }

  return buildApprovedSkillInstallCandidateDirectory(rootPath);
}

function buildDraftFileName(draft: SkillDraft): string {
  const date = draft.createdAt.slice(0, 10) || "draft";
  return `${date}-${safeSegment(draft.proposedSkillName)}.md`;
}

function buildDraftMarkdown(draft: SkillDraft): string {
  return [
    `# ${draft.proposedSkillName}`,
    "",
    `- 状态: ${draft.status}`,
    `- 创建时间: ${draft.createdAt}`,
    `- 来源会话数: ${draft.sourceConversationIds.length}`,
    "",
    "## 触发原因",
    draft.reason || "未提供原因",
    "",
    "## 候选内容",
    draft.proposedContent.trim() || "未提供候选内容",
    "",
    "## 来源会话",
    ...draft.sourceConversationIds.map((conversationId) => `- ${conversationId}`),
    "",
  ].join("\n");
}

function buildInstallCandidateFileName(draft: SkillDraft): string {
  return `${safeSegment(draft.proposedSkillName).toLowerCase()}.md`;
}

function buildInstallCandidateMarkdown(draft: SkillDraft): string {
  return [
    `# ${draft.proposedSkillName}`,
    "",
    "> Candidate only. Review manually before moving into .claude/skills.",
    "",
    "## Summary",
    draft.reason || "未提供原因",
    "",
    "## Usage Guidance",
    `- 来源会话数: ${draft.sourceConversationIds.length}`,
    `- 草案状态: ${draft.status}`,
    `- 候选创建时间: ${draft.createdAt}`,
    "",
    "## Draft Content",
    draft.proposedContent.trim() || "未提供候选内容",
    "",
    "## Review Checklist",
    "- 核对是否仍符合当前产品的首页单会话心智",
    "- 核对是否会覆盖已有正式能力",
    "- 核对是否需要拆分为更小的独立 skill",
    "- 确认后再人工搬运到 .claude/skills 目录",
    "",
    "## Source Conversations",
    ...draft.sourceConversationIds.map((conversationId) => `- ${conversationId}`),
    "",
  ].join("\n");
}

function buildIndexMarkdown(drafts: SkillDraft[]): string {
  return [
    "# Approved Skill Drafts",
    "",
    `导出时间: ${new Date().toISOString()}`,
    `导出数量: ${drafts.length}`,
    "",
    "## 草案清单",
    ...drafts.map((draft) => {
      const fileName = buildDraftFileName(draft);
      return `- ${draft.proposedSkillName} -> ${fileName}`;
    }),
    "",
  ].join("\n");
}

export interface SkillDraftExportResult {
  directoryPath: string;
  indexPath: string;
  filePaths: string[];
  exportedCount: number;
}

export interface SkillDraftBundleExportResult {
  directoryPath: string;
  markdownPath: string;
  jsonPath: string;
  exportedCount: number;
}

export interface SkillDraftInstallCandidateExportResult {
  directoryPath: string;
  manifestPath: string;
  filePaths: string[];
  exportedCount: number;
}

export async function exportApprovedSkillDrafts(drafts: SkillDraft[]): Promise<SkillDraftExportResult> {
  const approvedDrafts = drafts.filter((draft) => draft.status === "approved");
  if (!approvedDrafts.length) {
    throw new Error("当前没有已批准技能草案可导出。");
  }

  const rootPath = await getResolvedFilesStoragePath();
  if (!rootPath) {
    throw new Error("当前环境无法获取本地文件目录，无法导出技能候选。");
  }

  const writer = window.electronAPI?.storage?.writeText;
  if (!writer) {
    throw new Error("当前环境不支持本地文件导出。");
  }

  const directoryPath = buildApprovedSkillDraftExportDirectory(rootPath);
  const filePaths: string[] = [];

  for (const draft of approvedDrafts) {
    const filePath = joinPath(directoryPath, buildDraftFileName(draft));
    const result = await writer(filePath, buildDraftMarkdown(draft));
    if (!result.ok) {
      throw new Error(result.error || `导出 ${draft.proposedSkillName} 失败。`);
    }
    filePaths.push(filePath);
  }

  const indexPath = joinPath(directoryPath, "README.md");
  const indexResult = await writer(indexPath, buildIndexMarkdown(approvedDrafts));
  if (!indexResult.ok) {
    throw new Error(indexResult.error || "导出技能候选索引失败。");
  }

  return {
    directoryPath,
    indexPath,
    filePaths,
    exportedCount: approvedDrafts.length,
  };
}

function buildBundleMarkdown(drafts: SkillDraft[]): string {
  return [
    "# InFinio Approved Skill Bundle Preview",
    "",
    `生成时间: ${new Date().toISOString()}`,
    `包含草案数: ${drafts.length}`,
    "",
    ...drafts.flatMap((draft, index) => [
      `## ${index + 1}. ${draft.proposedSkillName}`,
      "",
      `- 创建时间: ${draft.createdAt}`,
      `- 来源会话数: ${draft.sourceConversationIds.length}`,
      `- 原因: ${draft.reason || "未提供原因"}`,
      "",
      "### 候选内容",
      draft.proposedContent.trim() || "未提供候选内容",
      "",
    ]),
  ].join("\n");
}

function buildBundleJson(drafts: SkillDraft[]) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      exportedCount: drafts.length,
      drafts: drafts.map((draft) => ({
        id: draft.id,
        name: draft.proposedSkillName,
        createdAt: draft.createdAt,
        reason: draft.reason,
        sourceConversationIds: draft.sourceConversationIds,
        content: draft.proposedContent,
      })),
    },
    null,
    2,
  );
}

export async function exportApprovedSkillDraftBundle(
  drafts: SkillDraft[],
): Promise<SkillDraftBundleExportResult> {
  const approvedDrafts = drafts.filter((draft) => draft.status === "approved");
  if (!approvedDrafts.length) {
    throw new Error("当前没有已批准技能草案可打包。");
  }

  const rootPath = await getResolvedFilesStoragePath();
  if (!rootPath) {
    throw new Error("当前环境无法获取本地文件目录，无法导出技能 bundle 草案。");
  }

  const writer = window.electronAPI?.storage?.writeText;
  if (!writer) {
    throw new Error("当前环境不支持本地文件导出。");
  }

  const directoryPath = buildApprovedSkillDraftExportDirectory(rootPath);
  const markdownPath = joinPath(directoryPath, "bundle-preview.md");
  const jsonPath = joinPath(directoryPath, "bundle-preview.json");

  const markdownResult = await writer(markdownPath, buildBundleMarkdown(approvedDrafts));
  if (!markdownResult.ok) {
    throw new Error(markdownResult.error || "导出技能 bundle Markdown 失败。");
  }

  const jsonResult = await writer(jsonPath, buildBundleJson(approvedDrafts));
  if (!jsonResult.ok) {
    throw new Error(jsonResult.error || "导出技能 bundle JSON 失败。");
  }

  return {
    directoryPath,
    markdownPath,
    jsonPath,
    exportedCount: approvedDrafts.length,
  };
}

export async function exportApprovedSkillInstallCandidates(
  drafts: SkillDraft[],
): Promise<SkillDraftInstallCandidateExportResult> {
  const approvedDrafts = drafts.filter((draft) => draft.status === "approved");
  if (!approvedDrafts.length) {
    throw new Error("当前没有已批准技能草案可整理为正式 Skill 候选。");
  }

  const rootPath = await getResolvedFilesStoragePath();
  if (!rootPath) {
    throw new Error("当前环境无法获取本地文件目录，无法生成正式 Skill 候选包。");
  }

  const writer = window.electronAPI?.storage?.writeText;
  if (!writer) {
    throw new Error("当前环境不支持本地文件导出。");
  }

  const directoryPath = buildApprovedSkillInstallCandidateDirectory(rootPath);
  const filePaths: string[] = [];

  for (const draft of approvedDrafts) {
    const filePath = joinPath(directoryPath, buildInstallCandidateFileName(draft));
    const result = await writer(filePath, buildInstallCandidateMarkdown(draft));
    if (!result.ok) {
      throw new Error(result.error || `生成 ${draft.proposedSkillName} 的正式 Skill 候选失败。`);
    }
    filePaths.push(filePath);
  }

  const manifestPath = joinPath(directoryPath, "INSTALL-REVIEW.md");
  const manifest = [
    "# Approved Skill Install Candidates",
    "",
    "这些文件不会自动生效，也不会被当前 skill loader 直接加载。",
    "只有人工确认后，才应挑选并搬运到 `.claude/skills`。",
    "",
    `生成时间: ${new Date().toISOString()}`,
    `候选数量: ${approvedDrafts.length}`,
    "",
    "## Candidate Files",
    ...approvedDrafts.map((draft) => `- ${draft.proposedSkillName} -> ${buildInstallCandidateFileName(draft)}`),
    "",
  ].join("\n");

  const manifestResult = await writer(manifestPath, manifest);
  if (!manifestResult.ok) {
    throw new Error(manifestResult.error || "生成正式 Skill 候选审核清单失败。");
  }

  return {
    directoryPath,
    manifestPath,
    filePaths,
    exportedCount: approvedDrafts.length,
  };
}
