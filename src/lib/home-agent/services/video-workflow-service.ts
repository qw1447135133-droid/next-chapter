import {
  createStoredVideoProject,
  loadStoredVideoProjectById,
  type PersistedVideoProject,
  upsertStoredVideoProject,
} from "@/hooks/use-local-persistence";
import { invokeFunction } from "@/lib/invoke-with-key";
import { createVideoSnapshot } from "@/lib/home-agent/project-store";
import type { WorkflowActionResult, StudioRuntimeState } from "@/lib/home-agent/types";
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

export interface VideoWorkflowContinuationPlan {
  actionKind:
    | "analyze_script_for_video"
    | "extract_video_entities"
    | "prepare_storyboard_batch"
    | "prepare_video_prompt_batch"
    | "create_video_bridge_artifact";
  input: Record<string, unknown>;
  reason: string;
}

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
      input,
      reason: "先把当前脚本拆成镜头，首页会话才能继续推进视频生产。",
    };
  }

  if (!project.characters.length || !project.sceneSettings.length) {
    return {
      actionKind: "extract_video_entities",
      input,
      reason: "镜头已经拆完，下一步先整理角色和场景资产。",
    };
  }

  if (!project.storyboardPlan?.trim()) {
    return {
      actionKind: "prepare_storyboard_batch",
      input: { ...batchSceneRange(project.scenes, 6), ...input },
      reason: "角色与场景已就绪，先整理第一批分镜说明。",
    };
  }

  if (!project.videoPromptBatch?.trim()) {
    return {
      actionKind: "prepare_video_prompt_batch",
      input: { ...batchSceneRange(project.scenes, 4), ...input },
      reason: "分镜批次已经完成，下一步生成对应的视频提示词。",
    };
  }

  return {
    actionKind: "create_video_bridge_artifact",
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
  const saved = await upsertStoredVideoProject(project);
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
      : project.videoPromptBatch?.trim()
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
    4: "视频提示词",
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
    case "prepare_video_prompt_batch":
      return prepareVideoPromptBatchAction(plan.input, runtime);
    case "create_video_bridge_artifact":
      return createVideoBridgeArtifactAction(plan.input, runtime);
    default:
      throw new Error(`Unsupported video continuation action: ${plan.actionKind}`);
  }
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

  return {
    ...result,
    summary: `${plan.reason}\n\n${result.summary}`,
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
