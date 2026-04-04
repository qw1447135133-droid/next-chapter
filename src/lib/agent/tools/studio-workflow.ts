import { ToolBase, type CanUseToolFn, type ToolUseContext } from "../tool";
import type { AssistantMessage, ToolResult } from "../types";
import { runWorkflowAction } from "@/lib/home-agent/workflow-actions";
import type { ConversationProjectSnapshot, StudioRuntimeState } from "@/lib/home-agent/types";

type RuntimeDelta = NonNullable<Awaited<ReturnType<typeof runWorkflowAction>>["data"]>;
type WorkflowProgressStatus = "start" | "complete" | "error";

function buildWorkflowProgressLabel(actionName: string): string {
  const labels: Record<string, string> = {
    continue_project: "继续当前项目",
    continue_drama_step: "继续剧本创作",
    save_setup: "写入立项信息",
    analyze_reference_script: "分析参考内容",
    generate_creative_plan: "生成创意方案",
    generate_structure_transform: "生成结构转译",
    generate_characters: "生成角色设定",
    generate_character_transform: "生成角色转译方案",
    generate_directory: "生成分集目录",
    generate_outlines: "生成单集细纲",
    generate_episode: "生成分集正文",
    run_compliance_review: "执行合规审查",
    lock_character_cards: "锁定角色状态卡",
    lock_story_beats: "锁定剧情 beat",
    resolve_compliance_revisions: "标记修订已处理",
    reopen_compliance_revisions: "重新打开修订项",
    prepare_video_generation: "接管视频项目",
    advance_video_workflow: "继续视频工作流",
    advance_video_workflow_round: "连续推进视频一轮",
    analyze_script_for_video: "拆解视频脚本",
    extract_video_entities: "整理角色与场景",
    prepare_storyboard_batch: "整理分镜批次",
    compile_video_shot_packets: "编译镜头指令包",
    prepare_video_prompt_batch: "生成视频提示词批次",
    generate_video_assets: "提交视频出片",
    refresh_video_assets: "轮询视频结果",
    review_video_assets: "整理待审阅素材",
    approve_video_assets: "通过审阅项",
    redo_video_assets: "标记重做素材",
    continue_video_step: "定位视频阶段",
    create_video_bridge_artifact: "整理视频桥接摘要",
    export_project: "整理导出文档",
    create_skill_draft: "写入技能草案",
    export_approved_skill_drafts: "导出已批准技能候选",
    export_approved_skill_draft_bundle: "生成技能 Bundle 草案",
    export_approved_skill_install_candidates: "生成正式 Skill 安装候选",
    export_video_production_bundle: "导出视频生产状态包",
    preview_video_production_bundle: "预览视频生产状态摘要",
    open_video_production_bundle_directory: "打开视频生产状态目录",
    run_maintenance: "执行维护整理",
  };

  return labels[actionName] || actionName;
}

function emitWorkflowProgress(
  id: string,
  status: WorkflowProgressStatus,
  content: string,
  onProgress?: (data: unknown) => void,
) {
  const detail = { id, status, content };
  onProgress?.(detail);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("agent:workflow-progress", {
        detail,
      }),
    );
  }
}

function upsertRecentProject(
  recentProjects: ConversationProjectSnapshot[],
  snapshot: ConversationProjectSnapshot,
): ConversationProjectSnapshot[] {
  return [snapshot, ...recentProjects.filter((item) => item.projectId !== snapshot.projectId)].slice(0, 8);
}

function mergeRuntimeState(previous: StudioRuntimeState, delta?: RuntimeDelta): StudioRuntimeState {
  if (!delta) return previous;

  const nextProjectSnapshot = delta.projectSnapshot ?? previous.currentProjectSnapshot;
  const nextSkillDrafts = delta.skillDrafts ?? previous.skillDrafts;
  const nextReports = delta.maintenanceReports ?? previous.maintenanceReports;
  const nextRecentProjects = nextProjectSnapshot
    ? upsertRecentProject(previous.recentProjects, nextProjectSnapshot)
    : previous.recentProjects;

  return {
    ...previous,
    currentDramaProject: delta.dramaProject === undefined ? previous.currentDramaProject : delta.dramaProject,
    currentVideoProject: delta.videoProject === undefined ? previous.currentVideoProject : delta.videoProject,
    currentProjectSnapshot: nextProjectSnapshot,
    skillDrafts: nextSkillDrafts,
    maintenanceReports: nextReports,
    recentProjects: nextRecentProjects,
    recentMessageSummary:
      delta.recentMessageSummary === undefined ? previous.recentMessageSummary : delta.recentMessageSummary,
  };
}

export class StudioWorkflowTool extends ToolBase {
  readonly name = "HomeStudioWorkflow";
  readonly searchHint = "Operate the homepage-only creation workflow and project state";

  inputSchema() {
    return {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Workflow action: get_context, save_setup, continue_project, continue_drama_step, analyze_reference_script, generate_creative_plan, generate_structure_transform, generate_characters, generate_character_transform, generate_directory, generate_outlines, generate_episode, run_compliance_review, lock_character_cards, lock_story_beats, resolve_compliance_revisions, reopen_compliance_revisions, prepare_video_generation, advance_video_workflow, advance_video_workflow_round, analyze_script_for_video, extract_video_entities, prepare_storyboard_batch, compile_video_shot_packets, prepare_video_prompt_batch, generate_video_assets, refresh_video_assets, review_video_assets, approve_video_assets, redo_video_assets, continue_video_step, create_video_bridge_artifact, export_project, create_skill_draft, export_approved_skill_drafts, export_approved_skill_draft_bundle, export_approved_skill_install_candidates, export_video_production_bundle, preview_video_production_bundle, open_video_production_bundle_directory, run_maintenance",
        },
        projectKind: {
          type: "string",
          description: "script, adaptation, or video when relevant",
        },
        title: {
          type: "string",
          description: "Project title if known",
        },
        genres: {
          type: "array",
          items: { type: "string" },
          description: "Genre tags chosen for the project",
        },
        audience: {
          type: "string",
          description: "Audience label such as 女频, 男频, 全龄",
        },
        tone: {
          type: "string",
          description: "Tone label such as 甜, 虐, 爽, 燃",
        },
        ending: {
          type: "string",
          description: "HE, BE, or OE",
        },
        totalEpisodes: {
          type: "number",
          description: "Target episode count",
        },
        targetMarket: {
          type: "string",
          description: "cn, jp, west, kr, sea",
        },
        customTopic: {
          type: "string",
          description: "Extra user note about the topic",
        },
        setupMode: {
          type: "string",
          description: "creative or topic",
        },
        creativeInput: {
          type: "string",
          description: "Original free-form concept from the user",
        },
        referenceScript: {
          type: "string",
          description: "Reference script content for adaptation",
        },
        script: {
          type: "string",
          description: "Video script, episode text, or any source text to continue video production",
        },
        frameworkStyle: {
          type: "string",
          description: "Style mapping for adaptation structure",
        },
        creativePlan: {
          type: "string",
          description: "Creative plan content override when needed",
        },
        characters: {
          type: "string",
          description: "Character sheet override when needed",
        },
        structureTransform: {
          type: "string",
          description: "Structure transform override when needed",
        },
        rangeStart: {
          type: "number",
          description: "Start episode for outline generation",
        },
        rangeEnd: {
          type: "number",
          description: "End episode for outline generation",
        },
        episodeNumber: {
          type: "number",
          description: "Single episode number to generate",
        },
        durationSeconds: {
          type: "number",
          description: "Optional target duration for a single episode",
        },
        projectId: {
          type: "string",
          description: "Existing project id when resuming a saved video session",
        },
        model: {
          type: "string",
          description: "Optional model override for generation tools",
        },
        artStyle: {
          type: "string",
          description: "Video visual style such as live-action, anime-3d, retro-comic, or custom",
        },
        systemPrompt: {
          type: "string",
          description: "Optional system prompt override for decomposition or video generation helpers",
        },
        targetPlatform: {
          type: "string",
          description: "Primary target platform such as 抖音, TikTok, 小红书, B站, or multi-platform",
        },
        shotStyle: {
          type: "string",
          description: "Preferred shot language such as documentary, cinematic, ad-like, or hybrid",
        },
        outputGoal: {
          type: "string",
          description: "Desired output goal such as teaser, trailer, ads, or proof-of-concept",
        },
        productionNotes: {
          type: "string",
          description: "Extra production constraints or notes to keep with the video project",
        },
        videoPace: {
          type: "string",
          description: "slow, medium, or fast pacing for script decomposition",
        },
        segmentsPerEpisode: {
          type: "number",
          description: "Target segment count when decomposing script into shots",
        },
        sceneStart: {
          type: "number",
          description: "Start scene number for storyboard or prompt batch preparation",
        },
        sceneEnd: {
          type: "number",
          description: "End scene number for storyboard or prompt batch preparation",
        },
        batchSize: {
          type: "number",
          description: "How many scenes to submit in one homepage generation batch",
        },
        maxSteps: {
          type: "number",
          description: "Maximum steps to auto-run when using advance_video_workflow_round",
        },
        resolution: {
          type: "string",
          description: "Target video resolution, usually 720p or 1080p",
        },
        aspectRatio: {
          type: "string",
          description: "Target video aspect ratio such as 16:9, 9:16, or 1:1",
        },
        provider: {
          type: "string",
          description: "Optional provider override such as dreamina-cli, jimeng, or tuzi",
        },
        forceRegenerate: {
          type: "boolean",
          description: "When true, resubmit scenes even if they already have video outputs",
        },
        targetStep: {
          type: "number",
          description: "Target video stage number when explicitly repositioning a video project",
        },
        customInstruction: {
          type: "string",
          description: "Extra instruction for rewriting or generation",
        },
        targetId: {
          type: "string",
          description: "Single asset, review, or shot packet id to approve or redo",
        },
        targetIds: {
          type: "array",
          items: { type: "string" },
          description: "Multiple asset, review, or shot packet ids to approve or redo",
        },
        proposedSkillName: {
          type: "string",
          description: "Skill draft name for controlled evolution",
        },
        proposedContent: {
          type: "string",
          description: "Skill draft content markdown",
        },
        reason: {
          type: "string",
          description: "Why the skill draft or maintenance action exists",
        },
        sourceConversationIds: {
          type: "array",
          items: { type: "string" },
          description: "Conversation ids linked to the skill draft",
        },
      },
      required: ["action"],
    };
  }

  async call(
    args: Record<string, unknown>,
    context: ToolUseContext,
    _canUseTool: CanUseToolFn,
    _parentMessage: AssistantMessage,
    onProgress?: (data: unknown) => void,
  ): Promise<ToolResult> {
    const runtime = context.getAppState?.() as StudioRuntimeState | undefined;
    if (!runtime) {
      throw new Error("Home studio runtime is unavailable.");
    }

    const actionName = typeof args.action === "string" ? args.action : "";
    if (!actionName) {
      throw new Error("Workflow action is required.");
    }

    const progressId = crypto.randomUUID();
    const actionLabel = buildWorkflowProgressLabel(actionName);
    emitWorkflowProgress(progressId, "start", `Agent 正在执行：${actionLabel}`, onProgress);

    let result: Awaited<ReturnType<typeof runWorkflowAction>>;
    try {
      result = await runWorkflowAction(actionName, args, runtime);
    } catch (error) {
      emitWorkflowProgress(
        progressId,
        "error",
        `执行失败：${actionLabel}${error instanceof Error ? ` · ${error.message}` : ""}`,
        onProgress,
      );
      throw error;
    }

    context.setAppState?.((previous) => mergeRuntimeState(previous as StudioRuntimeState, result.data));

    emitWorkflowProgress(progressId, "complete", `已完成：${result.summary}`, onProgress);

    return {
      data: JSON.stringify(
        {
          summary: result.summary,
          recommendedActions: result.recommendedActions ?? result.projectSnapshot?.recommendedActions ?? [],
          projectSnapshot: result.projectSnapshot ?? result.data?.projectSnapshot ?? null,
        },
        null,
        2,
      ),
    };
  }
}
