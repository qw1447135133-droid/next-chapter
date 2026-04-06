import * as React from "react";
import { flushSync } from "react-dom";
import {
  Wand2,
  Compass,
  PanelsTopLeft,
} from "lucide-react";
import type { QueryEngine } from "@/lib/agent/query-engine";
import { buildResearchPromptOverlay } from "@/lib/home-agent/auto-research";
import type {
  AgentConversationMode,
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioQuestionState,
  StudioRuntimeState,
  StudioSessionState,
  WorkflowRuntimeDelta,
} from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";
import type { JimengExecutionMode } from "@/lib/api-config";
import { API_CONFIG_UPDATED_EVENT } from "@/lib/api-config";
import {
  DesktopSidebar,
  MobileSidebarSheet,
} from "./home-agent-sidebar";
import {
  ActiveConversationShell,
  DetachedMaintenanceNoticeCard,
  type DetachedMaintenanceNotice,
  HomeSurfaceBackdrop,
  IdleLanding,
  MobileTopbar,
} from "./home-agent-shell";
import {
  areProjectSnapshotsEquivalent,
  areRecentSessionsEquivalent,
  buildProjectSuggestionKey,
  createInitialStudioSeed,
  hasSavedSessionContent,
  qStepKey,
  mergeRecentProjects,
} from "./home-agent-session-utils";
import { createQuestionState, textOf, toQuery } from "./home-agent-protocol-utils";
import {
  buildBeatPacketDecisionQuestion,
  buildBeatPacketListQuestion,
  buildCharacterCardDecisionQuestion,
  buildCharacterCardListQuestion,
  buildComplianceDecisionQuestion,
  buildComplianceListQuestion,
  buildMaintenanceReviewQuestion,
  buildReviewDecisionQuestion,
  buildReviewListQuestion,
  buildApprovedSkillDraftListQuestion,
  buildSkillDraftDecisionQuestion,
  buildReviewQuestion,
  buildSkillDraftListQuestion,
  buildVideoGenerationQuestion,
  buildVideoGenerationSceneListQuestion,
  buildVideoRefreshQuestion,
  buildVideoRefreshSceneListQuestion,
  buildVideoRepairListQuestion,
  buildVideoRepairQuestion,
  collectReviewTargetIds,
  findBeatPacket,
  findCharacterCard,
  findCompliancePacket,
  findReviewItem,
  listFailedVideoScenes,
  listGeneratableVideoScenes,
  listPendingCompliancePackets,
  listRedoReviewItems,
  listRunningVideoScenes,
  listUnlockedBeatPackets,
  listUnlockedCharacterCards,
} from "./home-agent-project-questions";
import {
  DesktopSettingsPanel,
  MobileSettingsSheet,
} from "./home-agent-settings-panels";
import {
  useHomeAgentModuleLoaders,
  type ProjectStoreModule,
} from "./use-home-agent-module-loaders";
import { useHomeAgentBootstrapEffects } from "./use-home-agent-bootstrap-effects";
import { useHomeAgentChoiceHandlers } from "./use-home-agent-choice-handlers";
import { useHomeAgentConversationEffects } from "./use-home-agent-conversation-effects";
import { useHomeAgentRuntimeActions } from "./use-home-agent-runtime-actions";
import { useHomeAgentRecoveryFlow } from "./use-home-agent-recovery-flow";
import { useHomeAgentQuestionView } from "./use-home-agent-question-view";
import { useHomeAgentShellHandlers } from "./use-home-agent-shell-handlers";
import { useHomeAgentSurfaceState } from "./use-home-agent-surface-state";
import {
  areTaskListsEquivalent,
  buildTaskResultMessage,
  isTaskVisibleForSession,
  parseTaskHeading,
  truncateCopy,
} from "./home-agent-task-utils";
import { useHomeAgentWorkflowShortcuts } from "./use-home-agent-workflow-shortcuts";
import { useHomeAgentComposerBindings } from "./use-home-agent-composer-bindings";
import { getAllTasks, type Task } from "@/lib/agent/tools/task-tools";
import type { CreationGuideDimensionId } from "@/lib/home-agent/creation-guide-presets";
import { recordAssistantFeedbackLog } from "@/lib/home-agent/assistant-feedback-log";
import { readHomeAgentLaunchReadiness, type HomeAgentLaunchReadiness } from "@/lib/home-agent/launch-readiness";
import {
  getHomeAgentTextModelOption,
  groupHomeAgentTextModelOptions,
  normalizeHomeAgentTextModelKey,
  readStoredHomeAgentTextModelKey,
  writeStoredHomeAgentTextModelKey,
} from "@/lib/home-agent/text-models";

const { useCallback, useEffect, useMemo, useRef, useState, startTransition } = React;

type UtilityPanelId = "settings" | undefined;

interface Props {
  initialUtility?: UtilityPanelId;
  onUtilityChange?: (panel?: UtilityPanelId) => void;
}

type QState = StudioQuestionState;

const PROMPT =
  "你是 InFinio 首页里的主控创作 Agent。整个产品只有一个首页工作表面，不允许把用户推回模块页、步骤页、工作台或手动表单。你必须先分析，再追问，再执行。需要结构化选择时优先调用 AskUserQuestion：为每一步决策提供充足选项（可十余项以上），支持多步问卷与自定义输入；不要只用 Markdown 表格让用户“默读选项”，应用工具阻塞等待用户选择后再继续下一步（例如先定题材再追问作品形态）；仅输出表格不会出现与 AskUserQuestion 相同的全屏选项弹窗。会话里若出现带 **从题材出发** / **从媒介出发** / **从核心冲突出发**（或 **【创作起点·题材】** / **【创作起点·媒介】** / **【创作起点·冲突】**）的引导文案，须用 ** 完整包裹这些短语，用户才能点选并打开预设弹窗；你会收到形如「【创作起点·题材】…」的用户消息，请据此进入对应下一问。需要推进项目时调用 HomeStudioWorkflow。遇到明显适合并行研究、分工拆解或长任务处理的情况，要优先考虑调用 Agent 启动 2 到 4 个后台子任务，并用 TaskOutput / TaskStop 管理后台任务，但最终仍然要把结果收口回当前首页会话。适合并行研究的典型场景包括：市场分析、风格对比、角色方案比较、改编路线比较、视频包装方案比较。输出格式必须规范：优先使用 Markdown 标题、分段、项目符号/编号列表；当有对比维度时使用 Markdown 表格；参数、端口、文件名和错误码使用反引号包裹；避免一整段大白话长文。除非用户明确要求自由发挥，默认按以下结构输出：## 结论、## 原因分析、## 可执行方案、## 风险与边界、## 下一步（每节 3-6 条短要点，先结论后细节）。默认使用简体中文，保持简洁、克制、专业，一次只推进一个关键决策。";
const MOBILE_NAV_SHEET =
  "w-full border-r border-white/8 bg-[#17181b] p-0 text-slate-100 shadow-[18px_0_48px_rgba(0,0,0,0.3)] overscroll-contain sm:max-w-[360px]";
const IDLE =
  "和 Agent 说出你的目标，例如：我想做一部面向女性市场的都市反转短剧，请一步一步带我完成。";
const ACTIVE =
  "继续补充目标、修改意见、素材条件或你想推进的下一步，整个生产都会在这一页完成。";
const CUSTOM = "也可以跳过上方建议，直接输入你的自定义回答。";
const TITLE = "InFinio-一站式智能体自动化平台";
const SIDEBAR_BRAND = "InFinio";
const DESKTOP_SIDEBAR_WIDTH = 272;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 80;
const DESKTOP_SIDEBAR_OFFSET = 296;
const DESKTOP_SIDEBAR_COLLAPSED_OFFSET = 108;
const DESKTOP_SETTINGS_WIDTH = 456;
const DESKTOP_SIDEBAR_COLLAPSE_KEY = "storyforge-home-agent-desktop-sidebar-collapsed-v1";
const ACTIVE_TRACK_CLASS = "max-w-[820px]";
const IDLE_TRACK_CLASS = "max-w-[800px]";
type RuntimeTask = Task;
type DreaminaCapabilityState = {
  ready: boolean;
  available: boolean;
  message?: string;
};

function scheduleBackgroundTask(task: () => void, timeout = 500): () => void {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(task, Math.min(timeout, 180));
  return () => window.clearTimeout(handle);
}

function readDesktopSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return JSON.parse(window.localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSE_KEY) ?? "false") === true;
  } catch {
    return false;
  }
}

function writeDesktopSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSE_KEY, JSON.stringify(collapsed));
}

const templates = [
  {
    id: "script",
    title: "原创剧本",
    description: "从一个想法开始，由 Agent 追问市场、风格、受众和人物关系。",
    prompt:
      "我想开启一个原创剧本项目。请先分析我的目标，再一步一步追问目标市场、风格类型、受众和创作方向，最终带我完成创作。",
    icon: Wand2,
  },
  {
    id: "adaptation",
    title: "参考改编",
    description: "拆解参考内容，在同一场会话里完成结构转译、角色重塑和内容生成。",
    prompt:
      "我要做参考改编。请先问我目标市场和改编方向，然后接收参考内容，在首页会话里继续推进结构转译和角色设计。",
    icon: Compass,
  },
  {
    id: "video",
    title: "视频工作流",
    description: "把脚本、分镜、提示词批次和出片准备统一放进同一套首页会话。",
    prompt:
      "我要继续视频工作流。请先分析我现有的脚本或项目，再在当前首页会话里继续推进分镜、提示词批次和出片准备。",
    icon: PanelsTopLeft,
  },
];

const mk = (role: HomeAgentMessage["role"], content: string): HomeAgentMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: new Date().toISOString(),
  status: "complete",
});

export default function HomeAgentStudio({ initialUtility, onUtilityChange }: Props) {
  const seedRef = useRef<{ session: StudioSessionState | null; runtime: StudioRuntimeState }>();
  if (!seedRef.current) seedRef.current = createInitialStudioSeed();

  const session = seedRef.current.session;
  const hasInitialSession = hasSavedSessionContent(session) || !!session?.currentProjectSnapshot;
  const [runtime, setRuntime] = useState(seedRef.current.runtime);
  const [messages, setMessages] = useState<HomeAgentMessage[]>(session?.messages ?? []);
  const [mode, setMode] = useState<AgentConversationMode>(
    session?.mode === "recovering" || session?.mode === "maintenance-review"
      ? session.mode
      : hasInitialSession
        ? "active"
        : "idle",
  );
  const [streaming, setStreaming] = useState(false);
  const [tasks, setTasks] = useState<RuntimeTask[]>(() => getAllTasks());
  const [qState, setQState] = useState<QState | null>(session?.qState ?? null);
  const [suggested, setSuggested] = useState<ComposerQuestion | null>(null);
  const [popoverOverride, setPopoverOverride] = useState<ComposerQuestion | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>(session?.selectedValues ?? []);
  const [draftInitialValue, setDraftInitialValue] = useState(session?.draft ?? "");
  const [draftResetVersion, setDraftResetVersion] = useState(0);
  const [draftPresence, setDraftPresence] = useState(Boolean(session?.draft?.trim()));
  const [persistedDraft, setPersistedDraft] = useState(session?.draft ?? "");
  const [recentProjectsReady, setRecentProjectsReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(readDesktopSidebarCollapsed);
  /** Settings open state comes from the route (`?utility=settings`) via `initialUtility`; avoid duplicate React state so toggles are not overwritten by URL sync. */
  const utilityPanel: UtilityPanelId = initialUtility;
  const [activeProjectId, setActiveProjectId] = useState(
    session?.projectId ?? session?.currentProjectSnapshot?.projectId,
  );
  const [compactedMessageCount, setCompactedMessageCount] = useState(session?.compactedMessageCount ?? 0);
  const [maintenanceHint, setMaintenanceHint] = useState<string | null>(null);
  const [maintenanceNotice, setMaintenanceNotice] = useState<DetachedMaintenanceNotice | null>(null);
  const [jimengExecutionMode, setJimengExecutionMode] = useState<JimengExecutionMode>("api");
  const [launchReadiness, setLaunchReadiness] = useState<HomeAgentLaunchReadiness | null>(null);
  const [suppressedLaunchNoticeKey, setSuppressedLaunchNoticeKey] = useState<string | null>(null);
  const [selectedTextModelKey, setSelectedTextModelKey] = useState(() =>
    normalizeHomeAgentTextModelKey(session?.selectedTextModelKey ?? readStoredHomeAgentTextModelKey()),
  );
  const [dreaminaCapability, setDreaminaCapability] = useState<DreaminaCapabilityState>({
    ready: false,
    available: false,
  });

  const runtimeRef = useRef(runtime);
  const messagesRef = useRef(messages);
  const compactedMessageCountRef = useRef(compactedMessageCount);
  const draftRef = useRef(session?.draft ?? "");
  const draftPersistTimerRef = useRef<number | null>(null);
  const engineRef = useRef<QueryEngine | null>(null);
  const handoffRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const surfacedTaskIdsRef = useRef<Set<string>>(new Set());
  const surfacedTaskFollowupIdsRef = useRef<Set<string>>(new Set());
  const surfacedProjectSuggestionKeysRef = useRef<Set<string>>(new Set());
  const restoredProjectSuggestionKeysRef = useRef<Set<string>>(new Set());
  const surfacedDreaminaHintRef = useRef(false);
  const maintenanceHintTimerRef = useRef<number | null>(null);
  const dismissedMaintenanceNoticeKeyRef = useRef<string | null>(null);
  const surfacedMaintenanceNoticeKeyRef = useRef<string | null>(null);
  const compactionJobVersionRef = useRef(0);
  const selectedTextModelKeyRef = useRef(selectedTextModelKey);
  const previousQuestionStepRef = useRef<string | null>(
    session?.qState ? `${session.qState.request.id}:${session.qState.currentIndex}` : null,
  );
  if (surfacedTaskIdsRef.current.size === 0 && session?.surfacedTaskIds?.length) {
    surfacedTaskIdsRef.current = new Set(session.surfacedTaskIds);
  }
  if (surfacedTaskFollowupIdsRef.current.size === 0 && session?.surfacedTaskFollowupKeys?.length) {
    surfacedTaskFollowupIdsRef.current = new Set(session.surfacedTaskFollowupKeys);
  }
  if (surfacedProjectSuggestionKeysRef.current.size === 0 && session?.surfacedProjectSuggestionKeys?.length) {
    surfacedProjectSuggestionKeysRef.current = new Set(session.surfacedProjectSuggestionKeys);
  }
  if (restoredProjectSuggestionKeysRef.current.size === 0 && session?.surfacedProjectSuggestionKeys?.length) {
    restoredProjectSuggestionKeysRef.current = new Set(session.surfacedProjectSuggestionKeys);
  }
  const {
    loadEngineDeps,
    loadProjectStore,
    loadApiConfigModule,
    loadAskUserQuestionModule,
    loadStructuredQuestionParser,
    loadWorkflowActionsModule,
    loadSemanticSummaryModule,
    loadConversationMemoryModule,
    loadDreaminaCliModule,
  } = useHomeAgentModuleLoaders();

  const { currentProject, question } = useHomeAgentQuestionView({
    runtime,
    qState,
    popoverOverride,
    suggested,
    selectedValues,
  });
  const {
    idle,
    activeTheme,
    placeholder,
    deferredMessages,
    deferredProjectSnapshot,
    deferredRecentProjects,
    reduceMotion,
    settingsOpen,
    desktopSidebarOffset,
    recentSessionSummary,
    flashMaintenanceHint,
    syncComposerDraft,
    resetComposerDraft,
    composerShellClass,
    deferredSidebarAssets,
    visibleTasks,
    deferredVisibleTasks,
    deferredActiveProjectId,
  } = useHomeAgentSurfaceState({
    mode,
    messages,
    currentProject,
    question,
    utilityPanel,
    desktopSidebarCollapsed,
    runtime,
    tasks,
    activeProjectId,
    maintenanceHintTimerRef,
    draftPersistTimerRef,
    draftRef,
    setMaintenanceHint,
    setDraftPresence,
    setPersistedDraft,
    setDraftInitialValue,
    setDraftResetVersion,
    truncateCopy,
    isTaskVisibleForSession,
    idlePlaceholder: IDLE,
    activePlaceholder: ACTIVE,
    customPlaceholder: CUSTOM,
    desktopSidebarOffsetExpanded: DESKTOP_SIDEBAR_OFFSET,
    desktopSidebarOffsetCollapsed: DESKTOP_SIDEBAR_COLLAPSED_OFFSET,
  });
  const textModelGroups = useMemo(() => groupHomeAgentTextModelOptions(), []);
  const selectedTextModelOption = useMemo(
    () => getHomeAgentTextModelOption(selectedTextModelKey),
    [selectedTextModelKey],
  );

  const refreshLaunchReadiness = useCallback(async () => {
    try {
      const nextReadiness = await readHomeAgentLaunchReadiness();
      setLaunchReadiness(nextReadiness);
      setJimengExecutionMode((current) =>
        current === nextReadiness.video.mode ? current : nextReadiness.video.mode,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "首发运行前检查失败";
      setLaunchReadiness({
        checkedAt: new Date().toISOString(),
        textReady: false,
        textMessage: message,
        video: {
          mode: "api",
          ready: false,
          label: "当前默认走 API",
          detail: message,
          tone: "warning",
        },
        notice: {
          level: "critical",
          title: "首发运行前检查失败",
          description: message,
          actions: [{ id: "open_settings", label: "去设置检查" }],
        },
      });
      setJimengExecutionMode("api");
    }
  }, []);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    writeStoredHomeAgentTextModelKey(selectedTextModelKey);
  }, [selectedTextModelKey]);

  useEffect(() => {
    if (selectedTextModelKeyRef.current === selectedTextModelKey) return;
    selectedTextModelKeyRef.current = selectedTextModelKey;
    engineRef.current?.interrupt();
    engineRef.current = null;
  }, [selectedTextModelKey]);

  useEffect(() => {
    void refreshLaunchReadiness();
  }, [refreshLaunchReadiness]);

  useEffect(() => {
    if (settingsOpen) return;
    void refreshLaunchReadiness();
  }, [refreshLaunchReadiness, settingsOpen]);

  useEffect(() => {
    const handleConfigUpdated = () => {
      void refreshLaunchReadiness();
    };
    window.addEventListener(API_CONFIG_UPDATED_EVENT, handleConfigUpdated);
    return () => window.removeEventListener(API_CONFIG_UPDATED_EVENT, handleConfigUpdated);
  }, [refreshLaunchReadiness]);

  const push = useCallback((role: HomeAgentMessage["role"], content: string) => {
    if (!content.trim()) return;
    setMessages((prev) => [...prev, mk(role, content.trim())]);
  }, []);

  const dismissMaintenanceNotice = useCallback(() => {
    if (maintenanceNotice) {
      dismissedMaintenanceNoticeKeyRef.current = maintenanceNotice.id;
    }
    setMaintenanceNotice(null);
  }, [maintenanceNotice]);

  const showDetachedMaintenanceNotice = useCallback(
    (message: string, nextQuestion: ComposerQuestion | null = null, title?: string) => {
      const noticeTitle = title?.trim() || nextQuestion?.title || "首页维护提醒";
      const noticeKey = [
        noticeTitle,
        nextQuestion?.id ?? "message",
        runtimeRef.current.maintenanceReports[0]?.id ?? "no-report",
        runtimeRef.current.skillDrafts
          .map((draft) => `${draft.id}:${draft.status}`)
          .slice(0, 6)
          .join("|"),
      ].join("::");
      surfacedMaintenanceNoticeKeyRef.current = noticeKey;
      dismissedMaintenanceNoticeKeyRef.current = null;
      setMaintenanceNotice({
        id: noticeKey,
        title: noticeTitle,
        message,
        question: nextQuestion,
      });
    },
    [runtimeRef],
  );

  const runDetachedMaintenanceAction = useCallback(
    async (action: string, input: Record<string, unknown>, _label: string) => {
      try {
        const workflow = await loadWorkflowActionsModule();
        const result = await workflow.runWorkflowAction(action, input, runtimeRef.current);
        const nextRuntime = result.data
          ? mergeRuntimeWithWorkflowDelta(runtimeRef.current, result.data as WorkflowRuntimeDelta)
          : runtimeRef.current;

        if (result.data) {
          startTransition(() => {
            setRuntime(nextRuntime);
          });
        }

        const normalizedSummary = result.summary.trim() || "维护动作已完成。";
        const summaryTitle = normalizedSummary.split(/\n+/)[0]?.trim() || "维护动作已完成。";
        const summaryBody =
          normalizedSummary === summaryTitle
            ? "你可以继续处理维护事项，或直接回到主任务会话。"
            : normalizedSummary.slice(summaryTitle.length).trim();

        showDetachedMaintenanceNotice(
          summaryBody,
          buildMaintenanceReviewQuestion(nextRuntime),
          summaryTitle,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "维护动作执行失败。";
        const errorTitle = message.split(/\n+/)[0]?.trim() || "维护动作执行失败。";
        const errorBody =
          message === errorTitle ? "可以稍后重试，或继续当前首页主会话。" : message.slice(errorTitle.length).trim();
        showDetachedMaintenanceNotice(errorBody, buildMaintenanceReviewQuestion(runtimeRef.current), errorTitle);
      }
    },
    [loadWorkflowActionsModule, setRuntime, showDetachedMaintenanceNotice],
  );

  const { resolveDreaminaCapability, send, reset, answer, handleTemplateLaunch, autoResearchChoiceHandler } = useHomeAgentRuntimeActions({
    systemPrompt: PROMPT,
    qState,
    engineRef,
    runtimeRef,
    messagesRef,
    compactedMessageCountRef,
    surfacedTaskIdsRef,
    surfacedTaskFollowupIdsRef,
    surfacedProjectSuggestionKeysRef,
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
  });

  const handleEditUserMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;

      engineRef.current?.interrupt();
      engineRef.current = null;

      const pendingRequestId = qState?.request.id;
      if (pendingRequestId) {
        try {
          const mod = await loadAskUserQuestionModule();
          mod.rejectAskUserQuestion(pendingRequestId, "User edited conversation history");
        } catch {
          /* ignore */
        }
      }

      flushSync(() => {
        setStreaming(false);
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === messageId);
          if (i === -1 || prev[i].role !== "user") return prev;
          const next = prev.slice(0, i);
          messagesRef.current = next;
          return next;
        });
        compactedMessageCountRef.current = 0;
        setCompactedMessageCount(0);
        setQState(null);
        setPopoverOverride(null);
        setSuggested(null);
        setSelectedValues([]);
      });

      await send(trimmed);
    },
    [
      loadAskUserQuestionModule,
      qState?.request.id,
      send,
      setCompactedMessageCount,
      setMessages,
      setPopoverOverride,
      setQState,
      setSelectedValues,
      setStreaming,
      setSuggested,
    ],
  );

  const handleAssistantFeedback = useCallback((messageId: string, vote: "up" | "down" | null) => {
    const prev = messagesRef.current.find((m) => m.id === messageId);
    const preview = (prev?.content ?? "").slice(0, 240);
    recordAssistantFeedbackLog({
      messageId,
      action: vote === null ? "clear" : vote,
      contentPreview: preview,
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.role === "assistant"
          ? { ...m, ...(vote ? { feedback: vote } : { feedback: undefined }) }
          : m,
      ),
    );
  }, [setMessages]);

  const handleRegenerateAssistant = useCallback(
    async (assistantMessageId: string) => {
      const list = messagesRef.current;
      const idx = list.findIndex((m) => m.id === assistantMessageId);
      if (idx === -1 || list[idx]?.role !== "assistant") return;

      let u = idx - 1;
      while (u >= 0 && list[u].role !== "user") u -= 1;
      if (u < 0) return;
      const userContent = list[u].content.trim();
      if (!userContent) return;

      engineRef.current?.interrupt();
      engineRef.current = null;

      const pendingRequestId = qState?.request.id;
      if (pendingRequestId) {
        try {
          const mod = await loadAskUserQuestionModule();
          mod.rejectAskUserQuestion(pendingRequestId, "User regenerated assistant response");
        } catch {
          /* ignore */
        }
      }

      flushSync(() => {
        setStreaming(false);
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === assistantMessageId);
          if (i === -1 || prev[i].role !== "assistant") return prev;
          const next = prev.slice(0, i);
          messagesRef.current = next;
          return next;
        });
        compactedMessageCountRef.current = 0;
        setCompactedMessageCount(0);
        setQState(null);
        setPopoverOverride(null);
        setSuggested(null);
        setSelectedValues([]);
      });

      await send(userContent, userContent, { skipUserBubble: true });
    },
    [
      loadAskUserQuestionModule,
      qState?.request.id,
      send,
      setCompactedMessageCount,
      setMessages,
      setPopoverOverride,
      setQState,
      setSelectedValues,
      setStreaming,
      setSuggested,
    ],
  );

  const handleCreationGuidePick = useCallback(
    (dimension: CreationGuideDimensionId, value: string, label: string) => {
      const tag =
        dimension === "theme"
          ? "【创作起点·题材】"
          : dimension === "medium"
            ? "【创作起点·媒介】"
            : "【创作起点·核心冲突】";
      const body = `${tag}我选了「${label}」（${value}）。请基于这一选择继续下一步追问（例如作品形态、受众或叙事结构），不要跳过关键决策。`;
      void send(body, label);
    },
    [send],
  );

  const handleJimengExecutionModeChange = useCallback(
    async (nextMode: JimengExecutionMode) => {
      try {
        const apiConfig = await loadApiConfigModule();
        apiConfig.saveApiConfig({ jimengExecutionMode: nextMode });
        setJimengExecutionMode(nextMode);
        setSuppressedLaunchNoticeKey(null);

        if (nextMode === "cli") {
          const capability = await resolveDreaminaCapability();
          await refreshLaunchReadiness();
          flashMaintenanceHint(
            capability.available
              ? "已切到 Dreamina CLI，后续视频默认走本机登录态"
              : "已切到 Dreamina CLI，但当前本机还未就绪",
            2600,
          );
          return;
        }

        await refreshLaunchReadiness();
        flashMaintenanceHint("已切到 Seedance API，后续视频默认走 API", 2400);
      } catch (error) {
        flashMaintenanceHint(
          error instanceof Error ? error.message : "切换视频运行通道失败",
          2600,
        );
      }
    },
    [flashMaintenanceHint, loadApiConfigModule, refreshLaunchReadiness, resolveDreaminaCapability],
  );

  const launchNoticeKey = useMemo(() => {
    const notice = launchReadiness?.notice;
    if (!notice) return null;
    return `${notice.level}:${notice.title}:${launchReadiness?.video.mode}:${launchReadiness?.video.detail}:${launchReadiness?.textReady}`;
  }, [launchReadiness]);

  const launchNotice = useMemo(() => {
    const notice = launchReadiness?.notice;
    if (!notice || !launchNoticeKey) return null;
    if (suppressedLaunchNoticeKey === launchNoticeKey) return null;
    if (!idle && notice.level !== "critical" && currentProject?.projectKind !== "video") {
      return null;
    }
    return notice;
  }, [currentProject?.projectKind, idle, launchNoticeKey, launchReadiness?.notice, suppressedLaunchNoticeKey]);

  const videoTransportHint = useMemo(() => {
    const snapshot = deferredProjectSnapshot ?? currentProject;
    if (snapshot?.projectKind !== "video") return null;

    if (launchReadiness?.video) {
      return launchReadiness.video;
    }

    return {
      label: jimengExecutionMode === "cli" ? "当前选择 CLI" : "当前实际走 API",
      detail: jimengExecutionMode === "cli" ? "Dreamina 状态检查中" : "Seedance API",
      tone: "neutral" as const,
    };
  }, [currentProject, deferredProjectSnapshot, jimengExecutionMode, launchReadiness?.video]);

  useHomeAgentBootstrapEffects({
    runtime,
    mode,
    metaReady,
    messages,
    compactedMessageCount,
    desktopSidebarCollapsed,
    dreaminaCapability,
    maintenanceHintTimerRef,
    draftPersistTimerRef,
    messagesRef,
    compactedMessageCountRef,
    surfacedTaskIdsRef,
    surfacedTaskFollowupIdsRef,
    surfacedDreaminaHintRef,
    setRuntime,
    setRecentProjectsReady,
    setMetaReady,
    setActiveProjectId,
    setTasks,
    loadProjectStore,
    resolveDreaminaCapability,
    flashMaintenanceHint,
    scheduleBackgroundTask,
    areProjectSnapshotsEquivalent,
    areRecentSessionsEquivalent,
    areTaskListsEquivalent,
    writeDesktopSidebarCollapsed,
    surfacedProjectSuggestionKeysRef,
    restoredProjectSuggestionKeysRef,
  });

  useHomeAgentConversationEffects({
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
  });

  const { openProject } = useHomeAgentRecoveryFlow({
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
    clearSurfacedTasks: () => {
      surfacedTaskIdsRef.current.clear();
      surfacedTaskFollowupIdsRef.current.clear();
      surfacedProjectSuggestionKeysRef.current.clear();
      restoredProjectSuggestionKeysRef.current.clear();
    },
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
  });

  const {
    handleOpenProject,
    handleReset,
    handleOpenSettings,
    handleToggleSettings,
    handleOpenMobileNavigation,
    handleStopTask,
    handleToggleDesktopSidebar,
    handleSettingsOpenChange,
    handleCloseSettings,
  } = useHomeAgentShellHandlers({
    openProject,
    reset,
    utilityPanel,
    setMobileNavOpen,
    setTasks,
    setDesktopSidebarCollapsed,
    onUtilityChange,
    areTaskListsEquivalent,
  });

  const sortConversationSnapshots = useCallback((items: ConversationProjectSnapshot[]) => {
    return [...items].sort((a, b) => {
      const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      if (pinnedDelta !== 0) return pinnedDelta;
      const aDate = new Date(a.updatedAt ?? 0).getTime();
      const bDate = new Date(b.updatedAt ?? 0).getTime();
      return bDate - aDate;
    });
  }, []);

  const handleToggleProjectPin = useCallback(
    async (snapshot: ConversationProjectSnapshot) => {
      const nextPinned = !snapshot.pinned;
      try {
        const store = await loadProjectStore();
        await store.setConversationProjectPinned(snapshot.projectId, nextPinned);
      } catch (error) {
        flashMaintenanceHint(
          error instanceof Error ? error.message : "更新置顶状态失败，请稍后重试。",
          3200,
        );
        return;
      }

      startTransition(() => {
        setRuntime((prev) => {
          const nextProjects = sortConversationSnapshots(
            prev.recentProjects.map((item) =>
              item.projectId === snapshot.projectId ? { ...item, pinned: nextPinned } : item,
            ),
          );
          const nextCurrent =
            prev.currentProjectSnapshot?.projectId === snapshot.projectId
              ? { ...prev.currentProjectSnapshot, pinned: nextPinned }
              : prev.currentProjectSnapshot;
          return {
            ...prev,
            recentProjects: nextProjects,
            currentProjectSnapshot: nextCurrent,
          };
        });
      });
      flashMaintenanceHint(nextPinned ? "已置顶该会话。" : "已取消置顶。", 2000);
    },
    [flashMaintenanceHint, loadProjectStore, sortConversationSnapshots],
  );

  const handleRenameProject = useCallback(
    async (snapshot: ConversationProjectSnapshot) => {
      const next = window.prompt("输入新的会话名称", snapshot.title)?.trim();
      if (!next || next === snapshot.title) return;
      try {
        const store = await loadProjectStore();
        await store.renameConversationProject(snapshot.projectId, next);
      } catch (error) {
        flashMaintenanceHint(
          error instanceof Error ? error.message : "重命名失败，请稍后重试。",
          3200,
        );
        return;
      }

      startTransition(() => {
        setRuntime((prev) => ({
          ...prev,
          recentProjects: prev.recentProjects.map((item) =>
            item.projectId === snapshot.projectId ? { ...item, title: next } : item,
          ),
          currentProjectSnapshot:
            prev.currentProjectSnapshot?.projectId === snapshot.projectId
              ? { ...prev.currentProjectSnapshot, title: next }
              : prev.currentProjectSnapshot,
        }));
      });
      flashMaintenanceHint("已重命名该会话。", 2000);
    },
    [flashMaintenanceHint, loadProjectStore],
  );

  const handleDeleteProject = useCallback(
    async (snapshot: ConversationProjectSnapshot) => {
      if (
        !window.confirm(`确定删除「${snapshot.title}」？本地会话与项目数据将一并移除，且无法恢复。`)
      ) {
        return;
      }
      const others = runtimeRef.current.recentProjects.filter((p) => p.projectId !== snapshot.projectId);
      const wasActive = activeProjectId === snapshot.projectId;

      if (wasActive) {
        const requestId = qState?.request.id;
        if (requestId) {
          void loadAskUserQuestionModule().then((mod) => {
            mod.rejectAskUserQuestion(requestId, "User deleted conversation");
          });
        }
        engineRef.current?.interrupt?.();
        engineRef.current = null;
        surfacedTaskIdsRef.current.clear();
        surfacedTaskFollowupIdsRef.current.clear();
        surfacedProjectSuggestionKeysRef.current.clear();
        restoredProjectSuggestionKeysRef.current.clear();
        startTransition(() => {
          setStreaming(false);
          setQState(null);
          setPopoverOverride(null);
          setSuggested(null);
          setSelectedValues([]);
        });
      }

      try {
        const store = await loadProjectStore();
        await store.deleteConversationProject(snapshot);
      } catch (error) {
        flashMaintenanceHint(
          error instanceof Error ? error.message : "删除会话失败，请稍后重试。",
          3200,
        );
        return;
      }

      startTransition(() => {
        setRuntime((prev) => ({
          ...prev,
          recentProjects: sortConversationSnapshots(
            prev.recentProjects.filter((p) => p.projectId !== snapshot.projectId),
          ),
          recentProjectSessions: (prev.recentProjectSessions ?? []).filter(
            (s) => s.projectId !== snapshot.projectId,
          ),
          ...(prev.currentProjectSnapshot?.projectId === snapshot.projectId
            ? {
                currentProjectSnapshot: null,
                currentDramaProject: null,
                currentVideoProject: null,
              }
            : {}),
        }));
      });

      if (wasActive) {
        const next = others[0];
        if (next) {
          void openProject(next.projectId);
        } else {
          reset();
        }
      } else {
        flashMaintenanceHint("已删除该会话。", 2200);
      }
    },
    [
      activeProjectId,
      flashMaintenanceHint,
      loadAskUserQuestionModule,
      loadProjectStore,
      openProject,
      qState?.request.id,
      reset,
      restoredProjectSuggestionKeysRef,
      runtimeRef,
      setPopoverOverride,
      setQState,
      setRuntime,
      setSelectedValues,
      setStreaming,
      setSuggested,
      surfacedProjectSuggestionKeysRef,
      surfacedTaskFollowupIdsRef,
      surfacedTaskIdsRef,
      sortConversationSnapshots,
    ],
  );

  const handleLaunchNoticeAction = useCallback(
    (actionId: string) => {
      if (actionId === "open_settings") {
        handleOpenSettings();
        return;
      }

      if (actionId === "switch_to_api") {
        void handleJimengExecutionModeChange("api");
        return;
      }

      if (actionId === "switch_to_cli") {
        void handleJimengExecutionModeChange("cli");
        return;
      }

      if (actionId === "continue_script_only" && launchNoticeKey) {
        setSuppressedLaunchNoticeKey(launchNoticeKey);
        flashMaintenanceHint("已按仅剧本 / 改编模式继续，视频配置提醒本轮先收起。", 2400);
      }
    },
    [flashMaintenanceHint, handleJimengExecutionModeChange, handleOpenSettings, launchNoticeKey],
  );

  const { runWorkflowActionShortcut, runWorkflowActionShortcutChain } = useHomeAgentWorkflowShortcuts({
    runtimeRef,
    loadWorkflowActionsModule,
    push,
    resetComposerDraft,
    setStreaming,
    setSuggested,
    setPopoverOverride,
    setMode,
    setRuntime,
    setActiveProjectId,
  });

  const {
    maintenanceChoiceHandler,
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
  } = useHomeAgentChoiceHandlers({
    runtimeRef,
    push,
    setPopoverOverride,
    setSuggested,
    setMode,
    resetComposerDraft,
    runWorkflowActionShortcut,
    runWorkflowActionShortcutChain,
    send,
    buildVideoGenerationQuestion,
    buildVideoRefreshQuestion,
    buildReviewQuestion,
    buildReviewListQuestion,
    buildVideoRepairQuestion,
    listGeneratableVideoScenes,
    listRunningVideoScenes,
    collectReviewTargetIds,
    findReviewItem,
    buildReviewDecisionQuestion,
    buildVideoGenerationSceneListQuestion,
    buildVideoRefreshSceneListQuestion,
    buildVideoRepairListQuestion,
    listFailedVideoScenes,
    listRedoReviewItems,
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
    showDetachedMaintenanceNotice,
    runDetachedMaintenanceAction,
  });

  const handleMaintenanceNoticeChoice = useCallback(
    (value: string, label: string) => {
      maintenanceChoiceHandler(value, label);
    },
    [maintenanceChoiceHandler],
  );

  useEffect(() => {
    if (runtime.currentProjectSnapshot || qState || streaming || popoverOverride || draftPresence) {
      return;
    }

    const nextQuestion = buildMaintenanceReviewQuestion(runtime);
    if (!nextQuestion) {
      if (maintenanceNotice?.question?.id?.startsWith("maintenance-")) {
        setMaintenanceNotice(null);
      }
      surfacedMaintenanceNoticeKeyRef.current = null;
      dismissedMaintenanceNoticeKeyRef.current = null;
      return;
    }

    // Keep the detached maintenance card on its own mini-session path.
    // Once a notice is open, only explicit maintenance actions should advance it.
    if (maintenanceNotice) {
      return;
    }

    const nextNoticeKey = [
      nextQuestion.id,
      runtime.maintenanceReports[0]?.id ?? "no-report",
      runtime.skillDrafts.map((draft) => `${draft.id}:${draft.status}`).slice(0, 6).join("|"),
    ].join("::");
    if (dismissedMaintenanceNoticeKeyRef.current === nextNoticeKey) return;
    if (surfacedMaintenanceNoticeKeyRef.current === nextNoticeKey && maintenanceNotice) return;

    surfacedMaintenanceNoticeKeyRef.current = nextNoticeKey;
    setMaintenanceNotice({
      id: nextNoticeKey,
      title: nextQuestion.title,
      message: nextQuestion.description || "最近一次维护整理已经完成，可以单独查看，不会打断当前主会话。",
      question: nextQuestion,
    });
  }, [
    draftPresence,
    maintenanceNotice,
    popoverOverride,
    qState,
    runtime,
    streaming,
  ]);

  const { idleComposer, activeComposer } = useHomeAgentComposerBindings({
    idle,
    currentProject,
    maintenanceHint,
    videoTransportHint,
    launchNotice,
    draftInitialValue,
    draftResetVersion,
    draftPresence,
    syncComposerDraft,
    placeholder,
    question,
    qState,
    selectedValues,
    streaming,
    reduceMotion,
    composerShellClass,
    activeTheme,
    selectedTextModelKey,
    selectedTextModelLabel: selectedTextModelOption.shortLabel,
    textModelGroups,
    onSelectTextModel: setSelectedTextModelKey,
    runtimeRef,
    draftRef,
    engineRef,
    setStreaming,
    answer,
    send,
    setSelectedValues,
    maintenanceChoiceHandler,
    videoProjectChoiceHandler,
    videoReviewChoiceHandler,
    videoAssetChoiceHandler,
    scriptProjectChoiceHandler,
    autoResearchChoiceHandler,
    onLaunchAction: handleLaunchNoticeAction,
    activeTrackClassName: ACTIVE_TRACK_CLASS,
    idleTrackClassName: IDLE_TRACK_CLASS,
  });

  return (
    <div className="relative h-screen overflow-x-hidden overflow-y-auto scrollbar-none bg-[#131314] text-white">
      <HomeSurfaceBackdrop idle={idle} />
      <DesktopSidebar
        idle={idle}
        recentProjects={deferredRecentProjects}
        recentProjectsReady={recentProjectsReady}
        templates={templates}
        assets={deferredSidebarAssets}
        currentProjectId={deferredActiveProjectId}
        collapsed={desktopSidebarCollapsed}
        brandLabel={SIDEBAR_BRAND}
        expandedWidth={DESKTOP_SIDEBAR_WIDTH}
        collapsedWidth={DESKTOP_SIDEBAR_COLLAPSED_WIDTH}
        onTemplateLaunch={handleTemplateLaunch}
        onOpenProject={handleOpenProject}
        onTogglePinProject={handleToggleProjectPin}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onNewProject={handleReset}
        onOpenSettings={handleToggleSettings}
        onToggleCollapse={handleToggleDesktopSidebar}
        jimengExecutionMode={jimengExecutionMode}
        onChangeJimengExecutionMode={handleJimengExecutionModeChange}
        dreaminaCliAvailable={dreaminaCapability.available}
      />
      <MobileSidebarSheet
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        idle={idle}
        recentProjects={deferredRecentProjects}
        recentProjectsReady={recentProjectsReady}
        templates={templates}
        assets={deferredSidebarAssets}
        currentProjectId={deferredActiveProjectId}
        brandLabel={SIDEBAR_BRAND}
        sheetClassName={MOBILE_NAV_SHEET}
        onTemplateLaunch={handleTemplateLaunch}
        onOpenProject={handleOpenProject}
        onTogglePinProject={handleToggleProjectPin}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onNewProject={handleReset}
        onOpenSettings={handleToggleSettings}
        jimengExecutionMode={jimengExecutionMode}
        onChangeJimengExecutionMode={handleJimengExecutionModeChange}
        dreaminaCliAvailable={dreaminaCapability.available}
      />
      <DesktopSettingsPanel
        open={settingsOpen}
        onClose={handleCloseSettings}
        onSaved={() => {
          void refreshLaunchReadiness();
        }}
        leftOffset={desktopSidebarOffset}
        width={DESKTOP_SETTINGS_WIDTH}
      />
      <MobileSettingsSheet
        open={settingsOpen}
        onOpenChange={handleSettingsOpenChange}
        onSaved={() => {
          void refreshLaunchReadiness();
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <DetachedMaintenanceNoticeCard
          notice={maintenanceNotice}
          onDismiss={dismissMaintenanceNotice}
          onSelect={handleMaintenanceNoticeChoice}
        />
        <MobileTopbar idle={idle} brandLabel={SIDEBAR_BRAND} onOpenNavigation={handleOpenMobileNavigation} />
        <main
          className={cn(
            "relative flex-1 overflow-x-visible overflow-y-visible px-3.5 transition-[padding-left] duration-300 ease-out motion-reduce:transition-none sm:px-4 md:px-8",
            idle ? "pb-0 pt-4 lg:pl-[var(--home-sidebar-offset)]" : "pb-0 pt-2 lg:pl-[var(--home-sidebar-offset)]",
          )}
          style={
            {
              "--home-sidebar-offset": `${desktopSidebarOffset}px`,
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "padding-left",
            } as React.CSSProperties
          }
        >
          {idle ? (
            <IdleLanding composer={idleComposer} reduceMotion={reduceMotion} title={TITLE} trackClassName={IDLE_TRACK_CLASS} />
          ) : (
            <ActiveConversationShell
              messages={deferredMessages}
              tasks={deferredVisibleTasks}
              onStopTask={handleStopTask}
              endRef={endRef}
              composer={activeComposer}
              streaming={streaming}
              trackClassName={ACTIVE_TRACK_CLASS}
              onEditUserMessage={handleEditUserMessage}
              onAssistantFeedback={handleAssistantFeedback}
              onRegenerateAssistant={handleRegenerateAssistant}
              onCreationGuidePick={handleCreationGuidePick}
            />
          )}
        </main>
      </div>
    </div>
  );
}
