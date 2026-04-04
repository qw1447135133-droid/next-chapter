import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { ComposerQuestion, ConversationProjectSnapshot } from "@/lib/home-agent/types";

type WorkflowShortcutRunner = (
  action: string,
  input: Record<string, unknown>,
  label: string,
) => void | Promise<void>;

type WorkflowShortcutChainRunner = (
  steps: Array<{ action: string; input: Record<string, unknown> }>,
  label: string,
) => void | Promise<void>;

type ReviewItem = {
  id: string;
  title: string;
  reason?: string;
  targetIds: string[];
};

type SceneLike = {
  id: string;
};

type VideoChoiceHandler = (
  snapshot: ConversationProjectSnapshot,
  value: string,
  label: string,
) => boolean;

type ShowChoicePopover = (
  label: string,
  assistantMessage: string,
  nextQuestion: ComposerQuestion,
) => void;

type ShowChoiceNotice = (
  label: string,
  assistantMessage: string,
  nextSuggestion?: ComposerQuestion | null,
) => void;

type VideoProjectChoiceDeps = {
  getCurrentVideoProject: () => PersistedVideoProject | null | undefined;
  runWorkflowActionShortcut: WorkflowShortcutRunner;
  send: (prompt: string, label: string) => void | Promise<void>;
  showChoicePopover: ShowChoicePopover;
  showChoiceNotice: ShowChoiceNotice;
  buildVideoGenerationQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildVideoRefreshQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildReviewQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  buildReviewListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  buildVideoRepairQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  listGeneratableVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listRunningVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
};

type VideoReviewChoiceDeps = {
  runWorkflowActionShortcut: WorkflowShortcutRunner;
  showChoicePopover: ShowChoicePopover;
  collectReviewTargetIds: (snapshot: ConversationProjectSnapshot, mode: "stable" | "risk") => string[];
  buildReviewListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findReviewItem: (snapshot: ConversationProjectSnapshot, reviewId: string) => ReviewItem | undefined;
  buildReviewDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    reviewId: string,
  ) => ComposerQuestion | null;
};

type VideoAssetChoiceDeps = {
  getCurrentVideoProject: () => PersistedVideoProject | null | undefined;
  runWorkflowActionShortcut: WorkflowShortcutRunner;
  runWorkflowActionShortcutChain: WorkflowShortcutChainRunner;
  showChoicePopover: ShowChoicePopover;
  buildVideoGenerationSceneListQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildVideoRefreshSceneListQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildVideoRepairListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  listFailedVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listGeneratableVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listRedoReviewItems: (snapshot: ConversationProjectSnapshot) => ReviewItem[];
  findReviewItem: (snapshot: ConversationProjectSnapshot, reviewId: string) => ReviewItem | undefined;
};

export function createVideoProjectChoiceHandler(deps: VideoProjectChoiceDeps): VideoChoiceHandler {
  return (snapshot, value, label) => {
    const videoProject = deps.getCurrentVideoProject();

    if (value === "video:bridge:analyze") {
      void deps.runWorkflowActionShortcut("analyze_script_for_video", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:bridge:entities") {
      void deps.runWorkflowActionShortcut("extract_video_entities", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:bridge:storyboard") {
      void deps.runWorkflowActionShortcut("prepare_storyboard_batch", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:bridge:shots") {
      void deps.runWorkflowActionShortcut("compile_video_shot_packets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:bridge:prompts") {
      void deps.runWorkflowActionShortcut("prepare_video_prompt_batch", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:bridge:platform") {
      void deps.send(
        `请基于《${snapshot.title}》当前视频桥接状态，帮我补齐目标平台、镜头风格、出片目标和额外镜头偏好，并直接给出下一步最适合执行的首页动作。`,
        label,
      );
      return true;
    }

    if (value === "开始第一轮出片") {
      const nextQuestion = deps.buildVideoGenerationQuestion(snapshot, videoProject);
      if (nextQuestion && deps.listGeneratableVideoScenes(videoProject).length > 1) {
        deps.showChoicePopover(label, "先选这一轮要发的镜头。", nextQuestion);
        return true;
      }

      void deps.runWorkflowActionShortcut("generate_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "轮询当前出片结果") {
      const nextQuestion = deps.buildVideoRefreshQuestion(snapshot, videoProject);
      if (nextQuestion && deps.listRunningVideoScenes(videoProject).length > 1) {
        deps.showChoicePopover(label, "先选要刷新的镜头。", nextQuestion);
        return true;
      }

      void deps.runWorkflowActionShortcut("refresh_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "整理待审阅项" || /^检查已生成的\s+\d+\s+条视频资产/.test(value)) {
      void deps.runWorkflowActionShortcut("review_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (/^处理\s+\d+\s+条待审阅项/.test(value)) {
      const nextQuestion = deps.buildReviewQuestion(snapshot) ?? deps.buildReviewListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选这一轮要处理的待审阅项。", nextQuestion);
        return true;
      }

      void deps.runWorkflowActionShortcut("review_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "对需要重做的镜头发起修复") {
      const nextQuestion = deps.buildVideoRepairQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选要返工的镜头。", nextQuestion);
        return true;
      }

      deps.showChoiceNotice(
        label,
        "当前还没有已标记为重做的镜头，先继续审阅或轮询当前结果更合适。",
        deps.buildReviewQuestion(snapshot) ?? deps.buildVideoRefreshQuestion(snapshot, videoProject),
      );
      return true;
    }

    if (value === "导出生产状态包") {
      void deps.runWorkflowActionShortcut("export_video_production_bundle", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "预览生产状态摘要") {
      void deps.runWorkflowActionShortcut("preview_video_production_bundle", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "打开生产状态目录") {
      void deps.runWorkflowActionShortcut("open_video_production_bundle_directory", { projectId: snapshot.projectId }, label);
      return true;
    }

    return false;
  };
}

export function createVideoReviewChoiceHandler(deps: VideoReviewChoiceDeps): VideoChoiceHandler {
  return (snapshot, value, label) => {
    if (value === "review:queue") {
      void deps.runWorkflowActionShortcut("review_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "review:approve-stable") {
      const targetIds = deps.collectReviewTargetIds(snapshot, "stable");
      if (!targetIds.length) {
        const nextQuestion = deps.buildReviewListQuestion(snapshot);
        if (nextQuestion) {
          deps.showChoicePopover(label, "当前没有可直接通过的项，先看待审阅列表。", nextQuestion);
        }
        return true;
      }

      void deps.runWorkflowActionShortcut("approve_video_assets", { projectId: snapshot.projectId, targetIds }, label);
      return true;
    }

    if (value === "review:redo-risk") {
      const targetIds = deps.collectReviewTargetIds(snapshot, "risk");
      if (!targetIds.length) {
        const nextQuestion = deps.buildReviewListQuestion(snapshot);
        if (nextQuestion) {
          deps.showChoicePopover(label, "当前没有风险项，先看待审阅列表。", nextQuestion);
        }
        return true;
      }

      void deps.runWorkflowActionShortcut(
        "redo_video_assets",
        {
          projectId: snapshot.projectId,
          targetIds,
          reason: "集中回退风险项，等待重新生成。",
        },
        label,
      );
      return true;
    }

    if (value === "review:list") {
      const nextQuestion = deps.buildReviewListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(label, "先选一条待审阅项。", nextQuestion);
      }
      return true;
    }

    if (value.startsWith("review:item:")) {
      const reviewId = value.replace("review:item:", "");
      const item = deps.findReviewItem(snapshot, reviewId);
      const nextQuestion = deps.buildReviewDecisionQuestion(snapshot, reviewId);
      if (!item || !nextQuestion) return true;

      deps.showChoicePopover(label, `已定位「${item.title}」，直接通过还是重做？`, nextQuestion);
      return true;
    }

    if (value.startsWith("review:item-approve:")) {
      const reviewId = value.replace("review:item-approve:", "");
      const item = deps.findReviewItem(snapshot, reviewId);
      if (!item) return true;

      void deps.runWorkflowActionShortcut(
        "approve_video_assets",
        { projectId: snapshot.projectId, targetIds: item.targetIds },
        label,
      );
      return true;
    }

    if (value.startsWith("review:item-redo:")) {
      const reviewId = value.replace("review:item-redo:", "");
      const item = deps.findReviewItem(snapshot, reviewId);
      if (!item) return true;

      void deps.runWorkflowActionShortcut(
        "redo_video_assets",
        {
          projectId: snapshot.projectId,
          targetIds: item.targetIds,
          reason: `已将「${item.title}」退回重做。`,
        },
        label,
      );
      return true;
    }

    return false;
  };
}

export function createVideoAssetChoiceHandler(deps: VideoAssetChoiceDeps): VideoChoiceHandler {
  return (snapshot, value, label) => {
    if (snapshot.projectKind !== "video") {
      return false;
    }

    const videoProject = deps.getCurrentVideoProject();

    if (value === "video:generate:first") {
      const targetIds = deps.listGeneratableVideoScenes(videoProject)
        .slice(0, 3)
        .map((scene) => scene.id);
      if (!targetIds.length) return true;

      void deps.runWorkflowActionShortcut(
        "generate_video_assets",
        { projectId: snapshot.projectId, targetIds },
        label,
      );
      return true;
    }

    if (value === "video:generate:failed") {
      const targetIds = deps.listFailedVideoScenes(videoProject).map((scene) => scene.id);
      if (!targetIds.length) {
        const nextQuestion = deps.buildVideoGenerationSceneListQuestion(snapshot, videoProject);
        if (nextQuestion) {
          deps.showChoicePopover(label, "当前没有失败镜头，先从可生成镜头里选一条。", nextQuestion);
        }
        return true;
      }

      void deps.runWorkflowActionShortcut(
        "generate_video_assets",
        { projectId: snapshot.projectId, targetIds, forceRegenerate: true },
        label,
      );
      return true;
    }

    if (value === "video:generate:list") {
      const nextQuestion = deps.buildVideoGenerationSceneListQuestion(snapshot, videoProject);
      if (nextQuestion) {
        deps.showChoicePopover(label, "选一条镜头开始出片。", nextQuestion);
      }
      return true;
    }

    if (value.startsWith("video:generate:scene:")) {
      const sceneId = value.replace("video:generate:scene:", "");
      void deps.runWorkflowActionShortcut(
        "generate_video_assets",
        { projectId: snapshot.projectId, targetIds: [sceneId] },
        label,
      );
      return true;
    }

    if (value === "video:refresh:all") {
      void deps.runWorkflowActionShortcut("refresh_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:refresh:list") {
      const nextQuestion = deps.buildVideoRefreshSceneListQuestion(snapshot, videoProject);
      if (nextQuestion) {
        deps.showChoicePopover(label, "选一条镜头先看结果。", nextQuestion);
      }
      return true;
    }

    if (value.startsWith("video:refresh:scene:")) {
      const sceneId = value.replace("video:refresh:scene:", "");
      void deps.runWorkflowActionShortcut(
        "refresh_video_assets",
        { projectId: snapshot.projectId, targetIds: [sceneId] },
        label,
      );
      return true;
    }

    if (value === "video:review:generated") {
      void deps.runWorkflowActionShortcut("review_video_assets", { projectId: snapshot.projectId }, label);
      return true;
    }

    if (value === "video:repair:all") {
      const targetIds = deps.listRedoReviewItems(snapshot).flatMap((item) =>
        item.targetIds.length ? item.targetIds : [item.id],
      );
      if (!targetIds.length) return true;

      void deps.runWorkflowActionShortcutChain(
        [
          {
            action: "redo_video_assets",
            input: {
              projectId: snapshot.projectId,
              targetIds,
              reason: "根据当前首页审阅结论，集中回退需要修复的镜头。",
            },
          },
          {
            action: "generate_video_assets",
            input: {
              projectId: snapshot.projectId,
              targetIds,
              forceRegenerate: true,
            },
          },
        ],
        label,
      );
      return true;
    }

    if (value === "video:repair:list" || value === "video:repair:review") {
      const nextQuestion = deps.buildVideoRepairListQuestion(snapshot);
      if (nextQuestion) {
        deps.showChoicePopover(
          label,
          value === "video:repair:review" ? "先看每条退回镜头。" : "选一条镜头先返工。",
          nextQuestion,
        );
      }
      return true;
    }

    if (value.startsWith("video:repair:item:")) {
      const reviewId = value.replace("video:repair:item:", "");
      const item = deps.findReviewItem(snapshot, reviewId);
      if (!item) return true;

      const targetIds = item.targetIds.length ? item.targetIds : [item.id];
      void deps.runWorkflowActionShortcutChain(
        [
          {
            action: "redo_video_assets",
            input: {
              projectId: snapshot.projectId,
              targetIds,
              reason: item.reason || `已将「${item.title}」送回重做。`,
            },
          },
          {
            action: "generate_video_assets",
            input: {
              projectId: snapshot.projectId,
              targetIds,
              forceRegenerate: true,
            },
          },
        ],
        label,
      );
      return true;
    }

    return false;
  };
}
