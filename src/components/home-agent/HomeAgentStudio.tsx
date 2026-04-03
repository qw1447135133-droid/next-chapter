import * as React from "react";
import { useReducedMotion } from "framer-motion";
import {
  Wand2,
  Compass,
  PanelsTopLeft,
} from "lucide-react";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { QueryEngine } from "@/lib/agent/query-engine";
import type { Message as QueryMessage } from "@/lib/agent/types";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import {
  clearStudioSession,
  readStudioProjectSession,
  writeStudioSession,
} from "@/lib/home-agent/session-store";
import {
  buildCompactedHistoryPrompt,
  planConversationCompaction,
} from "@/lib/home-agent/conversation-compact";
import {
  buildResearchFollowupQuestion,
  buildResearchPromptOverlay,
} from "@/lib/home-agent/auto-research";
import type {
  AgentConversationMode,
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioQuestionState,
  StudioRuntimeState,
  StudioSessionState,
} from "@/lib/home-agent/types";
import {
  mergeRuntimeWithWorkflowDelta,
  runWorkflowShortcut,
  runWorkflowShortcutChain,
} from "@/lib/home-agent/workflow-shortcut-runner";
import type { Scene } from "@/types/project";
import { cn } from "@/lib/utils";
import {
  DesktopSidebar,
  MobileSidebarSheet,
} from "./home-agent-sidebar";
import {
  ActiveConversationShell,
  HomeComposer,
  HomeSurfaceBackdrop,
  IdleLanding,
  MobileTopbar,
  type HomeComposerProps,
} from "./home-agent-shell";
import {
  buildRecoveryActionRationale,
  createInitialStudioSeed,
  hasSavedSessionContent,
  qStepKey,
  qToComposer,
  serializeQuestionAnswers,
  summarizeRecoveryArtifacts,
} from "./home-agent-session-utils";
import {
  advanceStructuredAnswer,
  buildOpenProjectSessionState,
  buildResetRuntimeState,
} from "./home-agent-conversation-state";
import { collectConversationAssets } from "./home-agent-sidebar-utils";
import {
  DesktopSettingsPanel,
  MobileSettingsSheet,
} from "./home-agent-settings-panels";
import {
  createWorkflowShortcutUiBridge,
  showChoiceNoticeMessage,
  showChoicePopoverMessage,
} from "./home-agent-workflow-ui";
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
} from "./home-agent-engine-runtime";
import {
  useHomeAgentModuleLoaders,
  type ProjectStoreModule,
} from "./use-home-agent-module-loaders";
import { useHomeAgentBootstrapEffects } from "./use-home-agent-bootstrap-effects";
import { createScriptProjectChoiceHandler } from "./home-agent-script-choice-handlers";
import {
  createVideoAssetChoiceHandler,
  createVideoProjectChoiceHandler,
  createVideoReviewChoiceHandler,
} from "./home-agent-video-choice-handlers";
import { getAllTasks, stopTask, type Task } from "@/lib/agent/tools/task-tools";

const { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } = React;

type ReactNode = React.ReactNode;

type UtilityPanelId = "settings" | undefined;

interface Props {
  initialUtility?: UtilityPanelId;
  onUtilityChange?: (panel?: UtilityPanelId) => void;
}

type QState = StudioQuestionState;

const PROMPT =
  "你是 InFinio 首页里的主控创作 Agent。整个产品只有一个首页工作表面，不允许把用户推回模块页、步骤页、工作台或手动表单。你必须先分析，再追问，再执行。需要结构化选择时调用 AskUserQuestion，并允许用户自定义输入。需要推进项目时调用 HomeStudioWorkflow。遇到明显适合并行研究、分工拆解或长任务处理的情况，要优先考虑调用 Agent 启动 2 到 4 个后台子任务，并用 TaskOutput / TaskStop 管理后台任务，但最终仍然要把结果收口回当前首页会话。适合并行研究的典型场景包括：市场分析、风格对比、角色方案比较、改编路线比较、视频包装方案比较。默认使用简体中文，保持简洁、克制、专业，一次只推进一个关键决策。";
const MOBILE_NAV_SHEET =
  "w-full border-r border-white/8 bg-[#17181b] p-0 text-slate-100 shadow-[18px_0_48px_rgba(0,0,0,0.3)] overscroll-contain sm:max-w-[360px]";
const IDLE =
  "和 Agent 说出你的目标，例如：我想做一部面向女性市场的都市反转短剧，请一步一步带我完成。";
const ACTIVE =
  "继续补充目标、修改意见、素材条件或你想推进的下一步，整个生产都会在这一页完成。";
const CUSTOM = "也可以跳过上方建议，直接输入你的自定义回答。";
const TITLE = "InFinio-一站式智能体自动化平台";
const SUBTITLE = "单首页、单会话、Agent 主导";
const SIDEBAR_BRAND = "InFinio";
const DESKTOP_SIDEBAR_WIDTH = 272;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 80;
const DESKTOP_SIDEBAR_OFFSET = 296;
const DESKTOP_SIDEBAR_COLLAPSED_OFFSET = 108;
const DESKTOP_SETTINGS_WIDTH = 456;
const DESKTOP_SIDEBAR_COLLAPSE_KEY = "storyforge-home-agent-desktop-sidebar-collapsed-v1";
const ACTIVE_TRACK_CLASS = "max-w-[896px]";
const IDLE_TRACK_CLASS = "max-w-[860px]";
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

function compactSidebarLabel(value: string): string {
  const trimmed = value.trim();
  return Array.from(trimmed)[0] ?? "•";
}

function taskStatusLabel(status: RuntimeTask["status"]): string {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已停止";
    default:
      return "待处理";
  }
}

function taskStatusClass(status: RuntimeTask["status"]): string {
  switch (status) {
    case "running":
      return "border-[#8aa0ff]/24 bg-[#8aa0ff]/10 text-[#dfe5ff]";
    case "completed":
      return "border-emerald-400/18 bg-emerald-400/10 text-emerald-100";
    case "failed":
      return "border-rose-400/18 bg-rose-400/10 text-rose-100";
    case "cancelled":
      return "border-white/[0.08] bg-white/[0.05] text-white/58";
    default:
      return "border-white/[0.08] bg-white/[0.05] text-white/72";
  }
}

function isTerminalTask(task: RuntimeTask): boolean {
  return task.status === "completed" || task.status === "failed" || task.status === "cancelled";
}

function formatTaskDockTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseTaskHeading(prompt: string): string | null {
  const matched =
    prompt.match(/^并行研究\s+([^:：]+)[:：]/) ??
    prompt.match(/^并行研究[:：]\s*(.+)$/);
  return matched?.[1]?.trim() ?? null;
}

function parseTaskPreview(prompt: string): string {
  const heading = parseTaskHeading(prompt);
  if (!heading) return truncateCopy(prompt, 84);
  const stripped = prompt
    .replace(/^并行研究\s+[^:：]+[:：]\s*/, "")
    .replace(/^并行研究[:：]\s*.+$/, "")
    .trim();
  return truncateCopy(stripped, 96);
}

function buildTaskResultMessage(task: RuntimeTask): string {
  const heading = parseTaskHeading(task.prompt);
  const summary = heading ? `并行研究 ${heading}` : truncateCopy(task.prompt, 84);
  const output = truncateCopy((task.output ?? "").trim(), 240);

  if (task.status === "completed") {
    return output
      ? `后台研究已完成：${summary}\n\n${output}`
      : `后台研究已完成：${summary}`;
  }

  if (task.status === "failed") {
    return output
      ? `后台任务执行失败：${summary}\n\n${output}`
      : `后台任务执行失败：${summary}`;
  }

  return "";
}

function isTaskVisibleForSession(task: RuntimeTask, sessionId: string): boolean {
  return task.sessionId === sessionId;
}

function areTaskListsEquivalent(nextTasks: RuntimeTask[], prevTasks: RuntimeTask[]): boolean {
  if (nextTasks === prevTasks) return true;
  if (nextTasks.length !== prevTasks.length) return false;

  return nextTasks.every((task, index) => {
    const prev = prevTasks[index];
    return (
      task.id === prev.id &&
      task.status === prev.status &&
      task.updatedAt === prev.updatedAt &&
      task.sessionId === prev.sessionId &&
      task.projectId === prev.projectId &&
      task.prompt === prev.prompt &&
      task.output === prev.output
    );
  });
}

function areProjectSnapshotsEquivalent(
  nextProjects: ConversationProjectSnapshot[],
  prevProjects: ConversationProjectSnapshot[],
): boolean {
  if (nextProjects === prevProjects) return true;
  if (nextProjects.length !== prevProjects.length) return false;

  return nextProjects.every((project, index) => {
    const prev = prevProjects[index];
    return (
      project.projectId === prev.projectId &&
      project.updatedAt === prev.updatedAt &&
      project.derivedStage === prev.derivedStage &&
      project.currentObjective === prev.currentObjective &&
      project.agentSummary === prev.agentSummary
    );
  });
}

function areRecentSessionsEquivalent(
  nextSessions: StudioSessionState[] | undefined,
  prevSessions: StudioSessionState[] | undefined,
): boolean {
  if (nextSessions === prevSessions) return true;
  if (!nextSessions?.length && !prevSessions?.length) return true;
  if (!nextSessions || !prevSessions) return false;
  if (nextSessions.length !== prevSessions.length) return false;

  return nextSessions.every((session, index) => {
    const prev = prevSessions[index];
    return (
      session.sessionId === prev.sessionId &&
      session.projectId === prev.projectId &&
      session.mode === prev.mode &&
      session.compactedMessageCount === prev.compactedMessageCount &&
      session.messages.length === prev.messages.length &&
      session.draft === prev.draft &&
      session.qState?.request.id === prev.qState?.request.id &&
      session.qState?.currentIndex === prev.qState?.currentIndex
    );
  });
}

function mergeRecentProjects(
  currentProjects: ConversationProjectSnapshot[],
  nextProject: ConversationProjectSnapshot,
  limit = 8,
): ConversationProjectSnapshot[] {
  const merged = [nextProject, ...currentProjects.filter((item) => item.projectId !== nextProject.projectId)].slice(0, limit);
  return areProjectSnapshotsEquivalent(merged, currentProjects) ? currentProjects : merged;
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

const textOf = (content: unknown) =>
  Array.isArray(content)
    ? content
        .filter((block): block is { type: string; text?: string } => !!block && typeof block === "object" && "type" in block)
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n\n")
    : "";

const toQuery = (messages: HomeAgentMessage[]): QueryMessage[] =>
  messages.flatMap((message) =>
    message.role === "system"
      ? []
      : [
          {
            type: message.role,
            uuid: message.id,
            message: { role: message.role, content: message.content },
          } as QueryMessage,
        ],
  );

function buildReviewQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listPendingApprovalReviewItems(snapshot);
  if (!reviewQueue?.length) return null;

  return {
    id: `review-${snapshot.projectId}`,
    title: `我已恢复《${snapshot.title}》的待审阅素材，先怎么处理？`,
    description: `当前有 ${reviewQueue.length} 条待审阅项，仍然可以直接输入自定义要求。`,
    options: [
      {
        id: `${snapshot.projectId}-review-open`,
        label: "整理待审阅项",
        value: "review:queue",
        rationale: "先同步待审阅状态，再决定具体通过还是重做。",
      },
      {
        id: `${snapshot.projectId}-review-pass`,
        label: "通过稳定项",
        value: "review:approve-stable",
        rationale: "先收口已经稳定的素材，减少后续反复。",
      },
      {
        id: `${snapshot.projectId}-review-redo`,
        label: "只重做风险项",
        value: "review:redo-risk",
        rationale: "先把风险镜头统一退回重做。",
      },
      {
        id: `${snapshot.projectId}-review-list`,
        label: "逐条审阅",
        value: "review:list",
        rationale: "展开逐条处理入口，再决定每条素材的去留。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "review-recovery",
  };
}

function buildVideoRepairQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const redoItems = listRedoReviewItems(snapshot);
  if (!redoItems.length) return null;

  return {
    id: `video-repair-${snapshot.projectId}`,
    title: `《${snapshot.title}》已有 ${redoItems.length} 条镜头被退回重做，先怎么修复？`,
    description: "可以整批回发，也可以只挑当前最关键的镜头先重做。",
    options: [
      {
        id: `${snapshot.projectId}-video-repair-all`,
        label: redoItems.length === 1 ? "直接重做这条镜头" : "重做全部退回镜头",
        value: "video:repair:all",
        rationale: "先把已明确需要返工的镜头统一送回重做。",
      },
      {
        id: `${snapshot.projectId}-video-repair-list`,
        label: "指定镜头重做",
        value: "video:repair:list",
        rationale: "只挑当前最关键的镜头先返工，保持修复节奏可控。",
      },
      {
        id: `${snapshot.projectId}-video-repair-review`,
        label: "先复核重做原因",
        value: "video:repair:review",
        rationale: "先看清每条镜头为什么被退回，再决定是否整批重做。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-repair",
  };
}

function buildVideoRepairListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const redoItems = listRedoReviewItems(snapshot);
  if (!redoItems.length) return null;

  return {
    id: `video-repair-list-${snapshot.projectId}`,
    title: `先重做《${snapshot.title}》里的哪条镜头？`,
    description: "只会回发你选中的镜头，后续仍然在首页里继续看结果。",
    options: redoItems.slice(0, 5).map((item) => ({
      id: item.id,
      label: item.title,
      value: `video:repair:item:${item.id}`,
      rationale: item.reason || item.summary,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-repair-list",
  };
}

function normalizeVideoSceneStatus(status: string | undefined): string {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "";
  if (/(queued|pending|submitted)/.test(value)) return "queued";
  if (/(completed|success|succeeded|done)/.test(value)) return "completed";
  if (/(failed|error|cancel)/.test(value)) return "failed";
  return "processing";
}

function compareSceneOrder(a: Scene, b: Scene): number {
  const segmentA = a.segmentLabel ?? "";
  const segmentB = b.segmentLabel ?? "";
  return a.sceneNumber - b.sceneNumber || segmentA.localeCompare(segmentB, "zh-CN");
}

function formatSceneOptionLabel(scene: Scene): string {
  return `镜头 ${scene.sceneNumber}${scene.segmentLabel ? ` / ${scene.segmentLabel}` : ""} · ${scene.sceneName}`;
}

function summarizeSceneOption(scene: Scene): string {
  const fragments = [scene.description, scene.cameraDirection, scene.dialogue]
    .map((value) => value?.trim())
    .filter(Boolean);
  return truncateCopy(fragments[0] ?? "使用当前镜头设定继续推进出片。", 88);
}

function listGeneratableVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];

  return [...project.scenes]
    .filter((scene) => {
      const status = normalizeVideoSceneStatus(scene.videoStatus);
      if (status === "queued" || status === "processing") return false;
      return !scene.videoUrl;
    })
    .sort(compareSceneOrder);
}

function listFailedVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes]
    .filter((scene) => normalizeVideoSceneStatus(scene.videoStatus) === "failed")
    .sort(compareSceneOrder);
}

function listRunningVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes]
    .filter((scene) => {
      const status = normalizeVideoSceneStatus(scene.videoStatus);
      return !!scene.videoTaskId && (status === "queued" || status === "processing");
    })
    .sort(compareSceneOrder);
}

function listCompletedVideoScenes(project: PersistedVideoProject | null | undefined): Scene[] {
  if (!project) return [];
  return [...project.scenes]
    .filter((scene) => !!scene.videoUrl)
    .sort(compareSceneOrder);
}

function countStoryboardedScenes(project: PersistedVideoProject | null | undefined): number {
  if (!project) return 0;
  return project.scenes.filter((scene) => !!scene.storyboardUrl).length;
}

function countShotPackets(project: PersistedVideoProject | null | undefined): number {
  return project?.shotPackets?.length ?? 0;
}

function buildVideoBridgeQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  if (snapshot.projectKind !== "video") return null;
  if (snapshot.derivedStage === "视频提示词" || snapshot.derivedStage === "生成中" || snapshot.derivedStage === "审阅与修复") {
    return null;
  }

  const sceneCount = project?.scenes.length ?? 0;
  const storyboardedSceneCount = countStoryboardedScenes(project);
  const shotPacketCount = countShotPackets(project);

  switch (snapshot.derivedStage) {
    case "脚本拆解":
      return {
        id: `video-bridge-analyze-${snapshot.projectId}`,
        title: `《${snapshot.title}》已经进入视频桥接阶段。`,
        description: sceneCount
          ? `已整理 ${sceneCount} 个镜头草稿。`
          : "先把剧本拆成镜头流。",
        options: [
          {
            id: `${snapshot.projectId}-video-analyze`,
            label: sceneCount ? "梳理脚本拆解结果" : "先完成第一轮镜头拆解",
            value: "video:bridge:analyze",
            rationale: "先把剧本转换成首页可继续推进的镜头序列。",
          },
          {
            id: `${snapshot.projectId}-video-entities`,
            label: "继续提取角色与场景",
            value: "video:bridge:entities",
            rationale: "先抽出角色和场景资产，避免后面分镜与出片漂移。",
          },
          {
            id: `${snapshot.projectId}-video-platform`,
            label: "补充平台和镜头偏好",
            value: "video:bridge:platform",
            rationale: "先补足平台、风格和目标，有助于后续镜头语言统一。",
          },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-analyze",
      };
    case "角色与场景":
      return {
        id: `video-bridge-entities-${snapshot.projectId}`,
        title: `《${snapshot.title}》的角色与场景资产可以继续收口。`,
        description: sceneCount
          ? `已拆解 ${sceneCount} 个镜头。`
          : "先补齐角色与场景资产。",
        options: [
          {
            id: `${snapshot.projectId}-video-entities-refresh`,
            label: "先整理角色和场景资产",
            value: "video:bridge:entities",
            rationale: "优先收口角色与场景设定，后续分镜更稳。",
          },
          {
            id: `${snapshot.projectId}-video-storyboard`,
            label: storyboardedSceneCount ? "继续整理分镜批次" : "开始整理分镜批次",
            value: "video:bridge:storyboard",
            rationale: "把已有镜头推进到分镜层，保持首页单链路生产。",
          },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-entities",
      };
    case "分镜批次":
      return {
        id: `video-bridge-storyboard-${snapshot.projectId}`,
        title: `《${snapshot.title}》的分镜批次可以继续推进。`,
        description: storyboardedSceneCount
          ? `已有 ${storyboardedSceneCount} 条分镜结果。`
          : "先继续整理分镜批次。",
        options: [
          {
            id: `${snapshot.projectId}-video-storyboard-next`,
            label: storyboardedSceneCount ? "继续补齐剩余分镜批次" : "继续生成分镜批次",
            value: "video:bridge:storyboard",
            rationale: "先补齐分镜，让后续提示词和出片建立在完整镜头语言上。",
          },
          {
            id: `${snapshot.projectId}-video-shot-packets`,
            label: shotPacketCount ? "更新镜头指令包" : "编译镜头指令包",
            value: "video:bridge:shots",
            rationale: "把分镜压成可复用的 shot packet，方便继续生成提示词。",
          },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-storyboard",
      };
    case "镜头指令包":
      return {
        id: `video-bridge-shots-${snapshot.projectId}`,
        title: `《${snapshot.title}》的镜头指令包已经可用。`,
        description: shotPacketCount
          ? `已编译 ${shotPacketCount} 个镜头指令包。`
          : "先编译 shot packet。",
        options: [
          {
            id: `${snapshot.projectId}-video-shot-review`,
            label: shotPacketCount ? `复核 ${shotPacketCount} 个镜头指令包` : "编译镜头指令包",
            value: "video:bridge:shots",
            rationale: "先把镜头指令包收口，避免后续提示词批次反复返工。",
          },
          {
            id: `${snapshot.projectId}-video-prompts`,
            label: "准备视频提示词批次",
            value: "video:bridge:prompts",
            rationale: "直接把镜头指令包推进到提示词批次，准备进入第一轮出片。",
          },
        ],
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "video-bridge-shots",
      };
    default:
      return null;
  }
}

function buildVideoGenerationQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  const candidates = listGeneratableVideoScenes(project);
  if (!candidates.length) return null;

  const failedScenes = listFailedVideoScenes(project);
  const firstBatchSize = Math.min(3, candidates.length);
  const options = [
    {
      id: `${snapshot.projectId}-video-generate-first`,
      label:
        candidates.length === 1
          ? `直接生成 ${formatSceneOptionLabel(candidates[0])}`
          : `先生成前 ${firstBatchSize} 条镜头`,
      value: "video:generate:first",
      rationale:
        candidates.length === 1
          ? "直接把当前最靠前的镜头送去出片，继续留在首页等待结果。"
          : `优先验证最靠前的 ${firstBatchSize} 条镜头，保持第一轮出片节奏。`,
    },
    ...(failedScenes.length
      ? [
          {
            id: `${snapshot.projectId}-video-generate-failed`,
            label: `补发 ${Math.min(failedScenes.length, 3)} 条失败镜头`,
            value: "video:generate:failed",
            rationale: "先把失败镜头回补一轮，避免卡住后续审阅。",
          },
        ]
      : []),
    ...(candidates.length > 1
      ? [
          {
            id: `${snapshot.projectId}-video-generate-list`,
            label: "指定镜头出片",
            value: "video:generate:list",
            rationale: "先点选具体镜头，再只发这一小批。",
          },
        ]
      : []),
  ];

  return {
    id: `video-generate-${snapshot.projectId}`,
    title: `《${snapshot.title}》的视频提示词已就绪，先怎么开始出片？`,
    description: `当前可直接出片 ${candidates.length} 条镜头。`,
    options,
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-generate",
  };
}

function buildVideoGenerationSceneListQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  const candidates = listGeneratableVideoScenes(project);
  if (!candidates.length) return null;

  return {
    id: `video-generate-list-${snapshot.projectId}`,
    title: `先发《${snapshot.title}》里的哪条镜头？`,
    description: "只提交你选中的镜头。",
    options: candidates.slice(0, 5).map((scene) => ({
      id: scene.id,
      label: formatSceneOptionLabel(scene),
      value: `video:generate:scene:${scene.id}`,
      rationale: summarizeSceneOption(scene),
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-generate-list",
  };
}

function buildVideoRefreshQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  const runningScenes = listRunningVideoScenes(project);
  if (!runningScenes.length) return null;

  const completedScenes = listCompletedVideoScenes(project);
  const options = [
    {
      id: `${snapshot.projectId}-video-refresh-all`,
      label:
        runningScenes.length === 1
          ? `刷新 ${formatSceneOptionLabel(runningScenes[0])}`
          : "刷新全部进行中镜头",
      value: "video:refresh:all",
      rationale:
        runningScenes.length === 1
          ? "回收这一条镜头的最新状态，看是否已经能进入审阅。"
          : `当前有 ${runningScenes.length} 条镜头在后台处理中，先统一刷新结果。`,
    },
    ...(runningScenes.length > 1
      ? [
          {
            id: `${snapshot.projectId}-video-refresh-list`,
            label: "指定镜头查看结果",
            value: "video:refresh:list",
            rationale: "只查看某一条镜头的最新结果，减少打断。",
          },
        ]
      : []),
    ...(completedScenes.length
      ? [
          {
            id: `${snapshot.projectId}-video-review-generated`,
            label: `检查已生成的 ${completedScenes.length} 条视频资产`,
            value: "video:review:generated",
            rationale: "直接切到首页内的审阅动作，不再跳去别的工作区。",
          },
        ]
      : []),
  ];

  return {
    id: `video-refresh-${snapshot.projectId}`,
    title: `《${snapshot.title}》已有镜头在生成中，下一步怎么查结果？`,
    description: `后台处理中 ${runningScenes.length} 条。`,
    options,
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-refresh",
  };
}

function buildVideoRefreshSceneListQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  const runningScenes = listRunningVideoScenes(project);
  if (!runningScenes.length) return null;

  return {
    id: `video-refresh-list-${snapshot.projectId}`,
    title: `先看《${snapshot.title}》里的哪条镜头结果？`,
    description: "只轮询你选中的镜头。",
    options: runningScenes.slice(0, 5).map((scene) => ({
      id: scene.id,
      label: formatSceneOptionLabel(scene),
      value: `video:refresh:scene:${scene.id}`,
      rationale: summarizeSceneOption(scene),
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "video-refresh-list",
  };
}

function buildVideoContinuationQuestion(
  snapshot: ConversationProjectSnapshot,
  project: PersistedVideoProject | null | undefined,
): ComposerQuestion | null {
  if (snapshot.projectKind !== "video") return null;

  const bridgeQuestion = buildVideoBridgeQuestion(snapshot, project);
  if (bridgeQuestion) return bridgeQuestion;

  if (snapshot.derivedStage === "视频提示词") {
    return buildVideoGenerationQuestion(snapshot, project);
  }

  if (snapshot.derivedStage === "生成中") {
    return buildVideoRefreshQuestion(snapshot, project);
  }

  return null;
}

function listUnlockedCharacterCards(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.characterStateCards?.filter((card) => card.status !== "locked") ?? [];
}

function findCharacterCard(snapshot: ConversationProjectSnapshot, cardId: string) {
  return snapshot.memory?.characterStateCards?.find((card) => card.id === cardId) ?? null;
}

function buildCharacterCardQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const cards = listUnlockedCharacterCards(snapshot);
  if (!cards.length) return null;

  const nextCard = cards[0];
  return {
    id: `script-character-${snapshot.projectId}`,
    title: `《${snapshot.title}》还有 ${cards.length} 张角色状态卡待收口。`,
    description: nextCard ? `建议先锁定 ${nextCard.name}。` : "也可以直接输入要求。",
    options: [
      {
        id: `${snapshot.projectId}-character-next`,
        label: nextCard ? `锁定 ${nextCard.name}` : "锁定下一张角色卡",
        value: "script:character-lock-next",
        rationale: "先锁定最关键的角色状态卡，保持人物关系稳定。",
      },
      {
        id: `${snapshot.projectId}-character-list`,
        label: "逐张检查角色卡",
        value: "script:character-list",
        rationale: "展开逐张入口，再决定锁定或继续完善。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-character",
  };
}

function buildCharacterCardListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const cards = listUnlockedCharacterCards(snapshot);
  if (!cards.length) return null;

  return {
    id: `script-character-list-${snapshot.projectId}`,
    title: `先处理《${snapshot.title}》里的哪张角色状态卡？`,
    description: "选中后可直接锁定或继续深化。",
    options: cards.slice(0, 5).map((card) => ({
      id: card.id,
      label: card.name,
      value: `script:character-item:${card.id}`,
      rationale: `${card.role} · ${card.coreConflict}`,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-character-list",
  };
}

function buildCharacterCardDecisionQuestion(
  snapshot: ConversationProjectSnapshot,
  cardId: string,
): ComposerQuestion | null {
  const card = findCharacterCard(snapshot, cardId);
  if (!card) return null;

  return {
    id: `script-character-item-${snapshot.projectId}-${cardId}`,
    title: `《${card.name}》这张角色状态卡怎么处理？`,
    description: `${card.coreConflict} / 目标：${card.desire}`,
    options: [
      {
        id: `${cardId}-lock`,
        label: "锁定这张角色卡",
        value: `script:character-lock:${cardId}`,
        rationale: "确认这张角色卡已经稳定，后续剧情按它推进。",
      },
      {
        id: `${cardId}-refine`,
        label: "继续深化这个角色",
        value: `script:character-refine:${cardId}`,
        rationale: "继续围绕这张角色卡补充人物动机、冲突和关系。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-character-decision",
  };
}

function listPendingCompliancePackets(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.complianceRevisionPackets?.filter((item) => item.status !== "resolved") ?? [];
}

function listUnlockedBeatPackets(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.storyBeatPackets?.filter((item) => item.status !== "locked") ?? [];
}

function findCompliancePacket(snapshot: ConversationProjectSnapshot, packetId: string) {
  return snapshot.memory?.complianceRevisionPackets?.find((item) => item.id === packetId) ?? null;
}

function findBeatPacket(snapshot: ConversationProjectSnapshot, packetId: string) {
  return snapshot.memory?.storyBeatPackets?.find((item) => item.id === packetId) ?? null;
}

function findRecommendedAction(
  snapshot: ConversationProjectSnapshot,
  predicate: (action: string) => boolean,
) {
  return snapshot.recommendedActions.find((action) => predicate(action)) ?? null;
}

function extractEpisodeNumberFromAction(action: string | null | undefined): number | null {
  if (!action) return null;
  const match = action.match(/第\s*(\d+)\s*集/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildComplianceQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listPendingCompliancePackets(snapshot);
  if (!packets.length) return null;

  const highRiskCount = packets.filter((packet) => packet.riskLevel === "high").length;
  return {
    id: `script-compliance-${snapshot.projectId}`,
    title: `《${snapshot.title}》还有 ${packets.length} 条合规修订包待处理。`,
    description: highRiskCount
      ? `其中 ${highRiskCount} 条为高风险。`
      : "也可以直接输入修订要求。",
    options: [
      {
        id: `${snapshot.projectId}-compliance-high`,
        label: highRiskCount ? "先处理高风险项" : "逐条处理修订包",
        value: highRiskCount ? "script:compliance-resolve-high" : "script:compliance-list",
        rationale: highRiskCount ? "先把高风险项收口，再继续后续导出。" : "先展开待处理修订包，再逐条确认。",
      },
      {
        id: `${snapshot.projectId}-compliance-list`,
        label: "逐条处理修订包",
        value: "script:compliance-list",
        rationale: "展开逐条处理入口，保留首页单会话体验。",
      },
      {
        id: `${snapshot.projectId}-compliance-rerun`,
        label: "重新跑合规审查",
        value: "script:compliance-rerun",
        rationale: "用当前最新正文重新生成一轮审查意见。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-compliance",
  };
}

function buildComplianceListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listPendingCompliancePackets(snapshot);
  if (!packets.length) return null;

  return {
    id: `script-compliance-list-${snapshot.projectId}`,
    title: `先处理《${snapshot.title}》里的哪条修订包？`,
    description: "选中后可直接处理或继续改写。",
    options: packets.slice(0, 5).map((packet) => ({
      id: packet.id,
      label: packet.issueTitle,
      value: `script:compliance-item:${packet.id}`,
      rationale: `风险：${packet.riskLevel} · ${packet.recommendation}`,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-compliance-list",
  };
}

function buildComplianceDecisionQuestion(
  snapshot: ConversationProjectSnapshot,
  packetId: string,
): ComposerQuestion | null {
  const packet = findCompliancePacket(snapshot, packetId);
  if (!packet) return null;

  return {
    id: `script-compliance-item-${snapshot.projectId}-${packetId}`,
    title: `《${packet.issueTitle}》这条修订包怎么处理？`,
    description: packet.recommendation,
    options: [
      {
        id: `${packetId}-resolve`,
        label: "标记已处理",
        value: `script:compliance-resolve:${packetId}`,
        rationale: "确认这条修订已经落地，不再反复提示。",
      },
      {
        id: `${packetId}-rewrite`,
        label: "继续按这条改写",
        value: `script:compliance-rewrite:${packetId}`,
        rationale: "让 Agent 继续围绕这条修订推进文本改写。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-compliance-decision",
  };
}

function buildBeatPacketQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listUnlockedBeatPackets(snapshot);
  if (!packets.length) return null;

  const nextPacket = packets[0];
  return {
    id: `script-beat-${snapshot.projectId}`,
    title: `《${snapshot.title}》还有 ${packets.length} 条剧情 beat 可以继续收口。`,
    description: nextPacket ? `建议先处理第 ${nextPacket.episodeNumber} 集。` : "也可以直接输入推进要求。",
    options: [
      {
        id: `${snapshot.projectId}-beat-next`,
        label: nextPacket ? `锁定第 ${nextPacket.episodeNumber} 集 beat` : "锁定下一条 beat",
        value: "script:beat-lock-next",
        rationale: "先把最靠前的一条剧情 beat 收口，保持节奏连续。",
      },
      {
        id: `${snapshot.projectId}-beat-drafted`,
        label: "批量锁定已成型 beat",
        value: "script:beat-lock-drafted",
        rationale: "把已有细纲支撑的 beat 先锁住，减少反复。",
      },
      {
        id: `${snapshot.projectId}-beat-list`,
        label: "逐条检查剧情 beat",
        value: "script:beat-list",
        rationale: "展开逐条入口，再决定锁定或继续扩写。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-beat",
  };
}

function buildBeatPacketListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listUnlockedBeatPackets(snapshot);
  if (!packets.length) return null;

  return {
    id: `script-beat-list-${snapshot.projectId}`,
    title: `先处理《${snapshot.title}》里的哪条剧情 beat？`,
    description: "选中后可直接锁定或继续写。",
    options: packets.slice(0, 5).map((packet) => ({
      id: packet.id,
      label: `第 ${packet.episodeNumber} 集 · ${packet.title}`,
      value: `script:beat-item:${packet.id}`,
      rationale: packet.beatSummary,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-beat-list",
  };
}

function buildBeatPacketDecisionQuestion(
  snapshot: ConversationProjectSnapshot,
  packetId: string,
): ComposerQuestion | null {
  const packet = findBeatPacket(snapshot, packetId);
  if (!packet) return null;

  return {
    id: `script-beat-item-${snapshot.projectId}-${packetId}`,
    title: `第 ${packet.episodeNumber} 集 · ${packet.title} 这条 beat 怎么处理？`,
    description: packet.beatSummary,
    options: [
      {
        id: `${packetId}-lock`,
        label: "锁定这条 beat",
        value: `script:beat-lock:${packetId}`,
        rationale: "确认这条剧情节点已经成型，后续按它推进。",
      },
      {
        id: `${packetId}-write`,
        label: `继续写第 ${packet.episodeNumber} 集`,
        value: `script:beat-write:${packet.episodeNumber}`,
        rationale: "直接用当前 beat 去推进这一集正文。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-beat-decision",
  };
}

function buildEpisodeWorkflowQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  if (snapshot.projectKind === "video" || snapshot.derivedStage !== "剧本撰写") return null;

  const nextEpisodeAction = findRecommendedAction(snapshot, (action) =>
    /^继续(?:生成|写)第\s*\d+\s*集$/.test(action) || action === "继续生成下一集",
  );
  const reviewAction = findRecommendedAction(snapshot, (action) => action.includes("批量质检"));
  const complianceAction = findRecommendedAction(snapshot, (action) => action.includes("合规审查"));

  if (!nextEpisodeAction && !reviewAction && !complianceAction) return null;

  const nextEpisodeNumber = extractEpisodeNumberFromAction(nextEpisodeAction);
  return {
    id: `script-episode-${snapshot.projectId}`,
    title: `《${snapshot.title}》已经进入正文推进阶段。`,
    description: nextEpisodeNumber
      ? `建议先接上第 ${nextEpisodeNumber} 集。`
      : "可继续写下一集、先质检，或直接合规审查。",
    options: [
      nextEpisodeAction
        ? {
            id: `${snapshot.projectId}-episode-next`,
            label: nextEpisodeAction,
            value: `script:episode-generate:${nextEpisodeNumber ?? "auto"}`,
            rationale: nextEpisodeNumber
              ? `继续补齐第 ${nextEpisodeNumber} 集正文，让首页会话保持单链路推进。`
              : "继续沿着当前目录补写下一集正文。",
          }
        : null,
      reviewAction
        ? {
            id: `${snapshot.projectId}-episode-review`,
            label: reviewAction,
            value: "script:episode-review",
            rationale: "先做一轮批量质检，把连续性、节奏和角色口吻风险集中找出来。",
          }
        : null,
      complianceAction
        ? {
            id: `${snapshot.projectId}-episode-compliance`,
            label: complianceAction,
            value: "script:episode-compliance",
            rationale: "直接把当前正文送入合规审查，收口风险点并准备导出。",
          }
        : null,
    ].filter((option): option is NonNullable<typeof option> => Boolean(option)),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-episode",
  };
}

function buildExportWorkflowQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  if (snapshot.projectKind === "video" || snapshot.derivedStage !== "导出与出片") return null;

  const exportAction = findRecommendedAction(
    snapshot,
    (action) => action.includes("导出整合文档") || action.includes("修改导出稿"),
  );
  const videoAction = findRecommendedAction(snapshot, (action) => action.includes("视频工作流"));
  const patchAction = findRecommendedAction(snapshot, (action) => action.includes("补写"));

  if (!exportAction && !videoAction && !patchAction) return null;

  const hasExportArtifact = snapshot.artifacts.some((artifact) => artifact.kind === "export");
  return {
    id: `script-export-${snapshot.projectId}`,
    title: `《${snapshot.title}》已经进入导出与出片阶段。`,
    description: hasExportArtifact
      ? "导出稿已在当前会话里。"
      : "可先导出，再接视频工作流。",
    options: [
      exportAction
        ? {
            id: `${snapshot.projectId}-export-document`,
            label: exportAction,
            value: exportAction.includes("修改导出稿") ? "script:export-refine" : "script:export-document",
            rationale: exportAction.includes("修改导出稿")
              ? "继续围绕当前导出稿润色结构、语气和交付格式。"
              : "先整理一份完整导出稿，方便后续交付和出片。",
          }
        : null,
      videoAction
        ? {
            id: `${snapshot.projectId}-export-video`,
            label: videoAction,
            value: "script:export-video",
            rationale: "把当前剧本直接桥接到首页视频工作流，不再跳出当前会话。",
          }
        : null,
      patchAction
        ? {
            id: `${snapshot.projectId}-export-patch`,
            label: patchAction,
            value: "script:export-patch",
            rationale: "先定位缺失章节或集数，再决定补写哪一块。",
          }
        : null,
    ].filter((option): option is NonNullable<typeof option> => Boolean(option)),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "script-export",
  };
}

function buildScriptPacketQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  return (
    buildComplianceQuestion(snapshot) ??
    buildCharacterCardQuestion(snapshot) ??
    buildBeatPacketQuestion(snapshot) ??
    buildEpisodeWorkflowQuestion(snapshot) ??
    buildExportWorkflowQuestion(snapshot)
  );
}

const brief = (snapshot: ConversationProjectSnapshot) =>
  [
    `已恢复项目《${snapshot.title}》。`,
    `当前阶段：${snapshot.derivedStage}`,
    `当前目标：${snapshot.currentObjective}`,
    summarizeRecoveryArtifacts(snapshot),
    snapshot.agentSummary,
    snapshot.recommendedActions.length
      ? `建议下一步：\n${snapshot.recommendedActions
          .slice(0, 3)
          .map((action) => `- ${action}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

const recQuestion = (
  snapshot: ConversationProjectSnapshot,
  videoProject?: PersistedVideoProject | null,
): ComposerQuestion | null =>
  buildReviewQuestion(snapshot) ??
  buildVideoRepairQuestion(snapshot) ??
  buildVideoContinuationQuestion(snapshot, videoProject) ??
  buildScriptPacketQuestion(snapshot) ??
  (snapshot.recommendedActions.length
    ? {
        id: `r-${snapshot.projectId}`,
        title: `我已分析《${snapshot.title}》的当前状态，下一步先推进哪一块？`,
        description: `${summarizeRecoveryArtifacts(snapshot)} 你也可以直接输入自定义指令。`,
        options: snapshot.recommendedActions.slice(0, 3).map((action, index) => ({
          id: `${snapshot.projectId}-${index}`,
          label: action,
          value: action,
          rationale: buildRecoveryActionRationale(snapshot, action, index),
        })),
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "recovery",
      }
    : null);

function listActionableReviewItems(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "pending" || item.status === "redo") ?? [];
}

function listPendingApprovalReviewItems(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "pending") ?? [];
}

function listRedoReviewItems(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "redo") ?? [];
}

function findReviewItem(snapshot: ConversationProjectSnapshot, reviewId: string) {
  return listActionableReviewItems(snapshot).find((item) => item.id === reviewId) ?? null;
}

function collectReviewTargetIds(snapshot: ConversationProjectSnapshot, mode: "stable" | "risk"): string[] {
  return (mode === "stable" ? listPendingApprovalReviewItems(snapshot) : listRedoReviewItems(snapshot))
    .flatMap((item) => (item.targetIds.length ? item.targetIds : [item.id]));
}

function buildReviewListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listActionableReviewItems(snapshot);
  if (!reviewQueue.length) return null;

  return {
    id: `review-list-${snapshot.projectId}`,
    title: `先处理《${snapshot.title}》里的哪条待审阅项？`,
    description: "选中后我会继续给出通过或重做动作，也可以直接输入自定义修订要求。",
    options: reviewQueue.slice(0, 5).map((item) => ({
      id: item.id,
      label: item.title,
      value: `review:item:${item.id}`,
      rationale: item.summary,
    })),
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "review-item-list",
  };
}

function buildReviewDecisionQuestion(
  snapshot: ConversationProjectSnapshot,
  reviewId: string,
): ComposerQuestion | null {
  const item = findReviewItem(snapshot, reviewId);
  if (!item) return null;

  return {
    id: `review-item-${snapshot.projectId}-${reviewId}`,
    title: `《${item.title}》这条素材怎么处理？`,
    description: item.summary,
    options: [
      {
        id: `${reviewId}-approve`,
        label: "通过这条素材",
        value: `review:item-approve:${reviewId}`,
        rationale: "确认这条素材已经可用，直接保留下来。",
      },
      {
        id: `${reviewId}-redo`,
        label: "标记这条重做",
        value: `review:item-redo:${reviewId}`,
        rationale: "保留当前判断，但把这条镜头退回重做。",
      },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "review-item-decision",
  };
}

const createQState = (request: AskUserQuestionRequest): QState => ({
  request,
  currentIndex: 0,
  answers: {},
  displayAnswers: {},
});

const qStepKey = (
  index: number,
  question: Pick<AskUserQuestionRequest["questions"][number], "header">,
) => `${index}:${question.header}`;

const projectKindLabel = (kind?: ConversationProjectSnapshot["projectKind"]) =>
  kind === "adaptation" ? "参考改编" : kind === "video" ? "视频工作流" : "原创剧本";

function formatDateLabel(value?: string): string {
  if (!value) return "刚刚整理";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚整理";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncateCopy(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function isVideoIntentPrompt(prompt: string, snapshot?: ConversationProjectSnapshot | null): boolean {
  if (snapshot?.projectKind === "video") return true;

  const lowered = prompt.trim().toLowerCase();
  if (!lowered) return false;

  return [
    "视频",
    "分镜",
    "镜头",
    "出片",
    "提示词批次",
    "seedance",
    "dreamina",
    "即梦",
    "text2video",
    "image2video",
  ].some((keyword) => lowered.includes(keyword));
}

function buildDreaminaCapabilityOverlay(message?: string): string {
  const capabilitySummary = message?.trim() || "已检测到本机 Dreamina CLI 登录态";
  return [
    "当前运行环境附加能力：",
    `${capabilitySummary}，可直接使用官方 Dreamina CLI 继续 Seedance 2.0 / Seedance 2.0 Fast 视频生成。`,
    "当用户进入视频工作流、镜头出片、提示词批次或资产续接时，你应把这项能力纳入分析，并优先给出基于当前本机能力可直接执行的建议。",
  ].join("\n");
}

function RailSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/8 px-5 py-5 last:border-b-0">
      {eyebrow ? (
        <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">{eyebrow}</div>
      ) : null}
      <div className="mb-3 text-sm font-semibold text-slate-100">{title}</div>
      {children}
    </section>
  );
}


const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  shouldAnimate,
  reduceMotion,
}: {
  message: HomeAgentMessage;
  shouldAnimate: boolean;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      initial={reduceMotion || !shouldAnimate ? false : { opacity: 0, y: 10 }}
      animate={reduceMotion || !shouldAnimate ? undefined : { opacity: 1, y: 0 }}
      transition={
        reduceMotion || !shouldAnimate
          ? undefined
          : {
              duration: 0.16,
              ease: [0.22, 1, 0.36, 1],
            }
      }
      className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
    >
      {message.role === "assistant" ? (
        <div className="max-w-[660px] pr-3 sm:pr-4">
          <div className="flex gap-2">
            <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/40">
              <Sparkles className="h-2.5 w-2.5" />
            </div>
            <div className="whitespace-pre-wrap break-words pt-0.5 text-[12.5px] leading-[1.74] text-white/74 sm:text-[13px] sm:leading-[1.8]">
              {message.content}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-[68%] rounded-[18px] border border-white/[0.045] bg-white/[0.04] px-3.5 py-2 text-[12.5px] leading-[1.62] text-white/82 sm:max-w-[60%] sm:text-[13px] sm:leading-[1.68]">
          {message.content}
        </div>
      )}
    </motion.div>
  );
});

const ConversationTimeline = memo(function ConversationTimeline({
  messages,
  endRef,
  streaming,
  hasFloatingDock,
}: {
  messages: HomeAgentMessage[];
  endRef: RefObject<HTMLDivElement | null>;
  streaming?: boolean;
  hasFloatingDock?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const animateFromIndex = Math.max(messages.length - 4, 0);
  const showStreamingGhost = streaming && (!messages.length || messages[messages.length - 1]?.role !== "assistant");

  return (
    <div className={cn("flex min-h-[calc(100vh-254px)] flex-col justify-end", hasFloatingDock && "md:pr-[336px]")}>
      <div className="space-y-3.5 pb-5 pt-2 sm:space-y-4 sm:pb-6 sm:pt-3 [content-visibility:auto]">
        {messages.map((message, index) => (
          <ConversationMessageRow
            key={message.id}
            message={message}
            shouldAnimate={index >= animateFromIndex}
            reduceMotion={Boolean(reduceMotion)}
          />
        ))}
        {showStreamingGhost ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={reduceMotion ? undefined : { duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-start"
          >
            <div className="max-w-[660px] pr-3 sm:pr-4">
              <div className="flex gap-2">
                <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/34">
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-white/42">
                  <span>正在分析</span>
                  <span className="inline-flex gap-1">
                    <span className="h-1 w-1 rounded-full bg-white/36" />
                    <span className="h-1 w-1 rounded-full bg-white/28" />
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
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
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanelId>(initialUtility);
  const [activeProjectId, setActiveProjectId] = useState(
    session?.projectId ?? session?.currentProjectSnapshot?.projectId,
  );
  const [compactedMessageCount, setCompactedMessageCount] = useState(session?.compactedMessageCount ?? 0);
  const [maintenanceHint, setMaintenanceHint] = useState<string | null>(null);
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
  const surfacedDreaminaHintRef = useRef(false);
  const maintenanceHintTimerRef = useRef<number | null>(null);
  const compactionJobVersionRef = useRef(0);
  const previousQuestionStepRef = useRef<string | null>(
    session?.qState ? `${session.qState.request.id}:${session.qState.currentIndex}` : null,
  );
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

  const currentProject = runtime.currentProjectSnapshot;
  const baseQuestion = useMemo(
    () => qToComposer(qState) || popoverOverride || suggested,
    [popoverOverride, qState, suggested],
  );
  const question = useMemo(
    () =>
      baseQuestion
        ? {
            ...baseQuestion,
            options: baseQuestion.options.map((option) => ({
              ...option,
              selected: selectedValues.includes(option.value),
            })),
          }
        : null,
    [baseQuestion, selectedValues],
  );
  const idle = mode === "idle" && messages.length === 0 && !currentProject;
  const activeTheme = true;
  const placeholder = question?.allowCustomInput ? CUSTOM : idle ? IDLE : ACTIVE;
  const deferredMessages = useDeferredValue(messages);
  const deferredProjectSnapshot = useDeferredValue(runtime.currentProjectSnapshot);
  const deferredRecentProjects = useDeferredValue(runtime.recentProjects);
  const reduceMotion = useReducedMotion();
  const settingsOpen = utilityPanel === "settings";
  const desktopSidebarOffset = desktopSidebarCollapsed
    ? DESKTOP_SIDEBAR_COLLAPSED_OFFSET
    : DESKTOP_SIDEBAR_OFFSET;
  const recentSessionSummary = useMemo(
    () =>
      deferredMessages
        .slice(-6)
        .map((message) => `${message.role}: ${truncateCopy(message.content, 120)}`)
        .join(" | "),
    [deferredMessages],
  );
  const compactedHistoryPrompt = useMemo(
    () => (compactedMessageCount > 0 ? buildCompactedHistoryPrompt(runtime.recentMessageSummary) : undefined),
    [compactedMessageCount, runtime.recentMessageSummary],
  );

  const flashMaintenanceHint = useCallback((message: string, duration = 2200) => {
    setMaintenanceHint(message);
    if (typeof window === "undefined") return;
    if (maintenanceHintTimerRef.current) {
      window.clearTimeout(maintenanceHintTimerRef.current);
    }
    maintenanceHintTimerRef.current = window.setTimeout(() => {
      setMaintenanceHint(null);
      maintenanceHintTimerRef.current = null;
    }, duration);
  }, []);

  const syncComposerDraft = useCallback((value: string) => {
    draftRef.current = value;
    const hasText = Boolean(value.trim());
    setDraftPresence((current) => (current === hasText ? current : hasText));

    if (typeof window === "undefined") {
      setPersistedDraft((current) => (current === value ? current : value));
      return;
    }

    if (draftPersistTimerRef.current) {
      window.clearTimeout(draftPersistTimerRef.current);
    }

    draftPersistTimerRef.current = window.setTimeout(() => {
      setPersistedDraft((current) => (current === draftRef.current ? current : draftRef.current));
      draftPersistTimerRef.current = null;
    }, 180);
  }, []);

  const resetComposerDraft = useCallback((value = "") => {
    if (typeof window !== "undefined" && draftPersistTimerRef.current) {
      window.clearTimeout(draftPersistTimerRef.current);
      draftPersistTimerRef.current = null;
    }
    draftRef.current = value;
    setDraftInitialValue(value);
    setPersistedDraft(value);
    setDraftPresence(Boolean(value.trim()));
    setDraftResetVersion((current) => current + 1);
  }, []);

  const composerShellClass = idle
    ? "overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,rgba(35,36,40,0.96),rgba(24,25,28,0.98))] shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
    : "overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(33,34,38,0.96),rgba(24,25,28,0.98))]";
  const sidebarAssets = useMemo(
    () =>
      collectConversationAssets(
        runtime.currentVideoProject,
        runtime.currentProjectSnapshot,
      ).slice(0, 12),
    [runtime.currentProjectSnapshot, runtime.currentVideoProject],
  );
  const deferredSidebarAssets = useDeferredValue(sidebarAssets);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => isTaskVisibleForSession(task, runtime.sessionId)),
    [tasks, runtime.sessionId],
  );
  const deferredVisibleTasks = useDeferredValue(visibleTasks);
  const deferredActiveProjectId = useDeferredValue(activeProjectId);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

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
  }, [dreaminaCapability, loadDreaminaCliModule]);

  useHomeAgentBootstrapEffects({
    runtime,
    mode,
    metaReady,
    messages,
    compactedMessageCount,
    initialUtility,
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
    setUtilityPanel,
    loadProjectStore,
    resolveDreaminaCapability,
    flashMaintenanceHint,
    scheduleBackgroundTask,
    areProjectSnapshotsEquivalent,
    areRecentSessionsEquivalent,
    areTaskListsEquivalent,
    writeDesktopSidebarCollapsed,
  });

  useEffect(() => {
    if (qState || streaming || popoverOverride) return;
    if (draftPresence) return;
    if (!runtime.currentProjectSnapshot) {
      if (suggested) setSuggested(null);
      return;
    }

    const nextSuggestion = recQuestion(runtime.currentProjectSnapshot, runtime.currentVideoProject);
    setSuggested((previous) => {
      const previousId = previous?.id ?? null;
      const nextId = nextSuggestion?.id ?? null;
      if (previousId === nextId) return previous;
      return nextSuggestion;
    });
  }, [draftPresence, popoverOverride, qState, runtime.currentProjectSnapshot, runtime.currentVideoProject, streaming, suggested]);

  useEffect(() => {
    const stepKey = qState ? `${qState.request.id}:${qState.currentIndex}` : null;
    if (stepKey === previousQuestionStepRef.current) return;
    previousQuestionStepRef.current = stepKey;
    if (!stepKey) return;
    setPopoverOverride(null);
    setSelectedValues([]);
    resetComposerDraft("");
  }, [qState, resetComposerDraft]);

  useEffect(() => {
    if (idle || streaming) return;

    const plan = planConversationCompaction(messages, compactedMessageCount, runtime.recentMessageSummary);
    if (!plan.shouldCompact) return;

    engineRef.current?.interrupt();
    engineRef.current = null;
    setCompactedMessageCount(plan.nextCompactedMessageCount);
    setRuntime((prev) => ({
      ...prev,
      recentMessageSummary: plan.nextSummary,
    }));
    flashMaintenanceHint("较早对话已静默整理");

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
        const cfg = apiConfig.getApiConfig();
        const refinedSummary = await semanticSummary.refineCompactedConversationSummary({
          existingSummary: baseSummary,
          compactedMessages: plan.compactedMessages,
          projectSnapshot: runtimeRef.current.currentProjectSnapshot,
          apiKey: cfg.claudeKey || cfg.geminiKey || cfg.gptKey,
          baseUrl: cfg.claudeEndpoint || cfg.geminiEndpoint || cfg.gptEndpoint,
          model: apiConfig.resolveConfiguredModelName("claude-sonnet-4-6"),
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
        // Fall back to the deterministic summary already persisted in state.
      }
    })();
  }, [
    compactedMessageCount,
    flashMaintenanceHint,
    idle,
    loadApiConfigModule,
    loadSemanticSummaryModule,
    messages,
    runtime.recentMessageSummary,
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
        compactedMessageCount,
        draft: draftRef.current || persistedDraft,
        qState,
        selectedValues,
      });
    }, 720);

    return cancelTask;
  }, [
    activeProjectId,
    deferredMessages,
    deferredProjectSnapshot,
    persistedDraft,
    idle,
    mode,
    qState,
    recentSessionSummary,
    compactedMessageCount,
    runtime.recentMessageSummary,
    selectedValues,
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
  }, [activeProjectId, loadProjectStore, runtime.currentDramaProject, runtime.currentVideoProject]);

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
  }, [idle, messages]);

  const push = useCallback((role: HomeAgentMessage["role"], content: string) => {
    if (!content.trim()) return;
    setMessages((prev) => [...prev, mk(role, content.trim())]);
  }, []);

  useEffect(() => {
    const newlySurfacedTasks: RuntimeTask[] = [];

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
  }, [draftPresence, popoverOverride, push, qState, streaming, visibleTasks]);

  const getEngine = useCallback(
    async () => {
      engineRef.current = await getOrCreateHomeAgentEngine({
        existingEngine: engineRef.current,
        loadEngineDeps,
        loadApiConfigModule,
        messages: messagesRef.current,
        compactedMessageCount: compactedMessageCountRef.current,
        recentMessageSummary: runtimeRef.current.recentMessageSummary,
        systemPrompt: PROMPT,
        toQuery,
        getAppState: () => runtimeRef.current,
        setRuntime,
        setCompactedMessageCount: (count) => {
          compactedMessageCountRef.current = count;
          setCompactedMessageCount(count);
        },
      });
      return engineRef.current;
    },
    [loadApiConfigModule, loadEngineDeps],
  );

  const launchAutoResearchTasks = useCallback(
    async (prompt: string) =>
      launchHomeAgentAutoResearchTasks({
        prompt,
        runtime: runtimeRef.current,
        loadApiConfigModule,
      }),
    [loadApiConfigModule],
  );

  const send = useCallback(
    async (prompt: string, shown?: string) => {
      const cleaned = beginSendFlow({
        prompt,
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
            setQuestionRequest: (request) => setQState(createQState(request)),
          });
        }
      } catch (error) {
        push("assistant", error instanceof Error ? error.message : String(error));
      } finally {
        setStreaming(false);
      }
    },
    [
      dreaminaCapability,
      flashMaintenanceHint,
      getEngine,
      launchAutoResearchTasks,
      loadConversationMemoryModule,
      loadProjectStore,
      resolveDreaminaCapability,
      loadStructuredQuestionParser,
      push,
      resetComposerDraft,
    ],
  );

  const reset = useCallback(() => {
    if (qState) {
      void loadAskUserQuestionModule().then((mod) => {
        mod.rejectAskUserQuestion(qState.request.id, "User reset conversation");
      });
    }

    engineRef.current?.interrupt();
    engineRef.current = null;
    surfacedTaskIdsRef.current.clear();
    surfacedTaskFollowupIdsRef.current.clear();
    setQState(null);
    setPopoverOverride(null);
    setSuggested(null);
    setSelectedValues([]);
    setMode("idle");
    setMessages([]);
    resetComposerDraft("");
    setCompactedMessageCount(0);
    setActiveProjectId(undefined);
    setRuntime((prev) => buildResetRuntimeState(prev));
    setMetaReady(false);
    clearStudioSession();
  }, [loadAskUserQuestionModule, qState, resetComposerDraft]);

  const openProject = useCallback(
    async (projectId: string) => {
      const store = await loadProjectStore();
      const savedSession = readStudioProjectSession(projectId);
      const source = await store.loadConversationSourceById(projectId);
      const snapshot = source.snapshot ?? savedSession?.currentProjectSnapshot;
      if (!snapshot) return;

      engineRef.current = null;
      startTransition(() => {
        const nextState = buildOpenProjectSessionState({
          savedSession,
          snapshot,
          videoProject: source.videoProject,
          buildBrief: brief,
          createAssistantMessage: (content) => mk("assistant", content),
          getSuggestedQuestion: recQuestion,
        });

        setActiveProjectId(projectId);
        setQState(nextState.qState);
        setPopoverOverride(nextState.popoverOverride);
        setSuggested(nextState.suggested);
        setSelectedValues(nextState.selectedValues);
        setMode(nextState.mode);
        setMessages(nextState.messages);
        resetComposerDraft(nextState.draft);
        setCompactedMessageCount(nextState.compactedMessageCount);
        previousQuestionStepRef.current = nextState.previousQuestionStep;

        setRuntime((prev) => ({
          ...prev,
          sessionId: nextState.sessionId,
          currentProjectSnapshot: snapshot,
          currentDramaProject: source.dramaProject,
          currentVideoProject: source.videoProject,
          recentProjects: mergeRecentProjects(prev.recentProjects, snapshot),
        }));
      });
      if (dreaminaCapability.available && snapshot.projectKind === "video") {
        flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2400);
        surfacedDreaminaHintRef.current = true;
      }
      setMetaReady(false);
    },
    [dreaminaCapability.available, flashMaintenanceHint, loadProjectStore, resetComposerDraft],
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
  }, [openProject, send]);

  useEffect(() => {
    const onAsk = (event: Event) => {
      const detail = (event as CustomEvent<AskUserQuestionRequest>).detail;
      if (!detail?.questions?.length) return;
      startTransition(() => {
        setPopoverOverride(null);
        setSuggested(null);
        setQState(createQState(detail));
        setSelectedValues([]);
        resetComposerDraft("");
        setMode("active");
      });
    };

    window.addEventListener("agent:ask-user-question", onAsk);
    return () => window.removeEventListener("agent:ask-user-question", onAsk);
  }, [resetComposerDraft]);

  const answer = useCallback(
    (value: string, label?: string) => {
      if (!qState) {
        setSuggested(null);
        void send(value, label);
        return;
      }

      const activeQuestion = qState.request.questions[qState.currentIndex];
      if (!activeQuestion) {
        setQState(null);
        setSelectedValues([]);
        resetComposerDraft("");
        return;
      }

      const transition = advanceStructuredAnswer({
        qState,
        value,
        label,
        qStepKey,
      });
      if (!transition) return;

      push("user", transition.userBubble);

      if (transition.isLastStep) {
        void loadAskUserQuestionModule().then((mod) => {
          mod.resolveAskUserQuestion(
            qState.request.id,
            serializeQuestionAnswers(qState.request, transition.nextAnswers),
          );
        });
        setQState(null);
      } else {
        setQState(transition.nextQState);
      }

      setSelectedValues([]);
      resetComposerDraft("");
    },
    [loadAskUserQuestionModule, qState, push, resetComposerDraft, send],
  );

  const handleTemplateLaunch = useCallback(
    (prompt: string, title: string) => {
      if (dreaminaCapability.available && title.includes("视频")) {
        flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2400);
        surfacedDreaminaHintRef.current = true;
      }
      void send(prompt, title);
    },
    [dreaminaCapability.available, flashMaintenanceHint, send],
  );

  const handleOpenProject = useCallback(
    (projectId: string) => {
      void openProject(projectId);
    },
    [openProject],
  );

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const handleOpenSettings = useCallback(() => {
    setUtilityPanel("settings");
    setMobileNavOpen(false);
    onUtilityChange?.("settings");
  }, [onUtilityChange]);

  const handleOpenMobileNavigation = useCallback(() => {
    setMobileNavOpen(true);
  }, []);

  const handleStopTask = useCallback((taskId: string) => {
    stopTask(taskId);
    const nextTasks = getAllTasks();
    setTasks((prev) => (areTaskListsEquivalent(nextTasks, prev) ? prev : nextTasks));
  }, []);
  const handleToggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((current) => !current);
  }, []);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      const next = open ? "settings" : undefined;
      setUtilityPanel(next);
      onUtilityChange?.(next);
    },
    [onUtilityChange],
  );
  const handleCloseSettings = useCallback(() => {
    handleSettingsOpenChange(false);
  }, [handleSettingsOpenChange]);

  const clearChoiceUi = useCallback(() => {
    setPopoverOverride(null);
    setSuggested(null);
  }, []);

  const activateConversation = useCallback(() => {
    setMode("active");
  }, []);

  const commitWorkflowRuntime = useCallback((nextRuntime: StudioRuntimeState, nextProjectId?: string) => {
    startTransition(() => {
      setRuntime(nextRuntime);
      if (nextProjectId) {
        setActiveProjectId(nextProjectId);
      }
    });
  }, []);

  const getSuggestedQuestion = useCallback(
    (snapshot: ConversationProjectSnapshot | null, runtime: StudioRuntimeState) =>
      snapshot ? recQuestion(snapshot, runtime.currentVideoProject) : null,
    [],
  );

  const runWorkflowActionShortcut = useCallback(
    async (action: string, input: Record<string, unknown>, userBubble: string) => {
      const workflow = await loadWorkflowActionsModule();
      const ui = createWorkflowShortcutUiBridge({
        activateConversation,
        clearChoiceUi,
        commitRuntime: commitWorkflowRuntime,
        getSuggestedQuestion,
        push,
        resetComposerDraft,
        setStreaming,
        setSuggested,
      });

      await runWorkflowShortcut({
        action,
        input,
        runtime: runtimeRef.current,
        runAction: (nextAction, nextInput, nextRuntime) =>
          workflow.runWorkflowAction(nextAction, nextInput, nextRuntime),
        ui,
        userBubble,
      });
    },
    [
      activateConversation,
      clearChoiceUi,
      commitWorkflowRuntime,
      getSuggestedQuestion,
      loadWorkflowActionsModule,
      push,
      resetComposerDraft,
    ],
  );

  const runWorkflowActionShortcutChain = useCallback(
    async (steps: Array<{ action: string; input: Record<string, unknown> }>, userBubble: string) => {
      const workflow = await loadWorkflowActionsModule();
      const ui = createWorkflowShortcutUiBridge({
        activateConversation,
        clearChoiceUi,
        commitRuntime: commitWorkflowRuntime,
        getSuggestedQuestion,
        push,
        resetComposerDraft,
        setStreaming,
        setSuggested,
      });

      await runWorkflowShortcutChain({
        runtime: runtimeRef.current,
        runAction: (nextAction, nextInput, nextRuntime) =>
          workflow.runWorkflowAction(nextAction, nextInput, nextRuntime),
        steps,
        ui,
        userBubble,
      });
    },
    [
      activateConversation,
      clearChoiceUi,
      commitWorkflowRuntime,
      getSuggestedQuestion,
      loadWorkflowActionsModule,
      push,
      resetComposerDraft,
    ],
  );

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
    [push, resetComposerDraft],
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
    [push, resetComposerDraft],
  );

  const videoProjectChoiceHandler = useMemo(
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
    [runWorkflowActionShortcut, send, showChoiceNotice, showChoicePopover],
  );

  const videoReviewChoiceHandler = useMemo(
    () =>
      createVideoReviewChoiceHandler({
        runWorkflowActionShortcut,
        showChoicePopover,
        collectReviewTargetIds,
        buildReviewListQuestion,
        findReviewItem,
        buildReviewDecisionQuestion,
      }),
    [runWorkflowActionShortcut, showChoicePopover],
  );

  const videoAssetChoiceHandler = useMemo(
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
    [runWorkflowActionShortcut, runWorkflowActionShortcutChain, showChoicePopover],
  );

  const scriptProjectChoiceHandler = useMemo(
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
    [runWorkflowActionShortcut, send, showChoicePopover],
  );

  const handleChoiceSelect = useCallback(
    (value: string, label: string) => {
      const snapshot = runtimeRef.current.currentProjectSnapshot;

      if (snapshot?.projectKind === "video" && videoProjectChoiceHandler(snapshot, value, label)) {
        return;
      }

      if (snapshot?.projectKind === "video" && question?.id.startsWith("review-")) {
        if (videoReviewChoiceHandler(snapshot, value, label)) {
          return;
        }
      }

      if (snapshot?.projectKind === "video" && videoAssetChoiceHandler(snapshot, value, label)) {
        return;
      }

      if (
        (snapshot?.projectKind === "script" || snapshot?.projectKind === "adaptation") &&
        question?.id.startsWith("script-") &&
        scriptProjectChoiceHandler(snapshot, value, label)
      ) {
        return;
      }

      if (!qState || (!question?.multiSelect && question?.submissionMode !== "confirm")) {
        answer(value, label);
        return;
      }

      setSelectedValues((prev) => {
        if (question.multiSelect) {
          return prev.includes(value)
            ? prev.filter((item) => item !== value)
            : [...prev, value];
        }
        return [value];
      });
    },
    [
      answer,
      qState,
      question,
      scriptProjectChoiceHandler,
      videoAssetChoiceHandler,
      videoProjectChoiceHandler,
      videoReviewChoiceHandler,
    ],
  );

  const confirmStructuredAnswer = useCallback(() => {
    if (!qState || !question) return;

    const activeQuestion = qState.request.questions[qState.currentIndex];
    if (!activeQuestion) return;

    const selectedLabels = question.options
      .filter((option) => selectedValues.includes(option.value))
      .map((option) => option.label);
    const custom = draftRef.current.trim();
    const hasSelection = selectedValues.length > 0;
    const submittedValue = [
      hasSelection ? selectedValues.join(" / ") : "",
      custom ? (hasSelection ? `补充：${custom}` : custom) : "",
    ]
      .filter(Boolean)
      .join("\n");
    const displayValue = [
      hasSelection ? selectedLabels.join(" / ") : "",
      custom ? (hasSelection ? `补充：${custom}` : custom) : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (!submittedValue.trim()) return;
    answer(submittedValue, displayValue || submittedValue || activeQuestion.question);
  }, [answer, qState, question, selectedValues]);

  const submitComposer = useCallback(() => {
    if (qState && (question?.submissionMode === "confirm" || question?.multiSelect)) {
      confirmStructuredAnswer();
      return;
    }

    if (qState) {
      answer(draftRef.current);
      return;
    }

    void send(draftRef.current);
  }, [answer, confirmStructuredAnswer, qState, question, send]);
  const handleInterrupt = useCallback(() => {
    engineRef.current?.interrupt();
    setStreaming(false);
  }, []);

  const composerProps = useMemo<HomeComposerProps>(
    () => ({
      idle,
      currentProjectTitle: currentProject?.title,
      currentProjectStage: currentProject?.derivedStage,
      maintenanceHint,
      initialDraft: draftInitialValue,
      draftResetVersion,
      draftPresence,
      onDraftChange: syncComposerDraft,
      placeholder,
      question,
      qState,
      selectedValues,
      streaming,
      reduceMotion,
      composerShellClass,
      activeTheme,
      onSelectChoice: handleChoiceSelect,
      onConfirmQuestion: qState ? confirmStructuredAnswer : undefined,
      onSubmit: submitComposer,
      onInterrupt: handleInterrupt,
    }),
    [
      activeTheme,
      composerShellClass,
      confirmStructuredAnswer,
      currentProject,
      draftPresence,
      draftInitialValue,
      draftResetVersion,
      handleInterrupt,
      handleChoiceSelect,
      idle,
      maintenanceHint,
      syncComposerDraft,
      placeholder,
      qState,
      question,
      reduceMotion,
      selectedValues,
      streaming,
      submitComposer,
    ],
  );
  const idleComposer = useMemo(
    () => (
      <div className={cn("mx-auto w-full", IDLE_TRACK_CLASS)}>
        <HomeComposer {...composerProps} />
      </div>
    ),
    [composerProps],
  );
  const activeComposer = useMemo(
    () => (
      <div className={cn("mx-auto w-full", ACTIVE_TRACK_CLASS)}>
        <HomeComposer {...composerProps} />
      </div>
    ),
    [composerProps],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#131314] text-white">
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
        onNewProject={handleReset}
        onOpenSettings={handleOpenSettings}
        onToggleCollapse={handleToggleDesktopSidebar}
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
        onNewProject={handleReset}
        onOpenSettings={handleOpenSettings}
      />
      <DesktopSettingsPanel
        open={settingsOpen}
        onClose={handleCloseSettings}
        leftOffset={desktopSidebarOffset}
        width={DESKTOP_SETTINGS_WIDTH}
      />
      <MobileSettingsSheet open={settingsOpen} onOpenChange={handleSettingsOpenChange} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <MobileTopbar idle={idle} brandLabel={SIDEBAR_BRAND} onOpenNavigation={handleOpenMobileNavigation} />
        <main
          className={cn(
            "relative flex-1 overflow-x-clip px-3.5 sm:px-4 md:px-8",
            idle ? "pb-0 pt-4 lg:pl-[var(--home-sidebar-offset)]" : "pb-0 pt-2 lg:pl-[var(--home-sidebar-offset)]",
          )}
          style={{ "--home-sidebar-offset": `${desktopSidebarOffset}px` } as React.CSSProperties}
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
            />
          )}
        </main>
      </div>
    </div>
  );
}
