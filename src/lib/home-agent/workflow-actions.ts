import {
  readMaintenanceReports,
  readSkillDrafts,
  writeMaintenanceReports,
  writeSkillDrafts,
} from "./project-store";
import { upsertStoredVideoProject } from "@/hooks/use-local-persistence";
import {
  buildVideoProductionBundlePreviewMessage,
  exportVideoProductionBundle,
  resolveVideoProductionBundleDirectory,
} from "./production-state-export";
import {
  exportApprovedSkillDraftBundle,
  exportApprovedSkillDrafts,
  exportApprovedSkillInstallCandidates,
} from "./skill-draft-export";
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
  lockCharacterCardsAction,
  lockStoryBeatsAction,
  reopenComplianceRevisionsAction,
  resolveComplianceRevisionsAction,
  runComplianceReviewAction,
  saveDramaSetupAction,
} from "./services/drama-workflow-service";
import {
  approveVideoAssetsAction,
  advanceVideoWorkflowAction,
  advanceVideoWorkflowRoundAction,
  analyzeScriptForVideoAction,
  compileVideoShotPacketsAction,
  continueVideoStepAction,
  createVideoBridgeArtifactAction,
  generateVideoAssetsAction,
  refreshVideoAssetsAction,
  redoVideoAssetsAction,
  extractVideoEntitiesAction,
  prepareStoryboardBatchAction,
  prepareVideoGenerationAction,
  prepareVideoPromptBatchAction,
  reviewVideoAssetsAction,
} from "./services/video-workflow-service";

function buildContextSummary(runtime: StudioRuntimeState): string {
  const snapshot = runtime.currentProjectSnapshot;
  const pendingSkillDrafts = runtime.skillDrafts.filter((draft) => draft.status === "pending").length;
  const approvedSkillDrafts = runtime.skillDrafts.filter((draft) => draft.status === "approved").length;
  const latestReport = runtime.maintenanceReports[0];
  const memory = snapshot?.memory;
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
    memory?.styleLock
      ? `风格锁定：${memory.styleLock.genre.join("、")} / ${memory.styleLock.tone} / ${memory.styleLock.visualStyle}`
      : "",
    memory?.worldModel
      ? `世界模型：角色 ${memory.worldModel.characters.length} / 场景 ${memory.worldModel.scenes.length}`
      : "",
    memory?.characterStateCards?.length ? `角色状态卡：${memory.characterStateCards.length} 张` : "",
    memory?.storyBeatPackets?.length ? `剧情 beat 包：${memory.storyBeatPackets.length} 条` : "",
    memory?.complianceRevisionPackets?.length
      ? `合规修订包：${memory.complianceRevisionPackets.length} 条`
      : "",
    memory?.assetManifest
      ? `资产清单：${memory.assetManifest.items.length} 项 / 待审阅 ${memory.reviewQueue?.filter((item) => item.status !== "approved").length ?? 0} 项`
      : "",
    memory?.shotPackets?.length ? `镜头指令包：${memory.shotPackets.length} 个` : "",
    artifactSummary ? `可用产物：\n- ${artifactSummary}` : "",
    snapshot?.recommendedActions.length
      ? `推荐动作：\n- ${snapshot.recommendedActions.slice(0, 3).join("\n- ")}`
      : "",
    runtime.recentMessageSummary ? `最近会话摘要：${runtime.recentMessageSummary}` : "",
    pendingSkillDrafts ? `待审核技能草案：${pendingSkillDrafts}` : "待审核技能草案：0",
    approvedSkillDrafts ? `已批准技能草案：${approvedSkillDrafts}` : "已批准技能草案：0",
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

async function updateSkillDraftStatusAction(
  input: Record<string, unknown>,
  nextStatus: SkillDraft["status"],
): Promise<WorkflowActionResult> {
  const draftId = typeof input.draftId === "string" ? input.draftId : "";
  if (!draftId.trim()) {
    throw new Error("缺少技能草案 ID，无法更新审核状态。");
  }

  const drafts = readSkillDrafts();
  const target = drafts.find((draft) => draft.id === draftId);
  if (!target) {
    throw new Error("这份技能草案不存在，可能已被清理。");
  }

  const nextDrafts = drafts.map((draft) => (draft.id === draftId ? { ...draft, status: nextStatus } : draft));
  writeSkillDrafts(nextDrafts);
  const nextReport: MaintenanceReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary:
      nextStatus === "approved"
        ? `已将《${target.proposedSkillName}》加入已批准技能候选。`
        : `已将《${target.proposedSkillName}》从待审核草案中驳回。`,
    compressedConversationCount: 0,
    archivedProjectCount: 0,
    clearedCacheKeys: [],
    mergedDraftCount: 0,
    notes: [
      `草案来源会话：${target.sourceConversationIds.length} 条`,
      nextStatus === "approved"
        ? "这份草案已进入后续正式技能整理候选队列。"
        : "这份草案不会再出现在待审核列表中。",
    ],
  };
  const nextReports = [nextReport, ...readMaintenanceReports()].slice(0, 20);
  writeMaintenanceReports(nextReports);

  return {
    summary:
      nextStatus === "approved"
        ? `已批准技能草案《${target.proposedSkillName}》，并加入已批准候选队列。`
        : `已驳回技能草案《${target.proposedSkillName}》。`,
    data: {
      skillDrafts: nextDrafts,
      maintenanceReports: nextReports,
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

async function exportApprovedSkillDraftsAction(): Promise<WorkflowActionResult> {
  const drafts = readSkillDrafts();
  const exported = await exportApprovedSkillDrafts(drafts);
  const nextReport: MaintenanceReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary: `已将 ${exported.exportedCount} 份已批准技能草案导出到本地候选目录。`,
    compressedConversationCount: 0,
    archivedProjectCount: 0,
    clearedCacheKeys: [],
    mergedDraftCount: 0,
    notes: [`导出目录：${exported.directoryPath}`, `索引文件：${exported.indexPath}`],
  };
  const nextReports = [nextReport, ...readMaintenanceReports()].slice(0, 20);
  writeMaintenanceReports(nextReports);

  return {
    summary: `${nextReport.summary}\n目录：${exported.directoryPath}`,
    data: {
      skillDrafts: drafts,
      maintenanceReports: nextReports,
    },
  };
}

async function exportApprovedSkillDraftBundleAction(): Promise<WorkflowActionResult> {
  const drafts = readSkillDrafts();
  const exported = await exportApprovedSkillDraftBundle(drafts);
  const nextReport: MaintenanceReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary: `已生成 ${exported.exportedCount} 份已批准技能草案的 bundle 预览。`,
    compressedConversationCount: 0,
    archivedProjectCount: 0,
    clearedCacheKeys: [],
    mergedDraftCount: 0,
    notes: [`Markdown: ${exported.markdownPath}`, `JSON: ${exported.jsonPath}`],
  };
  const nextReports = [nextReport, ...readMaintenanceReports()].slice(0, 20);
  writeMaintenanceReports(nextReports);

  return {
    summary: `${nextReport.summary}\nMarkdown：${exported.markdownPath}`,
    data: {
      skillDrafts: drafts,
      maintenanceReports: nextReports,
    },
  };
}

async function exportApprovedSkillInstallCandidatesAction(): Promise<WorkflowActionResult> {
  const drafts = readSkillDrafts();
  const exported = await exportApprovedSkillInstallCandidates(drafts);
  const nextReport: MaintenanceReport = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    summary: `已整理 ${exported.exportedCount} 份正式 Skill 安装候选文件，等待人工审核。`,
    compressedConversationCount: 0,
    archivedProjectCount: 0,
    clearedCacheKeys: [],
    mergedDraftCount: 0,
    notes: [
      `候选目录：${exported.directoryPath}`,
      `审核清单：${exported.manifestPath}`,
      "这些候选文件不会自动进入 .claude/skills，也不会自动生效。",
    ],
  };
  const nextReports = [nextReport, ...readMaintenanceReports()].slice(0, 20);
  writeMaintenanceReports(nextReports);

  return {
    summary: `${nextReport.summary}\n目录：${exported.directoryPath}`,
    data: {
      skillDrafts: drafts,
      maintenanceReports: nextReports,
    },
  };
}

function withVideoProductionBundleFollowups(
  snapshot: StudioRuntimeState["currentProjectSnapshot"],
): StudioRuntimeState["currentProjectSnapshot"] {
  if (!snapshot || snapshot.projectKind !== "video") return snapshot;

  const followups = ["预览生产状态摘要", "打开生产状态目录", "导出生产状态包"];
  const nextRecommendedActions = [...followups, ...snapshot.recommendedActions].filter(
    (action, index, actions) => actions.indexOf(action) === index,
  );

  return {
    ...snapshot,
    recommendedActions: nextRecommendedActions,
  };
}

function withVideoProductionBundleArtifact(
  snapshot: StudioRuntimeState["currentProjectSnapshot"],
  directoryPath: string,
): StudioRuntimeState["currentProjectSnapshot"] {
  if (!snapshot || snapshot.projectKind !== "video") return snapshot;

  const artifact = {
    id: `video-production-bundle:${snapshot.projectId}`,
    kind: "report" as const,
    label: "生产状态包",
    summary: `已导出到 ${directoryPath}`,
    content: [
      `目录：${directoryPath}`,
      "包含文件：overview / style-lock / world-model / asset-manifest / shot-packets / review-queue / README",
    ].join("\n"),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...snapshot,
    artifacts: [artifact, ...snapshot.artifacts.filter((item) => item.id !== artifact.id)].slice(0, 12),
  };
}

async function exportVideoProductionBundleAction(
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = runtime.currentVideoProject;
  if (!project) {
    throw new Error("当前没有可导出的首页视频项目。");
  }

  const exported = await exportVideoProductionBundle(project);
  const nextProject = await upsertStoredVideoProject({
    ...project,
    productionStateBundle: {
      directoryPath: exported.directoryPath,
      overviewPath: exported.overviewPath,
      filePaths: exported.filePaths,
      exportedCount: exported.exportedCount,
      exportedAt: new Date().toISOString(),
    },
  });
  const nextSnapshot = withVideoProductionBundleFollowups(
    withVideoProductionBundleArtifact(runtime.currentProjectSnapshot, exported.directoryPath),
  );
  return {
    summary: `已导出《${project.title || project.id}》的生产状态包。\n目录：${exported.directoryPath}`,
    data: {
      videoProject: nextProject,
      projectSnapshot: nextSnapshot,
    },
  };
}

async function previewVideoProductionBundleAction(
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = runtime.currentVideoProject;
  if (!project) {
    throw new Error("当前没有可预览的首页视频项目。");
  }

  const nextSnapshot = withVideoProductionBundleFollowups(runtime.currentProjectSnapshot);
  return {
    summary: buildVideoProductionBundlePreviewMessage(project),
    data: {
      projectSnapshot: nextSnapshot,
    },
  };
}

async function openVideoProductionBundleDirectoryAction(
  runtime: StudioRuntimeState,
): Promise<WorkflowActionResult> {
  const project = runtime.currentVideoProject;
  if (!project) {
    throw new Error("当前没有可打开目录的首页视频项目。");
  }

  const opener = window.electronAPI?.storage?.openFolder;
  if (!opener) {
    throw new Error("当前环境不支持直接打开本地目录。");
  }

  const directoryPath = await resolveVideoProductionBundleDirectory(project);
  await opener(directoryPath);
  const nextSnapshot = withVideoProductionBundleFollowups(runtime.currentProjectSnapshot);

  return {
    summary: `已为你打开生产状态目录：${directoryPath}`,
    data: {
      projectSnapshot: nextSnapshot,
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
    id: "lock-character-cards",
    kind: "lock_character_cards",
    run: lockCharacterCardsAction,
  },
  {
    id: "lock-story-beats",
    kind: "lock_story_beats",
    run: lockStoryBeatsAction,
  },
  {
    id: "resolve-compliance-revisions",
    kind: "resolve_compliance_revisions",
    run: resolveComplianceRevisionsAction,
  },
  {
    id: "reopen-compliance-revisions",
    kind: "reopen_compliance_revisions",
    run: reopenComplianceRevisionsAction,
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
    id: "advance-video-workflow-round",
    kind: "advance_video_workflow_round",
    run: advanceVideoWorkflowRoundAction,
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
    id: "compile-video-shot-packets",
    kind: "compile_video_shot_packets",
    run: compileVideoShotPacketsAction,
  },
  {
    id: "prepare-video-prompt-batch",
    kind: "prepare_video_prompt_batch",
    run: prepareVideoPromptBatchAction,
  },
  {
    id: "generate-video-assets",
    kind: "generate_video_assets",
    run: generateVideoAssetsAction,
  },
  {
    id: "refresh-video-assets",
    kind: "refresh_video_assets",
    run: refreshVideoAssetsAction,
  },
  {
    id: "review-video-assets",
    kind: "review_video_assets",
    run: reviewVideoAssetsAction,
  },
  {
    id: "approve-video-assets",
    kind: "approve_video_assets",
    run: approveVideoAssetsAction,
  },
  {
    id: "redo-video-assets",
    kind: "redo_video_assets",
    run: redoVideoAssetsAction,
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
  {
    id: "export-approved-skill-drafts",
    kind: "export_approved_skill_drafts",
    async run() {
      return exportApprovedSkillDraftsAction();
    },
  },
  {
    id: "export-approved-skill-draft-bundle",
    kind: "export_approved_skill_draft_bundle",
    async run() {
      return exportApprovedSkillDraftBundleAction();
    },
  },
  {
    id: "export-approved-skill-install-candidates",
    kind: "export_approved_skill_install_candidates",
    async run() {
      return exportApprovedSkillInstallCandidatesAction();
    },
  },
  {
    id: "export-video-production-bundle",
    kind: "export_video_production_bundle",
    async run(_input, runtime) {
      return exportVideoProductionBundleAction(runtime);
    },
  },
  {
    id: "preview-video-production-bundle",
    kind: "preview_video_production_bundle",
    async run(_input, runtime) {
      return previewVideoProductionBundleAction(runtime);
    },
  },
  {
    id: "open-video-production-bundle-directory",
    kind: "open_video_production_bundle_directory",
    async run(_input, runtime) {
      return openVideoProductionBundleDirectoryAction(runtime);
    },
  },
  {
    id: "approve-skill-draft",
    kind: "approve_skill_draft",
    async run(input) {
      return updateSkillDraftStatusAction(input, "approved");
    },
  },
  {
    id: "reject-skill-draft",
    kind: "reject_skill_draft",
    async run(input) {
      return updateSkillDraftStatusAction(input, "rejected");
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
