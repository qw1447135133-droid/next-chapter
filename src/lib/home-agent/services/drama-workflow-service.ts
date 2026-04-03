import {
  buildCharacterTransformPrompt,
  buildCharactersPrompt,
  buildCompliancePrompt,
  buildCreativePlanPrompt,
  buildDirectoryPrompt,
  buildEpisodePrompt,
  buildExportPrompt,
  buildOutlinePrompt,
  buildStructureTransformPrompt,
} from "@/lib/drama-prompts";
import { callGeminiStream } from "@/lib/gemini-client";
import { readStoredDecomposeModel } from "@/lib/gemini-text-models";
import {
  createEmptyDramaProject,
  type DramaProject,
  type DramaSetup,
  type EpisodeEntry,
  type EpisodeScript,
} from "@/types/drama";
import {
  createDramaSnapshot,
  upsertStoredDramaProject,
} from "@/lib/home-agent/project-store";
import type {
  StudioRuntimeState,
  WorkflowActionResult,
} from "@/lib/home-agent/types";

export interface DramaWorkflowContinuationPlan {
  actionKind:
    | "save_setup"
    | "analyze_reference_script"
    | "generate_creative_plan"
    | "generate_structure_transform"
    | "generate_characters"
    | "generate_character_transform"
    | "generate_directory"
    | "generate_outlines"
    | "generate_episode"
    | "run_compliance_review"
    | "export_project";
  input: Record<string, unknown>;
  reason: string;
}

export function extractDramaTitle(plan: string): string {
  const markdownHeading = plan.match(/^#\s+(.+)$/m);
  if (markdownHeading) return markdownHeading[1].trim();
  const quoted = plan.match(/[《「“](.+?)[》」”]/);
  if (quoted) return quoted[1].trim();
  const firstLine = plan
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 32) : "";
}

export function ensureDramaProject(
  runtime: StudioRuntimeState,
  mode: DramaProject["mode"] = "traditional",
): DramaProject {
  if (runtime.currentDramaProject) {
    return { ...runtime.currentDramaProject };
  }
  return { ...createEmptyDramaProject(mode), mode };
}

export function buildDramaSetup(
  input: Record<string, unknown>,
  existing: DramaSetup | null,
): DramaSetup {
  return {
    genres: Array.isArray(input.genres)
      ? input.genres.filter((item): item is string => typeof item === "string")
      : existing?.genres ?? [],
    audience:
      typeof input.audience === "string" ? input.audience : existing?.audience ?? "全龄",
    tone: typeof input.tone === "string" ? input.tone : existing?.tone ?? "燃",
    ending:
      typeof input.ending === "string" ? input.ending : existing?.ending ?? "OE",
    totalEpisodes:
      typeof input.totalEpisodes === "number"
        ? input.totalEpisodes
        : existing?.totalEpisodes ?? 60,
    targetMarket:
      typeof input.targetMarket === "string"
        ? input.targetMarket
        : existing?.targetMarket ?? "cn",
    customTopic:
      typeof input.customTopic === "string" ? input.customTopic : existing?.customTopic,
    setupMode:
      input.setupMode === "creative" || input.setupMode === "topic"
        ? input.setupMode
        : existing?.setupMode,
    creativeInput:
      typeof input.creativeInput === "string"
        ? input.creativeInput
        : existing?.creativeInput,
  };
}

const DRAMA_SETUP_INPUT_KEYS = [
  "title",
  "genres",
  "audience",
  "tone",
  "ending",
  "totalEpisodes",
  "targetMarket",
  "customTopic",
  "setupMode",
  "creativeInput",
  "referenceScript",
] as const;

function resolveDramaMode(
  runtime: StudioRuntimeState,
  input: Record<string, unknown>,
): DramaProject["mode"] {
  if (input.projectKind === "adaptation") return "adaptation";
  if (runtime.currentDramaProject?.mode === "adaptation") return "adaptation";
  if (runtime.currentProjectSnapshot?.projectKind === "adaptation") return "adaptation";
  return "traditional";
}

function buildPlanningDramaProject(
  runtime: StudioRuntimeState,
  input: Record<string, unknown>,
): DramaProject {
  const mode = resolveDramaMode(runtime, input);
  const project = ensureDramaProject(runtime, mode);

  return {
    ...project,
    mode,
    setup: buildDramaSetup(input, project.setup),
    dramaTitle:
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : project.dramaTitle,
    referenceScript:
      typeof input.referenceScript === "string"
        ? input.referenceScript
        : project.referenceScript,
    referenceStructure:
      typeof input.referenceStructure === "string"
        ? input.referenceStructure
        : project.referenceStructure,
    frameworkStyle:
      typeof input.frameworkStyle === "string"
        ? input.frameworkStyle
        : project.frameworkStyle,
    creativePlan:
      typeof input.creativePlan === "string" ? input.creativePlan : project.creativePlan,
    characters:
      typeof input.characters === "string" ? input.characters : project.characters,
    structureTransform:
      typeof input.structureTransform === "string"
        ? input.structureTransform
        : project.structureTransform,
  };
}

function findMissingOutlineRange(project: DramaProject): {
  rangeStart: number;
  rangeEnd: number;
} | null {
  const missingEntries = project.directory.filter((entry) => !entry.outline?.trim());
  if (missingEntries.length === 0) return null;

  const rangeStart = missingEntries[0]?.number ?? 1;
  const lastMissing = missingEntries.at(-1)?.number ?? rangeStart;
  return {
    rangeStart,
    rangeEnd: Math.min(rangeStart + 4, lastMissing),
  };
}

function findNextEpisodeNumber(project: DramaProject): number | null {
  const existingEpisodes = new Set(project.episodes.map((episode) => episode.number));
  const nextDirectoryEntry = project.directory.find((entry) => !existingEpisodes.has(entry.number));
  return nextDirectoryEntry?.number ?? null;
}

function hasDramaSetupInput(input: Record<string, unknown>): boolean {
  return DRAMA_SETUP_INPUT_KEYS.some((key) => key in input);
}

function withDramaProject(
  runtime: StudioRuntimeState,
  project: DramaProject,
): StudioRuntimeState {
  return {
    ...runtime,
    currentDramaProject: project,
    currentProjectSnapshot: createDramaSnapshot(project),
  };
}

export function planDramaWorkflowContinuation(
  project: DramaProject,
  input: Record<string, unknown> = {},
): DramaWorkflowContinuationPlan {
  const baseInput: Record<string, unknown> = {
    ...input,
    projectKind: project.mode === "adaptation" ? "adaptation" : "script",
  };

  if (!project.setup) {
    return {
      actionKind: "save_setup",
      input: baseInput,
      reason: "先把当前首页会话里的立项信息写入项目，再继续推进后续创作。",
    };
  }

  if (project.mode === "adaptation") {
    if (!project.referenceScript?.trim()) {
      throw new Error("改编流程还缺少参考文本，先把参考剧本贴给我，我就继续分析和转译。");
    }

    if (!project.referenceStructure?.trim()) {
      return {
        actionKind: "analyze_reference_script",
        input: baseInput,
        reason: "先分析参考文本的结构和冲突骨架，后面才能继续做改编转译。",
      };
    }

    if (!project.structureTransform?.trim()) {
      return {
        actionKind: "generate_structure_transform",
        input: baseInput,
        reason: "参考结构已经拿到，下一步直接生成适配目标市场的新结构方案。",
      };
    }

    if (!project.characterTransform?.trim() || !project.characters?.trim()) {
      return {
        actionKind: "generate_character_transform",
        input: baseInput,
        reason: "结构转译完成后，继续补齐角色改编方案和人物设定。",
      };
    }
  } else {
    if (!project.creativePlan?.trim()) {
      return {
        actionKind: "generate_creative_plan",
        input: baseInput,
        reason: "立项信息已经足够，先生成创作方案，后续目录和分集都会基于它推进。",
      };
    }

    if (!project.characters?.trim()) {
      return {
        actionKind: "generate_characters",
        input: baseInput,
        reason: "创作方案已完成，下一步补齐角色设定，避免后续目录和单集失焦。",
      };
    }
  }

  if (!project.directory.length || !project.directoryRaw?.trim()) {
    return {
      actionKind: "generate_directory",
      input: baseInput,
      reason: "核心世界观和人物已经就位，继续生成完整的分集目录。",
    };
  }

  const missingOutlineRange = findMissingOutlineRange(project);
  if (missingOutlineRange) {
    return {
      actionKind: "generate_outlines",
      input: {
        ...baseInput,
        ...missingOutlineRange,
      },
      reason: "分集目录已经成型，先把下一批缺失的单集细纲补齐。",
    };
  }

  const episodeNumber = findNextEpisodeNumber(project);
  if (episodeNumber) {
    return {
      actionKind: "generate_episode",
      input: {
        ...baseInput,
        episodeNumber,
      },
      reason: `细纲已经具备，继续生成第 ${episodeNumber} 集正文。`,
    };
  }

  if (!project.complianceReport?.trim()) {
    return {
      actionKind: "run_compliance_review",
      input: baseInput,
      reason: "正文已具备，下一步做合规审核，帮助首页会话继续安全出片。",
    };
  }

  if (!project.exportDocument?.trim()) {
    return {
      actionKind: "export_project",
      input: baseInput,
      reason: "核心产物已经齐了，继续整理导出文档，方便后续交付和出片。",
    };
  }

  return {
    actionKind: "export_project",
    input: baseInput,
    reason: "当前项目主链路已经完成，我先刷新一版导出文档供你继续润色或衔接视频制作。",
  };
}

async function runDramaContinuationPlan(
  plan: DramaWorkflowContinuationPlan,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  switch (plan.actionKind) {
    case "save_setup":
      return saveDramaSetupAction(plan.input, runtime);
    case "analyze_reference_script":
      return analyzeReferenceScriptAction(plan.input, runtime);
    case "generate_creative_plan":
      return generateCreativePlanAction(plan.input, runtime);
    case "generate_structure_transform":
      return generateStructureTransformAction(plan.input, runtime);
    case "generate_characters":
      return generateCharactersAction(plan.input, runtime);
    case "generate_character_transform":
      return generateCharacterTransformAction(plan.input, runtime);
    case "generate_directory":
      return generateDirectoryAction(plan.input, runtime);
    case "generate_outlines":
      return generateOutlinesAction(plan.input, runtime);
    case "generate_episode":
      return generateEpisodeAction(plan.input, runtime);
    case "run_compliance_review":
      return runComplianceReviewAction(plan.input, runtime);
    case "export_project":
      return exportDramaProjectAction(plan.input, runtime);
    default:
      throw new Error(`Unsupported drama continuation action: ${plan.actionKind}`);
  }
}

export async function continueDramaStepAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  let effectiveRuntime = runtime;
  let planningProject = buildPlanningDramaProject(runtime, input);
  let setupResult: WorkflowActionResult | null = null;

  if (!runtime.currentDramaProject || !runtime.currentDramaProject.setup || hasDramaSetupInput(input)) {
    setupResult = await saveDramaSetupAction(
      {
        ...input,
        projectKind: planningProject.mode === "adaptation" ? "adaptation" : "script",
      },
      runtime,
    );

    const savedProject = setupResult.data?.dramaProject;
    if (!savedProject) {
      return setupResult;
    }

    effectiveRuntime = withDramaProject(runtime, savedProject);
    planningProject = buildPlanningDramaProject(effectiveRuntime, input);

    if (planningProject.mode === "adaptation" && !planningProject.referenceScript?.trim()) {
      return {
        ...setupResult,
        summary: "已收下当前改编立项信息。接下来把参考剧本贴给我，我会在同一首页会话里继续做结构分析和改编。",
      };
    }
  }

  const plan = planDramaWorkflowContinuation(planningProject, input);
  if (plan.actionKind === "save_setup") {
    return setupResult ?? saveDramaSetupAction(plan.input, effectiveRuntime);
  }

  const result = await runDramaContinuationPlan(
    plan,
    withDramaProject(effectiveRuntime, planningProject),
  );

  return {
    ...result,
    summary: `${plan.reason}\n\n${result.summary}`,
  };
}

function parseDirectory(raw: string): EpisodeEntry[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      let match = line.match(/^第?\s*(\d+)\s*[集话：:]\s*(.+?)(?:\s*[-—–|]\s*)(.+)$/);
      if (!match) {
        match = line.match(/^(\d+)[\.\)、]\s*(.+?)(?:\s*[-—–|]\s*)(.+)$/);
      }
      if (!match) return [];
      const number = Number(match[1]);
      const title = match[2].trim();
      const rest = match[3];
      const hookMatch = rest.match(/\[([^\]]+)\]/);
      const emotionMatch = rest.match(/情绪[:：]?\s*(\d)/i);
      return [
        {
          number,
          title,
          summary: rest.replace(/\[[^\]]+\]/g, "").trim(),
          hookType: hookMatch?.[1] ?? "悬念钩子",
          isKey: /关键|重点/.test(line),
          isClimax: /高潮/.test(line),
          isPaywall: /付费|卡点/.test(line),
          emotionLevel: emotionMatch ? Number(emotionMatch[1]) : undefined,
        },
      ];
    });
}

function parseOutlines(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const blocks = text.split(/【第(\d+)集细纲】/);
  for (let index = 1; index < blocks.length; index += 2) {
    const episodeNumber = Number(blocks[index]);
    const outline = (blocks[index + 1] ?? "")
      .replace(/^[^\n]*\n/, "")
      .replace(/---\s*$/, "")
      .trim();
    if (episodeNumber && outline) {
      map.set(episodeNumber, outline);
    }
  }
  return map;
}

async function generateDramaText(
  prompt: string,
  abortSignal?: AbortSignal,
  maxOutputTokens = 8192,
): Promise<string> {
  const model = readStoredDecomposeModel();
  return callGeminiStream(
    model,
    [{ role: "user", parts: [{ text: prompt }] }],
    () => {},
    { maxOutputTokens },
    abortSignal,
  );
}

function buildPreviousEpisodesText(
  episodes: EpisodeScript[],
  episodeNumber: number,
): string {
  return episodes
    .filter((episode) => episode.number < episodeNumber)
    .sort((a, b) => a.number - b.number)
    .slice(-2)
    .map((episode) => `第${episode.number}集 ${episode.title}\n${episode.content}`)
    .join("\n\n---\n\n");
}

function buildNextEpisodesText(
  directory: EpisodeEntry[],
  episodeNumber: number,
): string {
  return directory
    .filter((entry) => entry.number > episodeNumber)
    .slice(0, 2)
    .map((entry) => `第${entry.number}集 ${entry.title}\n${entry.summary}`)
    .join("\n\n");
}

function saveDramaProject(project: DramaProject): WorkflowActionResult {
  const saved = upsertStoredDramaProject(project);
  const snapshot = createDramaSnapshot(saved);
  return {
    summary: `已更新项目《${saved.dramaTitle || "未命名项目"}》。`,
    projectSnapshot: snapshot,
    data: {
      dramaProject: saved,
      projectSnapshot: snapshot,
    },
  };
}

export async function saveDramaSetupAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    input.projectKind === "adaptation"
      ? "adaptation"
      : runtime.currentProjectSnapshot?.projectKind === "adaptation"
        ? "adaptation"
        : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const title = typeof input.title === "string" ? input.title : project.dramaTitle;
  const referenceScript =
    typeof input.referenceScript === "string"
      ? input.referenceScript
      : project.referenceScript;
  return saveDramaProject({
    ...project,
    mode,
    setup,
    dramaTitle: title,
    referenceScript,
    currentStep:
      mode === "adaptation"
        ? referenceScript?.trim()
          ? "structure-transform"
          : "reference-script"
        : "creative-plan",
  });
}

export async function analyzeReferenceScriptAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = ensureDramaProject(runtime, "adaptation");
  const setup = buildDramaSetup(input, project.setup);
  const referenceScript =
    typeof input.referenceScript === "string"
      ? input.referenceScript
      : project.referenceScript ?? "";
  const prompt = [
    "你是短剧改编分析师。",
    "请基于下面的参考文本输出一份适合后续改编的结构分析。",
    "输出结构：",
    "1. 故事主线概括",
    "2. 关键情节点列表",
    "3. 角色关系拓扑",
    "4. 核心反转与高潮",
    "5. 适合继续改编的注意事项",
    "",
    `目标市场：${setup.targetMarket}`,
    "",
    referenceScript,
  ].join("\n");
  const referenceStructure = await generateDramaText(prompt, undefined, 6144);
  return saveDramaProject({
    ...project,
    mode: "adaptation",
    setup,
    referenceScript,
    referenceStructure,
    currentStep: "structure-transform",
  });
}

export async function generateCreativePlanAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = ensureDramaProject(runtime, "traditional");
  const setup = buildDramaSetup(input, project.setup);
  const creativePlan = await generateDramaText(buildCreativePlanPrompt(setup));
  return saveDramaProject({
    ...project,
    mode: "traditional",
    setup,
    creativePlan,
    dramaTitle:
      typeof input.title === "string"
        ? input.title
        : extractDramaTitle(creativePlan) || project.dramaTitle,
    currentStep: "characters",
  });
}

export async function generateStructureTransformAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = ensureDramaProject(runtime, "adaptation");
  const setup = buildDramaSetup(input, project.setup);
  const referenceScript =
    typeof input.referenceScript === "string"
      ? input.referenceScript
      : project.referenceScript ?? "";
  const frameworkStyle =
    typeof input.frameworkStyle === "string"
      ? input.frameworkStyle
      : project.frameworkStyle ?? "";
  const transformed = await generateDramaText(
    buildStructureTransformPrompt(
      setup,
      referenceScript,
      frameworkStyle,
      typeof input.targetMarket === "string" ? input.targetMarket : undefined,
    ),
  );
  return saveDramaProject({
    ...project,
    mode: "adaptation",
    setup,
    referenceScript,
    frameworkStyle,
    structureTransform: transformed,
    creativePlan: transformed,
    dramaTitle: extractDramaTitle(transformed) || project.dramaTitle,
    currentStep: "character-transform",
  });
}

export async function generateCharactersAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const creativePlan =
    typeof input.creativePlan === "string"
      ? input.creativePlan
      : project.creativePlan || project.structureTransform;
  const characters = await generateDramaText(
    buildCharactersPrompt(setup, creativePlan),
  );
  return saveDramaProject({
    ...project,
    setup,
    creativePlan,
    characters,
    currentStep: "directory",
  });
}

export async function generateCharacterTransformAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = ensureDramaProject(runtime, "adaptation");
  const setup = buildDramaSetup(input, project.setup);
  const referenceScript =
    typeof input.referenceScript === "string"
      ? input.referenceScript
      : project.referenceScript ?? "";
  const frameworkStyle =
    typeof input.frameworkStyle === "string"
      ? input.frameworkStyle
      : project.frameworkStyle ?? "";
  const structureTransform =
    typeof input.structureTransform === "string"
      ? input.structureTransform
      : project.structureTransform ?? "";
  const characters = await generateDramaText(
    buildCharacterTransformPrompt(
      setup,
      referenceScript,
      frameworkStyle,
      structureTransform,
    ),
  );
  return saveDramaProject({
    ...project,
    setup,
    referenceScript,
    frameworkStyle,
    structureTransform,
    characterTransform: characters,
    characters,
    currentStep: "directory",
  });
}

export async function generateDirectoryAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const creativePlan =
    typeof input.creativePlan === "string"
      ? input.creativePlan
      : project.creativePlan || project.structureTransform;
  const characters =
    typeof input.characters === "string" ? input.characters : project.characters;
  const directoryRaw = await generateDramaText(
    buildDirectoryPrompt(setup, creativePlan, characters),
  );
  return saveDramaProject({
    ...project,
    setup,
    creativePlan,
    characters,
    directoryRaw,
    directory: parseDirectory(directoryRaw),
    currentStep: "outlines",
  });
}

export async function generateOutlinesAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const creativePlan =
    typeof input.creativePlan === "string"
      ? input.creativePlan
      : project.creativePlan || project.structureTransform;
  const characters =
    typeof input.characters === "string" ? input.characters : project.characters;
  const rangeStart =
    typeof input.rangeStart === "number"
      ? input.rangeStart
      : project.directory[0]?.number ?? 1;
  const rangeEnd =
    typeof input.rangeEnd === "number"
      ? input.rangeEnd
      : Math.min(rangeStart + 4, project.directory.at(-1)?.number ?? rangeStart);
  const targetEpisodes = project.directory.filter(
    (entry) => entry.number >= rangeStart && entry.number <= rangeEnd,
  );
  const outlineText = await generateDramaText(
    buildOutlinePrompt(
      setup,
      creativePlan,
      characters,
      targetEpisodes.map((entry) => ({
        number: entry.number,
        title: entry.title,
        summary: entry.summary,
        hookType: entry.hookType,
      })),
      project.directoryRaw,
    ),
  );
  const outlineMap = parseOutlines(outlineText);
  return saveDramaProject({
    ...project,
    setup,
    creativePlan,
    characters,
    directory: project.directory.map((entry) =>
      outlineMap.has(entry.number)
        ? { ...entry, outline: outlineMap.get(entry.number) }
        : entry,
    ),
    currentStep: "episodes",
  });
}

export async function generateEpisodeAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const episodeNumber =
    typeof input.episodeNumber === "number"
      ? input.episodeNumber
      : project.directory.find(
          (entry) =>
            !project.episodes.some((episode) => episode.number === entry.number),
        )?.number ?? 1;
  const content = await generateDramaText(
    buildEpisodePrompt(
      setup,
      project.characters,
      project.directory,
      episodeNumber,
      buildPreviousEpisodesText(project.episodes, episodeNumber),
      buildNextEpisodesText(project.directory, episodeNumber),
      typeof input.customInstruction === "string"
        ? input.customInstruction
        : undefined,
      typeof input.durationSeconds === "number"
        ? input.durationSeconds
        : undefined,
    ),
    undefined,
    12288,
  );
  const entry = project.directory.find((item) => item.number === episodeNumber);
  const nextEpisode: EpisodeScript = {
    number: episodeNumber,
    title: entry?.title || `第${episodeNumber}集`,
    content,
    wordCount: content.length,
  };
  const episodes = [
    ...project.episodes.filter((episode) => episode.number !== episodeNumber),
    nextEpisode,
  ].sort((a, b) => a.number - b.number);
  return saveDramaProject({
    ...project,
    setup,
    episodes,
    currentStep: "episodes",
  });
}

export async function runComplianceReviewAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const creativePlan =
    typeof input.creativePlan === "string"
      ? input.creativePlan
      : project.creativePlan || project.structureTransform;
  const complianceReport = await generateDramaText(
    buildCompliancePrompt(
      setup,
      creativePlan,
      project.characters,
      project.episodes,
      "text",
    ),
  );
  return saveDramaProject({
    ...project,
    setup,
    creativePlan,
    complianceReport,
    currentStep: "export",
  });
}

export async function exportDramaProjectAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const mode =
    runtime.currentProjectSnapshot?.projectKind === "adaptation"
      ? "adaptation"
      : "traditional";
  const project = ensureDramaProject(runtime, mode);
  const setup = buildDramaSetup(input, project.setup);
  const exportText = await generateDramaText(
    buildExportPrompt(
      setup,
      project.dramaTitle,
      project.creativePlan || project.structureTransform || "",
      project.characters,
      project.episodes,
    ),
    undefined,
    16384,
  );
  return saveDramaProject({
    ...project,
    setup,
    exportDocument: exportText,
    currentStep: "export",
  });
}
