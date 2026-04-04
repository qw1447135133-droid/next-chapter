import { startTransition, useCallback } from "react";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import { readStudioProjectSession } from "@/lib/home-agent/session-store";
import type { HomeAgentMessage, StudioQuestionState, StudioRuntimeState } from "@/lib/home-agent/types";
import type { AutoResearchPlan } from "@/lib/home-agent/auto-research";
import {
  applyAutoResearchOverlay,
  applyConversationMemoryOverlay,
  applyDreaminaContextOverlay,
  beginSendFlow,
  handleSendEngineEvent,
} from "./home-agent-send-flow";
import {
  getOrCreateHomeAgentEngine,
  launchHomeAgentAutoResearchTasks,
  type HomeAgentApiConfigModule,
  type HomeAgentEngineDeps,
} from "./home-agent-engine-runtime";
import { answerHomeAgentQuestion, launchTemplateConversation, resetHomeAgentConversation, resetRuntimeState } from "./home-agent-session-actions";
import { buildDreaminaCapabilityOverlay, isVideoIntentPrompt } from "./home-agent-project-questions";
import type {
  AskUserQuestionModule,
  ConversationMemoryModule,
  DreaminaCliModule,
  ProjectStoreModule,
  StructuredQuestionParserModule,
} from "./use-home-agent-module-loaders";

type DreaminaCapabilityState = {
  ready: boolean;
  available: boolean;
  message?: string;
};

export function useHomeAgentRuntimeActions(params: {
  systemPrompt: string;
  qState: StudioQuestionState | null;
  engineRef: React.MutableRefObject<Awaited<ReturnType<typeof getOrCreateHomeAgentEngine>> | null>;
  runtimeRef: React.MutableRefObject<StudioRuntimeState>;
  messagesRef: React.MutableRefObject<HomeAgentMessage[]>;
  compactedMessageCountRef: React.MutableRefObject<number>;
  surfacedTaskIdsRef: React.MutableRefObject<Set<string>>;
  surfacedTaskFollowupIdsRef: React.MutableRefObject<Set<string>>;
  surfacedDreaminaHintRef: React.MutableRefObject<boolean>;
  loadEngineDeps: () => Promise<HomeAgentEngineDeps>;
  loadApiConfigModule: () => Promise<HomeAgentApiConfigModule>;
  loadStructuredQuestionParser: () => Promise<StructuredQuestionParserModule>;
  loadConversationMemoryModule: () => Promise<ConversationMemoryModule>;
  loadProjectStore: () => Promise<ProjectStoreModule>;
  loadAskUserQuestionModule: () => Promise<AskUserQuestionModule>;
  loadDreaminaCliModule: () => Promise<DreaminaCliModule>;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  resetComposerDraft: (value?: string) => void;
  dreaminaCapability: DreaminaCapabilityState;
  setDreaminaCapability: React.Dispatch<React.SetStateAction<DreaminaCapabilityState>>;
  buildResearchPromptOverlay: (plan: AutoResearchPlan, taskIds: string[]) => string;
  createQuestionState: (request: AskUserQuestionRequest) => StudioQuestionState;
  toQuery: (messages: HomeAgentMessage[]) => { role: "user" | "assistant" | "system"; content: string }[];
  textOf: (value: unknown) => string;
  qStepKey: (index: number, question: { header?: string }) => string;
  push: (role: HomeAgentMessage["role"], content: string) => void;
  setPopoverOverride: React.Dispatch<React.SetStateAction<null>>;
  setSuggested: React.Dispatch<React.SetStateAction<null>>;
  setMode: React.Dispatch<React.SetStateAction<"idle" | "active" | "recovering" | "maintenance-review">>;
  setQState: React.Dispatch<React.SetStateAction<StudioQuestionState | null>>;
  setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>;
  setCompactedMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setMessages: React.Dispatch<React.SetStateAction<HomeAgentMessage[]>>;
  setMetaReady: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
}) {
  const {
    systemPrompt,
    qState,
    engineRef,
    runtimeRef,
    messagesRef,
    compactedMessageCountRef,
    surfacedTaskIdsRef,
    surfacedTaskFollowupIdsRef,
    surfacedDreaminaHintRef,
    loadEngineDeps,
    loadApiConfigModule,
    loadStructuredQuestionParser,
    loadConversationMemoryModule,
    loadProjectStore,
    loadAskUserQuestionModule,
    loadDreaminaCliModule,
    flashMaintenanceHint,
    resetComposerDraft,
    dreaminaCapability,
    setDreaminaCapability,
    buildResearchPromptOverlay,
    createQuestionState,
    toQuery,
    textOf,
    qStepKey,
    push,
    setPopoverOverride,
    setSuggested,
    setMode,
    setQState,
    setSelectedValues,
    setStreaming,
    setRuntime,
    setCompactedMessageCount,
    setMessages,
    setMetaReady,
    setActiveProjectId,
  } = params;

  const resolveDreaminaCapability = useCallback(async (): Promise<DreaminaCapabilityState> => {
    if (dreaminaCapability.ready) return dreaminaCapability;
    if (!window.electronAPI?.dreaminaCli?.exec) {
      const fallback = { ready: true, available: false } satisfies DreaminaCapabilityState;
      setDreaminaCapability(fallback);
      return fallback;
    }

    try {
      const mod = await loadDreaminaCliModule();
      const status = await mod.dreaminaCliGetStatus();
      const next = {
        ready: true,
        available: status.loggedIn,
        message: status.message,
      } satisfies DreaminaCapabilityState;
      startTransition(() => {
        setDreaminaCapability(next);
      });
      return next;
    } catch {
      const fallback = { ready: true, available: false } satisfies DreaminaCapabilityState;
      setDreaminaCapability(fallback);
      return fallback;
    }
  }, [dreaminaCapability, loadDreaminaCliModule, setDreaminaCapability]);

  const getEngine = useCallback(async () => {
    engineRef.current = await getOrCreateHomeAgentEngine({
      existingEngine: engineRef.current,
      loadEngineDeps,
      loadApiConfigModule,
      messages: messagesRef.current,
      compactedMessageCount: compactedMessageCountRef.current,
      recentMessageSummary: runtimeRef.current.recentMessageSummary,
      systemPrompt,
      toQuery,
      getAppState: () => runtimeRef.current,
      setRuntime,
      setCompactedMessageCount: (count) => {
        compactedMessageCountRef.current = count;
        setCompactedMessageCount(count);
      },
    });
    return engineRef.current;
  }, [
    compactedMessageCountRef,
    engineRef,
    loadApiConfigModule,
    loadEngineDeps,
    messagesRef,
    systemPrompt,
    runtimeRef,
    setCompactedMessageCount,
    setRuntime,
    toQuery,
  ]);

  const launchAutoResearchTasks = useCallback(
    async (nextPrompt: string) =>
      launchHomeAgentAutoResearchTasks({
        prompt: nextPrompt,
        runtime: runtimeRef.current,
        loadApiConfigModule,
      }),
    [loadApiConfigModule, runtimeRef],
  );

  const send = useCallback(
    async (rawPrompt: string, shown?: string) => {
      const cleaned = beginSendFlow({
        prompt: rawPrompt,
        shown,
        push,
        setPopoverOverride,
        setSuggested,
        setMode,
        resetComposerDraft,
      });
      if (!cleaned) return;

      let promptForEngine = await applyAutoResearchOverlay({
        cleaned,
        launchAutoResearchTasks,
        push,
        buildResearchPromptOverlay,
      });
      promptForEngine = await applyConversationMemoryOverlay({
        cleaned,
        promptForEngine,
        runtime: runtimeRef.current,
        loadConversationMemoryModule,
        loadProjectStore,
        readProjectSession: readStudioProjectSession,
        flashMaintenanceHint,
      });
      const dreaminaPromptState = await applyDreaminaContextOverlay({
        cleaned,
        promptForEngine,
        currentProjectSnapshot: runtimeRef.current.currentProjectSnapshot,
        dreaminaCapability,
        resolveDreaminaCapability,
        isVideoIntentPrompt,
        buildDreaminaCapabilityOverlay,
        flashMaintenanceHint,
        hasSurfacedHint: surfacedDreaminaHintRef.current,
      });
      promptForEngine = dreaminaPromptState.promptForEngine;
      surfacedDreaminaHintRef.current = dreaminaPromptState.surfacedHint;

      setStreaming(true);

      try {
        const activeEngine = await getEngine();
        for await (const event of activeEngine.submitMessage(promptForEngine)) {
          await handleSendEngineEvent({
            event,
            loadStructuredQuestionParser,
            textOf,
            push,
            setQuestionRequest: (request) => setQState(createQuestionState(request)),
          });
        }
      } catch (error) {
        push("assistant", error instanceof Error ? error.message : String(error));
      } finally {
        setStreaming(false);
      }
    },
    [
      buildResearchPromptOverlay,
      createQuestionState,
      dreaminaCapability,
      flashMaintenanceHint,
      getEngine,
      launchAutoResearchTasks,
      loadConversationMemoryModule,
      loadProjectStore,
      loadStructuredQuestionParser,
      push,
      resetComposerDraft,
      resolveDreaminaCapability,
      runtimeRef,
      setMode,
      setPopoverOverride,
      setQState,
      setStreaming,
      setSuggested,
      surfacedDreaminaHintRef,
      textOf,
    ],
  );

  const reset = useCallback(() => {
    resetHomeAgentConversation({
      qState,
      rejectQuestion: (requestId) => {
        void loadAskUserQuestionModule().then((mod) => {
          mod.rejectAskUserQuestion(requestId, "User reset conversation");
        });
      },
      interruptEngine: () => {
        engineRef.current?.interrupt();
        engineRef.current = null;
      },
      clearSurfacedTasks: () => {
        surfacedTaskIdsRef.current.clear();
        surfacedTaskFollowupIdsRef.current.clear();
      },
      setQState,
      setPopoverOverride,
      setSuggested,
      setSelectedValues,
      setMode,
      setMessages,
      resetComposerDraft,
      setCompactedMessageCount,
      setActiveProjectId,
      resetRuntime: () => resetRuntimeState(setRuntime),
      setMetaReady,
    });
  }, [
    engineRef,
    loadAskUserQuestionModule,
    qState,
    resetComposerDraft,
    setActiveProjectId,
    setCompactedMessageCount,
    setMessages,
    setMetaReady,
    setMode,
    setPopoverOverride,
    setQState,
    setRuntime,
    setSelectedValues,
    setSuggested,
    surfacedTaskFollowupIdsRef,
    surfacedTaskIdsRef,
  ]);

  const answer = useCallback(
    (value: string, label?: string) => {
      answerHomeAgentQuestion({
        qState,
        value,
        label,
        qStepKey,
        setSuggested,
        send,
        push,
        resolveQuestion: (requestId, output) => {
          void loadAskUserQuestionModule().then((mod) => {
            mod.resolveAskUserQuestion(requestId, output);
          });
        },
        setQState,
        setSelectedValues,
        resetComposerDraft,
      });
    },
    [loadAskUserQuestionModule, push, qState, qStepKey, resetComposerDraft, send, setQState, setSelectedValues, setSuggested],
  );

  const handleTemplateLaunch = useCallback(
    (templatePrompt: string, title: string) => {
      launchTemplateConversation({
        prompt: templatePrompt,
        title,
        dreaminaAvailable: dreaminaCapability.available,
        flashMaintenanceHint,
        markDreaminaSurfaced: () => {
          surfacedDreaminaHintRef.current = true;
        },
        send,
      });
    },
    [dreaminaCapability.available, flashMaintenanceHint, send, surfacedDreaminaHintRef],
  );

  return {
    resolveDreaminaCapability,
    send,
    reset,
    answer,
    handleTemplateLaunch,
  };
}
