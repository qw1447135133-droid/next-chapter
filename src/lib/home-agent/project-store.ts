import {
  createEmptyDramaProject,
  type DramaProject,
  type DramaSetup,
} from "@/types/drama";
import type {
  ConversationArtifact,
  ConversationProjectSnapshot,
  MaintenanceReport,
  SkillDraft,
} from "./types";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { VideoStyleLock, VideoWorldModel } from "@/types/project";
import { synchronizeVideoProductionState } from "./video-production-memory";
import { synchronizeDramaProductionState } from "./drama-production-memory";
export {
  clearStudioSession,
  readProjectStudioSession,
  readStudioProjectSession,
  readStudioSession,
  writeStudioSession,
} from "./session-store";

const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";
const SKILL_DRAFTS_KEY = "storyforge-skill-drafts-v1";
const MAINTENANCE_REPORTS_KEY = "storyforge-maintenance-reports-v1";

type VideoPersistenceModule = typeof import("@/hooks/use-local-persistence");
let videoPersistencePromise: Promise<VideoPersistenceModule> | null = null;

function loadVideoPersistenceModule(): Promise<VideoPersistenceModule> {
  if (!videoPersistencePromise) {
    videoPersistencePromise = import("@/hooks/use-local-persistence");
  }
  return videoPersistencePromise;
}

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeDramaSetup(setup: DramaSetup | null | undefined): DramaSetup | null {
  if (!setup || typeof setup !== "object") {
    return null;
  }

  return {
    genres: Array.isArray(setup.genres)
      ? setup.genres.filter((genre): genre is string => typeof genre === "string")
      : [],
    audience: typeof setup.audience === "string" ? setup.audience : "",
    tone: typeof setup.tone === "string" ? setup.tone : "",
    ending: typeof setup.ending === "string" ? setup.ending : "",
    totalEpisodes: typeof setup.totalEpisodes === "number" ? setup.totalEpisodes : 0,
    targetMarket: typeof setup.targetMarket === "string" ? setup.targetMarket : "",
    customTopic: typeof setup.customTopic === "string" ? setup.customTopic : "",
    setupMode:
      setup.setupMode === "creative" || setup.setupMode === "topic"
        ? setup.setupMode
        : undefined,
    creativeInput: typeof setup.creativeInput === "string" ? setup.creativeInput : "",
  };
}

function normalizeDramaProject(project: DramaProject): DramaProject {
  const mode = project?.mode === "adaptation" ? "adaptation" : "traditional";
  const base = createEmptyDramaProject(mode);

  return {
    ...base,
    ...project,
    mode,
    setup: normalizeDramaSetup(project?.setup),
    creativePlan: typeof project?.creativePlan === "string" ? project.creativePlan : "",
    characters: typeof project?.characters === "string" ? project.characters : "",
    directory: Array.isArray(project?.directory) ? project.directory : [],
    directoryRaw: typeof project?.directoryRaw === "string" ? project.directoryRaw : "",
    episodes: Array.isArray(project?.episodes) ? project.episodes : [],
    complianceReport:
      typeof project?.complianceReport === "string" ? project.complianceReport : "",
    currentStep:
      typeof project?.currentStep === "string" ? project.currentStep : base.currentStep,
    dramaTitle: typeof project?.dramaTitle === "string" ? project.dramaTitle : "",
    createdAt: typeof project?.createdAt === "string" ? project.createdAt : base.createdAt,
    updatedAt: typeof project?.updatedAt === "string" ? project.updatedAt : base.updatedAt,
    referenceScript:
      typeof project?.referenceScript === "string" ? project.referenceScript : "",
    referenceStructure:
      typeof project?.referenceStructure === "string" ? project.referenceStructure : "",
    frameworkStyle:
      typeof project?.frameworkStyle === "string" ? project.frameworkStyle : "",
    structureTransform:
      typeof project?.structureTransform === "string" ? project.structureTransform : "",
    characterTransform:
      typeof project?.characterTransform === "string" ? project.characterTransform : "",
    exportDocument:
      typeof project?.exportDocument === "string" ? project.exportDocument : "",
    styleLock: project?.styleLock ?? null,
    worldModel: project?.worldModel ?? null,
    characterStateCards: Array.isArray(project?.characterStateCards) ? project.characterStateCards : [],
    storyBeatPackets: Array.isArray(project?.storyBeatPackets) ? project.storyBeatPackets : [],
    complianceRevisionPackets: Array.isArray(project?.complianceRevisionPackets)
      ? project.complianceRevisionPackets
      : [],
  };
}

function truncate(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function buildArtifact(
  id: string,
  kind: ConversationArtifact["kind"],
  label: string,
  content: string,
  updatedAt: string,
): ConversationArtifact {
  return {
    id,
    kind,
    label,
    content,
    summary: truncate(content),
    updatedAt,
  };
}

function mapTargetMarket(value: string): string {
  const labels: Record<string, string> = {
    cn: "中国大陆",
    jp: "日本",
    west: "欧美",
    kr: "韩国",
    sea: "东南亚",
  };

  return labels[value] ?? value;
}

function buildDramaSetupSummary(setup: DramaSetup | null): string {
  if (!setup) return "";

  const lines = [
    `目标市场：${setup.targetMarket ? mapTargetMarket(setup.targetMarket) : "未设定"}`,
    `受众：${setup.audience || "未设定"}`,
    `风格：${setup.tone || "未设定"}`,
    `结局：${setup.ending || "未设定"}`,
    `总集数：${setup.totalEpisodes || "未设定"}`,
  ];

  if (setup.genres.length > 0) {
    lines.push(`题材：${setup.genres.join("、")}`);
  }
  if (setup.customTopic?.trim()) {
    lines.push(`主题补充：${setup.customTopic.trim()}`);
  }
  if (setup.creativeInput?.trim()) {
    lines.push(`创意输入：${setup.creativeInput.trim()}`);
  }

  return lines.join("\n");
}

function deriveDramaStyleLock(project: DramaProject): VideoStyleLock | null {
  if (!project.setup) return null;

  const genres = project.setup.genres.length
    ? project.setup.genres
    : project.setup.customTopic.trim()
      ? [project.setup.customTopic.trim()]
      : [];

  return {
    genre: genres.length ? genres : ["待补充题材"],
    tone: project.setup.tone || "待补充调性",
    visualStyle:
      project.mode === "adaptation"
        ? `${project.frameworkStyle || "参考改编"} 的结构转译质感`
        : `${project.setup.targetMarket ? mapTargetMarket(project.setup.targetMarket) : "当前市场"} 短剧叙事质感`,
    colorMood: project.setup.tone ? `${project.setup.tone}向情绪光影` : "高识别度主情绪氛围",
    cinematography:
      project.mode === "adaptation"
        ? "保留参考骨架，但重做人物与事件呈现"
        : "高钩子、快入题、人物关系驱动",
    forbidden: [
      "不要偏离已锁定的目标市场和受众取向",
      "不要破坏主卖点与核心人物关系",
      project.setup.ending ? `不要把结局方向改出 ${project.setup.ending}` : "",
    ].filter(Boolean),
    referencePromptTemplate: [
      "{核心人物}，{关系冲突}，{关键卖点}，",
      `${project.setup.tone || "高情绪"}，${genres.join("、") || "短剧创作"}，`,
      `${project.setup.audience || "目标受众"}向短剧节奏，保持市场一致性。`,
    ].join(""),
  };
}

function deriveDramaWorldModel(project: DramaProject): VideoWorldModel | null {
  const synopsisSource =
    project.creativePlan ||
    project.structureTransform ||
    project.referenceStructure ||
    project.setup?.creativeInput ||
    project.setup?.customTopic ||
    "";

  if (!synopsisSource.trim() && !project.directory.length && !project.episodes.length) {
    return null;
  }

  const beatSources = project.directory.slice(0, 8).map((entry) => ({
    id: `ep-${entry.number}`,
    name: `第 ${entry.number} 集 · ${entry.title}`,
    description: entry.summary || entry.outline || "等待补充分集推进",
  }));

  return {
    version: `drama-world-${project.updatedAt || new Date().toISOString()}`,
    synopsis: truncate(synopsisSource || "项目已进入持续创作阶段。", 220),
    continuityRules: [
      "保持主要人物关系与反转逻辑连续",
      "分集钩子和高潮位置需要逐步升级",
      "创作输出应服从当前市场、受众和结局方向",
    ],
    characters: [
      {
        id: `${project.id}-protagonists`,
        name: "主角群",
        description: truncate(project.characters || project.characterTransform || "待补充角色设定。", 220),
        aliases: [],
        currentState:
          project.currentStep === "characters" || project.currentStep === "character-transform"
            ? "正在继续完善人物弧光与冲突"
            : "角色基调已进入后续创作流",
        constraints: [
          project.setup?.audience ? `受众指向：${project.setup.audience}` : "",
          project.setup?.tone ? `调性：${project.setup.tone}` : "",
        ].filter(Boolean),
        referenceAssetIds: [],
      },
    ],
    scenes: beatSources.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: truncate(entry.description, 140),
      timeVariantLabels: [],
      referenceAssetIds: [],
    })),
  };
}

function buildOutlinePreview(project: DramaProject): string {
  return project.directory
    .filter((entry) => entry.outline?.trim())
    .slice(0, 4)
    .map(
      (entry) =>
        `第 ${entry.number} 集 · ${entry.title}\n${entry.outline?.trim() || ""}`,
    )
    .join("\n\n---\n\n");
}

function getSnapshotUpdatedAt(snapshot: ConversationProjectSnapshot): string {
  const timestamps = snapshot.artifacts
    .map((artifact) => artifact.updatedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return timestamps[0] ?? "";
}

function deriveDramaStage(project: DramaProject): string {
  switch (project.currentStep) {
    case "setup":
      return "立项设定";
    case "reference-script":
      return "参考拆解";
    case "creative-plan":
      return "创意方案";
    case "structure-transform":
      return "结构转译";
    case "characters":
      return "角色设定";
    case "character-transform":
      return "角色转译";
    case "directory":
      return "分集目录";
    case "outlines":
      return "单集细纲";
    case "episodes":
      return "剧本撰写";
    case "compliance":
      return "合规审查";
    case "export":
      return "导出与出片";
    default:
      return "立项设定";
  }
}

function deriveDramaObjective(project: DramaProject): string {
  switch (project.currentStep) {
    case "setup":
      return "补齐目标市场、受众、风格和核心题材。";
    case "reference-script":
      return "分析参考内容，提炼可复用的结构骨架。";
    case "creative-plan":
      return "收束创意方案，锁定主卖点与人物关系。";
    case "structure-transform":
      return "把参考结构转译成新的创作框架。";
    case "characters":
    case "character-transform":
      return "继续完善角色弧光、关系冲突与人物口吻。";
    case "directory":
      return "生成分集目录，安排节奏、钩子和高潮。";
    case "outlines":
      return "补全单集细纲，细化每集推进节点。";
    case "episodes":
      return "继续撰写分集正文，推进可导出的剧本稿。";
    case "compliance":
      return "完成合规审查，并修订潜在风险点。";
    case "export":
      return "整理导出文档，并衔接后续视频工作流。";
    default:
      return "继续推进当前剧本创作。";
  }
}

function listMissingDramaSetupFields(setup: DramaSetup | null): string[] {
  if (!setup) return ["目标市场", "受众", "风格", "结局", "总集数", "题材"];

  const missing: string[] = [];
  if (!setup.targetMarket.trim()) missing.push("目标市场");
  if (!setup.audience.trim()) missing.push("受众");
  if (!setup.tone.trim()) missing.push("风格");
  if (!setup.ending.trim()) missing.push("结局");
  if (!setup.totalEpisodes) missing.push("总集数");
  if (!setup.genres.length && !setup.customTopic.trim()) missing.push("题材");
  return missing;
}

function findNextOutlineEpisode(project: DramaProject): number | null {
  const nextEntry = project.directory
    .filter((entry) => !entry.outline?.trim())
    .sort((a, b) => a.number - b.number)[0];

  return nextEntry?.number ?? null;
}

function findNextEpisodeNumber(project: DramaProject): number | null {
  const completed = new Set(project.episodes.map((episode) => episode.number));
  const nextDirectoryEntry = project.directory
    .filter((entry) => !completed.has(entry.number))
    .sort((a, b) => a.number - b.number)[0];

  if (nextDirectoryEntry) return nextDirectoryEntry.number;
  if (project.directory.length) return project.directory.length + 1;
  return project.episodes.length ? project.episodes.length + 1 : null;
}

function summarizeArtifactLabels(labels: string[], limit = 2): string {
  const visible = labels.filter(Boolean).slice(0, limit);
  if (!visible.length) return "";
  return visible.join("、");
}

function buildDramaRecommendations(project: DramaProject): string[] {
  const missingSetup = listMissingDramaSetupFields(project.setup);
  const nextOutlineEpisode = findNextOutlineEpisode(project);
  const nextEpisodeNumber = findNextEpisodeNumber(project);
  const pendingCharacterCards = (project.characterStateCards ?? []).filter((card) => card.status !== "locked");
  const pendingCompliancePackets = (project.complianceRevisionPackets ?? []).filter(
    (packet) => packet.status === "pending",
  );
  const pendingBeatPacket = (project.storyBeatPackets ?? []).find((packet) => packet.status !== "locked");
  const hasCharacterCards = (project.characterStateCards?.length ?? 0) > 0;

  switch (project.currentStep) {
    case "setup":
      return [
        missingSetup.length
          ? `补齐${missingSetup.slice(0, 2).join("和")}`
          : "确认立项设定并进入创意方案",
        project.setup?.creativeInput.trim() ? "基于当前创意输入生成方案" : "直接输入你的核心想法",
        "让 Agent 先整理立项摘要",
      ];
    case "reference-script":
      return [
        project.referenceScript.trim() ? "继续分析参考内容" : "先补充参考文本",
        project.setup?.targetMarket.trim() ? "细化改编方向" : "锁定改编目标市场",
        "补充你的改编要求",
      ];
    case "creative-plan":
      return [
        project.creativePlan.trim() ? "微调创意方案" : "生成创意方案",
        pendingCharacterCards.length ? `先锁定 ${pendingCharacterCards.length} 张角色状态卡` : hasCharacterCards ? "继续推进到分集目录" : "补齐角色状态卡",
        "补充卖点、反转或人物关系要求",
      ];
    case "structure-transform":
      return [
        project.structureTransform.trim() ? "调整世界观映射" : "生成结构转译",
        project.characterTransform.trim() ? "继续推进到分集目录" : "生成角色转译方案",
        "补充改编边界和保留元素",
      ];
    case "characters":
    case "character-transform":
      return [
        project.directory.length ? "继续完善分集目录" : "生成分集目录",
        pendingCharacterCards.length ? `先锁定 ${pendingCharacterCards.length} 张角色状态卡` : hasCharacterCards ? "强化角色冲突" : "补齐角色状态卡",
        "补充人物口吻要求",
      ];
    case "directory":
      return [
        pendingCharacterCards.length ? `先锁定 ${pendingCharacterCards.length} 张角色状态卡` : "",
        pendingBeatPacket ? `先锁定第 ${pendingBeatPacket.episodeNumber} 集剧情 beat` : nextOutlineEpisode ? `先生成第 ${nextOutlineEpisode} 集细纲` : "生成单集细纲",
        "重新分配高潮与钩子",
        nextEpisodeNumber ? `直接开始写第 ${nextEpisodeNumber} 集` : "直接开始写第一集",
      ].filter(Boolean);
    case "outlines":
      return [
        pendingCharacterCards.length ? `回收剩余 ${pendingCharacterCards.length} 张角色状态卡` : "",
        pendingBeatPacket ? `复核第 ${pendingBeatPacket.episodeNumber} 集剧情 beat` : nextEpisodeNumber ? `生成第 ${nextEpisodeNumber} 集正文` : "生成分集正文",
        nextOutlineEpisode ? `重写第 ${nextOutlineEpisode} 集细纲` : "重写指定集细纲",
        "准备合规预检",
      ].filter(Boolean);
    case "episodes":
      return [
        nextEpisodeNumber ? `继续生成第 ${nextEpisodeNumber} 集` : "继续生成下一集",
        `做一轮已完成 ${project.episodes.length} 集的批量质检`,
        "准备合规审查",
      ];
    case "compliance":
      return [
        pendingCompliancePackets.length ? `先处理 ${pendingCompliancePackets.length} 条合规修订包` : project.complianceReport.trim() ? "根据建议修订" : "运行合规审查",
        "准备导出并衔接视频",
        "继续对话补充风险规避要求",
      ];
    case "export":
      return [
        pendingCompliancePackets.length ? "先回收剩余合规修订包" : project.exportDocument?.trim() ? "继续对话修改导出稿" : "导出整合文档",
        "接入视频工作流",
        "回头补写缺失章节或集数",
      ];
    default:
      return ["继续当前任务", "查看最近产物", "输入新的推进指令"];
  }
}

export function listStoredDramaProjects(): DramaProject[] {
  return safeReadJson<DramaProject[]>(DRAMA_PROJECTS_KEY, [])
    .map(normalizeDramaProject)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function loadStoredDramaProjectById(id: string): DramaProject | null {
  return listStoredDramaProjects().find((project) => project.id === id) ?? null;
}

export function upsertStoredDramaProject(project: DramaProject): DramaProject {
  const projects = listStoredDramaProjects();
  const nextProject = {
    ...synchronizeDramaProductionState(project, deriveDramaStyleLock(project), deriveDramaWorldModel(project)),
    updatedAt: new Date().toISOString(),
  };
  const index = projects.findIndex((item) => item.id === project.id);

  if (index >= 0) {
    projects[index] = nextProject;
  } else {
    projects.unshift(nextProject);
  }

  safeWriteJson(DRAMA_PROJECTS_KEY, projects);
  return nextProject;
}

export function readSkillDrafts(): SkillDraft[] {
  return safeReadJson<SkillDraft[]>(SKILL_DRAFTS_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function writeSkillDrafts(drafts: SkillDraft[]): void {
  safeWriteJson(SKILL_DRAFTS_KEY, drafts);
}

export function readMaintenanceReports(): MaintenanceReport[] {
  return safeReadJson<MaintenanceReport[]>(MAINTENANCE_REPORTS_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function writeMaintenanceReports(reports: MaintenanceReport[]): void {
  safeWriteJson(MAINTENANCE_REPORTS_KEY, reports);
}

export function createDramaSnapshot(project: DramaProject): ConversationProjectSnapshot {
  const syncedProject = synchronizeDramaProductionState(
    project,
    project.styleLock ?? deriveDramaStyleLock(project),
    project.worldModel ?? deriveDramaWorldModel(project),
  );
  const projectKind = syncedProject.mode === "adaptation" ? "adaptation" : "script";
  const updatedAt = syncedProject.updatedAt || new Date().toISOString();
  const artifacts: ConversationArtifact[] = [];
  const setupSummary = buildDramaSetupSummary(syncedProject.setup);
  const outlinePreview = buildOutlinePreview(syncedProject);
  const styleLock = syncedProject.styleLock ?? null;
  const worldModel = syncedProject.worldModel ?? null;

  if (setupSummary) {
    artifacts.push(
      buildArtifact(`${syncedProject.id}-setup`, "setup", "项目设定", setupSummary, updatedAt),
    );
  }

  if (syncedProject.referenceScript.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-reference`,
        "reference",
        "参考文本",
        syncedProject.referenceScript,
        updatedAt,
      ),
    );
  }

  if (syncedProject.referenceStructure.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-reference-structure`,
        "reference",
        "参考结构分析",
        syncedProject.referenceStructure,
        updatedAt,
      ),
    );
  }

  if (styleLock) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-style-lock`,
        "style-lock",
        "风格锁定",
        [
          `题材：${styleLock.genre.join("、")}`,
          `调性：${styleLock.tone}`,
          `视觉：${styleLock.visualStyle}`,
          `镜头：${styleLock.cinematography}`,
          `禁止项：${styleLock.forbidden.join("；")}`,
        ].join("\n"),
        updatedAt,
      ),
    );
  }

  if (worldModel) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-world-model`,
        "world-model",
        "世界模型",
        [
          worldModel.synopsis,
          `核心角色节点：${worldModel.characters.length}`,
          `剧情节点：${worldModel.scenes.length}`,
          `连续性规则：${worldModel.continuityRules.join("；")}`,
        ].join("\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.creativePlan.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-plan`,
        "plan",
        "创意方案",
        syncedProject.creativePlan,
        updatedAt,
      ),
    );
  }

  if (
    syncedProject.structureTransform.trim() &&
    syncedProject.structureTransform.trim() !== syncedProject.creativePlan.trim()
  ) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-structure-transform`,
        "plan",
        "结构转译",
        syncedProject.structureTransform,
        updatedAt,
      ),
    );
  }

  if (syncedProject.characters.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-characters`,
        "characters",
        "角色设定",
        syncedProject.characters,
        updatedAt,
      ),
    );
  }

  if (syncedProject.characterTransform.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-character-transform`,
        "characters",
        "角色转译",
        syncedProject.characterTransform,
        updatedAt,
      ),
    );
  }

  if (syncedProject.directoryRaw.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-directory`,
        "directory",
        "分集目录",
        syncedProject.directoryRaw,
        updatedAt,
      ),
    );
  }

  if (syncedProject.characterStateCards?.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-character-cards`,
        "character-card",
        `角色状态卡 ${syncedProject.characterStateCards.length} 张`,
        syncedProject.characterStateCards
          .slice(0, 6)
          .map(
            (card) =>
              `${card.name} · ${card.role}\n冲突：${card.coreConflict}\n目标：${card.desire}\n关注：${card.stageFocus}`,
          )
          .join("\n\n---\n\n"),
        updatedAt,
      ),
    );
  }

  if (outlinePreview) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-outline-preview`,
        "outline",
        "细纲预览",
        outlinePreview,
        updatedAt,
      ),
    );
  }

  if (syncedProject.storyBeatPackets?.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-beat-packets`,
        "beat-packet",
        `剧情 beat 包 ${syncedProject.storyBeatPackets.length} 条`,
        syncedProject.storyBeatPackets
          .slice(0, 8)
          .map(
            (packet) =>
              `第 ${packet.episodeNumber} 集 · ${packet.title}\n${packet.beatSummary}\n状态：${packet.status}`,
          )
          .join("\n\n---\n\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.episodes.length > 0) {
    const episodeText = syncedProject.episodes
      .slice(0, 3)
      .map((episode) => `第 ${episode.number} 集 · ${episode.title}\n${episode.content}`)
      .join("\n\n---\n\n");

    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-episodes`,
        "episode",
        `已完成 ${syncedProject.episodes.length} 集正文`,
        episodeText,
        updatedAt,
      ),
    );
  }

  if (syncedProject.complianceReport.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-compliance`,
        "compliance",
        "合规审查",
        syncedProject.complianceReport,
        updatedAt,
      ),
    );
  }

  if (syncedProject.complianceRevisionPackets?.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-compliance-revisions`,
        "compliance-revision",
        `合规修订包 ${syncedProject.complianceRevisionPackets.length} 条`,
        syncedProject.complianceRevisionPackets
          .slice(0, 8)
          .map(
            (packet) =>
              `${packet.issueTitle}\n风险：${packet.riskLevel}\n建议：${packet.recommendation}`,
          )
          .join("\n\n---\n\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.exportDocument?.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-export`,
        "export",
        "导出文档",
        syncedProject.exportDocument,
        updatedAt,
      ),
    );
  }

  const title =
    syncedProject.dramaTitle ||
    (syncedProject.mode === "adaptation" ? "未命名改编项目" : "未命名剧本项目");
  const stage = deriveDramaStage(syncedProject);
  const artifactLabels = summarizeArtifactLabels(artifacts.map((artifact) => artifact.label));
  const nextAction = buildDramaRecommendations(syncedProject)[0];

  return {
    projectId: syncedProject.id,
    projectKind,
    title,
    currentObjective: deriveDramaObjective(syncedProject),
    derivedStage: stage,
    agentSummary:
      artifacts.length > 0
        ? `项目当前位于“${stage}”，已整理出 ${artifacts.length} 份关键产物${artifactLabels ? `，包括${artifactLabels}` : ""}。${syncedProject.characterStateCards?.length ? `当前有 ${syncedProject.characterStateCards.length} 张角色状态卡。` : ""}${syncedProject.storyBeatPackets?.length ? `已锁定 ${syncedProject.storyBeatPackets.length} 条剧情 beat。` : ""}${syncedProject.complianceRevisionPackets?.length ? `合规修订包 ${syncedProject.complianceRevisionPackets.length} 条。` : ""}建议下一步先${nextAction}。`
        : `项目当前位于“${stage}”，但还缺少第一份可复用产物。建议先${nextAction}。`,
    recommendedActions: buildDramaRecommendations(syncedProject),
    artifacts,
    updatedAt,
    memory: {
      styleLock,
      worldModel,
      assetManifest: null,
      shotPackets: [],
      reviewQueue: [],
      characterStateCards: syncedProject.characterStateCards || [],
      storyBeatPackets: syncedProject.storyBeatPackets || [],
      complianceRevisionPackets: syncedProject.complianceRevisionPackets || [],
    },
  };
}

function deriveVideoStage(project: PersistedVideoProject): string {
  const hasReviewableOutputs = project.scenes.some(
    (scene) => !!scene.videoUrl || scene.videoStatus === "failed",
  );
  const hasRunningTasks = project.scenes.some(
    (scene) => !!scene.videoTaskId && ["queued", "processing"].includes(String(scene.videoStatus || "").toLowerCase()),
  );
  if (
    hasReviewableOutputs &&
    project.reviewQueue?.some((item) => item.status === "pending" || item.status === "redo")
  ) {
    return "审阅与修复";
  }
  if (hasRunningTasks) return "生成中";
  if (project.videoPromptBatch?.trim()) {
    return "视频提示词";
  }
  if (project.shotPackets?.length) {
    return "镜头指令包";
  }
  if (project.storyboardPlan?.trim()) {
    return "分镜批次";
  }
  if (project.characters.length || project.sceneSettings.length) {
    return "角色与场景";
  }
  return "脚本拆解";
}

function buildVideoRecommendations(project: PersistedVideoProject): string[] {
  const stage = deriveVideoStage(project);
  const generatedVideoCount = project.scenes.filter((scene) => scene.videoUrl).length;
  const storyboardedSceneCount = project.scenes.filter((scene) => scene.storyboardUrl).length;
  const shotPacketCount = project.shotPackets?.length ?? 0;
  const pendingReviews = project.reviewQueue?.filter(
    (item) => item.status === "pending" || item.status === "redo",
  ).length ?? 0;
  const runningTasks = project.scenes.filter(
    (scene) => !!scene.videoTaskId && ["queued", "processing"].includes(String(scene.videoStatus || "").toLowerCase()),
  ).length;

  switch (stage) {
    case "脚本拆解":
      return [
        project.script?.trim() ? "梳理脚本拆解结果" : "导入脚本开始拆解",
        project.targetPlatform?.trim() ? "补充镜头风格偏好" : "先补充目标平台",
        project.scenes.length ? "继续提取角色与场景" : "先完成第一轮镜头拆解",
      ];
    case "角色与场景":
      return [
        project.characters.length || project.sceneSettings.length ? "完善角色和场景资产" : "先生成角色和场景资产",
        storyboardedSceneCount ? "继续整理分镜批次" : "开始整理分镜批次",
        "补充额外镜头要求",
      ];
    case "分镜批次":
      return [
        storyboardedSceneCount ? `继续补齐剩余分镜批次` : "继续生成分镜批次",
        shotPacketCount ? "更新镜头指令包" : "编译镜头指令包",
        "整理镜头说明",
      ];
    case "镜头指令包":
      return [
        shotPacketCount ? `复核 ${shotPacketCount} 个镜头指令包` : "编译镜头指令包",
        project.videoPromptBatch?.trim() ? "微调视频提示词批次" : "准备视频提示词批次",
        pendingReviews ? `处理 ${pendingReviews} 条待审阅项` : "开始第一轮审阅准备",
      ];
    case "视频提示词":
      return [
        "开始第一轮出片",
        project.videoPromptBatch?.trim() ? "继续微调视频提示词批次" : "回到对话里补充出片要求",
        generatedVideoCount ? `检查已生成的 ${generatedVideoCount} 条视频资产` : "整理待审阅项",
      ];
    case "生成中":
      return [
        "轮询当前出片结果",
        runningTasks ? `等待剩余 ${runningTasks} 条镜头完成` : "继续等待当前批次",
        generatedVideoCount ? `检查已生成的 ${generatedVideoCount} 条视频资产` : "补充下一轮镜头要求",
      ];
    case "审阅与修复":
      return [
        pendingReviews ? `处理 ${pendingReviews} 条待审阅项` : "整理审阅结论",
        generatedVideoCount ? `检查已生成的 ${generatedVideoCount} 条视频资产` : "回到对话里补充审阅标准",
        "对需要重做的镜头发起修复",
      ];
    default:
      return [
        generatedVideoCount ? "预览并继续出片" : "检查导出前缺失的镜头",
        "导出当前视频资产",
        "回到对话里继续微调",
      ];
  }
}

export function createVideoSnapshot(project: PersistedVideoProject): ConversationProjectSnapshot {
  const syncedProject = synchronizeVideoProductionState(project);
  const updatedAt = syncedProject.updatedAt || new Date().toISOString();
  const sceneArtifactText = (syncedProject.scenes || [])
    .slice(0, 6)
    .map(
      (scene) =>
        `${scene.sceneNumber}. ${scene.sceneName}${scene.segmentLabel ? ` / ${scene.segmentLabel}` : ""}\n${
          scene.description || scene.dialogue || "等待补充镜头描述"
        }`,
    )
    .join("\n\n");
  const characterArtifactText = (syncedProject.characters || [])
    .slice(0, 6)
    .map((character) => `${character.name}: ${character.description || "已创建角色设定"}`)
    .join("\n");
  const sceneSettingsText = (syncedProject.sceneSettings || [])
    .slice(0, 6)
    .map((sceneSetting) => `${sceneSetting.name}: ${sceneSetting.description || "已创建场景设定"}`)
    .join("\n");
  const videoBriefText = [
    syncedProject.targetPlatform?.trim() ? `目标平台：${syncedProject.targetPlatform.trim()}` : null,
    syncedProject.shotStyle?.trim() ? `镜头风格：${syncedProject.shotStyle.trim()}` : null,
    syncedProject.outputGoal?.trim() ? `出片目标：${syncedProject.outputGoal.trim()}` : null,
    syncedProject.productionNotes?.trim() ? `补充说明：${syncedProject.productionNotes.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const artifacts: ConversationArtifact[] = [];

  if (videoBriefText.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-video-brief`,
        "video-brief",
        "视频简报",
        videoBriefText,
        updatedAt,
      ),
    );
  }

  if (syncedProject.analysisSummary?.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-analysis`,
        "video-brief",
        "桥接分析",
        syncedProject.analysisSummary,
        updatedAt,
      ),
    );
  }

  if (syncedProject.script?.trim()) {
    artifacts.push(
      buildArtifact(`${syncedProject.id}-script`, "plan", "视频脚本", syncedProject.script, updatedAt),
    );
  }

  if (sceneArtifactText.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-scenes`,
        "video-brief",
        `已拆解 ${syncedProject.scenes.length} 个镜头`,
        sceneArtifactText,
        updatedAt,
      ),
    );
  }

  if (characterArtifactText.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-characters`,
        "characters",
        `已整理 ${syncedProject.characters.length} 个角色`,
        characterArtifactText,
        updatedAt,
      ),
    );
  }

  if (sceneSettingsText.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-scene-settings`,
        "scene-settings",
        `已整理 ${syncedProject.sceneSettings.length} 个场景`,
        sceneSettingsText,
        updatedAt,
      ),
    );
  }

  if (syncedProject.styleLock) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-style-lock`,
        "style-lock",
        "风格锁定",
        [
          `题材：${syncedProject.styleLock.genre.join("、")}`,
          `调性：${syncedProject.styleLock.tone}`,
          `视觉：${syncedProject.styleLock.visualStyle}`,
          `镜头：${syncedProject.styleLock.cinematography}`,
          `禁止项：${syncedProject.styleLock.forbidden.join("；")}`,
        ].join("\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.worldModel) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-world-model`,
        "world-model",
        "世界模型",
        [
          syncedProject.worldModel.synopsis,
          `角色数：${syncedProject.worldModel.characters.length}`,
          `场景数：${syncedProject.worldModel.scenes.length}`,
          `连续性规则：${syncedProject.worldModel.continuityRules.join("；")}`,
        ].join("\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.assetManifest?.items.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-asset-manifest`,
        "asset-manifest",
        "资产清单",
        syncedProject.assetManifest.items
          .slice(0, 10)
          .map((item) => `${item.label} · ${item.meta} · ${item.reusable ? "可复用" : "当前镜头"}`)
          .join("\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.storyboardPlan?.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-storyboard-plan`,
        "storyboard-plan",
        "分镜批次",
        syncedProject.storyboardPlan,
        updatedAt,
      ),
    );
  }

  if (syncedProject.videoPromptBatch?.trim()) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-video-prompt-batch`,
        "video-prompt-batch",
        "视频提示词批次",
        syncedProject.videoPromptBatch,
        updatedAt,
      ),
    );
  }

  if (syncedProject.shotPackets?.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-shot-packets`,
        "shot-packet",
        `已编译 ${syncedProject.shotPackets.length} 个镜头指令包`,
        syncedProject.shotPackets
          .slice(0, 8)
          .map((packet) => `镜头 ${packet.sceneNumber} · ${packet.title}\n${packet.promptSeed}`)
          .join("\n\n---\n\n"),
        updatedAt,
      ),
    );
  }

  if (syncedProject.reviewQueue?.length) {
    artifacts.push(
      buildArtifact(
        `${syncedProject.id}-review-queue`,
        "review",
        `待审阅 ${syncedProject.reviewQueue.length} 项`,
        syncedProject.reviewQueue
          .slice(0, 8)
          .map((item) => `${item.title}\n${item.summary}\n状态：${item.status}`)
          .join("\n\n---\n\n"),
        updatedAt,
      ),
    );
  }

  const stage = deriveVideoStage(syncedProject);
  const hasReviewableOutputs = syncedProject.scenes.some(
    (scene) => !!scene.videoUrl || scene.videoStatus === "failed",
  );
  const contextSummary = [
    syncedProject.targetPlatform?.trim() ? `目标平台是 ${syncedProject.targetPlatform.trim()}` : null,
    syncedProject.shotStyle?.trim() ? `镜头风格为 ${syncedProject.shotStyle.trim()}` : null,
    syncedProject.outputGoal?.trim() ? `出片目标是 ${syncedProject.outputGoal.trim()}` : null,
  ]
    .filter(Boolean)
    .join("，");
  const artifactLabels = summarizeArtifactLabels(artifacts.map((artifact) => artifact.label));
  const nextAction = buildVideoRecommendations(syncedProject)[0];

  const currentObjective = hasReviewableOutputs &&
    syncedProject.reviewQueue?.some((item) => item.status === "pending" || item.status === "redo")
    ? "先审阅已有素材，并把需要重做的镜头回流给 Agent。"
    : syncedProject.scenes.some(
          (scene) => !!scene.videoTaskId && ["queued", "processing"].includes(String(scene.videoStatus || "").toLowerCase()),
        )
      ? "先轮询当前出片结果，再决定进入审阅还是继续补发镜头。"
      : syncedProject.videoPromptBatch?.trim()
        ? "把已整理好的提示词批次接入视频生成。"
        : syncedProject.shotPackets?.length
          ? "继续复核镜头指令包，并衔接提示词与生成。"
        : syncedProject.storyboardPlan?.trim()
          ? "继续补齐分镜批次，并校准镜头连贯性。"
          : syncedProject.characters.length || syncedProject.sceneSettings.length
            ? "完善角色与场景资产，为分镜生成做准备。"
            : syncedProject.scenes.length
              ? "复核镜头拆解结果，并继续整理桥接资产。"
              : "导入脚本，开始第一轮视频拆解。";

  return {
    projectId: syncedProject.id,
    projectKind: "video",
    title: syncedProject.title || "未命名视频项目",
    currentObjective,
    derivedStage: stage,
    agentSummary:
      artifacts.length > 0
        ? `视频项目当前位于“${stage}”，已整理 ${syncedProject.scenes.length} 个镜头、${syncedProject.characters.length} 个角色和 ${syncedProject.sceneSettings.length} 个场景${artifactLabels ? `，当前可直接使用${artifactLabels}` : ""}。${syncedProject.assetManifest ? `已建立 ${syncedProject.assetManifest.items.length} 项资产清单。` : ""}${contextSummary ? `当前${contextSummary}。` : ""}建议下一步先${nextAction}。`
        : `视频项目当前位于“${stage}”，适合先${nextAction}。${contextSummary ? `当前${contextSummary}。` : ""}`,
    recommendedActions: buildVideoRecommendations(syncedProject),
    artifacts,
    updatedAt,
    memory: {
      styleLock: syncedProject.styleLock,
      worldModel: syncedProject.worldModel,
      assetManifest: syncedProject.assetManifest,
      shotPackets: syncedProject.shotPackets || [],
      reviewQueue: syncedProject.reviewQueue || [],
    },
  };
}

export async function loadConversationSnapshotById(
  projectId: string,
): Promise<ConversationProjectSnapshot | null> {
  const dramaProject = loadStoredDramaProjectById(projectId);
  if (dramaProject) return createDramaSnapshot(dramaProject);

  const { loadStoredVideoProjectById } = await loadVideoPersistenceModule();
  const videoProject = await loadStoredVideoProjectById(projectId);
  if (videoProject) return createVideoSnapshot(videoProject);

  return null;
}

export async function loadConversationSourceById(projectId: string): Promise<{
  snapshot: ConversationProjectSnapshot | null;
  dramaProject: DramaProject | null;
  videoProject: PersistedVideoProject | null;
}> {
  const dramaProject = loadStoredDramaProjectById(projectId);
  if (dramaProject) {
    return {
      snapshot: createDramaSnapshot(dramaProject),
      dramaProject,
      videoProject: null,
    };
  }

  const { loadStoredVideoProjectById } = await loadVideoPersistenceModule();
  const videoProject = await loadStoredVideoProjectById(projectId);
  if (videoProject) {
    return {
      snapshot: createVideoSnapshot(videoProject),
      dramaProject: null,
      videoProject,
    };
  }

  return {
    snapshot: null,
    dramaProject: null,
    videoProject: null,
  };
}

export async function listRecentConversationSnapshots(
  limit = 8,
): Promise<ConversationProjectSnapshot[]> {
  const dramaSnapshots = listStoredDramaProjects().map(createDramaSnapshot);
  const { listStoredVideoProjects } = await loadVideoPersistenceModule();
  const videoSnapshots = (await listStoredVideoProjects()).map(createVideoSnapshot);

  return [...dramaSnapshots, ...videoSnapshots]
    .sort((a, b) => {
      const aDate = getSnapshotUpdatedAt(a);
      const bDate = getSnapshotUpdatedAt(b);
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, limit);
}
