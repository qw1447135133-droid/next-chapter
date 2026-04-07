import * as React from "react";
import { readStudioProjectSession } from "@/lib/home-agent/session-store";
import { buildOpenProjectSessionState } from "./home-agent-conversation-state";
import type { ComposerQuestion, ConversationProjectSnapshot, HomeAgentMessage, StudioQuestionState, StudioRuntimeState } from "@/lib/home-agent/types";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import { brief, recQuestion } from "./home-agent-project-questions";
import { normalizeHomeAgentTextModelKey } from "@/lib/home-agent/text-models";

const { useCallback, useEffect, useRef, startTransition } = React;

type DreaminaCapabilityState = {
  ready: boolean;
  available: boolean;
  message?: string;
};

export function useHomeAgentRecoveryFlow(params: {
  handoffRef: React.MutableRefObject<boolean>;
  engineRef: React.MutableRefObject<{ interrupt?: () => void } | null>;
  loadProjectStore: () => Promise<typeof import("@/lib/home-agent/project-store")>;
  loadAskUserQuestionModule: () => Promise<typeof import("@/lib/agent/tools/ask-user-question")>;
  qState: StudioQuestionState | null;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setSelectedTextModelKey: React.Dispatch<React.SetStateAction<string>>;
  setQState: React.Dispatch<React.SetStateAction<StudioQuestionState | null>>;
  setPopoverOverride: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSuggested: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setMode: React.Dispatch<React.SetStateAction<"idle" | "active" | "recovering" | "maintenance-review">>;
  setMessages: React.Dispatch<React.SetStateAction<HomeAgentMessage[]>>;
  setCompactedMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>;
  setMetaReady: React.Dispatch<React.SetStateAction<boolean>>;
  resetComposerDraft: (value?: string) => void;
  previousQuestionStepRef: React.MutableRefObject<string | null>;
  clearSurfacedTasks: () => void;
  surfacedTaskIdsRef: React.MutableRefObject<Set<string>>;
  surfacedTaskFollowupIdsRef: React.MutableRefObject<Set<string>>;
  surfacedProjectSuggestionKeysRef: React.MutableRefObject<Set<string>>;
  restoredProjectSuggestionKeysRef: React.MutableRefObject<Set<string>>;
  dreaminaCapability: DreaminaCapabilityState;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  surfacedDreaminaHintRef: React.MutableRefObject<boolean>;
  send: (prompt: string, shown?: string) => Promise<void>;
  createQuestionState: (request: AskUserQuestionRequest) => StudioQuestionState;
  mk: (role: HomeAgentMessage["role"], content: string) => HomeAgentMessage;
  mergeRecentProjects: (
    currentProjects: ConversationProjectSnapshot[],
    nextProject: ConversationProjectSnapshot,
    limit?: number,
  ) => ConversationProjectSnapshot[];
}) {
  const {
    handoffRef,
    engineRef,
    loadProjectStore,
    loadAskUserQuestionModule,
    qState,
    setActiveProjectId,
    setSelectedTextModelKey,
    setQState,
    setPopoverOverride,
    setSuggested,
    setSelectedValues,
    setStreaming,
    setMode,
    setMessages,
    setCompactedMessageCount,
    setRuntime,
    setMetaReady,
    resetComposerDraft,
    previousQuestionStepRef,
    clearSurfacedTasks,
    surfacedTaskIdsRef,
    surfacedTaskFollowupIdsRef,
    surfacedProjectSuggestionKeysRef,
    restoredProjectSuggestionKeysRef,
    dreaminaCapability,
    flashMaintenanceHint,
    surfacedDreaminaHintRef,
    send,
    createQuestionState,
    mk,
    mergeRecentProjects,
  } = params;
  const openProjectVersionRef = useRef(0);

  const openProject = useCallback(
    async (projectId: string) => {
      const openVersion = openProjectVersionRef.current + 1;
      openProjectVersionRef.current = openVersion;
      const requestId = qState?.request.id;
      if (requestId) {
        void loadAskUserQuestionModule().then((mod) => {
          mod.rejectAskUserQuestion(requestId, "User switched project");
        });
      }

      engineRef.current?.interrupt?.();
      engineRef.current = null;
      clearSurfacedTasks();

      startTransition(() => {
        setStreaming(false);
        setQState(null);
        setPopoverOverride(null);
        setSuggested(null);
        setSelectedValues([]);
      });

      const store = await loadProjectStore();
      const savedSession = readStudioProjectSession(projectId);
      const source = await store.loadConversationSourceById(projectId);
      const snapshot = source.snapshot ?? savedSession?.currentProjectSnapshot;
      if (openProjectVersionRef.current !== openVersion) return;
      if (!snapshot) return;

      startTransition(() => {
        const nextState = buildOpenProjectSessionState({
          savedSession,
          snapshot,
          videoProject: source.videoProject,
          buildBrief: brief,
          createAssistantMessage: (content) => mk("assistant", content),
          getSuggestedQuestion: recQuestion,
        });
        restoredProjectSuggestionKeysRef.current = new Set(nextState.surfacedProjectSuggestionKeys);

        setActiveProjectId(projectId);
        if (nextState.selectedTextModelKey) {
          setSelectedTextModelKey(normalizeHomeAgentTextModelKey(nextState.selectedTextModelKey));
        }
        setQState(nextState.qState);
        setPopoverOverride(nextState.popoverOverride);
        setSuggested(nextState.suggested);
        setSelectedValues(nextState.selectedValues);
        setMode(nextState.mode);
        setMessages(nextState.messages);
        resetComposerDraft(nextState.draft);
        setCompactedMessageCount(nextState.compactedMessageCount);
        previousQuestionStepRef.current = nextState.previousQuestionStep;
        surfacedTaskIdsRef.current = new Set(nextState.surfacedTaskIds);
        surfacedTaskFollowupIdsRef.current = new Set(nextState.surfacedTaskFollowupKeys);
        surfacedProjectSuggestionKeysRef.current = new Set(nextState.surfacedProjectSuggestionKeys);

        setRuntime((prev) => ({
          ...prev,
          sessionId: nextState.sessionId,
          currentProjectSnapshot: snapshot,
          currentDramaProject: source.dramaProject,
          currentVideoProject: source.videoProject,
          recentProjects: mergeRecentProjects(prev.recentProjects, snapshot),
          recentMessageSummary: savedSession?.recentMessageSummary ?? "",
        }));
      });
      if (dreaminaCapability.available && snapshot.projectKind === "video") {
        flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2400);
        surfacedDreaminaHintRef.current = true;
      }
      setMetaReady(false);
    },
    [
      clearSurfacedTasks,
      dreaminaCapability.available,
      engineRef,
      flashMaintenanceHint,
      loadAskUserQuestionModule,
      loadProjectStore,
      mergeRecentProjects,
      mk,
      previousQuestionStepRef,
      qState,
      resetComposerDraft,
      setActiveProjectId,
      setSelectedTextModelKey,
      setCompactedMessageCount,
      setMessages,
      setMetaReady,
      setMode,
      setPopoverOverride,
      setQState,
      setRuntime,
      setSelectedValues,
      setSuggested,
      setStreaming,
      surfacedTaskFollowupIdsRef,
      surfacedTaskIdsRef,
      surfacedProjectSuggestionKeysRef,
      restoredProjectSuggestionKeysRef,
      surfacedDreaminaHintRef,
    ],
  );

  useEffect(() => {
    if (handoffRef.current) return;
    handoffRef.current = true;

    void import("@/lib/agent-intake").then((mod) => {
      const handoff = mod.consumeAgentHandoff("script-creator");
      if (!handoff) return;
      if (handoff.resumeProjectId) {
        void openProject(handoff.resumeProjectId);
        return;
      }
      if (handoff.prompt.trim()) void send(handoff.prompt, handoff.title);
    });
  }, [handoffRef, openProject, send]);

  useEffect(() => {
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<AskUserQuestionRequest>).detail;
      if (!detail?.questions?.length) return;
      startTransition(() => {
        setPopoverOverride(null);
        setSuggested(null);
        setQState(createQuestionState(detail));
        setSelectedValues([]);
        resetComposerDraft("");
        setMode("active");
      });
    };

    window.addEventListener("agent:ask-user-question", onAsk);
    return () => window.removeEventListener("agent:ask-user-question", onAsk);
  }, [createQuestionState, resetComposerDraft, setMode, setPopoverOverride, setQState, setSelectedValues, setSuggested]);

  return { openProject };
}
