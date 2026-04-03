import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  History,
  Image,
  Loader2,
  Menu,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Square,
  Wand2,
  Compass,
  PanelsTopLeft,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Message as QueryMessage } from "@/lib/agent/types";
import type { AskUserQuestionRequest } from "@/lib/agent/tools/ask-user-question";
import {
  clearStudioSession,
  readStudioProjectSession,
  readStudioSession,
  writeStudioSession,
} from "@/lib/home-agent/session-store";
import {
  AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT,
  buildCompactedHistoryPrompt,
  planConversationCompaction,
} from "@/lib/home-agent/conversation-compact";
import {
  buildAutoResearchPlan,
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
  WorkflowActionResult,
  WorkflowRuntimeDelta,
} from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";
import ComposerChoicePopover from "./ComposerChoicePopover";
import type { QueryEngine as QueryEngineClass } from "@/lib/agent/query-engine";
import { AgentTool } from "@/lib/agent/tools/agent-tool";
import { getAllTasks, stopTask, type Task } from "@/lib/agent/tools/task-tools";
import { ToolUseContext } from "@/lib/agent/tool";

const {
  Suspense,
  lazy,
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} = React;

type ReactNode = React.ReactNode;
type RefObject<T> = React.RefObject<T>;

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
const DESKTOP_SIDEBAR_WIDTH = 288;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = 88;
const DESKTOP_SIDEBAR_OFFSET = 320;
const DESKTOP_SIDEBAR_COLLAPSED_OFFSET = 120;
const DESKTOP_SETTINGS_WIDTH = 456;
const DESKTOP_SIDEBAR_COLLAPSE_KEY = "storyforge-home-agent-desktop-sidebar-collapsed-v1";
const ACTIVE_TRACK_CLASS = "max-w-[960px]";
const IDLE_TRACK_CLASS = "max-w-[920px]";
const SETTINGS_PANEL_CLASS =
  "rounded-[28px] border border-white/10 bg-[#f4f1ea] text-slate-900 shadow-[0_28px_70px_rgba(0,0,0,0.28)]";
const MOBILE_SETTINGS_SHEET =
  "w-full border-r border-[#e7e1d7] bg-[#f4f1ea] p-0 text-slate-900 shadow-[18px_0_48px_rgba(0,0,0,0.24)] overscroll-contain sm:max-w-[440px]";
const SettingsPage = lazy(() => import("@/pages/Settings"));
type EngineDeps = {
  QueryEngine: typeof QueryEngineClass;
  createDefaultTools: typeof import("@/lib/agent/tools").createDefaultTools;
};

type ProjectStoreModule = typeof import("@/lib/home-agent/project-store");
type ApiConfigModule = typeof import("@/lib/api-config");
type AskUserQuestionModule = typeof import("@/lib/agent/tools/ask-user-question");
type StructuredQuestionParserModule = typeof import("./structured-question-parser");
type WorkflowActionsModule = typeof import("@/lib/home-agent/workflow-actions");
type SemanticSummaryModule = typeof import("@/lib/home-agent/conversation-semantic-summary");
type ConversationMemoryModule = typeof import("@/lib/home-agent/conversation-memory");
type RuntimeTask = Task;

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

function createInitialStudioSeed(): {
  session: StudioSessionState | null;
  runtime: StudioRuntimeState;
} {
  const session = readStudioSession();

  return {
    session,
    runtime: {
      sessionId: session?.sessionId ?? crypto.randomUUID(),
      currentProjectSnapshot: session?.currentProjectSnapshot ?? null,
      currentDramaProject: null,
      currentVideoProject: null,
      currentSetupDraft: null,
      skillDrafts: [],
      maintenanceReports: [],
      recentProjects: [],
      recentMessageSummary: session?.recentMessageSummary ?? "",
    },
  };
}

function summarizeRecoveryArtifacts(snapshot: ConversationProjectSnapshot): string {
  const labels = snapshot.artifacts
    .slice(0, 3)
    .map((artifact) => artifact.label)
    .filter(Boolean);

  return labels.length
    ? `我已对照当前项目产物做了恢复分析，最近可直接承接的内容是：${labels.join("、")}。`
    : "我已对照当前项目状态做了恢复分析，当前更适合先补齐一份可复用的核心产物。";
}

function buildRecoveryActionRationale(
  snapshot: ConversationProjectSnapshot,
  action: string,
  index: number,
): string {
  const artifact = snapshot.artifacts[index] ?? snapshot.artifacts[0];
  if (artifact) {
    return `优先围绕「${artifact.label}」继续推进，保持在${snapshot.derivedStage}阶段内完成。`;
  }

  if (snapshot.currentObjective.trim()) {
    return `会先围绕当前目标“${snapshot.currentObjective}”推进，不需要跳出首页。`;
  }

  return `继续留在${snapshot.derivedStage}阶段里推进这一步，不需要跳出首页。`;
}

function buildReviewQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listPendingReviewItems(snapshot);
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
    description: nextCard ? `建议优先锁定 ${nextCard.name}，避免后续剧情推进时角色动机漂移。` : "也可以直接输入自定义人物修订要求。",
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
    description: "选中后可以直接锁定，也可以继续围绕这张角色卡深化人物。",
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

function buildComplianceQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const packets = listPendingCompliancePackets(snapshot);
  if (!packets.length) return null;

  const highRiskCount = packets.filter((packet) => packet.riskLevel === "high").length;
  return {
    id: `script-compliance-${snapshot.projectId}`,
    title: `《${snapshot.title}》还有 ${packets.length} 条合规修订包待处理。`,
    description: highRiskCount
      ? `其中 ${highRiskCount} 条属于高风险，建议优先处理。`
      : "可以直接逐条确认，也可以继续输入自定义修订要求。",
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
    description: "选中后我会直接帮你标记已处理，或者继续在首页里推进这条修订。",
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
    description: nextPacket ? `建议优先处理第 ${nextPacket.episodeNumber} 集 · ${nextPacket.title}` : "也可以直接输入新的推进要求。",
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
    description: "选中后可以直接锁定，也可以继续写这一集。",
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

function buildScriptPacketQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  return buildComplianceQuestion(snapshot) ?? buildCharacterCardQuestion(snapshot) ?? buildBeatPacketQuestion(snapshot);
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

const recQuestion = (snapshot: ConversationProjectSnapshot): ComposerQuestion | null =>
  buildReviewQuestion(snapshot) ??
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

function listPendingReviewItems(snapshot: ConversationProjectSnapshot) {
  return snapshot.memory?.reviewQueue?.filter((item) => item.status === "pending" || item.status === "redo") ?? [];
}

function findReviewItem(snapshot: ConversationProjectSnapshot, reviewId: string) {
  return listPendingReviewItems(snapshot).find((item) => item.id === reviewId) ?? null;
}

function collectReviewTargetIds(snapshot: ConversationProjectSnapshot, mode: "stable" | "risk"): string[] {
  return listPendingReviewItems(snapshot)
    .filter((item) => (mode === "stable" ? item.status === "pending" : item.status === "redo"))
    .flatMap((item) => (item.targetIds.length ? item.targetIds : [item.id]));
}

function buildReviewListQuestion(snapshot: ConversationProjectSnapshot): ComposerQuestion | null {
  const reviewQueue = listPendingReviewItems(snapshot);
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

function upsertRecentProject(
  recentProjects: ConversationProjectSnapshot[],
  snapshot: ConversationProjectSnapshot,
): ConversationProjectSnapshot[] {
  return [snapshot, ...recentProjects.filter((item) => item.projectId !== snapshot.projectId)].slice(0, 8);
}

function mergeRuntimeWithWorkflowDelta(
  previous: StudioRuntimeState,
  delta?: WorkflowRuntimeDelta,
): StudioRuntimeState {
  if (!delta) return previous;

  const nextProjectSnapshot = delta.projectSnapshot ?? previous.currentProjectSnapshot;
  return {
    ...previous,
    currentDramaProject: delta.dramaProject === undefined ? previous.currentDramaProject : delta.dramaProject,
    currentVideoProject: delta.videoProject === undefined ? previous.currentVideoProject : delta.videoProject,
    currentProjectSnapshot: nextProjectSnapshot,
    skillDrafts: delta.skillDrafts ?? previous.skillDrafts,
    maintenanceReports: delta.maintenanceReports ?? previous.maintenanceReports,
    recentProjects: nextProjectSnapshot
      ? upsertRecentProject(previous.recentProjects, nextProjectSnapshot)
      : previous.recentProjects,
    recentMessageSummary:
      delta.recentMessageSummary === undefined ? previous.recentMessageSummary : delta.recentMessageSummary,
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

function hasSavedSessionContent(session: StudioSessionState | null | undefined): boolean {
  return Boolean(
    session?.messages?.length ||
      session?.qState ||
      session?.draft?.trim() ||
      session?.selectedValues?.length,
  );
}

const qToComposer = (state: QState | null): ComposerQuestion | null => {
  const activeQuestion = state ? state.request.questions[state.currentIndex] : null;
  if (!state || !activeQuestion) return null;

  return {
    id: `${state.request.id}:${state.currentIndex}`,
    title: activeQuestion.question,
    description: state.request.description,
    options: activeQuestion.options.map((option, index) => ({
      id: `${activeQuestion.header}-${index}`,
      label: option.label,
      value: option.value || option.label,
      rationale: option.rationale || option.description,
    })),
    allowCustomInput: state.request.allowCustomInput !== false,
    submissionMode: state.request.submissionMode === "confirm" ? "confirm" : "immediate",
    multiSelect: activeQuestion.multiSelect,
    stepIndex: state.currentIndex,
    totalSteps: state.request.questions.length,
    answerKey: activeQuestion.header,
  };
};

function serializeQuestionAnswers(
  request: AskUserQuestionRequest,
  answers: Record<string, string>,
): string {
  const rows = request.questions
    .map((item, index) => {
      const answer = answers[qStepKey(index, item)]?.trim();
      return answer ? `${item.header}: ${answer}` : "";
    })
    .filter(Boolean);

  if (rows.length <= 1) {
    return rows[0]?.replace(/^[^:]+:\s*/, "") ?? "";
  }

  return rows.join("\n");
}

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

type SidebarAssetItem = {
  id: string;
  kind: "image" | "video";
  label: string;
  url: string;
  meta: string;
};

function collectConversationAssets(
  videoProject: StudioRuntimeState["currentVideoProject"],
  projectSnapshot?: StudioRuntimeState["currentProjectSnapshot"] | null,
): SidebarAssetItem[] {
  const manifest = projectSnapshot?.memory?.assetManifest;
  if (manifest?.items.length) {
    return manifest.items.slice(0, 18).map((item) => ({
      id: item.id,
      kind: item.kind === "video-segment" ? "video" : "image",
      label: item.label,
      url: item.url,
      meta: [item.meta, item.reusable ? "可复用" : "当前镜头", item.status === "failed" ? "待修复" : ""]
        .filter(Boolean)
        .join(" · "),
    }));
  }

  if (!videoProject) return [];

  const items: SidebarAssetItem[] = [];
  const seen = new Set<string>();

  const pushAsset = (kind: SidebarAssetItem["kind"], label: string, url?: string, meta = "") => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({
      id: `${kind}-${items.length}-${label}`,
      kind,
      label,
      url,
      meta,
    });
  };

  videoProject.characters.forEach((character) => {
    pushAsset("image", `${character.name} 角色图`, character.imageUrl, "角色");
    character.imageHistory?.forEach((entry) =>
      pushAsset("image", `${character.name} 历史图`, entry.imageUrl, "角色历史"),
    );
    Object.entries(character.threeViewUrls ?? {}).forEach(([view, url]) =>
      pushAsset("image", `${character.name} ${view}`, url, "三视图"),
    );
    character.costumes?.forEach((costume) => {
      pushAsset("image", `${character.name} · ${costume.label}`, costume.imageUrl, "服装");
      costume.imageHistory?.forEach((entry) =>
        pushAsset("image", `${character.name} · ${costume.label}`, entry.imageUrl, "服装历史"),
      );
    });
  });

  videoProject.sceneSettings.forEach((scene) => {
    pushAsset("image", `${scene.name} 场景图`, scene.imageUrl, "场景");
    scene.imageHistory?.forEach((entry) =>
      pushAsset("image", `${scene.name} 历史图`, entry.imageUrl, "场景历史"),
    );
    scene.timeVariants?.forEach((variant) => {
      pushAsset("image", `${scene.name} · ${variant.label}`, variant.imageUrl, "时间变体");
      variant.imageHistory?.forEach((entry) =>
        pushAsset("image", `${scene.name} · ${variant.label}`, entry.imageUrl, "时间变体历史"),
      );
    });
  });

  videoProject.scenes.forEach((scene) => {
    pushAsset("image", `${scene.sceneName} 分镜图`, scene.storyboardUrl, "分镜");
    scene.storyboardHistory?.forEach((url, index) =>
      pushAsset("image", `${scene.sceneName} 分镜 ${index + 1}`, url, "分镜历史"),
    );
    pushAsset("video", `${scene.sceneName} 视频`, scene.videoUrl, "视频");
    scene.videoHistory?.forEach((entry, index) =>
      pushAsset("video", `${scene.sceneName} 视频 ${index + 1}`, entry.videoUrl, "视频历史"),
    );
  });

  return items.slice(0, 24);
}

const SidebarFooter = memo(function SidebarFooter({
  onOpenSettings,
  collapsed = false,
}: {
  onOpenSettings: () => void;
  collapsed?: boolean;
}) {
  return (
    <div className={cn("border-t border-white/[0.05] pb-4 pt-3", collapsed ? "px-2.5" : "px-3")}>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="打开设置"
        title="设置"
        className={cn(
          "flex w-full items-center rounded-[14px] px-3 py-2 text-left text-[12px] text-slate-300 transition-colors hover:bg-white/[0.035] hover:text-slate-100",
          collapsed ? "justify-center" : "gap-2",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white/[0.04] text-slate-200">
          <Settings2 className="h-3.5 w-3.5" />
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium">设置</span>
            <span className="block truncate text-[10.5px] text-slate-500">模型、密钥、路径与外观</span>
          </span>
        ) : null}
      </button>
    </div>
  );
});

const SidebarAssetRow = memo(function SidebarAssetRow({
  asset,
  onOpen,
  collapsed = false,
}: {
  asset: SidebarAssetItem;
  onOpen: (url: string) => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(asset.url)}
      aria-label={asset.label}
      title={asset.label}
      className={cn(
        "flex w-full items-center rounded-[14px] py-2 text-left transition-colors hover:bg-white/[0.04]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
      )}
    >
      {asset.kind === "image" ? (
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[11px] bg-white/[0.05]">
          <img src={asset.url} alt={asset.label} className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-0 rounded-[11px] ring-1 ring-inset ring-white/[0.08]" />
        </span>
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.04] text-slate-200">
          <Clapperboard className="h-3.5 w-3.5" />
        </span>
      )}
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] text-slate-100">{asset.label}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="uppercase tracking-[0.16em] text-slate-400">{asset.kind}</span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span className="truncate">{asset.meta}</span>
          </span>
        </span>
      ) : null}
    </button>
  );
});

const ConversationTimeline = memo(function ConversationTimeline({
  messages,
  endRef,
}: {
  messages: HomeAgentMessage[];
  endRef: RefObject<HTMLDivElement | null>;
}) {
  const reduceMotion = useReducedMotion();
  const animateFromIndex = Math.max(messages.length - 4, 0);

  return (
    <div className="space-y-5 pb-7 pt-3 sm:space-y-5.5 sm:pb-8 sm:pt-4 [content-visibility:auto]">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={reduceMotion || index < animateFromIndex ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion || index < animateFromIndex ? undefined : { opacity: 1, y: 0 }}
          transition={
            reduceMotion || index < animateFromIndex
              ? undefined
              : {
                  duration: 0.16,
                  ease: [0.22, 1, 0.36, 1],
                  delay: Math.min((index - animateFromIndex) * 0.018, 0.05),
                }
          }
          className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
        >
          {message.role === "assistant" ? (
            <div className="max-w-[780px] pr-5 sm:pr-7">
              <div className="flex gap-3">
                <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.035] text-white/58">
                  <Sparkles className="h-2.5 w-2.5" />
                </div>
                <div className="whitespace-pre-wrap break-words pt-0.5 text-[13.5px] leading-[1.82] text-white/78 sm:text-[14px] sm:leading-[1.9]">
                  {message.content}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-[78%] rounded-[20px] border border-white/[0.05] bg-white/[0.04] px-4 py-2.5 text-[13.5px] leading-[1.68] text-white/82 sm:max-w-[70%] sm:text-[14px] sm:leading-[1.74]">
              {message.content}
            </div>
          )}
        </motion.div>
      ))}
      <div ref={endRef} />
    </div>
  );
});

interface HomeComposerProps {
  idle: boolean;
  currentProjectLabel?: string;
  maintenanceHint?: string | null;
  draft: string;
  setDraft: (value: string) => void;
  placeholder: string;
  question: ComposerQuestion | null;
  qState: QState | null;
  selectedValues: string[];
  streaming: boolean;
  reduceMotion: boolean;
  composerShellClass: string;
  activeTheme: boolean;
  onSelectChoice: (value: string, label: string) => void;
  onConfirmQuestion?: () => void;
  onSubmit: () => void;
  onInterrupt: () => void;
}

const HomeComposer = memo(function HomeComposer({
  idle,
  currentProjectLabel,
  maintenanceHint,
  draft,
  setDraft,
  placeholder,
  question,
  qState,
  selectedValues,
  streaming,
  reduceMotion,
  composerShellClass,
  activeTheme,
  onSelectChoice,
  onConfirmQuestion,
  onSubmit,
  onInterrupt,
}: HomeComposerProps) {
  return (
    <motion.div
      layoutId="home-studio-composer"
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 340,
              damping: 34,
              mass: 0.9,
            }
      }
      className={cn(
        "pointer-events-auto relative w-full",
        idle ? IDLE_TRACK_CLASS : ACTIVE_TRACK_CLASS,
      )}
    >
      <ComposerChoicePopover
        question={question}
        onSelect={onSelectChoice}
        onConfirm={qState ? onConfirmQuestion : undefined}
        canConfirm={selectedValues.length > 0 || !!draft.trim()}
        tone={activeTheme ? "dark" : "light"}
      />
      <motion.div
        layout
        initial={reduceMotion ? false : { opacity: 0.92, y: idle ? 0 : 14 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? undefined
            : {
                duration: idle ? 0.16 : 0.22,
                ease: [0.22, 1, 0.36, 1],
              }
        }
        className={composerShellClass}
      >
        {idle ? (
          <div className="flex items-center gap-2.5 px-4 pb-0 pt-3 text-[10px] text-white/38 md:px-6">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/88">
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium text-white/72">首页主控会话</div>
              <div className="truncate text-[10px] text-white/38">未会话时居中，会话开始后同一个输入框沉到底部。</div>
            </div>
          </div>
        ) : currentProjectLabel || maintenanceHint ? (
          <div className="flex items-center justify-between gap-3 px-4 pb-0 pt-2 text-[10px] tracking-[0.02em] text-white/34 md:px-6">
            <div className="truncate">{currentProjectLabel ?? "当前首页会话"}</div>
            {maintenanceHint ? (
              <div className="hidden shrink-0 text-[10px] text-white/22 sm:block">{maintenanceHint}</div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("px-3.5 pb-3.5 pt-2 sm:px-4 sm:pb-4 md:px-6 md:pb-5", !idle && "pt-2")}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={idle ? 5 : 3}
            className={cn(
              "resize-none border-none bg-transparent px-0 pb-3 pt-2 text-[14.5px] leading-7 shadow-none ring-0 focus-visible:ring-0 sm:text-[15px]",
              activeTheme
                ? "min-h-[88px] text-white placeholder:text-white/28 sm:min-h-[100px]"
                : "min-h-[116px] text-slate-900 placeholder:text-slate-400",
              idle && "min-h-[144px] sm:min-h-[168px] md:min-h-[208px]",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="flex items-end justify-end gap-2.5">
            <div className="flex items-center gap-2">
              {streaming && !qState ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-10 w-10 rounded-full sm:h-11 sm:w-11",
                    activeTheme
                      ? "bg-white/[0.06] text-white hover:bg-white/[0.1]"
                      : "bg-black/5 text-slate-700 hover:bg-black/10",
                  )}
                  onClick={onInterrupt}
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                disabled={(!draft.trim() && !(qState && selectedValues.length > 0)) || (streaming && !qState)}
                className={cn(
                  "h-10 w-10 rounded-full shadow-none sm:h-11 sm:w-11",
                  activeTheme ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-900",
                )}
                onClick={onSubmit}
              >
                {streaming && !qState ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

const IdleLanding = memo(function IdleLanding({
  composerProps,
  reduceMotion,
}: {
  composerProps: HomeComposerProps;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      layout
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 300,
              damping: 32,
              mass: 0.95,
            }
      }
      className="mx-auto flex min-h-[calc(100vh-112px)] w-full max-w-[1180px] flex-col justify-center pb-16 pt-6 sm:pb-20"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={reduceMotion ? undefined : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-[860px]"
      >
        <div className="mb-5 space-y-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/56">
            <Bot className="h-3.5 w-3.5" />
            单首页会话
          </div>
          <h1 className="text-[22px] font-medium tracking-[-0.04em] text-white md:text-[30px]">{TITLE}</h1>
          <p className="mx-auto max-w-[560px] text-[13px] leading-6 text-white/42 sm:text-sm">
            直接开始说目标。会话启动后，同一个输入框会在这一页自然沉到底部，继续推进完整工作流。
          </p>
        </div>
        <div className={cn("mx-auto w-full", IDLE_TRACK_CLASS)}>
          <HomeComposer {...composerProps} />
        </div>
      </motion.div>
    </motion.div>
  );
});

const BackgroundTaskDock = memo(function BackgroundTaskDock({
  tasks,
  onStopTask,
}: {
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
}) {
  const sortedTasks = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
  const activeTasks = sortedTasks.filter((task) => !isTerminalTask(task));
  const terminalTasks = sortedTasks.filter((task) => isTerminalTask(task));
  const visibleTasks = [...activeTasks.slice(0, 3), ...terminalTasks.slice(0, Math.max(0, 4 - Math.min(activeTasks.length, 3)))].slice(0, 4);
  const collapsedTerminalTasks = terminalTasks.slice(Math.max(0, 4 - Math.min(activeTasks.length, 3)));
  const runningCount = tasks.filter((task) => task.status === "running").length;

  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/34">
          <Bot className="h-3.5 w-3.5" />
          Agent 任务
        </div>
        <div className="text-[10.5px] text-white/32">
          {runningCount > 0 ? `${runningCount} 项后台处理中` : `${tasks.length} 项任务记录`}
        </div>
      </div>
      <div className="space-y-1.5">
        {visibleTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-start gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.025] px-3.5 py-3"
          >
            <div
              className={cn(
                "mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] tracking-[0.08em]",
                taskStatusClass(task.status),
              )}
            >
              {taskStatusLabel(task.status)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-[12.5px] text-white/82">
                  {parseTaskHeading(task.prompt) ?? truncateCopy(task.prompt, 84)}
                </div>
                {isTerminalTask(task) ? (
                  <span className="shrink-0 text-[10px] text-white/20">{formatTaskDockTimestamp(task.updatedAt)}</span>
                ) : null}
              </div>
              {task.output ? (
                <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/42">{truncateCopy(task.output, 150)}</div>
              ) : (
                <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-white/32">
                  {parseTaskPreview(task.prompt) || "Agent 正在后台处理中，结果会自动回流到当前会话。"}
                </div>
              )}
            </div>
            {task.status === "running" ? (
              <button
                type="button"
                onClick={() => onStopTask(task.id)}
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/78"
              >
                停止
              </button>
            ) : null}
          </div>
        ))}
        {collapsedTerminalTasks.length ? (
          <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[11.5px] text-white/54">
                已整理 {collapsedTerminalTasks.length} 条较早任务记录
              </div>
              <div className="mt-0.5 truncate text-[10.5px] text-white/28">
                {collapsedTerminalTasks
                  .slice(0, 3)
                  .map((task) => parseTaskHeading(task.prompt) ?? truncateCopy(task.prompt, 24))
                  .join(" · ")}
              </div>
            </div>
            <div className="shrink-0 text-[10px] text-white/22">已折叠</div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

const ActiveConversationShell = memo(function ActiveConversationShell({
  messages,
  tasks,
  onStopTask,
  endRef,
  composerProps,
  reduceMotion,
}: {
  messages: HomeAgentMessage[];
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  composerProps: HomeComposerProps;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      layout
      transition={
        reduceMotion
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 300,
              damping: 32,
              mass: 0.95,
            }
      }
      className="mx-auto flex min-h-[calc(100vh-112px)] w-full flex-col"
    >
      <div className={cn("mx-auto w-full flex-1", ACTIVE_TRACK_CLASS)}>
        {tasks.length ? <BackgroundTaskDock tasks={tasks} onStopTask={onStopTask} /> : null}
        <ConversationTimeline messages={messages} endRef={endRef} />
      </div>
      <motion.div
        layout
        transition={
          reduceMotion
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 320,
                damping: 34,
                mass: 0.92,
              }
        }
        className={cn("sticky bottom-0 z-20 mx-auto w-full pb-[calc(16px+env(safe-area-inset-bottom))] pt-5", ACTIVE_TRACK_CLASS)}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(19,19,20,0),rgba(19,19,20,0.92)_38%,rgba(19,19,20,0.98))]" />
        <div className="relative">
          <HomeComposer {...composerProps} />
        </div>
      </motion.div>
    </motion.div>
  );
});

const HomeSurfaceBackdrop = memo(function HomeSurfaceBackdrop({ idle }: { idle: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {idle ? (
        <>
          <div className="absolute left-[-8%] top-[-10%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(76,94,255,0.12),rgba(76,94,255,0))]" />
          <div className="absolute right-[-6%] top-[14%] h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
          <div className="absolute right-[-8%] top-[18%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(91,111,255,0.1),rgba(91,111,255,0))]" />
        </>
      )}
    </div>
  );
});

const MobileTopbar = memo(function MobileTopbar({
  idle,
  onOpenNavigation,
}: {
  idle: boolean;
  onOpenNavigation: () => void;
}) {
  return (
    <header
      className={cn(
        "px-4 md:px-8 lg:pl-[320px] lg:hidden",
        idle ? "flex items-center justify-between pb-2 pt-4" : "flex items-center justify-between pb-0 pt-2.5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark className="h-8" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[0.02em] text-white">{SIDEBAR_BRAND}</div>
          <div className="hidden truncate text-[11px] text-white/38 sm:block">首页主控会话</div>
        </div>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-full bg-white/[0.05] text-white hover:bg-white/[0.08] sm:h-10 sm:w-10"
        onClick={onOpenNavigation}
      >
        <Menu className="h-4.5 w-4.5" />
      </Button>
    </header>
  );
});

const SidebarBrandHeader = memo(function SidebarBrandHeader({
  idle,
  collapsed = false,
  onToggleCollapse,
}: {
  idle: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div className={cn("relative flex h-[72px] items-center border-b border-white/[0.06]", collapsed ? "justify-center px-2" : "px-5")}>
      <div className="flex min-w-0 items-center">
        <BrandMark className="h-8" />
        {!collapsed ? (
          <div className="ml-3 min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-slate-100">{SIDEBAR_BRAND}</div>
            <div className="truncate text-[10px] text-slate-500">{idle ? "开始一段新会话" : "当前首页会话"}</div>
          </div>
        ) : null}
      </div>
      {onToggleCollapse ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className={cn(
            "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-100",
            collapsed && "absolute right-2 top-5 ml-0",
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );
});

const SidebarPrimaryAction = memo(function SidebarPrimaryAction({
  idle,
  onClick,
  collapsed = false,
}: {
  idle: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={idle ? "开始新项目" : "新建项目"}
      title={idle ? "开始新项目" : "新建项目"}
      className={cn(
        "mb-3.5 flex w-full items-center rounded-[16px] py-2 text-left text-[12.5px] text-slate-100 transition-colors hover:bg-white/[0.04]",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.92] text-slate-950">
        <Plus className="h-4 w-4 shrink-0" />
      </span>
      {!collapsed ? <span>{idle ? "开始新项目" : "新建项目"}</span> : null}
    </button>
  );
});

const SidebarQuickTasks = memo(function SidebarQuickTasks({
  templates,
  onLaunch,
  bordered = false,
  collapsed = false,
}: {
  templates: typeof templates;
  onLaunch: (template: (typeof templates)[number]) => void;
  bordered?: boolean;
  collapsed?: boolean;
}) {
  return (
    <section className={cn("px-2 pb-3", bordered && "border-b border-white/[0.06]")}>
      <div
        className={cn(
          "mb-2 px-1 text-[10px] uppercase tracking-[0.18em] text-slate-500",
          collapsed && "flex items-center justify-center px-0",
        )}
      >
        {collapsed ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : "快捷任务"}
      </div>
      <div className="space-y-1">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onLaunch(template)}
            aria-label={template.title}
            title={template.title}
            className={cn(
              "flex w-full items-center rounded-[14px] py-2 text-left transition-colors hover:bg-white/[0.05]",
              collapsed ? "justify-center px-0" : "justify-between gap-3 px-3",
            )}
          >
            {collapsed ? (
              <template.icon className="h-4 w-4 shrink-0 text-slate-300" />
            ) : (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-slate-100">{template.title}</span>
                  <span className="block truncate text-[10.5px] text-slate-500">{truncateCopy(template.description, 36)}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
              </>
            )}
          </button>
        ))}
      </div>
    </section>
  );
});

const SidebarProjectHistory = memo(function SidebarProjectHistory({
  recentProjects,
  recentProjectsReady,
  currentProjectId,
  onOpenProject,
  emptyClassName,
  limit = 10,
  bordered = false,
  collapsed = false,
}: {
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  currentProjectId?: string;
  onOpenProject: (projectId: string) => void;
  emptyClassName?: string;
  limit?: number;
  bordered?: boolean;
  collapsed?: boolean;
}) {
  return (
    <section className={cn("px-2 py-4", bordered && "border-b border-white/[0.06]")}>
      <div
        className={cn(
          "mb-2 flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.22em] text-slate-500",
          collapsed && "justify-center px-0",
        )}
      >
        <History className="h-3.5 w-3.5" />
        {!collapsed ? "对话历史" : null}
      </div>
      <div className="space-y-1">
        {recentProjects.slice(0, limit).map((project) => {
          const active = currentProjectId === project.projectId;

          return (
            <button
              key={project.projectId}
              type="button"
              onClick={() => onOpenProject(project.projectId)}
              aria-label={project.title}
              title={project.title}
              className={cn(
                "flex w-full rounded-[14px] py-2 text-left transition-colors hover:bg-white/[0.04]",
                collapsed ? "justify-center px-0" : "items-start gap-2 px-3",
                active && "bg-white/[0.05]",
              )}
            >
              {collapsed ? (
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-[11px] font-medium",
                    active
                      ? "border-[#7c92ff]/60 bg-[#7c92ff]/16 text-white"
                      : "border-white/[0.08] bg-white/[0.03] text-slate-300",
                  )}
                >
                  {compactSidebarLabel(project.title)}
                </span>
              ) : (
                <>
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full bg-white/[0.12]", active && "bg-[#7c92ff]")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-slate-100">{project.title}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                      {projectKindLabel(project.projectKind)} · {project.derivedStage} · {formatDateLabel(project.updatedAt)}
                    </span>
                    <span className={cn("mt-0.5 block truncate text-[10px]", active ? "text-slate-400" : "text-slate-600")}>
                      {truncateCopy(project.currentObjective || project.agentSummary, active ? 52 : 30)}
                    </span>
                  </span>
                </>
              )}
            </button>
          );
        })}
        {!recentProjects.length ? (
          <div
            className={cn(
              "px-3 py-2 text-[12.5px] leading-6 text-slate-500",
              emptyClassName,
              collapsed && "px-0 text-center text-[10.5px] leading-5",
            )}
          >
            {recentProjectsReady ? (collapsed ? "暂无" : "还没有历史项目。") : collapsed ? "整理中" : "正在整理最近项目…"}
          </div>
        ) : null}
      </div>
    </section>
  );
});

const SidebarAssetLibrary = memo(function SidebarAssetLibrary({
  assets,
  onOpenAsset,
  emptyClassName,
  collapsed = false,
}: {
  assets: SidebarAssetItem[];
  onOpenAsset: (url: string) => void;
  emptyClassName?: string;
  collapsed?: boolean;
}) {
  return (
    <section className="px-2 pb-2 pt-4">
      <div
        className={cn(
          "mb-2 flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.22em] text-slate-500",
          collapsed && "justify-center px-0",
        )}
      >
        <Image className="h-3.5 w-3.5" />
        {!collapsed ? "素材库" : null}
      </div>
      <div className="space-y-1">
        {assets.length ? (
          assets.map((asset) => (
            <SidebarAssetRow key={asset.id} asset={asset} onOpen={onOpenAsset} collapsed={collapsed} />
          ))
        ) : (
          <div
            className={cn(
              "px-3 py-2 text-[12.5px] leading-6 text-slate-500",
              emptyClassName,
              collapsed && "px-0 text-center text-[10.5px] leading-5",
            )}
          >
            {collapsed ? "暂无" : "当前对话还没有图像或视频素材。"}
          </div>
        )}
      </div>
    </section>
  );
});

const DesktopSidebar = memo(function DesktopSidebar({
  idle,
  recentProjects,
  recentProjectsReady,
  templates,
  assets,
  currentProjectId,
  collapsed = false,
  onTemplateLaunch,
  onOpenProject,
  onNewProject,
  onOpenSettings,
  onToggleCollapse,
}: {
  idle: boolean;
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  templates: typeof templates;
  assets: SidebarAssetItem[];
  currentProjectId?: string;
  collapsed?: boolean;
  onTemplateLaunch: (prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
}) {
  const handleOpenAsset = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleLaunchTemplate = useCallback(
    (template: (typeof templates)[number]) => {
      onTemplateLaunch(template.prompt, template.title);
    },
    [onTemplateLaunch],
  );

  return (
    <aside className="hidden lg:block">
      <div
        className="fixed inset-y-0 left-0 z-40 border-r border-white/[0.06] bg-[#141518] [contain:layout_paint] transition-[width] duration-200 ease-out"
        style={{ width: collapsed ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH : DESKTOP_SIDEBAR_WIDTH }}
      >
        <SidebarBrandHeader idle={idle} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2.5" : "px-3")}>
            <SidebarPrimaryAction idle={idle} onClick={onNewProject} collapsed={collapsed} />

            {idle ? (
              <SidebarQuickTasks templates={templates} onLaunch={handleLaunchTemplate} collapsed={collapsed} />
            ) : null}

            <SidebarProjectHistory
              recentProjects={recentProjects}
              recentProjectsReady={recentProjectsReady}
              currentProjectId={currentProjectId}
              onOpenProject={onOpenProject}
              limit={collapsed ? 8 : 10}
              collapsed={collapsed}
            />

            {!idle ? (
              <SidebarAssetLibrary assets={assets} onOpenAsset={handleOpenAsset} collapsed={collapsed} />
            ) : null}
          </div>
          <SidebarFooter onOpenSettings={onOpenSettings} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
});

const MobileSidebarSheet = memo(function MobileSidebarSheet({
  open,
  onOpenChange,
  idle,
  recentProjects,
  recentProjectsReady,
  templates,
  assets,
  currentProjectId,
  onTemplateLaunch,
  onOpenProject,
  onNewProject,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idle: boolean;
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  templates: typeof templates;
  assets: SidebarAssetItem[];
  currentProjectId?: string;
  onTemplateLaunch: (prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
}) {
  const handleLaunchTemplate = useCallback(
    (template: (typeof templates)[number]) => {
      onTemplateLaunch(template.prompt, template.title);
      onOpenChange(false);
    },
    [onOpenChange, onTemplateLaunch],
  );

  const handleOpenProjectFromSheet = useCallback(
    (projectId: string) => {
      onOpenProject(projectId);
      onOpenChange(false);
    },
    [onOpenChange, onOpenProject],
  );

  const handleNewProjectFromSheet = useCallback(() => {
    onNewProject();
    onOpenChange(false);
  }, [onNewProject, onOpenChange]);

  const handleOpenAsset = useCallback(
    (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className={cn(MOBILE_NAV_SHEET, "lg:hidden")}>
        <SheetHeader className="sr-only">
          <SheetTitle>导航</SheetTitle>
          <SheetDescription>当前首页会话的导航、历史项目和素材库。</SheetDescription>
        </SheetHeader>
        <SidebarBrandHeader idle={idle} />

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarPrimaryAction idle={idle} onClick={handleNewProjectFromSheet} />

            {idle ? <SidebarQuickTasks templates={templates} onLaunch={handleLaunchTemplate} bordered /> : null}

            <SidebarProjectHistory
              recentProjects={recentProjects}
              recentProjectsReady={recentProjectsReady}
              currentProjectId={currentProjectId}
              onOpenProject={handleOpenProjectFromSheet}
              emptyClassName="py-2.5 text-[13px]"
              limit={10}
              bordered
            />

            {!idle ? (
              <SidebarAssetLibrary
                assets={assets}
                onOpenAsset={handleOpenAsset}
                emptyClassName="py-2.5 text-[13px]"
              />
            ) : null}
          </div>
          <SidebarFooter
            onOpenSettings={() => {
              onOpenSettings();
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
});

const DesktopSettingsPanel = memo(function DesktopSettingsPanel({
  open,
  onClose,
  leftOffset,
}: {
  open: boolean;
  onClose: () => void;
  leftOffset: number;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: -18, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.99 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 top-4 z-50 hidden lg:block"
          style={{
            left: leftOffset - 16,
            width: `min(${DESKTOP_SETTINGS_WIDTH}px, calc(100vw - ${leftOffset + 32}px))`,
          }}
        >
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", SETTINGS_PANEL_CLASS)}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  正在加载设置面板…
                </div>
              }
            >
              <SettingsPage embedded onClose={onClose} />
            </Suspense>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
});

const MobileSettingsSheet = memo(function MobileSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className={cn(MOBILE_SETTINGS_SHEET, "lg:hidden")}>
        <SheetHeader className="sr-only">
          <SheetTitle>设置</SheetTitle>
          <SheetDescription>在首页内完成模型、密钥、路径与外观设置。</SheetDescription>
        </SheetHeader>
        <Suspense
          fallback={
            <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-sm text-slate-500">
              正在加载设置面板…
            </div>
          }
        >
          <SettingsPage embedded onClose={() => onOpenChange(false)} />
        </Suspense>
      </SheetContent>
    </Sheet>
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
  const [draft, setDraft] = useState(session?.draft ?? "");
  const [streaming, setStreaming] = useState(false);
  const [tasks, setTasks] = useState<RuntimeTask[]>(() => getAllTasks());
  const [qState, setQState] = useState<QState | null>(session?.qState ?? null);
  const [suggested, setSuggested] = useState<ComposerQuestion | null>(null);
  const [popoverOverride, setPopoverOverride] = useState<ComposerQuestion | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>(session?.selectedValues ?? []);
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

  const runtimeRef = useRef(runtime);
  const messagesRef = useRef(messages);
  const compactedMessageCountRef = useRef(compactedMessageCount);
  const engineRef = useRef<QueryEngineClass | null>(null);
  const engineDepsRef = useRef<Promise<EngineDeps> | null>(null);
  const projectStoreRef = useRef<Promise<ProjectStoreModule> | null>(null);
  const apiConfigRef = useRef<Promise<ApiConfigModule> | null>(null);
  const askQuestionRef = useRef<Promise<AskUserQuestionModule> | null>(null);
  const structuredParserRef = useRef<Promise<StructuredQuestionParserModule> | null>(null);
  const workflowActionsRef = useRef<Promise<WorkflowActionsModule> | null>(null);
  const semanticSummaryRef = useRef<Promise<SemanticSummaryModule> | null>(null);
  const conversationMemoryRef = useRef<Promise<ConversationMemoryModule> | null>(null);
  const handoffRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const surfacedTaskIdsRef = useRef<Set<string>>(new Set());
  const surfacedTaskFollowupIdsRef = useRef<Set<string>>(new Set());
  const maintenanceHintTimerRef = useRef<number | null>(null);
  const compactionJobVersionRef = useRef(0);
  const previousQuestionStepRef = useRef<string | null>(
    session?.qState ? `${session.qState.request.id}:${session.qState.currentIndex}` : null,
  );

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

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(
    () => () => {
      if (maintenanceHintTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(maintenanceHintTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    surfacedTaskIdsRef.current.clear();
    surfacedTaskFollowupIdsRef.current.clear();
  }, [runtime.sessionId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    compactedMessageCountRef.current = compactedMessageCount;
  }, [compactedMessageCount]);

  useEffect(() => {
    setUtilityPanel(initialUtility);
  }, [initialUtility]);

  useEffect(() => {
    writeDesktopSidebarCollapsed(desktopSidebarCollapsed);
  }, [desktopSidebarCollapsed]);

  const loadProjectStore = useCallback(async () => {
    if (!projectStoreRef.current) {
      projectStoreRef.current = import("@/lib/home-agent/project-store");
    }
    return projectStoreRef.current;
  }, []);

  const loadApiConfigModule = useCallback(async () => {
    if (!apiConfigRef.current) {
      apiConfigRef.current = import("@/lib/api-config");
    }
    return apiConfigRef.current;
  }, []);

  const loadAskUserQuestionModule = useCallback(async () => {
    if (!askQuestionRef.current) {
      askQuestionRef.current = import("@/lib/agent/tools/ask-user-question");
    }
    return askQuestionRef.current;
  }, []);

  const loadStructuredQuestionParser = useCallback(async () => {
    if (!structuredParserRef.current) {
      structuredParserRef.current = import("./structured-question-parser");
    }
    return structuredParserRef.current;
  }, []);

  const loadWorkflowActionsModule = useCallback(async () => {
    if (!workflowActionsRef.current) {
      workflowActionsRef.current = import("@/lib/home-agent/workflow-actions");
    }
    return workflowActionsRef.current;
  }, []);

  const loadSemanticSummaryModule = useCallback(async () => {
    if (!semanticSummaryRef.current) {
      semanticSummaryRef.current = import("@/lib/home-agent/conversation-semantic-summary");
    }
    return semanticSummaryRef.current;
  }, []);

  const loadConversationMemoryModule = useCallback(async () => {
    if (!conversationMemoryRef.current) {
      conversationMemoryRef.current = import("@/lib/home-agent/conversation-memory");
    }
    return conversationMemoryRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateRecentProjects = async () => {
      try {
        const store = await loadProjectStore();
        const items = await store.listRecentConversationSnapshots(8);
        if (cancelled) return;
        startTransition(() => {
          setRuntime((prev) => ({ ...prev, recentProjects: items }));
          setRecentProjectsReady(true);
        });
      } catch {
        if (cancelled) return;
        setRecentProjectsReady(true);
      }
    };

    const cancelTask = scheduleBackgroundTask(() => {
      void hydrateRecentProjects();
    });

    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [loadProjectStore]);

  useEffect(() => {
    if (metaReady || mode === "idle") return;

    let cancelled = false;
    const cancelTask = scheduleBackgroundTask(() => {
      void loadProjectStore()
        .then((store) => {
          if (cancelled) return;
          startTransition(() => {
            setRuntime((prev) => ({
              ...prev,
              skillDrafts: store.readSkillDrafts(),
              maintenanceReports: store.readMaintenanceReports(),
            }));
            setMetaReady(true);
          });
        })
        .catch(() => {
          if (cancelled) return;
          setMetaReady(true);
        });
    }, 700);

    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [loadProjectStore, metaReady, mode]);

  useEffect(() => {
    if (runtime.currentProjectSnapshot?.projectId) {
      setActiveProjectId(runtime.currentProjectSnapshot.projectId);
    }
  }, [runtime.currentProjectSnapshot?.projectId]);

  useEffect(() => {
    const syncTasks = () => {
      startTransition(() => {
        setTasks(getAllTasks());
      });
    };

    syncTasks();
    window.addEventListener("agent:tasks-updated", syncTasks);
    return () => window.removeEventListener("agent:tasks-updated", syncTasks);
  }, []);

  useEffect(() => {
    if (qState || streaming || popoverOverride) return;
    if (draft.trim()) return;
    if (!runtime.currentProjectSnapshot) {
      if (suggested) setSuggested(null);
      return;
    }

    const nextSuggestion = recQuestion(runtime.currentProjectSnapshot);
    setSuggested((previous) => {
      const previousId = previous?.id ?? null;
      const nextId = nextSuggestion?.id ?? null;
      if (previousId === nextId) return previous;
      return nextSuggestion;
    });
  }, [draft, popoverOverride, qState, runtime.currentProjectSnapshot, streaming, suggested]);

  useEffect(() => {
    const stepKey = qState ? `${qState.request.id}:${qState.currentIndex}` : null;
    if (stepKey === previousQuestionStepRef.current) return;
    previousQuestionStepRef.current = stepKey;
    if (!stepKey) return;
    setPopoverOverride(null);
    setSelectedValues([]);
    setDraft("");
  }, [qState]);

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
        draft,
        qState,
        selectedValues,
      });
    }, 720);

    return cancelTask;
  }, [
    activeProjectId,
    deferredMessages,
    deferredProjectSnapshot,
    draft,
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
            recentProjects: [
              source.snapshot,
              ...prev.recentProjects.filter((item) => item.projectId !== source.snapshot?.projectId),
            ].slice(0, 8),
          }));
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, loadProjectStore, runtime.currentDramaProject, runtime.currentVideoProject]);

  useEffect(() => {
    if (!endRef.current) return;

    const handle = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });

    return () => window.cancelAnimationFrame(handle);
  }, [idle, messages.length, question?.id]);

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
    if (qState || streaming || draft.trim() || popoverOverride) return;

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
  }, [draft, popoverOverride, push, qState, streaming, visibleTasks]);

  const loadEngineDeps = useCallback(async () => {
    if (!engineDepsRef.current) {
      engineDepsRef.current = Promise.all([
        import("@/lib/agent/query-engine"),
        import("@/lib/agent/tools"),
      ]).then(([engineModule, toolsModule]) => ({
        QueryEngine: engineModule.QueryEngine,
        createDefaultTools: toolsModule.createDefaultTools,
      }));
    }
    return engineDepsRef.current;
  }, []);

  const getEngine = useCallback(
    async () => {
      if (engineRef.current) return engineRef.current;

      const deps = await loadEngineDeps();
      const apiConfig = await loadApiConfigModule();
      const tools = deps
        .createDefaultTools()
        .filter((tool) =>
          ["AskUserQuestion", "HomeStudioWorkflow", "Agent", "TaskOutput", "TaskStop"].includes(tool.name),
        );
      const cfg = apiConfig.getApiConfig();
      const apiKey = cfg.claudeKey || cfg.geminiKey || cfg.gptKey;
      const baseUrl = cfg.claudeEndpoint || cfg.geminiEndpoint || cfg.gptEndpoint;

      if (!apiKey) {
        throw new Error("当前没有可用的文本模型 API Key，请先在设置中完成配置。");
      }

      const preflightPlan = planConversationCompaction(
        messagesRef.current,
        compactedMessageCountRef.current,
        runtimeRef.current.recentMessageSummary,
      );

      let engineSummary = runtimeRef.current.recentMessageSummary;
      let engineCompactedCount = compactedMessageCountRef.current;
      let engineInitialMessages = messagesRef.current.slice(
        Math.min(
          compactedMessageCountRef.current,
          Math.max(0, messagesRef.current.length - AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT),
        ),
      );

      if (preflightPlan.shouldCompact) {
        engineSummary = preflightPlan.nextSummary;
        engineCompactedCount = preflightPlan.nextCompactedMessageCount;
        engineInitialMessages = preflightPlan.retainedMessages;
        compactedMessageCountRef.current = engineCompactedCount;
        setCompactedMessageCount(engineCompactedCount);
        setRuntime((prev) => ({
          ...prev,
          recentMessageSummary: engineSummary,
        }));
      }

      const engineCompactedHistoryPrompt =
        engineCompactedCount > 0 ? buildCompactedHistoryPrompt(engineSummary) : undefined;

      engineRef.current = new deps.QueryEngine({
        apiKey,
        baseUrl,
        model: apiConfig.resolveConfiguredModelName("claude-sonnet-4-6"),
        tools,
        systemPrompt: PROMPT,
        appendSystemPrompt: engineCompactedHistoryPrompt,
        initialMessages: toQuery(engineInitialMessages),
        maxTurns: 12,
        getAppState: () => runtimeRef.current,
        setAppState: (updater) => setRuntime((prev) => updater(prev) as StudioRuntimeState),
      });

      return engineRef.current;
    },
    [loadApiConfigModule, loadEngineDeps],
  );

  const launchAutoResearchTasks = useCallback(
    async (prompt: string) => {
      const plan = buildAutoResearchPlan(prompt, runtimeRef.current.currentProjectSnapshot);
      if (!plan) return null;

      const apiConfig = await loadApiConfigModule();
      const cfg = apiConfig.getApiConfig();
      const apiKey = cfg.claudeKey || cfg.geminiKey || cfg.gptKey;
      const baseUrl = cfg.claudeEndpoint || cfg.geminiEndpoint || cfg.gptEndpoint;
      if (!apiKey) return null;

      const tool = new AgentTool();
      const context = new ToolUseContext({
        options: {
          model: apiConfig.resolveConfiguredModelName("claude-sonnet-4-6"),
          tools: [],
          apiKey,
          baseUrl,
        },
      });

      const parentMessage = {
        type: "assistant",
        uuid: crypto.randomUUID(),
        message: {
          role: "assistant",
          content: "auto-research-launch",
        },
      } as const;

      const taskIds: string[] = [];

      const results = await Promise.all(
        plan.tasks.map((task) =>
          tool.call(
            {
              prompt: task.prompt,
              description: `并行研究 ${task.title}`,
              session_id: runtimeRef.current.sessionId,
              project_id: runtimeRef.current.currentProjectSnapshot?.projectId,
              subagent_type: "research",
              run_in_background: true,
            },
            context,
            async () => ({ behavior: "allow" }),
            parentMessage,
          ),
        ),
      );

      for (const result of results) {
        const taskId = String(result.data).match(/Task ID:\s*([a-f0-9-]+)/i)?.[1];
        if (taskId) taskIds.push(taskId);
      }

      if (!taskIds.length) return null;
      return { plan, taskIds };
    },
    [loadApiConfigModule],
  );

  const send = useCallback(
    async (prompt: string, shown?: string) => {
      const cleaned = prompt.trim();
      if (!cleaned) return;

      push("user", shown || cleaned);
      setPopoverOverride(null);
      setSuggested(null);
      setMode("active");
      setDraft("");

      let promptForEngine = cleaned;
      try {
        const research = await launchAutoResearchTasks(cleaned);
        if (research) {
          push("assistant", research.plan.kickoff);
          promptForEngine = `${cleaned}\n\n${buildResearchPromptOverlay(research.plan, research.taskIds)}`;
        }
      } catch {
        promptForEngine = cleaned;
      }

      try {
        const memoryModule = await loadConversationMemoryModule();
        let memoryRuntime = runtimeRef.current;
        if (!memoryRuntime.recentProjects.length) {
          try {
            const store = await loadProjectStore();
            const snapshots = await store.listRecentConversationSnapshots(8);
            memoryRuntime = {
              ...memoryRuntime,
              recentProjects: snapshots,
            };
          } catch {
            memoryRuntime = runtimeRef.current;
          }
        }

        const memoryCorpus = memoryModule.buildConversationMemoryCorpus(memoryRuntime);
        const memoryHits = memoryModule.searchConversationMemory(
          cleaned,
          memoryCorpus,
          runtimeRef.current.currentProjectSnapshot?.projectId,
        ).filter((document) => document.projectId !== runtimeRef.current.currentProjectSnapshot?.projectId);
        const memoryPrompt = memoryModule.buildConversationMemoryPrompt(memoryHits);
        if (memoryPrompt) {
          flashMaintenanceHint(`已参考 ${memoryHits.length} 条历史经验`, 1800);
          promptForEngine = `${promptForEngine}\n\n${memoryPrompt}`;
        }
      } catch {
        // Keep the main conversation moving even if memory lookup fails.
      }

      setStreaming(true);

      try {
        const activeEngine = await getEngine();
        for await (const event of activeEngine.submitMessage(promptForEngine)) {
          if (event.type === "assistant") {
            const parser = await loadStructuredQuestionParser();
            const parsed = parser.extractStructuredQuestion(textOf(event.message.message.content));
            if (parsed.cleanedText.trim()) push("assistant", parsed.cleanedText.trim());
            if (parsed.request) setQState(createQState(parsed.request));
          }

          if (event.type === "result" && event.isError && event.result) {
            push("assistant", event.result);
          }
        }
      } catch (error) {
        push("assistant", error instanceof Error ? error.message : String(error));
      } finally {
        setStreaming(false);
      }
    },
    [
      flashMaintenanceHint,
      getEngine,
      launchAutoResearchTasks,
      loadConversationMemoryModule,
      loadProjectStore,
      loadStructuredQuestionParser,
      push,
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
    setDraft("");
    setCompactedMessageCount(0);
    setActiveProjectId(undefined);
    setRuntime((prev) => ({
      ...prev,
      sessionId: crypto.randomUUID(),
      currentProjectSnapshot: null,
      currentDramaProject: null,
      currentVideoProject: null,
      currentSetupDraft: null,
      skillDrafts: [],
      maintenanceReports: [],
      recentMessageSummary: "",
    }));
    setMetaReady(false);
    clearStudioSession();
  }, [loadAskUserQuestionModule, qState]);

  const openProject = useCallback(
    async (projectId: string) => {
      const store = await loadProjectStore();
      const savedSession = readStudioProjectSession(projectId);
      const source = await store.loadConversationSourceById(projectId);
      const snapshot = source.snapshot ?? savedSession?.currentProjectSnapshot;
      if (!snapshot) return;

      engineRef.current = null;
      startTransition(() => {
        setActiveProjectId(projectId);

        if (savedSession) {
          setQState(savedSession.qState ?? null);
          setPopoverOverride(null);
          setSuggested(null);
          setSelectedValues(savedSession.selectedValues ?? []);
          setMode(
            savedSession.mode === "recovering" || savedSession.mode === "maintenance-review"
              ? savedSession.mode
              : "active",
          );
          setMessages(savedSession.messages.length ? savedSession.messages : [mk("assistant", brief(snapshot))]);
          setDraft(savedSession.draft ?? "");
          setCompactedMessageCount(savedSession.compactedMessageCount ?? 0);
          previousQuestionStepRef.current = savedSession.qState
            ? `${savedSession.qState.request.id}:${savedSession.qState.currentIndex}`
            : null;
        } else {
          setQState(null);
          setPopoverOverride(null);
          setSuggested(recQuestion(snapshot));
          setSelectedValues([]);
          setMode("active");
          setMessages([mk("assistant", brief(snapshot))]);
          setDraft("");
          setCompactedMessageCount(0);
          previousQuestionStepRef.current = null;
        }

        setRuntime((prev) => ({
          ...prev,
          sessionId: savedSession?.sessionId ?? crypto.randomUUID(),
          currentProjectSnapshot: snapshot,
          currentDramaProject: source.dramaProject,
          currentVideoProject: source.videoProject,
          recentProjects: [
            snapshot,
            ...prev.recentProjects.filter((item) => item.projectId !== snapshot.projectId),
          ].slice(0, 8),
        }));
      });
      setMetaReady(false);
    },
    [loadProjectStore],
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
        setDraft("");
        setMode("active");
      });
    };

    window.addEventListener("agent:ask-user-question", onAsk);
    return () => window.removeEventListener("agent:ask-user-question", onAsk);
  }, []);

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
        setDraft("");
        return;
      }

      const submittedValue = value.trim();
      const displayValue = (label || value).trim();
      if (!submittedValue) return;
      const stepKey = qStepKey(qState.currentIndex, activeQuestion);

      const nextAnswers = {
        ...qState.answers,
        [stepKey]: submittedValue,
      };
      const nextDisplayAnswers = {
        ...qState.displayAnswers,
        [stepKey]: displayValue || submittedValue,
      };
      const userBubble = activeQuestion.header
        ? `${activeQuestion.header}：${nextDisplayAnswers[stepKey]}`
        : nextDisplayAnswers[stepKey];

      push("user", userBubble);

      const isLastStep = qState.currentIndex >= qState.request.questions.length - 1;
      if (isLastStep) {
        void loadAskUserQuestionModule().then((mod) => {
          mod.resolveAskUserQuestion(
            qState.request.id,
            serializeQuestionAnswers(qState.request, nextAnswers),
          );
        });
        setQState(null);
      } else {
        setQState({
          request: qState.request,
          currentIndex: qState.currentIndex + 1,
          answers: nextAnswers,
          displayAnswers: nextDisplayAnswers,
        });
      }

      setSelectedValues([]);
      setDraft("");
    },
    [loadAskUserQuestionModule, qState, push, send],
  );

  const handleTemplateLaunch = useCallback(
    (prompt: string, title: string) => {
      void send(prompt, title);
    },
    [send],
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
    setTasks(getAllTasks());
  }, []);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      const next = open ? "settings" : undefined;
      setUtilityPanel(next);
      onUtilityChange?.(next);
    },
    [onUtilityChange],
  );

  const handleChoiceSelect = useCallback(
    (value: string, label: string) => {
      const snapshot = runtimeRef.current.currentProjectSnapshot;

      const executeWorkflowShortcut = async (
        action: string,
        input: Record<string, unknown>,
        userBubble: string,
      ) => {
        push("user", userBubble);
        setPopoverOverride(null);
        setSuggested(null);
        setMode("active");
        setDraft("");
        setStreaming(true);

        try {
          const workflow = await loadWorkflowActionsModule();
          const result: WorkflowActionResult = await workflow.runWorkflowAction(action, input, runtimeRef.current);
          const nextProjectSnapshot = result.projectSnapshot ?? result.data?.projectSnapshot ?? null;

          if (result.data) {
            startTransition(() => {
              setRuntime((previous) => mergeRuntimeWithWorkflowDelta(previous, result.data));
              if (nextProjectSnapshot?.projectId) {
                setActiveProjectId(nextProjectSnapshot.projectId);
              }
            });
          }

          if (result.summary.trim()) {
            push("assistant", result.summary.trim());
          }
        } catch (error) {
          push("assistant", error instanceof Error ? error.message : String(error));
        } finally {
          setStreaming(false);
        }
      };

      if (snapshot?.projectKind === "video" && question?.id.startsWith("review-")) {
        if (value === "review:queue") {
          void executeWorkflowShortcut("review_video_assets", { projectId: snapshot.projectId }, label);
          return;
        }

        if (value === "review:approve-stable") {
          const targetIds = collectReviewTargetIds(snapshot, "stable");
          if (!targetIds.length) {
            push("user", label);
            push("assistant", "当前没有可直接通过的稳定项，我先把待审阅项展开给你逐条处理。");
            setPopoverOverride(buildReviewListQuestion(snapshot));
            setSuggested(null);
            setDraft("");
            return;
          }

          void executeWorkflowShortcut(
            "approve_video_assets",
            { projectId: snapshot.projectId, targetIds },
            label,
          );
          return;
        }

        if (value === "review:redo-risk") {
          const targetIds = collectReviewTargetIds(snapshot, "risk");
          if (!targetIds.length) {
            push("user", label);
            push("assistant", "当前还没有已标记的风险项，我先把待审阅项展开给你逐条判断。");
            setPopoverOverride(buildReviewListQuestion(snapshot));
            setSuggested(null);
            setDraft("");
            return;
          }

          void executeWorkflowShortcut(
            "redo_video_assets",
            {
              projectId: snapshot.projectId,
              targetIds,
              reason: "集中回退风险项，等待重新生成。",
            },
            label,
          );
          return;
        }

        if (value === "review:list") {
          push("user", label);
          push("assistant", "我先把待审阅项逐条展开，你可以直接决定每条素材通过还是重做。");
          setPopoverOverride(buildReviewListQuestion(snapshot));
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("review:item:")) {
          const reviewId = value.replace("review:item:", "");
          const item = findReviewItem(snapshot, reviewId);
          const nextQuestion = buildReviewDecisionQuestion(snapshot, reviewId);
          if (!item || !nextQuestion) return;

          push("user", label);
          push("assistant", `已定位到「${item.title}」，这条素材你想直接通过，还是先打回重做？`);
          setPopoverOverride(nextQuestion);
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("review:item-approve:")) {
          const reviewId = value.replace("review:item-approve:", "");
          const item = findReviewItem(snapshot, reviewId);
          if (!item) return;

          void executeWorkflowShortcut(
            "approve_video_assets",
            { projectId: snapshot.projectId, targetIds: item.targetIds },
            label,
          );
          return;
        }

        if (value.startsWith("review:item-redo:")) {
          const reviewId = value.replace("review:item-redo:", "");
          const item = findReviewItem(snapshot, reviewId);
          if (!item) return;

          void executeWorkflowShortcut(
            "redo_video_assets",
            {
              projectId: snapshot.projectId,
              targetIds: item.targetIds,
              reason: `已将「${item.title}」退回重做。`,
            },
            label,
          );
          return;
        }
      }

      if ((snapshot?.projectKind === "script" || snapshot?.projectKind === "adaptation") && question?.id.startsWith("script-")) {
        if (value === "script:character-lock-next") {
          const nextCard = listUnlockedCharacterCards(snapshot)[0];
          if (!nextCard) return;

          void executeWorkflowShortcut(
            "lock_character_cards",
            { projectId: snapshot.projectId, targetIds: [nextCard.id] },
            label,
          );
          return;
        }

        if (value === "script:character-list") {
          push("user", label);
          push("assistant", "我先把未锁定的角色状态卡逐张展开，你可以直接锁定，也可以继续深化对应角色。");
          setPopoverOverride(buildCharacterCardListQuestion(snapshot));
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("script:character-item:")) {
          const cardId = value.replace("script:character-item:", "");
          const card = findCharacterCard(snapshot, cardId);
          const nextQuestion = buildCharacterCardDecisionQuestion(snapshot, cardId);
          if (!card || !nextQuestion) return;

          push("user", label);
          push("assistant", `已定位到角色卡「${card.name}」，你想直接锁定，还是继续深化这个角色？`);
          setPopoverOverride(nextQuestion);
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("script:character-lock:")) {
          const cardId = value.replace("script:character-lock:", "");
          void executeWorkflowShortcut(
            "lock_character_cards",
            { projectId: snapshot.projectId, targetIds: [cardId] },
            label,
          );
          return;
        }

        if (value.startsWith("script:character-refine:")) {
          const cardId = value.replace("script:character-refine:", "");
          const card = findCharacterCard(snapshot, cardId);
          if (!card) return;

          void send(
            `请继续深化角色「${card.name}」的状态卡。角色定位：${card.role}。核心冲突：${card.coreConflict}。目标：${card.desire}。风险：${card.riskNote}。关系轴：${card.relationshipAxis.join("、") || "待补充"}。`,
            label,
          );
          return;
        }

        if (value === "script:compliance-resolve-high") {
          const targetIds = listPendingCompliancePackets(snapshot)
            .filter((packet) => packet.riskLevel === "high")
            .map((packet) => packet.id);

          if (!targetIds.length) {
            push("user", label);
            push("assistant", "当前没有高风险修订包，我先把待处理项展开给你逐条确认。");
            setPopoverOverride(buildComplianceListQuestion(snapshot));
            setSuggested(null);
            setDraft("");
            return;
          }

          void executeWorkflowShortcut(
            "resolve_compliance_revisions",
            { projectId: snapshot.projectId, targetIds },
            label,
          );
          return;
        }

        if (value === "script:compliance-list") {
          push("user", label);
          push("assistant", "我先把待处理修订包逐条展开，你可以直接标记已处理，或者继续围绕单条修订推进。");
          setPopoverOverride(buildComplianceListQuestion(snapshot));
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value === "script:compliance-rerun") {
          void executeWorkflowShortcut("run_compliance_review", { projectId: snapshot.projectId }, label);
          return;
        }

        if (value.startsWith("script:compliance-item:")) {
          const packetId = value.replace("script:compliance-item:", "");
          const packet = findCompliancePacket(snapshot, packetId);
          const nextQuestion = buildComplianceDecisionQuestion(snapshot, packetId);
          if (!packet || !nextQuestion) return;

          push("user", label);
          push("assistant", `已定位到修订包「${packet.issueTitle}」，你想直接标记已处理，还是继续按这条要求推进改写？`);
          setPopoverOverride(nextQuestion);
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("script:compliance-resolve:")) {
          const packetId = value.replace("script:compliance-resolve:", "");
          void executeWorkflowShortcut(
            "resolve_compliance_revisions",
            { projectId: snapshot.projectId, targetIds: [packetId] },
            label,
          );
          return;
        }

        if (value.startsWith("script:compliance-rewrite:")) {
          const packetId = value.replace("script:compliance-rewrite:", "");
          const packet = findCompliancePacket(snapshot, packetId);
          if (!packet) return;

          void send(
            `请根据这条合规修订继续改写当前项目：${packet.issueTitle}。风险等级：${packet.riskLevel}。建议：${packet.recommendation}`,
            label,
          );
          return;
        }

        if (value === "script:beat-lock-next") {
          const nextPacket = listUnlockedBeatPackets(snapshot)[0];
          if (!nextPacket) return;

          void executeWorkflowShortcut(
            "lock_story_beats",
            { projectId: snapshot.projectId, targetIds: [nextPacket.id] },
            label,
          );
          return;
        }

        if (value === "script:beat-lock-drafted") {
          const targetIds = listUnlockedBeatPackets(snapshot)
            .filter((packet) => packet.status === "drafted")
            .map((packet) => packet.id);

          if (!targetIds.length) {
            push("user", label);
            push("assistant", "当前还没有已经成型的 beat，我先把可处理的剧情节点逐条展开给你。");
            setPopoverOverride(buildBeatPacketListQuestion(snapshot));
            setSuggested(null);
            setDraft("");
            return;
          }

          void executeWorkflowShortcut(
            "lock_story_beats",
            { projectId: snapshot.projectId, targetIds },
            label,
          );
          return;
        }

        if (value === "script:beat-list") {
          push("user", label);
          push("assistant", "我先把可处理的剧情 beat 逐条展开，你可以直接锁定，或者继续写对应集数。");
          setPopoverOverride(buildBeatPacketListQuestion(snapshot));
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("script:beat-item:")) {
          const packetId = value.replace("script:beat-item:", "");
          const packet = findBeatPacket(snapshot, packetId);
          const nextQuestion = buildBeatPacketDecisionQuestion(snapshot, packetId);
          if (!packet || !nextQuestion) return;

          push("user", label);
          push("assistant", `已定位到第 ${packet.episodeNumber} 集 · ${packet.title}，这条 beat 你想直接锁定，还是继续写这一集？`);
          setPopoverOverride(nextQuestion);
          setSuggested(null);
          setMode("active");
          setDraft("");
          return;
        }

        if (value.startsWith("script:beat-lock:")) {
          const packetId = value.replace("script:beat-lock:", "");
          void executeWorkflowShortcut(
            "lock_story_beats",
            { projectId: snapshot.projectId, targetIds: [packetId] },
            label,
          );
          return;
        }

        if (value.startsWith("script:beat-write:")) {
          const episodeNumber = Number(value.replace("script:beat-write:", ""));
          if (!Number.isFinite(episodeNumber)) return;

          void executeWorkflowShortcut(
            "generate_episode",
            { projectId: snapshot.projectId, episodeNumber },
            label,
          );
          return;
        }
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
    [answer, loadWorkflowActionsModule, push, qState, question, send],
  );

  const confirmStructuredAnswer = useCallback(() => {
    if (!qState || !question) return;

    const activeQuestion = qState.request.questions[qState.currentIndex];
    if (!activeQuestion) return;

    const selectedLabels = question.options
      .filter((option) => selectedValues.includes(option.value))
      .map((option) => option.label);
    const custom = draft.trim();
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
  }, [answer, draft, qState, question, selectedValues]);

  const submitComposer = useCallback(() => {
    if (qState && (question?.submissionMode === "confirm" || question?.multiSelect)) {
      confirmStructuredAnswer();
      return;
    }

    if (qState) {
      answer(draft);
      return;
    }

    void send(draft);
  }, [answer, confirmStructuredAnswer, draft, qState, question, send]);
  const composerProps = useMemo<HomeComposerProps>(
    () => ({
      idle,
      currentProjectLabel: currentProject ? `${currentProject.title} · ${currentProject.derivedStage}` : undefined,
      maintenanceHint,
      draft,
      setDraft,
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
      onInterrupt: () => {
        engineRef.current?.interrupt();
        setStreaming(false);
      },
    }),
    [
      activeTheme,
      composerShellClass,
      confirmStructuredAnswer,
      currentProject,
      draft,
      handleChoiceSelect,
      idle,
      maintenanceHint,
      placeholder,
      qState,
      question,
      reduceMotion,
      selectedValues,
      streaming,
      submitComposer,
    ],
  );

  return (
    <LayoutGroup id="home-agent-shell">
      <div className="relative min-h-screen overflow-hidden bg-[#131314] text-white">
        <HomeSurfaceBackdrop idle={idle} />
        <DesktopSidebar
          idle={idle}
          recentProjects={deferredRecentProjects}
          recentProjectsReady={recentProjectsReady}
          templates={templates}
          assets={deferredSidebarAssets}
          currentProjectId={activeProjectId}
          collapsed={desktopSidebarCollapsed}
          onTemplateLaunch={handleTemplateLaunch}
          onOpenProject={handleOpenProject}
          onNewProject={handleReset}
          onOpenSettings={handleOpenSettings}
          onToggleCollapse={() => setDesktopSidebarCollapsed((current) => !current)}
        />
        <MobileSidebarSheet
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          idle={idle}
          recentProjects={deferredRecentProjects}
          recentProjectsReady={recentProjectsReady}
          templates={templates}
          assets={deferredSidebarAssets}
          currentProjectId={activeProjectId}
          onTemplateLaunch={handleTemplateLaunch}
          onOpenProject={handleOpenProject}
          onNewProject={handleReset}
          onOpenSettings={handleOpenSettings}
        />
        <DesktopSettingsPanel
          open={settingsOpen}
          onClose={() => handleSettingsOpenChange(false)}
          leftOffset={desktopSidebarOffset}
        />
        <MobileSettingsSheet open={settingsOpen} onOpenChange={handleSettingsOpenChange} />

        <div className="relative z-10 flex min-h-screen flex-col">
          <MobileTopbar idle={idle} onOpenNavigation={handleOpenMobileNavigation} />
          <main
            className={cn(
              "relative flex-1 overflow-x-clip px-3.5 sm:px-4 md:px-8",
              idle ? "pb-0 pt-4 lg:pl-[var(--home-sidebar-offset)]" : "pb-0 pt-2 lg:pl-[var(--home-sidebar-offset)]",
            )}
            style={{ "--home-sidebar-offset": `${desktopSidebarOffset}px` } as React.CSSProperties}
          >
            {idle ? (
              <IdleLanding composerProps={composerProps} reduceMotion={reduceMotion} />
            ) : (
              <ActiveConversationShell
                messages={deferredMessages}
                tasks={visibleTasks}
                onStopTask={handleStopTask}
                endRef={endRef}
                composerProps={composerProps}
                reduceMotion={reduceMotion}
              />
            )}
          </main>
        </div>
      </div>
    </LayoutGroup>
  );
}
