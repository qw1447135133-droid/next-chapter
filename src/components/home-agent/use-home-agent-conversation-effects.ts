import * as React from "react";
import { clearStudioSession, writeStudioSession } from "@/lib/home-agent/session-store";
import { planConversationCompaction } from "@/lib/home-agent/conversation-compact";
import { buildResearchFollowupQuestion } from "@/lib/home-agent/auto-research";
import { mergeRuntimeWithWorkflowDelta } from "@/lib/home-agent/workflow-shortcut-runner";
import { resolveHomeAgentTextModelRuntime } from "@/lib/home-agent/text-models";
import type {
  HomeAgentMessage,
  ComposerQuestion,
  ConversationProjectSnapshot,
  MaintenanceReport,
  StudioQuestionState,
  StudioRuntimeState,
} from "@/lib/home-agent/types";
import type { Task } from "@/lib/agent/tools/task-tools";
import { recQuestion } from "./home-agent-project-questions";

const { useEffect, useRef, startTransition } = React;

export function useHomeAgentConversationEffects(params: {
  idle: boolean;
  streaming: boolean;
  messages: HomeAgentMessage[];
  runtime: StudioRuntimeState;
  compactedMessageCount: number;
  activeProjectId?: string;
  mode: StudioRuntimeState["sessionId"] extends string ? string : string;
  qState: StudioQuestionState | null;
  popoverOverride: ComposerQuestion | null;
  suggested: ComposerQuestion | null;
  draftPresence: boolean;
  persistedDraft: string;
  recentSessionSummary: string;
  selectedValues: string[];
  selectedTextModelKey: string;
  deferredMessages: HomeAgentMessage[];
  deferredProjectSnapshot: ConversationProjectSnapshot | null;
  visibleTasks: Task[];
  endRef: React.RefObject<HTMLDivElement | null>;
  engineRef: React.MutableRefObject<{ interrupt?: () => void } | null>;
  runtimeRef: React.MutableRefObject<StudioRuntimeState>;
  draftRef: React.MutableRefObject<string>;
  previousQuestionStepRef: React.MutableRefObject<string | null>;
  surfacedTaskIdsRef: React.MutableRefObject<Set<string>>;
  surfacedTaskFollowupIdsRef: React.MutableRefObject<Set<string>>;
  surfacedProjectSuggestionKeysRef: React.MutableRefObject<Set<string>>;
  restoredProjectSuggestionKeysRef: React.MutableRefObject<Set<string>>;
  compactionJobVersionRef: React.MutableRefObject<number>;
  setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>;
  setCompactedMessageCount: React.Dispatch<React.SetStateAction<number>>;
  setSuggested: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setPopoverOverride: React.Dispatch<React.SetStateAction<ComposerQuestion | null>>;
  setSelectedValues: React.Dispatch<React.SetStateAction<string[]>>;
  resetComposerDraft: (value?: string) => void;
  push: (role: HomeAgentMessage["role"], content: string) => void;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  loadApiConfigModule: () => Promise<typeof import("@/lib/api-config")>;
  loadSemanticSummaryModule: () => Promise<typeof import("@/lib/home-agent/conversation-semantic-summary")>;
  loadProjectStore: () => Promise<typeof import("@/lib/home-agent/project-store")>;
  loadWorkflowActionsModule: () => Promise<typeof import("@/lib/home-agent/workflow-actions")>;
  scheduleBackgroundTask: (task: () => void, timeout?: number) => () => void;
  mergeRecentProjects: (
    currentProjects: ConversationProjectSnapshot[],
    nextProject: ConversationProjectSnapshot,
    limit?: number,
  ) => ConversationProjectSnapshot[];
  buildTaskResultMessage: (task: Task) => string;
  buildProjectSuggestionKey: (
    snapshot: ConversationProjectSnapshot | null | undefined,
    question: ComposerQuestion | null | undefined,
  ) => string | null;
  parseTaskHeading: (prompt: string) => string | null;
}) {
  const {
    idle,
    streaming,
    messages,
    runtime,
    compactedMessageCount,
    activeProjectId,
    mode,
    qState,
    popoverOverride,
    suggested,
    draftPresence,
    persistedDraft,
    recentSessionSummary,
    selectedValues,
    selectedTextModelKey,
    deferredMessages,
    deferredProjectSnapshot,
    visibleTasks,
    endRef,
    engineRef,
    runtimeRef,
    draftRef,
    previousQuestionStepRef,
    surfacedTaskIdsRef,
    surfacedTaskFollowupIdsRef,
    surfacedProjectSuggestionKeysRef,
    restoredProjectSuggestionKeysRef,
    compactionJobVersionRef,
    setRuntime,
    setCompactedMessageCount,
    setSuggested,
    setPopoverOverride,
    setSelectedValues,
    resetComposerDraft,
    push,
    flashMaintenanceHint,
    loadApiConfigModule,
    loadSemanticSummaryModule,
    loadProjectStore,
    loadWorkflowActionsModule,
    scheduleBackgroundTask,
    mergeRecentProjects,
    buildTaskResultMessage,
    buildProjectSuggestionKey,
    parseTaskHeading,
  } = params;
  const videoRefreshInFlightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (qState || streaming || popoverOverride) return;
    if (draftPresence) return;
    if (!runtime.currentProjectSnapshot) {
      setSuggested((previous) =>
        previous?.id && !previous.id.startsWith("auto-research:")
          ? null
          : previous,
      );
      return;
    }

    const nextSuggestion = recQuestion(runtime.currentProjectSnapshot, runtime.currentVideoProject);
    const suggestionKey = buildProjectSuggestionKey(runtime.currentProjectSnapshot, nextSuggestion);
    setSuggested((previous) => {
      if (suggestionKey && restoredProjectSuggestionKeysRef.current.has(suggestionKey)) {
        restoredProjectSuggestionKeysRef.current.delete(suggestionKey);
        return previous?.id ? null : previous;
      }
      // If this suggestion was already surfaced and dismissed (previous is null), don't re-show it
      if (suggestionKey && surfacedProjectSuggestionKeysRef.current.has(suggestionKey) && !previous) {
        return null;
      }
      const previousId = previous?.id ?? null;
      const nextId = nextSuggestion?.id ?? null;
      if (previousId === nextId) return previous;
      if (suggestionKey && nextSuggestion) {
        surfacedProjectSuggestionKeysRef.current.add(suggestionKey);
      }
      return nextSuggestion;
    });
  }, [
    buildProjectSuggestionKey,
    draftPresence,
    popoverOverride,
    qState,
    runtime.currentProjectSnapshot,
    runtime.maintenanceReports,
    runtime.currentVideoProject,
    runtime.skillDrafts,
    streaming,
    suggested,
    setSuggested,
    surfacedProjectSuggestionKeysRef,
    restoredProjectSuggestionKeysRef,
  ]);

  useEffect(() => {
    const stepKey = qState ? `${qState.request.id}:${qState.currentIndex}` : null;
    if (stepKey === previousQuestionStepRef.current) return;
    previousQuestionStepRef.current = stepKey;
    if (!stepKey) return;
    setPopoverOverride(null);
    setSelectedValues([]);
    resetComposerDraft("");
  }, [previousQuestionStepRef, qState, resetComposerDraft, setPopoverOverride, setSelectedValues]);

  useEffect(() => {
    if (idle || streaming) return;

    const plan = planConversationCompaction(messages, compactedMessageCount, runtime.recentMessageSummary);
    if (!plan.shouldCompact) return;

    engineRef.current?.interrupt?.();
    engineRef.current = null;
    const maintenanceReport: MaintenanceReport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      summary: "已静默压缩首页长会话，保留最近上下文与项目摘要。",
      compressedConversationCount: 1,
      archivedProjectCount: 0,
      clearedCacheKeys: [],
      mergedDraftCount: 0,
      notes: [
        runtime.currentProjectSnapshot
          ? `当前项目：${runtime.currentProjectSnapshot.title} / ${runtime.currentProjectSnapshot.derivedStage}`
          : "当前没有绑定项目。",
        `本次整理压缩了 ${plan.compactedMessages.length} 条较早消息。`,
      ],
    };
    setCompactedMessageCount(plan.nextCompactedMessageCount);
    setRuntime((prev) => ({
      ...prev,
      maintenanceReports: [maintenanceReport, ...prev.maintenanceReports].slice(0, 20),
      recentMessageSummary: plan.nextSummary,
    }));
    flashMaintenanceHint("较早对话已静默整理");

    void loadProjectStore()
      .then((store) => {
        const nextReports = [maintenanceReport, ...store.readMaintenanceReports()].slice(0, 20);
        store.writeMaintenanceReports(nextReports);
      })
      .catch(() => {
        // Keep the in-memory report even if persistence fails.
      });

    const jobVersion = compactionJobVersionRef.current + 1;
    compactionJobVersionRef.current = jobVersion;
    const baseSummary = runtime.recentMessageSummary;
    const jobSessionId = runtimeRef.current.sessionId;

    void (async () => {
      try {
        const [semanticSummary, apiConfig] = await Promise.all([
          loadSemanticSummaryModule(),
          loadApiConfigModule(),
        ]);
        const resolvedRuntime = resolveHomeAgentTextModelRuntime(apiConfig, selectedTextModelKey);
        if (!resolvedRuntime.apiKey) return;
        const refinedSummary = await semanticSummary.refineCompactedConversationSummary({
          existingSummary: baseSummary,
          compactedMessages: plan.compactedMessages,
          projectSnapshot: runtimeRef.current.currentProjectSnapshot,
          apiKey: resolvedRuntime.apiKey,
          baseUrl: resolvedRuntime.baseUrl,
          model: resolvedRuntime.model,
        });

        if (!refinedSummary.trim()) return;
        if (compactionJobVersionRef.current !== jobVersion) return;
        if (runtimeRef.current.sessionId !== jobSessionId) return;
        if (refinedSummary.trim() === plan.nextSummary.trim()) return;

        startTransition(() => {
          setRuntime((prev) => ({
            ...prev,
            recentMessageSummary: refinedSummary,
          }));
        });
      } catch {
        // Keep the deterministic summary on failure.
      }
    })();

  }, [
    compactedMessageCount,
    compactionJobVersionRef,
    engineRef,
    flashMaintenanceHint,
    idle,
    loadApiConfigModule,
    loadProjectStore,
    loadSemanticSummaryModule,
    messages,
    runtime.currentProjectSnapshot,
    runtime.recentMessageSummary,
    runtimeRef,
    selectedTextModelKey,
    setCompactedMessageCount,
    setRuntime,
    streaming,
  ]);

  useEffect(() => {
    if (idle) {
      clearStudioSession();
      return;
    }

    const cancelTask = scheduleBackgroundTask(() => {
      writeStudioSession({
        sessionId: runtimeRef.current.sessionId,
        mode,
        messages: deferredMessages,
        currentProjectSnapshot: deferredProjectSnapshot,
        recentMessageSummary: compactedMessageCount > 0 ? runtime.recentMessageSummary : recentSessionSummary,
        projectId: activeProjectId,
        selectedTextModelKey,
        compactedMessageCount,
        draft: draftRef.current || persistedDraft,
        qState,
        selectedValues,
        surfacedTaskIds: [...surfacedTaskIdsRef.current],
        surfacedTaskFollowupKeys: [...surfacedTaskFollowupIdsRef.current],
        surfacedProjectSuggestionKeys: [...surfacedProjectSuggestionKeysRef.current],
      });
    }, 720);

    return cancelTask;
  }, [
    activeProjectId,
    compactedMessageCount,
    deferredMessages,
    deferredProjectSnapshot,
    draftRef,
    idle,
    mode,
    persistedDraft,
    qState,
    recentSessionSummary,
    runtime.recentMessageSummary,
    runtimeRef,
    scheduleBackgroundTask,
    selectedValues,
    selectedTextModelKey,
    surfacedProjectSuggestionKeysRef,
    surfacedTaskFollowupIdsRef,
    surfacedTaskIdsRef,
  ]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (runtime.currentDramaProject || runtime.currentVideoProject) return;

    let cancelled = false;

    void loadProjectStore()
      .then((store) => store.loadConversationSourceById(activeProjectId))
      .then((source) => {
        if (cancelled || !source.snapshot) return;

        startTransition(() => {
          setRuntime((prev) => ({
            ...prev,
            currentProjectSnapshot: source.snapshot,
            currentDramaProject: source.dramaProject,
            currentVideoProject: source.videoProject,
            recentProjects: mergeRecentProjects(prev.recentProjects, source.snapshot),
          }));
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    activeProjectId,
    loadProjectStore,
    mergeRecentProjects,
    runtime.currentDramaProject,
    runtime.currentVideoProject,
    setRuntime,
  ]);

  useEffect(() => {
    if (idle) return;

    const project = runtime.currentVideoProject;
    const snapshotProjectId = runtime.currentProjectSnapshot?.projectId;
    if (!project || snapshotProjectId !== project.id) return;

    const runningScenes = project.scenes.filter(
      (scene) =>
        !!scene.videoTaskId?.trim() &&
        ["queued", "processing"].includes(String(scene.videoStatus || "").toLowerCase()),
    );
    if (!runningScenes.length) return;

    const refreshKey = `${runtime.sessionId}:${project.id}:${runningScenes
      .map((scene) => `${scene.id}:${scene.videoTaskId}:${scene.videoStatus || ""}`)
      .sort()
      .join("|")}`;
    if (videoRefreshInFlightKeyRef.current === refreshKey) return;
    videoRefreshInFlightKeyRef.current = refreshKey;

    const cancelTask = scheduleBackgroundTask(() => {
      const sessionId = runtimeRef.current.sessionId;
      const projectId = project.id;

      void loadWorkflowActionsModule()
        .then((workflow) =>
          workflow.runWorkflowAction(
            "refresh_video_assets",
            { projectId },
            runtimeRef.current,
          ),
        )
        .then((result) => {
          if (!result.data) return;

          startTransition(() => {
            setRuntime((previous) => {
              if (previous.sessionId !== sessionId) return previous;
              if (previous.currentProjectSnapshot?.projectId !== projectId) return previous;
              return mergeRuntimeWithWorkflowDelta(previous, result.data);
            });
          });
        })
        .catch(() => {})
        .finally(() => {
          if (videoRefreshInFlightKeyRef.current === refreshKey) {
            videoRefreshInFlightKeyRef.current = null;
          }
        });
    }, 2800);

    return () => {
      cancelTask();
      if (videoRefreshInFlightKeyRef.current === refreshKey) {
        videoRefreshInFlightKeyRef.current = null;
      }
    };
  }, [
    idle,
    loadWorkflowActionsModule,
    runtime.currentProjectSnapshot?.projectId,
    runtime.currentVideoProject,
    runtime.sessionId,
    runtimeRef,
    scheduleBackgroundTask,
    setRuntime,
  ]);

  useEffect(() => {
    if (idle || !endRef.current) return;

    const lastMessage = messages[messages.length - 1];
    const isNearViewportBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;

    if (!lastMessage || (lastMessage.role !== "assistant" && !isNearViewportBottom)) {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });

    return () => window.cancelAnimationFrame(handle);
  }, [endRef, idle, messages]);

  useEffect(() => {
    const newlySurfacedTasks: Task[] = [];

    for (const task of visibleTasks) {
      if (!["completed", "failed"].includes(task.status)) continue;
      if (surfacedTaskIdsRef.current.has(task.id)) continue;

      const nextMessage = buildTaskResultMessage(task);
      if (nextMessage) {
        surfacedTaskIdsRef.current.add(task.id);
        newlySurfacedTasks.push(task);
        push("assistant", nextMessage);
      }
    }

    if (!newlySurfacedTasks.length) return;
    if (qState || streaming || draftPresence || popoverOverride) return;

    const pendingTaskCount = visibleTasks.filter(
      (task) => task.status === "running" || task.status === "pending",
    ).length;
    if (pendingTaskCount > 0) return;

    const readyTasks = visibleTasks.filter((task) => ["completed", "failed"].includes(task.status));
    const followupKey = readyTasks.map((task) => task.id).sort().join(",");
    if (!followupKey || surfacedTaskFollowupIdsRef.current.has(followupKey)) return;

    const headings = readyTasks
      .map((task) => parseTaskHeading(task.prompt))
      .filter((value): value is string => Boolean(value))
      .slice(0, 3);
    const followupQuestion = buildResearchFollowupQuestion(
      runtimeRef.current.currentProjectSnapshot,
      headings,
      readyTasks.map((task) => task.id),
    );
    if (!followupQuestion) return;

    surfacedTaskFollowupIdsRef.current.add(followupKey);
    setPopoverOverride(followupQuestion);
  }, [
    buildTaskResultMessage,
    draftPresence,
    parseTaskHeading,
    popoverOverride,
    push,
    qState,
    runtimeRef,
    setPopoverOverride,
    streaming,
    surfacedTaskFollowupIdsRef,
    surfacedTaskIdsRef,
    visibleTasks,
  ]);
}
