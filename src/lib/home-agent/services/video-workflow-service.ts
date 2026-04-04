import {
  createStoredVideoProject,
  loadStoredVideoProjectById,
  type PersistedVideoProject,
  upsertStoredVideoProject,
} from "@/hooks/use-local-persistence";
import { invokeFunction } from "@/lib/invoke-with-key";
import { getApiConfig, prefersJimengCli } from "@/lib/api-config";
import { dreaminaCliGetStatus } from "@/lib/dreamina-cli";
import { createVideoSnapshot } from "@/lib/home-agent/project-store";
import type { WorkflowActionResult, StudioRuntimeState } from "@/lib/home-agent/types";
import {
  deriveVideoReviewQueue,
  deriveVideoShotPackets,
  synchronizeVideoProductionState,
} from "@/lib/home-agent/video-production-memory";
import type {
  ArtStyle,
  CharacterSetting,
  Scene,
  SceneSetting,
} from "@/types/project";

interface VideoEnhanceResult {
  enhanced: string;
  duration?: number;
  durationReason?: string;
}

interface ExtractEntitiesResult {
  characters?: Array<{ name?: string; description?: string }>;
  sceneSettings?: Array<{ name?: string; description?: string }>;
}

interface DecomposeResult {
  scenes?: Array<Partial<Scene>>;
}

interface VideoGenerationResult {
  task_id: string;
  status: string;
  provider?: string;
}

interface VideoGenerationStatusResult {
  status: string;
  video_url?: string;
  state?: string;
}

function summarizeVideoGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "视频生成失败，请检查当前运行通道与提示词后重试。";
  return truncate(normalized, 120);
}

export interface VideoWorkflowContinuationPlan {
  actionKind:
    | "analyze_script_for_video"
    | "extract_video_entities"
    | "prepare_storyboard_batch"
    | "compile_video_shot_packets"
    | "prepare_video_prompt_batch"
    | "generate_video_assets"
    | "refresh_video_assets"
    | "review_video_assets"
    | "create_video_bridge_artifact";
  policy:
    | "bootstrap-analysis"
    | "bootstrap-entities"
    | "bootstrap-storyboard"
    | "bootstrap-shot-packets"
    | "bootstrap-prompt-batch"
    | "refresh-running"
    | "review-ready"
    | "repair-failed"
    | "generate-next-batch"
    | "bridge-summary";
  input: Record<string, unknown>;
  reason: string;
  targetCount?: number;
  totalTargetCount?: number;
  remainingTargetCount?: number;
}

const VIDEO_ROUND_TERMINAL_POLICIES = new Set<VideoWorkflowContinuationPlan["policy"]>([
  "refresh-running",
  "review-ready",
  "repair-failed",
  "generate-next-batch",
  "bridge-summary",
]);

function truncate(text: string, max = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function buildVideoTitle(runtime: StudioRuntimeState, input: Record<string, unknown>): string {
  if (typeof input.title === "string" && input.title.trim()) {
    return input.title.trim();
  }
  if (runtime.currentVideoProject?.title?.trim()) {
    return runtime.currentVideoProject.title.trim();
  }
  if (runtime.currentDramaProject?.dramaTitle?.trim()) {
    return runtime.currentDramaProject.dramaTitle.trim();
  }
  if (runtime.currentProjectSnapshot?.title?.trim()) {
    return runtime.currentProjectSnapshot.title.trim();
  }
  return "未命名视频项目";
}

function buildScriptFromDrama(runtime: StudioRuntimeState): string {
  const drama = runtime.currentDramaProject;
  if (!drama) return "";
  if (drama.episodes.length > 0) {
    return drama.episodes
      .map((episode) => `第${episode.number}集：${episode.title}\n${episode.content}`)
      .join("\n\n---\n\n");
  }
  if (drama.creativePlan.trim()) return drama.creativePlan;
  if (drama.structureTransform.trim()) return drama.structureTransform;
  return "";
}

function resolveWorkingScript(
  runtime: StudioRuntimeState,
  project: PersistedVideoProject | null,
  input: Record<string, unknown>,
): string {
  if (typeof input.script === "string" && input.script.trim()) {
    return input.script.trim();
  }
  if (project?.script?.trim()) return project.script.trim();
  const dramaScript = buildScriptFromDrama(runtime);
  if (dramaScript.trim()) return dramaScript.trim();
  if (runtime.currentProjectSnapshot?.artifacts?.length) {
    const artifactWithContent = runtime.currentProjectSnapshot.artifacts.find((artifact) => artifact.content?.trim());
    if (artifactWithContent?.content?.trim()) {
      return artifactWithContent.content.trim();
    }
  }
  return "";
}

function readTextInput(input: Record<string, unknown>, key: string): string | undefined {
  return typeof input[key] === "string" && String(input[key]).trim()
    ? String(input[key]).trim()
    : undefined;
}

function buildVideoContextSummary(project: PersistedVideoProject): string {
  return [
    project.targetPlatform?.trim()
      ? `目标平台：${project.targetPlatform.trim()}`
      : null,
    project.shotStyle?.trim() ? `镜头风格：${project.shotStyle.trim()}` : null,
    project.outputGoal?.trim() ? `出片目标：${project.outputGoal.trim()}` : null,
    project.productionNotes?.trim()
      ? `补充说明：${truncate(project.productionNotes.trim(), 160)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function mergeVideoInputContext(
  project: PersistedVideoProject,
  runtime: StudioRuntimeState,
  input: Record<string, unknown>,
): PersistedVideoProject {
  return {
    ...project,
    title: buildVideoTitle(runtime, input),
    script: resolveWorkingScript(runtime, project, input),
    artStyle:
      typeof input.artStyle === "string"
        ? (input.artStyle as ArtStyle)
        : project.artStyle || "live-action",
    systemPrompt: readTextInput(input, "systemPrompt") || project.systemPrompt || "",
    targetPlatform: readTextInput(input, "targetPlatform") || project.targetPlatform || "",
    shotStyle: readTextInput(input, "shotStyle") || project.shotStyle || "",
    outputGoal: readTextInput(input, "outputGoal") || project.outputGoal || "",
    productionNotes:
      readTextInput(input, "productionNotes") ||
      readTextInput(input, "customInstruction") ||
      project.productionNotes ||
      "",
    sourceProjectId: project.sourceProjectId || runtime.currentDramaProject?.id,
  };
}

function withVideoProject(
  runtime: StudioRuntimeState,
  project: PersistedVideoProject,
): StudioRuntimeState {
  return {
    ...runtime,
    currentVideoProject: project,
    currentProjectSnapshot: createVideoSnapshot(project),
  };
}

function batchSceneRange(
  scenes: Scene[],
  size: number,
): { sceneStart: number; sceneEnd: number } {
  const start = scenes[0]?.sceneNumber ?? 1;
  const end = Math.min(start + size - 1, scenes.at(-1)?.sceneNumber ?? start);
  return { sceneStart: start, sceneEnd: end };
}

function listFailedSceneIds(project: PersistedVideoProject): string[] {
  return project.scenes
    .filter((scene) => normalizeSceneStatus(scene.videoStatus) === "failed")
    .map((scene) => scene.id);
}

function listRunningSceneIds(project: PersistedVideoProject): string[] {
  return project.scenes
    .filter(
      (scene) =>
        !!scene.videoTaskId &&
        ["queued", "processing"].includes(normalizeSceneStatus(scene.videoStatus)),
    )
    .map((scene) => scene.id);
}

function listGeneratableSceneIds(project: PersistedVideoProject, limit = 3): string[] {
  return project.scenes
    .filter((scene) => {
      const status = normalizeSceneStatus(scene.videoStatus);
      if (["queued", "processing"].includes(status)) return false;
      return !scene.videoUrl;
    })
    .slice(0, limit)
    .map((scene) => scene.id);
}

function listActionableReviewTargetIds(project: PersistedVideoProject): string[] {
  return (project.reviewQueue || [])
    .filter((item) => item.status === "pending" || item.status === "redo")
    .flatMap((item) => (item.targetIds.length ? item.targetIds : [item.id]));
}

function buildVideoContinuationBatchHint(plan: VideoWorkflowContinuationPlan): string {
  const targetCount = plan.targetCount ?? 0;
  const remainingTargetCount = plan.remainingTargetCount ?? 0;
  if (!targetCount) {
    return "";
  }

  switch (plan.policy) {
    case "generate-next-batch":
    case "repair-failed":
      return remainingTargetCount > 0
        ? `当前按批次推进：本轮先处理 ${targetCount} 条镜头，剩余 ${remainingTargetCount} 条可继续让 Agent 自动推进。`
        : `当前批次会直接处理这 ${targetCount} 条镜头，处理完成后就会自然衔接到下一轮轮询或审阅。`;
    case "refresh-running":
      return remainingTargetCount > 0
        ? `本轮先刷新 ${targetCount} 条进行中镜头，剩余 ${remainingTargetCount} 条任务稍后也能继续自动回收。`
        : `本轮会先刷新这 ${targetCount} 条进行中镜头，再根据结果决定进入审阅还是继续补发。`;
    case "review-ready":
      return remainingTargetCount > 0
        ? `本轮先处理 ${targetCount} 条待审项，剩余 ${remainingTargetCount} 条仍可继续让 Agent 分批收口。`
        : `本轮会先处理这 ${targetCount} 条待审项，处理完就能继续回到生成或修复。`;
    default:
      return "";
  }
}

export function planVideoWorkflowContinuation(
  project: PersistedVideoProject,
  input: Record<string, unknown> = {},
): VideoWorkflowContinuationPlan {
  if (!project.script?.trim()) {
    throw new Error("当前没有可用于视频生产的脚本，请先提供脚本或挂载剧本项目。");
  }

  if (!project.scenes.length) {
    return {
      actionKind: "analyze_script_for_video",
      policy: "bootstrap-analysis",
      input,
      reason: "先把当前脚本拆成镜头，首页会话才能继续推进视频生产。",
    };
  }

  if (!project.characters.length || !project.sceneSettings.length) {
    return {
      actionKind: "extract_video_entities",
      policy: "bootstrap-entities",
      input,
      reason: "镜头已经拆完，下一步先整理角色和场景资产。",
    };
  }

  if (!project.storyboardPlan?.trim()) {
    return {
      actionKind: "prepare_storyboard_batch",
      policy: "bootstrap-storyboard",
      input: { ...batchSceneRange(project.scenes, 6), ...input },
      reason: "角色与场景已就绪，先整理第一批分镜说明。",
    };
  }

  if (!project.shotPackets?.length) {
    return {
      actionKind: "compile_video_shot_packets",
      policy: "bootstrap-shot-packets",
      input,
      reason: "分镜说明已经就绪，下一步先把镜头压成可复用的 shot packet。",
    };
  }

  if (!project.videoPromptBatch?.trim()) {
    return {
      actionKind: "prepare_video_prompt_batch",
      policy: "bootstrap-prompt-batch",
      input: { ...batchSceneRange(project.scenes, 4), ...input },
      reason: "分镜批次已经完成，下一步生成对应的视频提示词。",
    };
  }

  const runningSceneIds = listRunningSceneIds(project);
  if (runningSceneIds.length) {
    const targetIds = runningSceneIds.slice(0, 6);
    return {
      actionKind: "refresh_video_assets",
      policy: "refresh-running",
      input: { ...input, targetIds },
      reason:
        targetIds.length === 1
          ? "已有镜头仍在后台出片，先刷新这一条镜头结果。"
          : `已有 ${runningSceneIds.length} 条镜头在后台出片，先刷新当前批次结果。`,
      targetCount: targetIds.length,
      totalTargetCount: runningSceneIds.length,
      remainingTargetCount: Math.max(runningSceneIds.length - targetIds.length, 0),
    };
  }

  const reviewTargetIds = listActionableReviewTargetIds(project);
  if (reviewTargetIds.length) {
    const targetIds = reviewTargetIds.slice(0, 6);
    return {
      actionKind: "review_video_assets",
      policy: "review-ready",
      input: { ...input, targetIds },
      reason:
        targetIds.length === 1
          ? "已有 1 条镜头进入待审阅状态，先确认是否通过或重做。"
          : `已有 ${reviewTargetIds.length} 条镜头进入待审阅状态，先处理这一轮审阅。`,
      targetCount: targetIds.length,
      totalTargetCount: reviewTargetIds.length,
      remainingTargetCount: Math.max(reviewTargetIds.length - targetIds.length, 0),
    };
  }

  const failedSceneIds = listFailedSceneIds(project);
  if (failedSceneIds.length) {
    const targetIds = failedSceneIds.slice(0, 3);
    return {
      actionKind: "generate_video_assets",
      policy: "repair-failed",
      input: {
        ...input,
        targetIds,
        forceRegenerate: true,
      },
      reason:
        targetIds.length === 1
          ? "当前有 1 条镜头出片失败，先直接补发这条失败镜头。"
          : `当前有 ${failedSceneIds.length} 条镜头出片失败，先统一补发失败镜头。`,
      targetCount: targetIds.length,
      totalTargetCount: failedSceneIds.length,
      remainingTargetCount: Math.max(failedSceneIds.length - targetIds.length, 0),
    };
  }

  const generatableSceneIds = listGeneratableSceneIds(project, 3);
  if (generatableSceneIds.length) {
    const totalGeneratableSceneIds = listGeneratableSceneIds(project, Number.MAX_SAFE_INTEGER);
    return {
      actionKind: "generate_video_assets",
      policy: "generate-next-batch",
      input: {
        ...input,
        targetIds: generatableSceneIds,
      },
      reason:
        generatableSceneIds.length === 1
          ? "视频提示词已经就绪，下一步先提交这一条镜头出片。"
          : `视频提示词已经就绪，下一步先提交前 ${generatableSceneIds.length} 条镜头出片。`,
      targetCount: generatableSceneIds.length,
      totalTargetCount: totalGeneratableSceneIds.length,
      remainingTargetCount: Math.max(totalGeneratableSceneIds.length - generatableSceneIds.length, 0),
    };
  }

  return {
    actionKind: "create_video_bridge_artifact",
    policy: "bridge-summary",
    input,
    reason: "当前视频项目已经具备首页继续出片所需的桥接摘要。",
  };
}

async function ensureVideoProject(
  runtime: StudioRuntimeState,
  input: Record<string, unknown>,
): Promise<PersistedVideoProject> {
  if (typeof input.projectId === "string" && input.projectId.trim()) {
    const restored = await loadStoredVideoProjectById(input.projectId.trim());
    if (restored) return restored;
  }

  if (runtime.currentVideoProject) {
    return { ...runtime.currentVideoProject };
  }

  const script = resolveWorkingScript(runtime, null, input);
  const created = await createStoredVideoProject({
    title: buildVideoTitle(runtime, input),
    script,
    targetPlatform: readTextInput(input, "targetPlatform"),
    shotStyle: readTextInput(input, "shotStyle"),
    outputGoal: readTextInput(input, "outputGoal"),
    productionNotes:
      readTextInput(input, "productionNotes") ||
      readTextInput(input, "customInstruction"),
    artStyle:
      typeof input.artStyle === "string"
        ? (input.artStyle as ArtStyle)
        : "live-action",
    currentStep: 1,
    sourceProjectId: runtime.currentDramaProject?.id,
    analysisSummary: script
      ? "已从当前首页会话接入脚本，可继续做镜头拆解、资产梳理和出片准备。"
      : "已建立视频会话项目，等待脚本或镜头需求进入生产。",
  });
  return mergeVideoInputContext(created, runtime, input);
}

async function saveVideoProject(
  project: PersistedVideoProject,
  summary: string,
): Promise<WorkflowActionResult> {
  const saved = await upsertStoredVideoProject(synchronizeVideoProductionState(project));
  const snapshot = createVideoSnapshot(saved);
  return {
    summary,
    projectSnapshot: snapshot,
    recommendedActions: snapshot.recommendedActions,
    data: {
      videoProject: saved,
      projectSnapshot: snapshot,
    },
  };
}

function resolveGenerationScenes(
  project: PersistedVideoProject,
  input: Record<string, unknown>,
): Scene[] {
  const targetIds = collectTargetIds(input);
  if (targetIds.length) {
    return project.scenes.filter((scene) => sceneTargetMatches(scene, project.id, targetIds));
  }

  const start = typeof input.sceneStart === "number" ? input.sceneStart : null;
  const end = typeof input.sceneEnd === "number" ? input.sceneEnd : null;
  if (start !== null || end !== null) {
    const lower = start ?? project.scenes[0]?.sceneNumber ?? 1;
    const upper = end ?? lower;
    return project.scenes.filter((scene) => scene.sceneNumber >= lower && scene.sceneNumber <= upper);
  }

  const forceRegenerate = input.forceRegenerate === true;
  const batchSize =
    typeof input.batchSize === "number" && Number.isFinite(input.batchSize)
      ? Math.max(1, Math.min(8, Math.floor(input.batchSize)))
      : 3;

  return project.scenes
    .filter((scene) => {
      if (forceRegenerate) return true;
      if (["queued", "processing"].includes(normalizeSceneStatus(scene.videoStatus))) return false;
      return !scene.videoUrl;
    })
    .slice(0, batchSize);
}

async function buildSceneVideoPrompt(
  project: PersistedVideoProject,
  scene: Scene,
): Promise<VideoEnhanceResult> {
  const characterDetails = findCharacterDetails(scene, project.characters || []);
  const matchedSetting = findSceneSetting(scene, project.sceneSettings || []);
  const { data, error } = await invokeFunction<VideoEnhanceResult>(
    "enhance-video-prompt",
    {
      description: scene.description,
      characters: scene.characters,
      cameraDirection: scene.cameraDirection,
      sceneName: scene.sceneName,
      dialogue: scene.dialogue,
      style: project.artStyle,
      characterDescriptions: characterDetails,
      sceneDescription: matchedSetting?.description || scene.sceneName,
    },
  );

  if (error) throw error;
  return data || { enhanced: scene.description || scene.sceneName || "继续生成当前镜头", duration: scene.duration || 5 };
}

function appendVideoHistory(scene: Scene, nextUrl?: string) {
  if (!scene.videoUrl || scene.videoUrl === nextUrl) return scene.videoHistory || [];

  const previous = scene.videoHistory || [];
  if (previous.some((entry) => entry.videoUrl === scene.videoUrl)) {
    return previous;
  }

  return [
    ...previous,
    {
      videoUrl: scene.videoUrl,
      createdAt: new Date().toISOString(),
    },
  ];
}

function mapScene(raw: Partial<Scene>, index: number): Scene {
  return {
    id: raw.id || crypto.randomUUID(),
    sceneNumber: typeof raw.sceneNumber === "number" ? raw.sceneNumber : index + 1,
    sceneName: raw.sceneName?.trim() || `镜头 ${index + 1}`,
    description: raw.description?.trim() || "",
    characters: Array.isArray(raw.characters)
      ? raw.characters.filter((item): item is string => typeof item === "string")
      : [],
    dialogue: raw.dialogue?.trim() || "",
    cameraDirection: raw.cameraDirection?.trim() || "",
    segmentLabel: raw.segmentLabel,
    duration: typeof raw.duration === "number" ? raw.duration : 5,
    storyboardUrl: raw.storyboardUrl,
    storyboardHistory: raw.storyboardHistory,
    panoramaUrl: raw.panoramaUrl,
    videoUrl: raw.videoUrl,
    videoTaskId: raw.videoTaskId,
    videoProvider: raw.videoProvider,
    videoStatus: raw.videoStatus,
    videoHistory: raw.videoHistory,
    recommendedDuration: raw.recommendedDuration,
    isManualDuration: raw.isManualDuration,
    characterCostumes: raw.characterCostumes,
    sceneTimeVariantId: raw.sceneTimeVariantId,
  };
}

function mapCharacters(
  rawCharacters: ExtractEntitiesResult["characters"],
): CharacterSetting[] {
  return (rawCharacters || []).map((character, index) => ({
    id: crypto.randomUUID(),
    name: character?.name?.trim() || `角色 ${index + 1}`,
    description: character?.description?.trim() || "",
    isAIGenerated: false,
    source: "auto",
  }));
}

function mapSceneSettings(
  rawSceneSettings: ExtractEntitiesResult["sceneSettings"],
): SceneSetting[] {
  return (rawSceneSettings || []).map((sceneSetting, index) => ({
    id: crypto.randomUUID(),
    name: sceneSetting?.name?.trim() || `场景 ${index + 1}`,
    description: sceneSetting?.description?.trim() || "",
    isAIGenerated: false,
    source: "auto",
  }));
}

function findCharacterDetails(
  scene: Scene,
  characters: CharacterSetting[],
): Array<{ name: string; description: string }> {
  const knownNames = new Set(scene.characters.map((name) => normalizeName(name)));
  return characters
    .filter((character) => knownNames.has(normalizeName(character.name)))
    .map((character) => ({
      name: character.name,
      description: character.description,
    }));
}

function findSceneSetting(scene: Scene, sceneSettings: SceneSetting[]): SceneSetting | undefined {
  const normalizedSceneName = normalizeName(scene.sceneName);
  return sceneSettings.find((sceneSetting) => {
    const normalizedSettingName = normalizeName(sceneSetting.name);
    return (
      normalizedSettingName === normalizedSceneName ||
      normalizedSceneName.includes(normalizedSettingName) ||
      normalizedSettingName.includes(normalizedSceneName)
    );
  });
}

function findSceneReferenceImage(
  scene: Scene,
  sceneSettings: SceneSetting[],
): string | undefined {
  if (scene.storyboardUrl?.trim()) return scene.storyboardUrl.trim();
  if (scene.panoramaUrl?.trim()) return scene.panoramaUrl.trim();

  const matchedSetting = findSceneSetting(scene, sceneSettings);
  const matchedVariant = matchedSetting?.timeVariants?.find(
    (variant) => variant.id === scene.sceneTimeVariantId || variant.id === matchedSetting.activeTimeVariantId,
  );

  if (matchedVariant?.imageUrl?.trim()) return matchedVariant.imageUrl.trim();
  if (matchedSetting?.imageUrl?.trim()) return matchedSetting.imageUrl.trim();
  return undefined;
}

function shouldPreferLocalDreamina(input: Record<string, unknown>): boolean {
  if (typeof input.provider === "string" && input.provider.trim()) {
    return input.provider.trim() === "dreamina-cli";
  }

  return prefersJimengCli(getApiConfig());
}

type VideoGenerationTransport = {
  mode: "api" | "cli";
  provider?: string;
  providerLabel: string;
};

async function ensureVideoGenerationTransport(
  input: Record<string, unknown>,
): Promise<VideoGenerationTransport> {
  const config = getApiConfig();
  const provider =
    typeof input.provider === "string" && input.provider.trim()
      ? input.provider.trim()
      : undefined;

  if (shouldPreferLocalDreamina(input)) {
    if (!window.electronAPI?.dreaminaCli?.exec) {
      throw new Error("当前已锁定 CLI，但 Dreamina CLI 未安装或当前环境不支持，无法发起出片。");
    }

    const status = await dreaminaCliGetStatus();
    if (!status.loggedIn) {
      throw new Error(
        status.installed
          ? "当前已锁定 CLI，但 Dreamina CLI 尚未登录，无法发起出片。请先完成登录，或切回 API。"
          : "当前已锁定 CLI，但 Dreamina CLI 未安装或不可用，无法发起出片。请先安装并登录，或切回 API。",
      );
    }

    return {
      mode: "cli",
      provider: "dreamina-cli",
      providerLabel: "Dreamina CLI / Seedance 2.0",
    };
  }

  if (provider === "tuzi") {
    if (!config.tuziKey?.trim()) {
      throw new Error("当前指定了 Tuzi / Sora 2，但缺少可用 API Key，无法发起出片。");
    }

    return {
      mode: "api",
      provider: "tuzi",
      providerLabel: "Tuzi API / Sora 2",
    };
  }

  if (!config.jimengKey?.trim() && !config.geminiKey?.trim()) {
    throw new Error("当前已锁定 API，但缺少 Seedance / Gemini 可用 Key，无法发起出片。");
  }

  return {
    mode: "api",
    provider,
    providerLabel: "Seedance API",
  };
}

function normalizeSceneStatus(value: string | undefined): string {
  if (!value?.trim()) return "";
  const lowered = String(value || "").toLowerCase();
  if (/(succeeded|success|completed|done)/.test(lowered)) return "completed";
  if (/(queued|pending|submitted)/.test(lowered)) return "queued";
  if (/(failed|error|cancel)/.test(lowered)) return "failed";
  return "processing";
}

function sceneTargetMatches(scene: Scene, projectId: string, targetIds: string[]): boolean {
  if (!targetIds.length) return false;

  return targetIds.some((targetId) => {
    const normalized = targetId.trim();
    return (
      normalized === scene.id ||
      normalized === `packet:${projectId}:${scene.id}` ||
      normalized === `review:packet:${projectId}:${scene.id}` ||
      normalized === `shot:${scene.id}:video` ||
      normalized === `shot:${scene.id}:storyboard` ||
      normalized.endsWith(`:${scene.id}`) ||
      normalized.includes(`:${scene.id}:`)
    );
  });
}

function buildStoryboardBatch(
  scenes: Scene[],
  characters: CharacterSetting[],
  sceneSettings: SceneSetting[],
): string {
  return scenes
    .map((scene) => {
      const characterSummary = scene.characters.length > 0 ? scene.characters.join("、") : "暂无明确角色";
      const matchedSetting = findSceneSetting(scene, sceneSettings);
      const knownCharacterDetails = findCharacterDetails(scene, characters)
        .map((character) => `${character.name}: ${character.description || "待补充角色外观与特征"}`)
        .join("；");

      return [
        `镜头 ${scene.sceneNumber}${scene.segmentLabel ? ` / 片段 ${scene.segmentLabel}` : ""}`,
        `标题：${scene.sceneName}`,
        `画面：${scene.description || "待补充镜头描述"}`,
        `对白：${scene.dialogue || "无"}`,
        `镜头语言：${scene.cameraDirection || "待补充"}`,
        `角色：${characterSummary}`,
        `角色资产：${knownCharacterDetails || "暂无角色资产，建议先生成角色形象"}`,
        `场景资产：${matchedSetting ? `${matchedSetting.name} - ${matchedSetting.description || "已有场景设定"}` : "暂无对应场景设定"}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function buildPromptBatchSummary(
  scenes: Scene[],
  results: Array<{ scene: Scene; prompt: VideoEnhanceResult }>,
): string {
  return results
    .map(({ scene, prompt }, index) => [
      `批次 ${index + 1} / 镜头 ${scene.sceneNumber}${scene.segmentLabel ? ` / ${scene.segmentLabel}` : ""}`,
      `场景：${scene.sceneName}`,
      `推荐时长：${prompt.duration ?? scene.duration ?? 5}s`,
      `时长依据：${prompt.durationReason || "按镜头复杂度自动估算"}`,
      "",
      prompt.enhanced,
    ].join("\n"))
    .join("\n\n====================\n\n");
}

export async function prepareVideoGenerationAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const nextProject: PersistedVideoProject = {
    ...project,
    title: buildVideoTitle(runtime, input),
    script: resolveWorkingScript(runtime, project, input),
    analysisSummary:
      project.analysisSummary ||
      "首页会话已经接管视频生产，你可以继续做镜头拆解、资产梳理和提示词批处理。",
    currentStep: Math.max(project.currentStep || 1, 1),
    sourceProjectId: project.sourceProjectId || runtime.currentDramaProject?.id,
  };
  return saveVideoProject(
    nextProject,
    `已接管视频项目《${nextProject.title}》的首页会话上下文。`,
  );
}

export async function analyzeScriptForVideoAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const script = resolveWorkingScript(runtime, project, input);
  if (!script) {
    throw new Error("当前没有可用于视频拆解的脚本内容。");
  }

  const { data, error } = await invokeFunction<DecomposeResult>("script-decompose", {
    script,
    videoPace: typeof input.videoPace === "string" ? input.videoPace : "medium",
    segmentsPerEpisode:
      typeof input.segmentsPerEpisode === "number" ? input.segmentsPerEpisode : 5,
    systemPrompt:
      typeof input.systemPrompt === "string" ? input.systemPrompt : project.systemPrompt,
    model: typeof input.model === "string" ? input.model : undefined,
  });

  if (error) throw error;

  const scenes = (data?.scenes || []).map((scene, index) => mapScene(scene, index));
  const segmentCount = new Set(
    scenes.map((scene) => scene.segmentLabel).filter(Boolean),
  ).size;

  return saveVideoProject(
    {
      ...project,
      title: buildVideoTitle(runtime, input),
      script,
      scenes,
      currentStep: Math.max(project.currentStep || 1, 1),
      analysisSummary: `已完成镜头拆解，共整理 ${scenes.length} 个镜头${segmentCount ? `，覆盖 ${segmentCount} 个片段` : ""}。`,
      sourceProjectId: project.sourceProjectId || runtime.currentDramaProject?.id,
    },
    `已完成《${project.title}》的视频镜头拆解，共 ${scenes.length} 个镜头。`,
  );
}

export async function extractVideoEntitiesAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const script = resolveWorkingScript(runtime, project, input);
  if (!script) {
    throw new Error("当前没有可用于识别角色和场景的脚本内容。");
  }

  const { data, error } = await invokeFunction<ExtractEntitiesResult>(
    "extract-characters-scenes",
    {
      script,
      model: typeof input.model === "string" ? input.model : undefined,
    },
  );

  if (error) throw error;

  const characters = mapCharacters(data?.characters);
  const sceneSettings = mapSceneSettings(data?.sceneSettings);

  return saveVideoProject(
    {
      ...project,
      title: buildVideoTitle(runtime, input),
      script,
      characters,
      sceneSettings,
      currentStep: Math.max(project.currentStep || 1, 2),
      analysisSummary: `已整理 ${characters.length} 个角色和 ${sceneSettings.length} 个场景设定，可继续组织分镜批次。`,
      sourceProjectId: project.sourceProjectId || runtime.currentDramaProject?.id,
    },
    `已从脚本中提取 ${characters.length} 个角色与 ${sceneSettings.length} 个场景设定。`,
  );
}

export async function prepareStoryboardBatchAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  if (!project.scenes.length) {
    throw new Error("当前还没有镜头拆解结果，先运行脚本拆解更稳妥。");
  }

  const start =
    typeof input.sceneStart === "number"
      ? input.sceneStart
      : project.scenes[0]?.sceneNumber ?? 1;
  const end =
    typeof input.sceneEnd === "number"
      ? input.sceneEnd
      : Math.min(start + 5, project.scenes.at(-1)?.sceneNumber ?? start);
  const selectedScenes = project.scenes.filter(
    (scene) => scene.sceneNumber >= start && scene.sceneNumber <= end,
  );

  const storyboardPlan = buildStoryboardBatch(
    selectedScenes,
    project.characters || [],
    project.sceneSettings || [],
  );

  return saveVideoProject(
    {
      ...project,
      storyboardPlan,
      currentStep: Math.max(project.currentStep || 1, 3),
      analysisSummary: `已整理镜头 ${start}-${end} 的分镜批次说明，可继续逐镜生成分镜图。`,
    },
    `已整理镜头 ${start}-${end} 的分镜批次说明。`,
  );
}

export async function compileVideoShotPacketsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );

  if (!project.scenes.length) {
    throw new Error("当前还没有镜头拆解结果，无法编译镜头指令包。");
  }

  if (!project.characters.length && !project.sceneSettings.length) {
    throw new Error("建议先整理角色与场景资产，再编译镜头指令包。");
  }

  const synced = synchronizeVideoProductionState(project);
  const shotPackets = deriveVideoShotPackets({
    ...synced,
    assetManifest: synced.assetManifest,
  });
  const reviewQueue = deriveVideoReviewQueue({
    ...synced,
    assetManifest: synced.assetManifest,
    shotPackets,
  });

  return saveVideoProject(
    {
      ...synced,
      shotPackets,
      reviewQueue,
      currentStep: Math.max(project.currentStep || 1, 4),
      analysisSummary: `已编译 ${shotPackets.length} 个镜头指令包，可继续对接提示词批次与生成。`,
    },
    `已为《${project.title}》编译 ${shotPackets.length} 个镜头指令包。`,
  );
}

export async function prepareVideoPromptBatchAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  if (!project.scenes.length) {
    throw new Error("当前还没有镜头拆解结果，无法准备视频提示词批次。");
  }

  const start =
    typeof input.sceneStart === "number"
      ? input.sceneStart
      : project.scenes[0]?.sceneNumber ?? 1;
  const end =
    typeof input.sceneEnd === "number"
      ? input.sceneEnd
      : Math.min(start + 3, project.scenes.at(-1)?.sceneNumber ?? start);
  const selectedScenes = project.scenes.filter(
    (scene) => scene.sceneNumber >= start && scene.sceneNumber <= end,
  );

  const promptResults: Array<{ scene: Scene; prompt: VideoEnhanceResult }> = [];
  const nextScenes = [...project.scenes];

  for (const scene of selectedScenes) {
    const characterDetails = findCharacterDetails(scene, project.characters || []);
    const matchedSetting = findSceneSetting(scene, project.sceneSettings || []);
    const { data, error } = await invokeFunction<VideoEnhanceResult>(
      "enhance-video-prompt",
      {
        description: scene.description,
        characters: scene.characters,
        cameraDirection: scene.cameraDirection,
        sceneName: scene.sceneName,
        dialogue: scene.dialogue,
        style: project.artStyle,
        characterDescriptions: characterDetails,
        sceneDescription: matchedSetting?.description || scene.sceneName,
      },
    );

    if (error) throw error;

    const result = data || { enhanced: scene.description };
    promptResults.push({ scene, prompt: result });

    const index = nextScenes.findIndex((item) => item.id === scene.id);
    if (index >= 0) {
      nextScenes[index] = {
        ...nextScenes[index],
        recommendedDuration: result.duration ?? nextScenes[index].recommendedDuration,
      };
    }
  }

  const videoPromptBatch = buildPromptBatchSummary(selectedScenes, promptResults);

  return saveVideoProject(
    {
      ...project,
      scenes: nextScenes,
      videoPromptBatch,
      currentStep: Math.max(project.currentStep || 1, 4),
      analysisSummary: `已生成镜头 ${start}-${end} 的视频提示词批次，可继续接到生成工具。`,
    },
    `已生成镜头 ${start}-${end} 的视频提示词批次。`,
  );
}

export async function generateVideoAssetsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  if (!project.scenes.length) {
    throw new Error("当前还没有镜头拆解结果，无法直接发起出片。");
  }

  const selectedScenes = resolveGenerationScenes(project, input);
  if (!selectedScenes.length) {
    throw new Error("当前没有可提交出片的镜头，先轮询结果或指定新的镜头范围。");
  }

  const transport = await ensureVideoGenerationTransport(input);
  const nextScenes = [...project.scenes];
  let submittedCount = 0;
  const failedScenes: string[] = [];

  for (const scene of selectedScenes) {
    try {
      const prompt = await buildSceneVideoPrompt(project, scene);
      const referenceImageUrl = findSceneReferenceImage(scene, project.sceneSettings || []);
      const { data, error } = await invokeFunction<VideoGenerationResult>("generate-video", {
        prompt: prompt.enhanced,
        imageUrl: referenceImageUrl,
        duration: prompt.duration ?? scene.recommendedDuration ?? scene.duration ?? 5,
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : "16:9",
        resolution: typeof input.resolution === "string" ? input.resolution : "720p",
        provider: transport.provider,
      });

      if (error) throw error;

      const sceneIndex = nextScenes.findIndex((item) => item.id === scene.id);
      if (sceneIndex < 0) continue;

      nextScenes[sceneIndex] = {
        ...nextScenes[sceneIndex],
        videoHistory: appendVideoHistory(nextScenes[sceneIndex]),
        videoUrl: undefined,
        videoTaskId: data?.task_id || nextScenes[sceneIndex].videoTaskId,
        videoProvider:
          data?.provider || transport.provider || nextScenes[sceneIndex].videoProvider,
        videoStatus: normalizeSceneStatus(data?.status),
        videoFailure: undefined,
        recommendedDuration: prompt.duration ?? nextScenes[sceneIndex].recommendedDuration,
      };
      submittedCount += 1;
    } catch (error) {
      const sceneIndex = nextScenes.findIndex((item) => item.id === scene.id);
      if (sceneIndex >= 0) {
        nextScenes[sceneIndex] = {
          ...nextScenes[sceneIndex],
          videoStatus: "failed",
          videoFailure: {
            message: summarizeVideoGenerationError(error),
            provider: transport.provider,
            stage: "submit",
            updatedAt: new Date().toISOString(),
          },
        };
      }
      failedScenes.push(scene.sceneName);
    }
  }

  const summary = [
    submittedCount
      ? `已提交 ${submittedCount} 条镜头出片任务，当前优先走 ${transport.providerLabel}。`
      : "当前没有镜头成功提交出片任务。",
    failedScenes.length ? `提交失败：${failedScenes.slice(0, 3).join("、")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return saveVideoProject(
    {
      ...project,
      scenes: nextScenes,
      currentStep: Math.max(project.currentStep || 1, 5),
      analysisSummary: submittedCount
        ? `已发起 ${submittedCount} 条镜头出片任务，可继续在首页轮询结果并进入审阅。`
        : "当前没有成功提交新的出片任务，建议检查镜头素材和提示词。",
    },
    summary,
  );
}

export async function refreshVideoAssetsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );

  const targetIds = collectTargetIds(input);
  const candidates = project.scenes.filter((scene) => {
    if (!scene.videoTaskId?.trim()) return false;
    if (targetIds.length) return sceneTargetMatches(scene, project.id, targetIds);
    return ["queued", "processing"].includes(normalizeSceneStatus(scene.videoStatus));
  });

  if (!candidates.length) {
    throw new Error("当前没有可轮询的出片任务。");
  }

  const nextScenes = [...project.scenes];
  let completedCount = 0;
  let processingCount = 0;
  let failedCount = 0;

  for (const scene of candidates) {
    const { data, error } = await invokeFunction<VideoGenerationStatusResult>("generate-video", {
      action: "status",
      taskId: scene.videoTaskId,
      provider: scene.videoProvider,
    });

    if (error) {
      const sceneIndex = nextScenes.findIndex((item) => item.id === scene.id);
      if (sceneIndex >= 0) {
        nextScenes[sceneIndex] = {
          ...nextScenes[sceneIndex],
          videoStatus: "failed",
          videoFailure: {
            message: summarizeVideoGenerationError(error),
            provider: scene.videoProvider,
            stage: "status",
            updatedAt: new Date().toISOString(),
          },
        };
      }
      failedCount += 1;
      continue;
    }

    const sceneIndex = nextScenes.findIndex((item) => item.id === scene.id);
    if (sceneIndex < 0) continue;

    const normalizedStatus = normalizeSceneStatus(data?.status || data?.state) || "processing";
    if (normalizedStatus === "completed" && data?.video_url) {
      nextScenes[sceneIndex] = {
        ...nextScenes[sceneIndex],
        videoHistory: appendVideoHistory(nextScenes[sceneIndex], data.video_url),
        videoUrl: data.video_url,
        videoStatus: "completed",
        videoFailure: undefined,
      };
      completedCount += 1;
      continue;
    }

    if (normalizedStatus === "failed") {
      nextScenes[sceneIndex] = {
        ...nextScenes[sceneIndex],
        videoStatus: "failed",
        videoFailure: {
          message: "轮询结果显示当前镜头生成失败，建议直接重做或调整提示词后补发。",
          provider: scene.videoProvider,
          stage: "status",
          updatedAt: new Date().toISOString(),
        },
      };
      failedCount += 1;
      continue;
    }

    nextScenes[sceneIndex] = {
      ...nextScenes[sceneIndex],
      videoStatus: normalizedStatus,
      videoFailure: undefined,
    };
    processingCount += 1;
  }

  const summary = [
    completedCount ? `已完成 ${completedCount} 条镜头出片。` : "",
    processingCount ? `仍有 ${processingCount} 条镜头在后台处理中。` : "",
    failedCount ? `${failedCount} 条镜头出片失败，建议直接发起重做。` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return saveVideoProject(
    {
      ...project,
      scenes: nextScenes,
      currentStep: Math.max(project.currentStep || 1, 5),
      analysisSummary: completedCount
        ? `已回收 ${completedCount} 条镜头结果，可继续审阅或重做。`
        : processingCount
          ? `当前仍有 ${processingCount} 条镜头在出片中，稍后可继续轮询。`
          : "当前轮询已完成，可继续处理失败项或补发新镜头。",
    },
    summary || "已刷新当前出片任务状态。",
  );
}

function collectTargetIds(input: Record<string, unknown>): string[] {
  const list = Array.isArray(input.targetIds)
    ? input.targetIds.filter((item): item is string => typeof item === "string" && item.trim())
    : [];

  if (list.length > 0) return list;
  if (typeof input.targetId === "string" && input.targetId.trim()) {
    return [input.targetId.trim()];
  }
  return [];
}

export async function reviewVideoAssetsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const synced = synchronizeVideoProductionState(project);
  const reviewQueue = deriveVideoReviewQueue(synced);
  const pending = reviewQueue.filter(
    (item) => item.status === "pending" || item.status === "redo",
  );

  return saveVideoProject(
    {
      ...synced,
      reviewQueue,
      currentStep: Math.max(project.currentStep || 1, 5),
      analysisSummary: pending.length
        ? `已整理 ${pending.length} 条待审阅项，可直接在首页会话里决定通过或重做。`
        : "当前还没有待审阅项，下一轮生成素材后会自动进入审阅。",
    },
    pending.length
      ? `已整理 ${pending.length} 条待审阅项，首页会话可直接继续审阅。`
      : "当前还没有待审阅项。",
  );
}

export async function approveVideoAssetsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const targetIds = collectTargetIds(input);
  const now = new Date().toISOString();
  const synced = synchronizeVideoProductionState(project);
  const baseReviewQueue = deriveVideoReviewQueue(synced);

  const reviewQueue = baseReviewQueue.map((item) =>
    !targetIds.length || targetIds.some((targetId) => item.targetIds.includes(targetId) || item.id === targetId)
      ? { ...item, status: "approved" as const, updatedAt: now }
      : item,
  );
  const shotPackets = (synced.shotPackets || []).map((packet) =>
    !targetIds.length || targetIds.includes(packet.id)
      ? { ...packet, reviewStatus: "approved" as const }
      : packet,
  );
  const affectedCount = reviewQueue.filter((item) => item.updatedAt === now).length;

  return saveVideoProject(
    {
      ...synced,
      reviewQueue,
      shotPackets,
      currentStep: Math.max(project.currentStep || 1, 5),
      analysisSummary: affectedCount
        ? `已通过 ${affectedCount} 条审阅项，可继续推进剩余镜头。`
        : "已记录当前审阅通过状态。",
    },
    affectedCount ? `已通过 ${affectedCount} 条审阅项。` : "已记录当前审阅通过状态。",
  );
}

export async function redoVideoAssetsAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const targetIds = collectTargetIds(input);
  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim()
      : "需要根据审阅意见重做。";
  const now = new Date().toISOString();
  const synced = synchronizeVideoProductionState(project);
  const baseReviewQueue = deriveVideoReviewQueue(synced);

  const reviewQueue = baseReviewQueue.map((item) =>
    !targetIds.length || targetIds.some((targetId) => item.targetIds.includes(targetId) || item.id === targetId)
      ? { ...item, status: "redo" as const, reason, updatedAt: now }
      : item,
  );
  const shotPackets = (synced.shotPackets || []).map((packet) =>
    !targetIds.length || targetIds.includes(packet.id)
      ? { ...packet, reviewStatus: "redo" as const }
      : packet,
  );
  const affectedCount = reviewQueue.filter((item) => item.updatedAt === now).length;

  return saveVideoProject(
    {
      ...synced,
      reviewQueue,
      shotPackets,
      currentStep: Math.max(project.currentStep || 1, 5),
      analysisSummary: affectedCount
        ? `已将 ${affectedCount} 条审阅项标记为重做，原因：${reason}`
        : `已记录重做原因：${reason}`,
    },
    affectedCount
      ? `已将 ${affectedCount} 条审阅项标记为重做。`
      : `已记录重做原因：${reason}`,
  );
}

export async function continueVideoStepAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const derivedStep =
    typeof input.targetStep === "number"
      ? Math.min(Math.max(input.targetStep, 1), 5)
      : project.reviewQueue?.some((item) => item.status === "pending" || item.status === "redo")
        ? 5
        : project.videoPromptBatch?.trim()
        ? 4
        : project.shotPackets?.length
          ? 4
        : project.storyboardPlan?.trim()
          ? 3
          : project.characters.length || project.sceneSettings.length
            ? 2
            : project.scenes.length
              ? 1
              : 1;

  const stageLabels: Record<number, string> = {
    1: "脚本拆解",
    2: "角色与场景",
    3: "分镜批次",
    4: "镜头指令包 / 视频提示词",
    5: "预览与导出",
  };

  return saveVideoProject(
    {
      ...project,
      currentStep: derivedStep,
      analysisSummary:
        project.analysisSummary ||
        `已把视频项目收口到「${stageLabels[derivedStep]}」阶段，可直接继续推进。`,
    },
    `已将《${project.title}》定位到「${stageLabels[derivedStep]}」阶段。`,
  );
}

async function runVideoContinuationPlan(
  plan: VideoWorkflowContinuationPlan,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  switch (plan.actionKind) {
    case "analyze_script_for_video":
      return analyzeScriptForVideoAction(plan.input, runtime);
    case "extract_video_entities":
      return extractVideoEntitiesAction(plan.input, runtime);
    case "prepare_storyboard_batch":
      return prepareStoryboardBatchAction(plan.input, runtime);
    case "compile_video_shot_packets":
      return compileVideoShotPacketsAction(plan.input, runtime);
    case "prepare_video_prompt_batch":
      return prepareVideoPromptBatchAction(plan.input, runtime);
    case "generate_video_assets":
      return generateVideoAssetsAction(plan.input, runtime);
    case "refresh_video_assets":
      return refreshVideoAssetsAction(plan.input, runtime);
    case "review_video_assets":
      return reviewVideoAssetsAction(plan.input, runtime);
    case "create_video_bridge_artifact":
      return createVideoBridgeArtifactAction(plan.input, runtime);
    default:
      throw new Error(`Unsupported video continuation action: ${plan.actionKind}`);
  }
}

function buildRoundStepLabel(plan: VideoWorkflowContinuationPlan): string {
  const labels: Record<VideoWorkflowContinuationPlan["policy"], string> = {
    "bootstrap-analysis": "完成脚本拆镜",
    "bootstrap-entities": "整理角色与场景",
    "bootstrap-storyboard": "补齐分镜批次",
    "bootstrap-shot-packets": "编译镜头指令包",
    "bootstrap-prompt-batch": "生成视频提示词批次",
    "refresh-running": "刷新进行中镜头",
    "review-ready": "整理待审阅项",
    "repair-failed": "补发失败镜头",
    "generate-next-batch": "提交下一批镜头出片",
    "bridge-summary": "整理桥接摘要",
  };

  return labels[plan.policy];
}

export async function advanceVideoWorkflowAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const prepared = await prepareVideoGenerationAction(input, runtime);
  const preparedProject = prepared.data?.videoProject;
  if (!preparedProject) {
    return prepared;
  }

  const preparedRuntime = withVideoProject(runtime, preparedProject);
  const contextSummary = buildVideoContextSummary(preparedProject);

  if (!preparedProject.script?.trim()) {
    return {
      ...prepared,
      summary: [
        prepared.summary,
        contextSummary ? `已记录当前视频意图：\n${contextSummary}` : null,
        "接下来只要把脚本、分集正文或现有项目内容发给我，我就会继续拆镜和出片准备。",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  const plan = planVideoWorkflowContinuation(preparedProject, input);
  const result = await runVideoContinuationPlan(
    plan,
    withVideoProject(preparedRuntime, preparedProject),
  );
  const batchHint = buildVideoContinuationBatchHint(plan);

  return {
    ...result,
    summary: [plan.reason, result.summary, batchHint].filter(Boolean).join("\n\n"),
  };
}

export async function advanceVideoWorkflowRoundAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const prepared = await prepareVideoGenerationAction(input, runtime);
  const preparedProject = prepared.data?.videoProject;
  if (!preparedProject) {
    return prepared;
  }

  if (!preparedProject.script?.trim()) {
    return advanceVideoWorkflowAction(input, runtime);
  }

  let workingRuntime = withVideoProject(runtime, preparedProject);
  let latestResult: WorkflowActionResult = prepared;
  const executedPlans: VideoWorkflowContinuationPlan[] = [];
  const maxSteps =
    typeof input.maxSteps === "number" && Number.isFinite(input.maxSteps)
      ? Math.max(1, Math.min(8, Math.floor(input.maxSteps)))
      : 6;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const currentProject = workingRuntime.currentVideoProject;
    if (!currentProject?.script?.trim()) break;

    const plan = planVideoWorkflowContinuation(currentProject, input);
    executedPlans.push(plan);
    latestResult = await runVideoContinuationPlan(plan, workingRuntime);

    const nextProject = latestResult.data?.videoProject ?? workingRuntime.currentVideoProject;
    if (nextProject) {
      workingRuntime = withVideoProject(
        {
          ...workingRuntime,
          currentVideoProject: nextProject,
          currentProjectSnapshot: latestResult.data?.projectSnapshot ?? createVideoSnapshot(nextProject),
        },
        nextProject,
      );
    } else if (latestResult.data?.projectSnapshot) {
      workingRuntime = {
        ...workingRuntime,
        currentProjectSnapshot: latestResult.data.projectSnapshot,
      };
    }

    if (VIDEO_ROUND_TERMINAL_POLICIES.has(plan.policy)) {
      break;
    }
  }

  const roundSummary = executedPlans.length
    ? `本轮连续推进了 ${executedPlans.length} 步：${executedPlans.map(buildRoundStepLabel).join(" -> ")}。`
    : "";
  const finalPlan = executedPlans.at(-1);
  const batchHint = finalPlan ? buildVideoContinuationBatchHint(finalPlan) : "";

  return {
    ...latestResult,
    summary: [roundSummary, latestResult.summary, batchHint].filter(Boolean).join("\n\n"),
  };
}

export async function createVideoBridgeArtifactAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = mergeVideoInputContext(
    await ensureVideoProject(runtime, input),
    runtime,
    input,
  );
  const script = resolveWorkingScript(runtime, project, input);
  const bridge = [
    `项目：${buildVideoTitle(runtime, input)}`,
    `脚本长度：${script.length} 字`,
    `镜头数：${project.scenes.length}`,
    `角色数：${project.characters.length}`,
    `场景数：${project.sceneSettings.length}`,
    `当前阶段：${project.currentStep}`,
    "",
    project.analysisSummary || "视频工作流已接管，等待进一步分析。",
  ].join("\n");

  return saveVideoProject(
    {
      ...project,
      analysisSummary: bridge,
      currentStep: Math.max(project.currentStep || 1, 1),
    },
    `已为《${project.title}》整理视频桥接摘要。`,
  );
}
