import {
  readMaintenanceReports,
  readSkillDrafts,
  writeMaintenanceReports,
  writeSkillDrafts,
} from "./project-store";
import type {
  MaintenanceReport,
  SkillDraft,
  StudioRuntimeState,
  WorkflowAction,
  WorkflowActionResult,
} from "./types";
import {
  analyzeReferenceScriptAction,
  continueDramaStepAction,
  exportDramaProjectAction,
  generateCharacterTransformAction,
  generateCharactersAction,
  generateCreativePlanAction,
  generateDirectoryAction,
  generateEpisodeAction,
  generateOutlinesAction,
  generateStructureTransformAction,
  runComplianceReviewAction,
  saveDramaSetupAction,
} from "./services/drama-workflow-service";
import {
  advanceVideoWorkflowAction,
  analyzeScriptForVideoAction,
  continueVideoStepAction,
  createVideoBridgeArtifactAction,
  extractVideoEntitiesAction,
  prepareStoryboardBatchAction,
  prepareVideoGenerationAction,
  prepareVideoPromptBatchAction,
} from "./services/video-workflow-service";

function buildContextSummary(runtime: StudioRuntimeState): string {
  const snapshot = runtime.currentProjectSnapshot;
  const pendingSkillDrafts = runtime.skillDrafts.filter((draft) => draft.status === "pending").length;
  const latestReport = runtime.maintenanceReports[0];
  const artifactSummary = snapshot?.artifacts.length
    ? snapshot.artifacts
        .slice(0, 4)
        .map((artifact) => `${artifact.label}: ${artifact.summary || "已生成"}`)
        .join("\n- ")
    : "";

  return [
    `sessionId: ${runtime.sessionId}`,
    snapshot
      ? `当前项目：${snapshot.title} / ${snapshot.projectKind} / ${snapshot.derivedStage}`
      : "当前项目：无",
    snapshot ? `当前目标：${snapshot.currentObjective}` : "",
    snapshot ? `项目摘要：${snapshot.agentSummary}` : "",
    artifactSummary ? `可用产物：\n- ${artifactSummary}` : "",
    snapshot?.recommendedActions.length
      ? `推荐动作：\n- ${snapshot.recommendedActions.slice(0, 3).join("\n- ")}`
      : "",
    runtime.recentMessageSummary ? `最近会话摘要：${runtime.recentMessageSummary}` : "",
    pendingSkillDrafts ? `待审核技能草案：${pendingSkillDrafts}` : "待审核技能草案：0",
    latestReport
      ? [
          `最近维护：${latestReport.summary}`,
          `维护计数：压缩 ${latestReport.compressedConversationCount} / 归档 ${latestReport.archivedProjectCount} / 归并 ${latestReport.mergedDraftCount}`,
        ].join("\n")
      : "最近维护：无",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveContinuationKind(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): "script" | "adaptation" | "video" {
  if (input.projectKind === "video") return "video";
  if (input.projectKind === "adaptation") return "adaptation";
  if (input.projectKind === "script") return "script";

  const hasVideoHints =
    typeof input.script === "string" ||
    typeof input.targetPlatform === "string" ||
    typeof input.shotStyle === "string" ||
    typeof input.outputGoal === "string" ||
    typeof input.productionNotes === "string" ||
    typeof input.artStyle === "string" ||
    typeof input.videoPace === "string" ||
    typeof input.segmentsPerEpisode === "number";

  if (hasVideoHints) return "video";
  if (runtime.currentProjectSnapshot?.projectKind === "video") return "video";
  if (runtime.currentProjectSnapshot?.projectKind === "adaptation") return "adaptation";
  if (runtime.currentProjectSnapshot?.projectKind === "script") return "script";
  if (runtime.currentVideoProject) return "video";

  return "script";
}

async function continueProjectAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const projectKind = resolveContinuationKind(input, runtime);
  if (projectKind === "video") {
    return advanceVideoWorkflowAction(
      {
        ...input,
        projectKind: "video",
      },
      runtime,
    );
  }

  return continueDramaStepAction(
    {
      ...input,
      projectKind,
    },
    runtime,
  );
}

async function createSkillDraftAction(
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const drafts = readSkillDrafts();
  const draft: SkillDraft = {
    id: crypto.randomUUID(),
    sourceConversationIds:
      Array.isArray(input.sourceConversationIds) &&
      input.sourceConversationIds.every((item) => typeof item === "string")
        ? input.sourceConversationIds
        : [runtime.sessionId],
    proposedSkillName:
      typeof input.proposedSkillName === "string" && input.proposedSkillName.trim()
        ? input.proposedSkillName.trim()
        : "未命名技能草案",
    proposedContent: typeof input.proposedContent === "string" ? input.proposedContent : "",
    reason:
      typeof input.reason === "string"
        ? input.reason
        : "从会话里提炼出的流程优化建议。",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const nextDrafts = [draft, ...drafts];

  writeSkillDrafts(nextDrafts);

  return {
    summary: `已写入待审核技能草案《${draft.proposedSkillName}》。`,
    data: {
      skillDrafts: nextDrafts,
    },
  };
}

async function runMaintenanceAction(
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const reports = readMaintenanceReports();
  const drafts = readSkillDrafts();
  const report: MaintenanceReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary: "已完成本地维护检查，整理了会话摘要、技能草案队列和缓存建议。",
    compressedConversationCount: runtime.recentMessageSummary ? 1 : 0,
    archivedProjectCount: runtime.recentProjects.filter(
      (project) => project.projectId !== runtime.currentProjectSnapshot?.projectId,
    ).length,
    clearedCacheKeys: [],
    mergedDraftCount:
      Math.max(0, drafts.length - new Set(drafts.map((draft) => draft.proposedSkillName)).size),
    notes: [
      runtime.recentMessageSummary
        ? "当前会话已有摘要，可继续沿用。"
        : "当前会话还没有摘要，建议在长会话后进行压缩。",
      drafts.length > 0
        ? `当前共有 ${drafts.length} 份待审核技能草案。`
        : "当前没有待审核技能草案。",
    ],
  };

  const nextReports = [report, ...reports].slice(0, 20);
  writeMaintenanceReports(nextReports);

  return {
    summary: report.summary,
    data: {
      maintenanceReports: nextReports,
    },
  };
}

const workflowActions: WorkflowAction[] = [
  {
    id: "get-context",
    kind: "get_context",
    async run(_input, runtime) {
      return { summary: buildContextSummary(runtime) };
    },
  },
  {
    id: "save-setup",
    kind: "save_setup",
    run: saveDramaSetupAction,
  },
  {
    id: "continue-project",
    kind: "continue_project",
    run: continueProjectAction,
  },
  {
    id: "continue-drama-step",
    kind: "continue_drama_step",
    run: continueDramaStepAction,
  },
  {
    id: "analyze-reference-script",
    kind: "analyze_reference_script",
    run: analyzeReferenceScriptAction,
  },
  {
    id: "generate-creative-plan",
    kind: "generate_creative_plan",
    run: generateCreativePlanAction,
  },
  {
    id: "generate-structure-transform",
    kind: "generate_structure_transform",
    run: generateStructureTransformAction,
  },
  {
    id: "generate-characters",
    kind: "generate_characters",
    run: generateCharactersAction,
  },
  {
    id: "generate-character-transform",
    kind: "generate_character_transform",
    run: generateCharacterTransformAction,
  },
  {
    id: "generate-directory",
    kind: "generate_directory",
    run: generateDirectoryAction,
  },
  {
    id: "generate-outlines",
    kind: "generate_outlines",
    run: generateOutlinesAction,
  },
  {
    id: "generate-episode",
    kind: "generate_episode",
    run: generateEpisodeAction,
  },
  {
    id: "run-compliance-review",
    kind: "run_compliance_review",
    run: runComplianceReviewAction,
  },
  {
    id: "prepare-video-generation",
    kind: "prepare_video_generation",
    run: prepareVideoGenerationAction,
  },
  {
    id: "advance-video-workflow",
    kind: "advance_video_workflow",
    run: advanceVideoWorkflowAction,
  },
  {
    id: "analyze-script-for-video",
    kind: "analyze_script_for_video",
    run: analyzeScriptForVideoAction,
  },
  {
    id: "extract-video-entities",
    kind: "extract_video_entities",
    run: extractVideoEntitiesAction,
  },
  {
    id: "prepare-storyboard-batch",
    kind: "prepare_storyboard_batch",
    run: prepareStoryboardBatchAction,
  },
  {
    id: "prepare-video-prompt-batch",
    kind: "prepare_video_prompt_batch",
    run: prepareVideoPromptBatchAction,
  },
  {
    id: "continue-video-step",
    kind: "continue_video_step",
    run: continueVideoStepAction,
  },
  {
    id: "create-video-bridge-artifact",
    kind: "create_video_bridge_artifact",
    run: createVideoBridgeArtifactAction,
  },
  {
    id: "export-project",
    kind: "export_project",
    run: exportDramaProjectAction,
  },
  {
    id: "create-skill-draft",
    kind: "create_skill_draft",
    async run(input, runtime) {
      return createSkillDraftAction(input, runtime);
    },
  },
  {
    id: "run-maintenance",
    kind: "run_maintenance",
    async run(_input, runtime) {
      return runMaintenanceAction(runtime);
    },
  },
];

export async function runWorkflowAction(
  actionKind: string,
  input: Record<string, unknown>,
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const action = workflowActions.find((item) => item.kind === actionKind);
  if (!action) {
    throw new Error(`Unsupported workflow action: ${actionKind}`);
  }

  return action.run(input, runtime);
}
