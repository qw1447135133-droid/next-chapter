import { useCallback, useMemo } from "react";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type {
  AgentConversationMode,
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  SkillDraft,
  StudioRuntimeState,
} from "@/lib/home-agent/types";
import { createScriptProjectChoiceHandler } from "./home-agent-script-choice-handlers";
import {
  buildMaintenanceReportMessage,
  buildApprovedSkillDraftBundlePreviewMessage,
  buildApprovedSkillInstallCandidatePreviewMessage,
  buildSkillDraftSummaryMessage,
  findSkillDraft,
  listPendingSkillDrafts,
} from "./home-agent-project-questions";
import {
  resolveApprovedSkillDraftExportDirectory,
  resolveApprovedSkillInstallCandidateDirectory,
} from "@/lib/home-agent/skill-draft-export";
import {
  createVideoAssetChoiceHandler,
  createVideoProjectChoiceHandler,
  createVideoReviewChoiceHandler,
} from "./home-agent-video-choice-handlers";
import { showChoiceNoticeMessage, showChoicePopoverMessage } from "./home-agent-workflow-ui";

type PushMessage = (role: HomeAgentMessage["role"], content: string) => void;
type ChoiceHandler = (snapshot: ConversationProjectSnapshot, value: string, label: string) => boolean;
type WorkflowShortcutRunner = (
  action: string,
  input: Record<string, unknown>,
  userBubble: string,
) => void | Promise<void>;
type WorkflowShortcutChainRunner = (
  steps: Array<{ action: string; input: Record<string, unknown> }>,
  userBubble: string,
) => void | Promise<void>;
type MaintenanceChoiceHandler = (value: string, label: string) => boolean;
type SceneLike = { id: string };
type ReviewItem = { id: string; title: string; targetIds: string[] };
type CharacterCard = {
  id: string;
  name: string;
  role: string;
  coreConflict: string;
  desire: string;
  riskNote: string;
  relationshipAxis: string[];
};
type CompliancePacket = {
  id: string;
  issueTitle: string;
  riskLevel: string;
  recommendation: string;
};
type BeatPacket = {
  id: string;
  title: string;
  episodeNumber: number;
  status: string;
};

export function useHomeAgentChoiceHandlers(params: {
  runtimeRef: React.MutableRefObject<StudioRuntimeState>;
  push: PushMessage;
  setPopoverOverride: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSuggested: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setMode: React.Dispatch<React.SetStateAction<AgentConversationMode>>;
  resetComposerDraft: (value?: string) => void;
  send: (prompt: string, shown?: string) => Promise<void>;
  runWorkflowActionShortcut: WorkflowShortcutRunner;
  runWorkflowActionShortcutChain: WorkflowShortcutChainRunner;
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
  buildVideoGenerationSceneListQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildVideoRefreshSceneListQuestion: (
    snapshot: ConversationProjectSnapshot,
    project: PersistedVideoProject | null | undefined,
  ) => ComposerQuestion | null;
  buildVideoRepairListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  listGeneratableVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listFailedVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listRunningVideoScenes: (project: PersistedVideoProject | null | undefined) => SceneLike[];
  listRedoReviewItems: (snapshot: ConversationProjectSnapshot) => ReviewItem[];
  collectReviewTargetIds: (snapshot: ConversationProjectSnapshot, mode: "stable" | "risk") => string[];
  findReviewItem: (snapshot: ConversationProjectSnapshot, reviewId: string) => ReviewItem | undefined;
  buildReviewDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    reviewId: string,
  ) => ComposerQuestion | null;
  listUnlockedCharacterCards: (snapshot: ConversationProjectSnapshot) => CharacterCard[];
  buildCharacterCardListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findCharacterCard: (snapshot: ConversationProjectSnapshot, cardId: string) => CharacterCard | undefined;
  buildCharacterCardDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    cardId: string,
  ) => ComposerQuestion | null;
  listPendingCompliancePackets: (snapshot: ConversationProjectSnapshot) => CompliancePacket[];
  buildComplianceListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findCompliancePacket: (snapshot: ConversationProjectSnapshot, packetId: string) => CompliancePacket | undefined;
  buildComplianceDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    packetId: string,
  ) => ComposerQuestion | null;
  listUnlockedBeatPackets: (snapshot: ConversationProjectSnapshot) => BeatPacket[];
  buildBeatPacketListQuestion: (snapshot: ConversationProjectSnapshot) => ComposerQuestion | null;
  findBeatPacket: (snapshot: ConversationProjectSnapshot, packetId: string) => BeatPacket | undefined;
  buildBeatPacketDecisionQuestion: (
    snapshot: ConversationProjectSnapshot,
    packetId: string,
  ) => ComposerQuestion | null;
  buildMaintenanceReviewQuestion: (
    runtime: Pick<StudioRuntimeState, "skillDrafts" | "maintenanceReports">,
  ) => ComposerQuestion | null;
  buildSkillDraftListQuestion: (
    drafts: SkillDraft[],
  ) => ComposerQuestion | null;
  buildApprovedSkillDraftListQuestion: (
    drafts: SkillDraft[],
  ) => ComposerQuestion | null;
  buildSkillDraftDecisionQuestion: (draft: SkillDraft) => ComposerQuestion;
}) {
  const {
    runtimeRef,
    push,
    setPopoverOverride,
    setSuggested,
    setMode,
    resetComposerDraft,
    send,
    runWorkflowActionShortcut,
    runWorkflowActionShortcutChain,
    buildVideoGenerationQuestion,
    buildVideoRefreshQuestion,
    buildReviewQuestion,
    buildReviewListQuestion,
    buildVideoRepairQuestion,
    buildVideoGenerationSceneListQuestion,
    buildVideoRefreshSceneListQuestion,
    buildVideoRepairListQuestion,
    listGeneratableVideoScenes,
    listFailedVideoScenes,
    listRunningVideoScenes,
    listRedoReviewItems,
    collectReviewTargetIds,
    findReviewItem,
    buildReviewDecisionQuestion,
    listUnlockedCharacterCards,
    buildCharacterCardListQuestion,
    findCharacterCard,
    buildCharacterCardDecisionQuestion,
    listPendingCompliancePackets,
    buildComplianceListQuestion,
    findCompliancePacket,
    buildComplianceDecisionQuestion,
    listUnlockedBeatPackets,
    buildBeatPacketListQuestion,
    findBeatPacket,
    buildBeatPacketDecisionQuestion,
    buildMaintenanceReviewQuestion,
    buildSkillDraftListQuestion,
    buildApprovedSkillDraftListQuestion,
    buildSkillDraftDecisionQuestion,
  } = params;

  const showChoicePopover = useCallback(
    (label: string, assistantMessage: string, nextQuestion: ComposerQuestion) => {
      showChoicePopoverMessage({
        label,
        assistantMessage,
        nextQuestion,
        push,
        setPopoverOverride,
        setSuggested,
        setMode,
        resetComposerDraft,
      });
    },
    [push, resetComposerDraft, setMode, setPopoverOverride, setSuggested],
  );

  const showChoiceNotice = useCallback(
    (label: string, assistantMessage: string, nextSuggestion: ComposerQuestion | null = null) => {
      showChoiceNoticeMessage({
        label,
        assistantMessage,
        nextSuggestion,
        push,
        setPopoverOverride,
        setSuggested,
        setMode,
        resetComposerDraft,
      });
    },
    [push, resetComposerDraft, setMode, setPopoverOverride, setSuggested],
  );

  const videoProjectChoiceHandler = useMemo<ChoiceHandler>(
    () =>
      createVideoProjectChoiceHandler({
        getCurrentVideoProject: () => runtimeRef.current.currentVideoProject,
        runWorkflowActionShortcut,
        send,
        showChoicePopover,
        showChoiceNotice,
        buildVideoGenerationQuestion,
        buildVideoRefreshQuestion,
        buildReviewQuestion,
        buildReviewListQuestion,
        buildVideoRepairQuestion,
        listGeneratableVideoScenes,
        listRunningVideoScenes,
      }),
    [
      buildReviewListQuestion,
      buildReviewQuestion,
      buildVideoGenerationQuestion,
      buildVideoRefreshQuestion,
      buildVideoRepairQuestion,
      listGeneratableVideoScenes,
      listRunningVideoScenes,
      runWorkflowActionShortcut,
      runtimeRef,
      send,
      showChoiceNotice,
      showChoicePopover,
    ],
  );

  const videoReviewChoiceHandler = useMemo<ChoiceHandler>(
    () =>
      createVideoReviewChoiceHandler({
        runWorkflowActionShortcut,
        showChoicePopover,
        collectReviewTargetIds,
        buildReviewListQuestion,
        findReviewItem,
        buildReviewDecisionQuestion,
      }),
    [
      buildReviewDecisionQuestion,
      buildReviewListQuestion,
      collectReviewTargetIds,
      findReviewItem,
      runWorkflowActionShortcut,
      showChoicePopover,
    ],
  );

  const videoAssetChoiceHandler = useMemo<ChoiceHandler>(
    () =>
      createVideoAssetChoiceHandler({
        getCurrentVideoProject: () => runtimeRef.current.currentVideoProject,
        runWorkflowActionShortcut,
        runWorkflowActionShortcutChain,
        showChoicePopover,
        buildVideoGenerationSceneListQuestion,
        buildVideoRefreshSceneListQuestion,
        buildVideoRepairListQuestion,
        listFailedVideoScenes,
        listGeneratableVideoScenes,
        listRedoReviewItems,
        findReviewItem,
      }),
    [
      buildVideoGenerationSceneListQuestion,
      buildVideoRefreshSceneListQuestion,
      buildVideoRepairListQuestion,
      findReviewItem,
      listFailedVideoScenes,
      listGeneratableVideoScenes,
      listRedoReviewItems,
      runWorkflowActionShortcut,
      runWorkflowActionShortcutChain,
      runtimeRef,
      showChoicePopover,
    ],
  );

  const scriptProjectChoiceHandler = useMemo<ChoiceHandler>(
    () =>
      createScriptProjectChoiceHandler({
        runWorkflowActionShortcut,
        send,
        showChoicePopover,
        listUnlockedCharacterCards,
        buildCharacterCardListQuestion,
        findCharacterCard,
        buildCharacterCardDecisionQuestion,
        listPendingCompliancePackets,
        buildComplianceListQuestion,
        findCompliancePacket,
        buildComplianceDecisionQuestion,
        listUnlockedBeatPackets,
        buildBeatPacketListQuestion,
        findBeatPacket,
        buildBeatPacketDecisionQuestion,
      }),
    [
      buildBeatPacketDecisionQuestion,
      buildBeatPacketListQuestion,
      buildCharacterCardDecisionQuestion,
      buildCharacterCardListQuestion,
      buildComplianceDecisionQuestion,
      buildComplianceListQuestion,
      findBeatPacket,
      findCharacterCard,
      findCompliancePacket,
      listPendingCompliancePackets,
      listUnlockedBeatPackets,
      listUnlockedCharacterCards,
      runWorkflowActionShortcut,
      send,
      showChoicePopover,
    ],
  );

  const maintenanceChoiceHandler = useMemo<MaintenanceChoiceHandler>(
    () => (value, label) => {
      const runtime = runtimeRef.current;
      const pendingDrafts = listPendingSkillDrafts(runtime.skillDrafts);
      const latestReport = runtime.maintenanceReports[0] ?? null;

      if (value === "maintenance:run") {
        void runWorkflowActionShortcut("run_maintenance", {}, label);
        return true;
      }

      if (value === "maintenance:report:latest" && latestReport) {
        showChoiceNotice(
          label,
          buildMaintenanceReportMessage(latestReport),
          buildMaintenanceReviewQuestion(runtime),
        );
        return true;
      }

      if (value === "maintenance:skills") {
        const nextQuestion = buildSkillDraftListQuestion(runtime.skillDrafts);
        if (!nextQuestion) {
          showChoiceNotice(
            label,
            pendingDrafts.length ? "当前没有可展开的技能草案。" : "当前没有待审核技能草案。",
            buildMaintenanceReviewQuestion(runtime),
          );
          return true;
        }

        showChoicePopover(
          label,
          `当前共有 ${pendingDrafts.length} 份待审核技能草案，我先按草案逐条给你看。`,
          nextQuestion,
        );
        return true;
      }

      if (value === "maintenance:skills:approved") {
        const nextQuestion = buildApprovedSkillDraftListQuestion(runtime.skillDrafts);
        if (!nextQuestion) {
          showChoiceNotice(label, "当前还没有已批准技能草案。", buildMaintenanceReviewQuestion(runtime));
          return true;
        }

        showChoicePopover(
          label,
          "我先把已批准的技能草案按候选能力列给你，你可以继续回看内容和后续整理优先级。",
          nextQuestion,
        );
        return true;
      }

      if (value === "maintenance:skills:export-approved") {
        void runWorkflowActionShortcut("export_approved_skill_drafts", {}, label);
        return true;
      }

      if (value === "maintenance:skills:preview-approved") {
        showChoiceNotice(
          label,
          buildApprovedSkillDraftBundlePreviewMessage(runtime.skillDrafts),
          buildMaintenanceReviewQuestion(runtime),
        );
        return true;
      }

      if (value === "maintenance:skills:open-approved-dir") {
        void (async () => {
          try {
            const directoryPath = await resolveApprovedSkillDraftExportDirectory();
            const opener = window.electronAPI?.storage?.openFolder;
            if (!opener) {
              throw new Error("当前环境不支持直接打开本地目录。");
            }

            await opener(directoryPath);
            showChoiceNotice(
              label,
              `已为你打开技能候选目录：${directoryPath}`,
              buildMaintenanceReviewQuestion(runtimeRef.current),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "打开技能候选目录失败。";
            showChoiceNotice(label, message, buildMaintenanceReviewQuestion(runtimeRef.current));
          }
        })();
        return true;
      }

      if (value === "maintenance:skills:package-install-candidates") {
        void runWorkflowActionShortcut("export_approved_skill_install_candidates", {}, label);
        return true;
      }

      if (value === "maintenance:skills:preview-install-candidates") {
        showChoiceNotice(
          label,
          buildApprovedSkillInstallCandidatePreviewMessage(runtime.skillDrafts),
          buildMaintenanceReviewQuestion(runtime),
        );
        return true;
      }

      if (value === "maintenance:skills:open-install-candidates-dir") {
        void (async () => {
          try {
            const directoryPath = await resolveApprovedSkillInstallCandidateDirectory();
            const opener = window.electronAPI?.storage?.openFolder;
            if (!opener) {
              throw new Error("当前环境不支持直接打开本地目录。");
            }

            await opener(directoryPath);
            showChoiceNotice(
              label,
              `已为你打开正式 Skill 候选目录：${directoryPath}`,
              buildMaintenanceReviewQuestion(runtimeRef.current),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "打开正式 Skill 候选目录失败。";
            showChoiceNotice(label, message, buildMaintenanceReviewQuestion(runtimeRef.current));
          }
        })();
        return true;
      }

      if (value === "maintenance:skills:bundle-approved") {
        void runWorkflowActionShortcut("export_approved_skill_draft_bundle", {}, label);
        return true;
      }

      if (value.startsWith("maintenance:skill:")) {
        const draftId = value.replace("maintenance:skill:", "");
        const draft = findSkillDraft(runtime.skillDrafts, draftId);
        if (!draft) {
          showChoiceNotice(label, "这份技能草案已经不存在或已被清理。", buildMaintenanceReviewQuestion(runtime));
          return true;
        }

        showChoicePopover(label, buildSkillDraftSummaryMessage(draft), buildSkillDraftDecisionQuestion(draft));
        return true;
      }

      if (value.startsWith("maintenance:skill-approved:")) {
        const draftId = value.replace("maintenance:skill-approved:", "");
        const draft = findSkillDraft(runtime.skillDrafts, draftId);
        if (!draft) {
          showChoiceNotice(label, "这份已批准技能草案已经不存在或已被清理。", buildMaintenanceReviewQuestion(runtime));
          return true;
        }

        showChoiceNotice(label, buildSkillDraftSummaryMessage(draft), buildMaintenanceReviewQuestion(runtime));
        return true;
      }

      if (value.startsWith("maintenance:skill-approve:")) {
        const draftId = value.replace("maintenance:skill-approve:", "");
        void runWorkflowActionShortcut("approve_skill_draft", { draftId }, label);
        return true;
      }

      if (value.startsWith("maintenance:skill-reject:")) {
        const draftId = value.replace("maintenance:skill-reject:", "");
        void runWorkflowActionShortcut("reject_skill_draft", { draftId }, label);
        return true;
      }

      return false;
    },
    [
      buildApprovedSkillDraftListQuestion,
      buildSkillDraftDecisionQuestion,
      buildMaintenanceReviewQuestion,
      buildSkillDraftListQuestion,
      runWorkflowActionShortcut,
      runtimeRef,
      showChoiceNotice,
      showChoicePopover,
    ],
  );

  return {
    maintenanceChoiceHandler,
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
  };
}
