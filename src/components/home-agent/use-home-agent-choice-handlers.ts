import { useCallback, useMemo } from "react";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type {
  AgentConversationMode,
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioRuntimeState,
} from "@/lib/home-agent/types";
import { createScriptProjectChoiceHandler } from "./home-agent-script-choice-handlers";
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
        runWorkflowActionShortcutChain,
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
      runWorkflowActionShortcutChain,
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

  return {
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
  };
}
