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
  if (setup.customTopic.trim()) {
    lines.push(`主题补充：${setup.customTopic.trim()}`);
  }
  if (setup.creativeInput.trim()) {
    lines.push(`创意输入：${setup.creativeInput.trim()}`);
  }

  return lines.join("\n");
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
        project.characters.trim() ? "继续推进到分集目录" : "生成角色设定",
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
        "强化角色冲突",
        "补充人物口吻要求",
      ];
    case "directory":
      return [
        nextOutlineEpisode ? `先生成第 ${nextOutlineEpisode} 集细纲` : "生成单集细纲",
        "重新分配高潮与钩子",
        nextEpisodeNumber ? `直接开始写第 ${nextEpisodeNumber} 集` : "直接开始写第一集",
      ];
    case "outlines":
      return [
        nextEpisodeNumber ? `生成第 ${nextEpisodeNumber} 集正文` : "生成分集正文",
        nextOutlineEpisode ? `重写第 ${nextOutlineEpisode} 集细纲` : "重写指定集细纲",
        "准备合规预检",
      ];
    case "episodes":
      return [
        nextEpisodeNumber ? `继续生成第 ${nextEpisodeNumber} 集` : "继续生成下一集",
        `做一轮已完成 ${project.episodes.length} 集的批量质检`,
        "准备合规审查",
      ];
    case "compliance":
      return [
        project.complianceReport.trim() ? "根据建议修订" : "运行合规审查",
        "准备导出并衔接视频",
        "继续对话补充风险规避要求",
      ];
    case "export":
      return [
        project.exportDocument?.trim() ? "继续对话修改导出稿" : "导出整合文档",
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
  const nextProject = { ...project, updatedAt: new Date().toISOString() };
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
  const projectKind = project.mode === "adaptation" ? "adaptation" : "script";
  const updatedAt = project.updatedAt || new Date().toISOString();
  const artifacts: ConversationArtifact[] = [];
  const setupSummary = buildDramaSetupSummary(project.setup);
  const outlinePreview = buildOutlinePreview(project);

  if (setupSummary) {
    artifacts.push(
      buildArtifact(`${project.id}-setup`, "setup", "项目设定", setupSummary, updatedAt),
    );
  }

  if (project.referenceScript.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-reference`,
        "reference",
        "参考文本",
        project.referenceScript,
        updatedAt,
      ),
    );
  }

  if (project.referenceStructure.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-reference-structure`,
        "reference",
        "参考结构分析",
        project.referenceStructure,
        updatedAt,
      ),
    );
  }

  if (project.creativePlan.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-plan`,
        "plan",
        "创意方案",
        project.creativePlan,
        updatedAt,
      ),
    );
  }

  if (
    project.structureTransform.trim() &&
    project.structureTransform.trim() !== project.creativePlan.trim()
  ) {
    artifacts.push(
      buildArtifact(
        `${project.id}-structure-transform`,
        "plan",
        "结构转译",
        project.structureTransform,
        updatedAt,
      ),
    );
  }

  if (project.characters.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-characters`,
        "characters",
        "角色设定",
        project.characters,
        updatedAt,
      ),
    );
  }

  if (project.characterTransform.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-character-transform`,
        "characters",
        "角色转译",
        project.characterTransform,
        updatedAt,
      ),
    );
  }

  if (project.directoryRaw.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-directory`,
        "directory",
        "分集目录",
        project.directoryRaw,
        updatedAt,
      ),
    );
  }

  if (outlinePreview) {
    artifacts.push(
      buildArtifact(
        `${project.id}-outline-preview`,
        "outline",
        "细纲预览",
        outlinePreview,
        updatedAt,
      ),
    );
  }

  if (project.episodes.length > 0) {
    const episodeText = project.episodes
      .slice(0, 3)
      .map((episode) => `第 ${episode.number} 集 · ${episode.title}\n${episode.content}`)
      .join("\n\n---\n\n");

    artifacts.push(
      buildArtifact(
        `${project.id}-episodes`,
        "episode",
        `已完成 ${project.episodes.length} 集正文`,
        episodeText,
        updatedAt,
      ),
    );
  }

  if (project.complianceReport.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-compliance`,
        "compliance",
        "合规审查",
        project.complianceReport,
        updatedAt,
      ),
    );
  }

  if (project.exportDocument?.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-export`,
        "export",
        "导出文档",
        project.exportDocument,
        updatedAt,
      ),
    );
  }

  const title =
    project.dramaTitle ||
    (project.mode === "adaptation" ? "未命名改编项目" : "未命名剧本项目");
  const stage = deriveDramaStage(project);
  const artifactLabels = summarizeArtifactLabels(artifacts.map((artifact) => artifact.label));
  const nextAction = buildDramaRecommendations(project)[0];

  return {
    projectId: project.id,
    projectKind,
    title,
    currentObjective: deriveDramaObjective(project),
    derivedStage: stage,
    agentSummary:
      artifacts.length > 0
        ? `项目当前位于“${stage}”，已整理出 ${artifacts.length} 份关键产物${artifactLabels ? `，包括${artifactLabels}` : ""}。建议下一步先${nextAction}。`
        : `项目当前位于“${stage}”，但还缺少第一份可复用产物。建议先${nextAction}。`,
    recommendedActions: buildDramaRecommendations(project),
    artifacts,
  };
}

function mapVideoStage(step: number): string {
  switch (Math.min(Math.max(step, 1), 5)) {
    case 1:
      return "脚本拆解";
    case 2:
      return "角色与场景";
    case 3:
      return "分镜批次";
    case 4:
      return "视频生成";
    default:
      return "预览与导出";
  }
}

function buildVideoRecommendations(project: PersistedVideoProject): string[] {
  const step = Math.min(Math.max(project.currentStep || 1, 1), 5);
  const generatedVideoCount = project.scenes.filter((scene) => scene.videoUrl).length;
  const storyboardedSceneCount = project.scenes.filter((scene) => scene.storyboardUrl).length;

  switch (step) {
    case 1:
      return [
        project.script?.trim() ? "梳理脚本拆解结果" : "导入脚本开始拆解",
        project.targetPlatform?.trim() ? "补充镜头风格偏好" : "先补充目标平台",
        project.scenes.length ? "继续提取角色与场景" : "先完成第一轮镜头拆解",
      ];
    case 2:
      return [
        project.characters.length || project.sceneSettings.length ? "完善角色和场景资产" : "先生成角色和场景资产",
        storyboardedSceneCount ? "继续整理分镜批次" : "开始整理分镜批次",
        "补充额外镜头要求",
      ];
    case 3:
      return [
        storyboardedSceneCount ? `继续补齐剩余分镜批次` : "继续生成分镜批次",
        "整理镜头说明",
        project.videoPromptBatch?.trim() ? "微调视频提示词批次" : "准备视频提示词批次",
      ];
    case 4:
      return [
        generatedVideoCount ? `继续生成剩余镜头视频` : "准备视频生成",
        `检查已生成的 ${generatedVideoCount} 条视频资产`,
        "继续下一批镜头",
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
  const updatedAt = project.updatedAt || new Date().toISOString();
  const sceneArtifactText = (project.scenes || [])
    .slice(0, 6)
    .map(
      (scene) =>
        `${scene.sceneNumber}. ${scene.sceneName}${scene.segmentLabel ? ` / ${scene.segmentLabel}` : ""}\n${
          scene.description || scene.dialogue || "等待补充镜头描述"
        }`,
    )
    .join("\n\n");
  const characterArtifactText = (project.characters || [])
    .slice(0, 6)
    .map((character) => `${character.name}: ${character.description || "已创建角色设定"}`)
    .join("\n");
  const sceneSettingsText = (project.sceneSettings || [])
    .slice(0, 6)
    .map((sceneSetting) => `${sceneSetting.name}: ${sceneSetting.description || "已创建场景设定"}`)
    .join("\n");
  const videoBriefText = [
    project.targetPlatform?.trim() ? `目标平台：${project.targetPlatform.trim()}` : null,
    project.shotStyle?.trim() ? `镜头风格：${project.shotStyle.trim()}` : null,
    project.outputGoal?.trim() ? `出片目标：${project.outputGoal.trim()}` : null,
    project.productionNotes?.trim() ? `补充说明：${project.productionNotes.trim()}` : null,
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

  if (project.analysisSummary?.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-analysis`,
        "video-brief",
        "桥接分析",
        project.analysisSummary,
        updatedAt,
      ),
    );
  }

  if (project.script?.trim()) {
    artifacts.push(
      buildArtifact(`${project.id}-script`, "plan", "视频脚本", project.script, updatedAt),
    );
  }

  if (sceneArtifactText.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-scenes`,
        "video-brief",
        `已拆解 ${project.scenes.length} 个镜头`,
        sceneArtifactText,
        updatedAt,
      ),
    );
  }

  if (characterArtifactText.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-characters`,
        "characters",
        `已整理 ${project.characters.length} 个角色`,
        characterArtifactText,
        updatedAt,
      ),
    );
  }

  if (sceneSettingsText.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-scene-settings`,
        "scene-settings",
        `已整理 ${project.sceneSettings.length} 个场景`,
        sceneSettingsText,
        updatedAt,
      ),
    );
  }

  if (project.storyboardPlan?.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-storyboard-plan`,
        "storyboard-plan",
        "分镜批次",
        project.storyboardPlan,
        updatedAt,
      ),
    );
  }

  if (project.videoPromptBatch?.trim()) {
    artifacts.push(
      buildArtifact(
        `${project.id}-video-prompt-batch`,
        "video-prompt-batch",
        "视频提示词批次",
        project.videoPromptBatch,
        updatedAt,
      ),
    );
  }

  const stage = mapVideoStage(project.currentStep || 1);
  const contextSummary = [
    project.targetPlatform?.trim() ? `目标平台是 ${project.targetPlatform.trim()}` : null,
    project.shotStyle?.trim() ? `镜头风格为 ${project.shotStyle.trim()}` : null,
    project.outputGoal?.trim() ? `出片目标是 ${project.outputGoal.trim()}` : null,
  ]
    .filter(Boolean)
    .join("，");
  const artifactLabels = summarizeArtifactLabels(artifacts.map((artifact) => artifact.label));
  const nextAction = buildVideoRecommendations(project)[0];

  return {
    projectId: project.id,
    projectKind: "video",
    title: project.title || "未命名视频项目",
    currentObjective:
      project.videoPromptBatch?.trim()
        ? "把已整理好的提示词批次接入视频生成。"
        : project.storyboardPlan?.trim()
          ? "继续补齐分镜批次，并校准镜头连贯性。"
          : project.characters.length || project.sceneSettings.length
            ? "完善角色与场景资产，为分镜生成做准备。"
            : project.scenes.length
              ? "复核镜头拆解结果，并继续整理桥接资产。"
              : "导入脚本，开始第一轮视频拆解。",
    derivedStage: stage,
    agentSummary:
      artifacts.length > 0
        ? `视频项目当前位于“${stage}”，已整理 ${project.scenes.length} 个镜头、${project.characters.length} 个角色和 ${project.sceneSettings.length} 个场景${artifactLabels ? `，当前可直接使用${artifactLabels}` : ""}。${contextSummary ? `当前${contextSummary}。` : ""}建议下一步先${nextAction}。`
        : `视频项目当前位于“${stage}”，适合先${nextAction}。${contextSummary ? `当前${contextSummary}。` : ""}`,
    recommendedActions: buildVideoRecommendations(project),
    artifacts,
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
