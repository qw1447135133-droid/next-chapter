import { startTransition, useCallback, useRef } from "react";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import { readStudioProjectSession } from "@/lib/home-agent/session-store";
import {
  buildOriginalScriptKickoffIntro,
  buildOriginalScriptKickoffRequest,
  ORIGINAL_SCRIPT_TEMPLATE_ID,
} from "@/lib/home-agent/original-script-kickoff";
import type { ComposerQuestion, HomeAgentMessage, StudioQuestionState, StudioRuntimeState } from "@/lib/home-agent/types";
import type { AutoResearchPlan } from "@/lib/home-agent/auto-research";
import {
  buildAutoResearchChoiceQuestion,
  buildAutoResearchPlan,
  buildAutoResearchStepQuestion,
} from "@/lib/home-agent/auto-research";
import {
  applyAutoResearchOverlay,
  applyConversationMemoryOverlay,
  applyDreaminaContextOverlay,
  beginSendFlow,
  handleSendEngineEvent,
} from "./home-agent-send-flow";
import { createWorkflowShortcutUiBridge } from "./home-agent-workflow-ui";
import {
  getOrCreateHomeAgentEngine,
  launchHomeAgentAutoResearchTasks,
  type HomeAgentApiConfigModule,
  type HomeAgentEngineDeps,
} from "./home-agent-engine-runtime";
import { answerHomeAgentQuestion, launchTemplateConversation, resetHomeAgentConversation, resetRuntimeState } from "./home-agent-session-actions";
import { recQuestion } from "./home-agent-project-questions";
import { runWorkflowShortcut } from "@/lib/home-agent/workflow-shortcut-runner";
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
  loadWorkflowActionsModule: () => Promise<{
    runWorkflowAction: (
      action: string,
      input: Record<string, unknown>,
      runtime: StudioRuntimeState,
    ) => Promise<{ summary: string; projectSnapshot?: unknown; data?: unknown }>;
  }>;
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
  selectedTextModelKey: string;
  setPopoverOverride: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSuggested: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
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
    loadWorkflowActionsModule,
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
    selectedTextModelKey,
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
  const sendRunIdRef = useRef(0);
  const pendingAutoResearchPlanRef = useRef<AutoResearchPlan | null>(null);
  const pendingAutoResearchSelectionsRef = useRef<Record<string, string>>({});
  const streamingMessageIdRef = useRef<string | null>(null);

  const updateStreamingMessage = useCallback((updater: (message: HomeAgentMessage | null) => HomeAgentMessage) => {
    setMessages((prev) => {
      const sid = streamingMessageIdRef.current;
      if (!sid) {
        const next = updater(null);
        streamingMessageIdRef.current = next.id;
        return [...prev, next];
      }

      const index = prev.findIndex((message) => message.id === sid);
      if (index === -1) {
        const next = updater(null);
        streamingMessageIdRef.current = next.id;
        return [...prev, next];
      }

      const current = prev[index] ?? null;
      const next = updater(current);
      if (next.id !== sid) {
        streamingMessageIdRef.current = next.id;
      }
      return [...prev.slice(0, index), next, ...prev.slice(index + 1)];
    });
  }, [setMessages]);

  const appendStreamingDelta = useCallback((delta: string) => {
    updateStreamingMessage((message) => {
      if (message) {
        return {
          ...message,
          content: message.content + delta,
          status: "pending",
          streamLabel: "继续分析中",
        };
      }

      return {
        id: `streaming-${Date.now()}`,
        role: "assistant" as const,
        content: delta,
        createdAt: new Date().toISOString(),
        status: "pending",
        streamLabel: "继续分析中",
      };
    });
  }, [updateStreamingMessage]);

  const updateStreamingLabel = useCallback((label?: string) => {
    if (!streamingMessageIdRef.current) return;
    updateStreamingMessage((message) => ({
      ...(message ?? {
        id: `streaming-${Date.now()}`,
        role: "assistant" as const,
        content: "",
        createdAt: new Date().toISOString(),
      }),
      status: "pending",
      streamLabel: label || "继续分析中",
    }));
  }, [updateStreamingMessage]);

  const finalizeStreamingMessage = useCallback((finalText?: string) => {
    if (!streamingMessageIdRef.current) {
      if (typeof finalText === "string" && finalText.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: finalText.trim(),
            createdAt: new Date().toISOString(),
            status: "complete",
          },
        ]);
      }
      return;
    }

    updateStreamingMessage((message) => ({
      ...(message ?? {
        id: `streaming-${Date.now()}`,
        role: "assistant" as const,
        content: "",
        createdAt: new Date().toISOString(),
      }),
      content: typeof finalText === "string" && finalText.trim() ? finalText.trim() : message?.content ?? "",
      status: "complete",
      streamLabel: undefined,
    }));
    streamingMessageIdRef.current = null;
  }, [updateStreamingMessage]);

  const ensureStreamingMessage = useCallback((label = "正在分析") => {
    updateStreamingMessage((message) => ({
      ...(message ?? {
        id: `streaming-${Date.now()}`,
        role: "assistant" as const,
        content: "",
        createdAt: new Date().toISOString(),
      }),
      status: "pending",
      streamLabel: message?.streamLabel || label,
    }));
  }, [updateStreamingMessage]);

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
      selectedTextModelKey,
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
    selectedTextModelKey,
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
        selectedTextModelKey,
      }),
    [loadApiConfigModule, runtimeRef, selectedTextModelKey],
  );

  const send = useCallback(
    async (rawPrompt: string, shown?: string, sendOpts?: { skipUserBubble?: boolean }) => {
      const runId = sendRunIdRef.current + 1;
      sendRunIdRef.current = runId;
      const cleaned = beginSendFlow({
        prompt: rawPrompt,
        shown,
        push,
        setPopoverOverride,
        setSuggested,
        setMode,
        resetComposerDraft,
        skipUserBubble: sendOpts?.skipUserBubble,
      });
      if (!cleaned) return;

      const autoResearchPlan = buildAutoResearchPlan(cleaned, runtimeRef.current.currentProjectSnapshot);
      const canOfferQuickResearchChoice =
        !runtimeRef.current.currentProjectSnapshot && messagesRef.current.length <= 1;
      const hasTrackKeyword = /市场|风格|卖点|路线|平台|受众|改编|角色|出片/.test(cleaned);
      if (autoResearchPlan && canOfferQuickResearchChoice && hasTrackKeyword) {
        pendingAutoResearchPlanRef.current = autoResearchPlan;
        pendingAutoResearchSelectionsRef.current = {};
        push(
          "assistant",
          `我已整理出 3 个快捷研究任务：${autoResearchPlan.tasks.map((t) => t.title).join("、")}。现在按顺序确认：${autoResearchPlan.tasks.map((t) => t.title).join(" → ")}。`,
        );
        setPopoverOverride(null);
        setSuggested(buildAutoResearchChoiceQuestion(autoResearchPlan));
        setMode("active");
        return;
      }

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
      streamingMessageIdRef.current = null;
      ensureStreamingMessage();

      try {
        const activeEngine = await getEngine();
        const sendSessionId = runtimeRef.current.sessionId;
        for await (const event of activeEngine.submitMessage(promptForEngine)) {
          if (sendRunIdRef.current !== runId) break;
          if (engineRef.current !== activeEngine) break;
          if (runtimeRef.current.sessionId !== sendSessionId) break;
          await handleSendEngineEvent({
            event,
            loadStructuredQuestionParser,
            textOf,
            push,
            appendStreamingDelta,
            updateStreamingLabel,
            finalizeStreamingMessage,
            setQuestionRequest: (request) => setQState(createQuestionState(request)),
          });
        }
      } catch (error) {
        if (sendRunIdRef.current === runId) {
          streamingMessageIdRef.current = null;
          push("assistant", error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (sendRunIdRef.current === runId) {
          setStreaming(false);
        }
      }
    },
    [
      buildResearchPromptOverlay,
      createQuestionState,
      dreaminaCapability,
      engineRef,
      ensureStreamingMessage,
      finalizeStreamingMessage,
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
      sendRunIdRef,
      surfacedDreaminaHintRef,
      textOf,
      updateStreamingLabel,
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
        resolveQuestion: async (requestId, output) => {
          try {
            const mod = await loadAskUserQuestionModule();
            return mod.resolveAskUserQuestion(requestId, output);
          } catch {
            return false;
          }
        },
        completeOriginalScriptKickoff: async (completion) => {
          const workflow = await loadWorkflowActionsModule();
          const ui = createWorkflowShortcutUiBridge({
            activateConversation: () => setMode("active"),
            clearChoiceUi: () => {
              setPopoverOverride(null);
              setSuggested(null);
            },
            commitRuntime: (nextRuntime, projectId) => {
              startTransition(() => {
                setRuntime(nextRuntime);
                if (projectId) {
                  setActiveProjectId(projectId);
                }
              });
            },
            getSuggestedQuestion: (snapshot, nextRuntime) =>
              snapshot ? recQuestion(snapshot, nextRuntime.currentVideoProject) : null,
            push,
            resetComposerDraft,
            setPopoverQuestion: setPopoverOverride,
            setStreaming,
            setSuggested,
          });

          await runWorkflowShortcut({
            action: "save_setup",
            input: completion.setupInput,
            runtime: runtimeRef.current,
            runAction: (nextAction, nextInput, nextRuntime) =>
              workflow.runWorkflowAction(nextAction, nextInput, nextRuntime),
            ui,
            userBubble: completion.userBubble,
          });
        },
        setQState,
        setSelectedValues,
        resetComposerDraft,
      });
    },
    [
      loadAskUserQuestionModule,
      loadWorkflowActionsModule,
      push,
      qState,
      qStepKey,
      resetComposerDraft,
      runtimeRef,
      send,
      setActiveProjectId,
      setMode,
      setPopoverOverride,
      setQState,
      setRuntime,
      setSelectedValues,
      setStreaming,
      setSuggested,
    ],
  );

  const handleTemplateLaunch = useCallback(
    (templateId: string, templatePrompt: string, title: string) => {
      if (templateId === ORIGINAL_SCRIPT_TEMPLATE_ID) {
        if (qState?.source === "live") {
          void loadAskUserQuestionModule().then((mod) => {
            mod.rejectAskUserQuestion(qState.request.id, "User launched original script quick task");
          });
        }
        push("user", title);
        push("assistant", buildOriginalScriptKickoffIntro());
        setPopoverOverride(null);
        setSuggested(null);
        setSelectedValues([]);
        setMode("active");
        resetComposerDraft("");
        setQState(createQuestionState(buildOriginalScriptKickoffRequest(), "restored"));
        return;
      }

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
    [
      createQuestionState,
      dreaminaCapability.available,
      flashMaintenanceHint,
      loadAskUserQuestionModule,
      push,
      qState,
      resetComposerDraft,
      send,
      setMode,
      setPopoverOverride,
      setQState,
      setSelectedValues,
      setSuggested,
      surfacedDreaminaHintRef,
    ],
  );

  const autoResearchChoiceHandler = useCallback(
    async (value: string, _label: string): Promise<boolean> => {
      if (!value.startsWith("auto-research:")) return false;
      const plan = pendingAutoResearchPlanRef.current;
      if (!plan) return true;
      const stepMatch = value.match(/^auto-research:step:(\d+):pick:(.+)$/);
      if (!stepMatch) return true;
      const [, stepIndexRaw] = stepMatch;
      const stepIndex = Number.parseInt(stepIndexRaw, 10);
      if (!Number.isFinite(stepIndex)) return true;
      const currentTask = plan.tasks[stepIndex];
      if (!currentTask) return true;

      pendingAutoResearchSelectionsRef.current[currentTask.id] = _label;

      const nextStepIndex = stepIndex + 1;
      const nextQuestion = buildAutoResearchStepQuestion(plan, nextStepIndex);
      if (nextQuestion) {
        setSuggested(nextQuestion);
        return true;
      }

      const selectedSummary = plan.tasks.map((task) => {
        const chosen = pendingAutoResearchSelectionsRef.current[task.id] ?? "暂不确定（默认建议）";
        return `${task.title}：${chosen}`;
      });
      const planOverride: AutoResearchPlan = {
        ...plan,
        tasks: plan.tasks.map((task) => {
          const chosen = pendingAutoResearchSelectionsRef.current[task.id] ?? "暂不确定（请先给默认建议）";
          return {
            ...task,
            prompt: `${task.prompt}\n\n用户已完成前置选择：${selectedSummary.join("；")}。\n当前任务重点选择：${task.title}=${chosen}。请严格围绕该选择给结论。`,
          };
        }),
      };
      const taskIdFilter = plan.tasks.map((task) => task.id);
      const selectedTitles = plan.tasks.map((task) => task.title);

      try {
        const launched = await launchHomeAgentAutoResearchTasks({
          prompt: "",
          runtime: runtimeRef.current,
          loadApiConfigModule,
          selectedTextModelKey,
          planOverride,
          taskIdFilter,
          sequential: true,
        });
        if (!launched) {
          push("assistant", "未能启动研究任务，请稍后重试。");
          return true;
        }
        push(
          "assistant",
          `已按顺序启动：${selectedTitles.join("、")}。你可以继续补充要求，结果会自动回流到当前会话。`,
        );
      } catch (error) {
        push("assistant", error instanceof Error ? error.message : "启动研究任务失败。");
      } finally {
        pendingAutoResearchPlanRef.current = null;
        pendingAutoResearchSelectionsRef.current = {};
        setSuggested(null);
        setPopoverOverride(null);
      }

      return true;
    },
    [loadApiConfigModule, push, runtimeRef, selectedTextModelKey, setPopoverOverride, setSuggested],
  );

  return {
    resolveDreaminaCapability,
    send,
    reset,
    answer,
    handleTemplateLaunch,
    autoResearchChoiceHandler,
  };
}
