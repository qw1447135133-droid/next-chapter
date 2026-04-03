import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Bot,
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
import type {
  ComposerQuestion,
  ConversationProjectSnapshot,
  HomeAgentMessage,
  StudioQuestionState,
  StudioRuntimeState,
  StudioSessionState,
} from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";
import ComposerChoicePopover from "./ComposerChoicePopover";
import type { QueryEngine as QueryEngineClass } from "@/lib/agent/query-engine";

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
  "你是 InFinio 首页里的主控创作 Agent。整个产品只有一个首页工作表面，不允许把用户推回模块页、步骤页、工作台或手动表单。你必须先分析，再追问，再执行。需要结构化选择时调用 AskUserQuestion，并允许用户自定义输入。需要推进项目时调用 HomeStudioWorkflow。默认使用简体中文，保持简洁、克制、专业，一次只推进一个关键决策。";
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

function scheduleBackgroundTask(task: () => void, timeout = 500): () => void {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(task, Math.min(timeout, 180));
  return () => window.clearTimeout(handle);
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
      sessionId: crypto.randomUUID(),
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

const brief = (snapshot: ConversationProjectSnapshot) =>
  [
    `已恢复项目《${snapshot.title}》。`,
    `当前阶段：${snapshot.derivedStage}`,
    `当前目标：${snapshot.currentObjective}`,
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
  snapshot.recommendedActions.length
    ? {
        id: `r-${snapshot.projectId}`,
        title: "接下来要从哪一步继续？",
        description: `我已经根据《${snapshot.title}》的当前状态整理好推荐动作，你也可以直接输入自定义指令。`,
        options: snapshot.recommendedActions.slice(0, 3).map((action, index) => ({
          id: `${snapshot.projectId}-${index}`,
          label: action,
          value: action,
          rationale: "点击后会在当前首页会话里直接继续，不会跳转到其他页面。",
        })),
        allowCustomInput: true,
        submissionMode: "immediate",
        multiSelect: false,
        stepIndex: 0,
        totalSteps: 1,
        answerKey: "recovery",
      }
    : null;

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
): SidebarAssetItem[] {
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
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div className="border-t border-white/[0.05] px-3 pb-4 pt-3">
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-[12px] text-slate-300 transition-colors hover:bg-white/[0.035] hover:text-slate-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white/[0.04] text-slate-200">
          <Settings2 className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium">设置</span>
          <span className="block truncate text-[10.5px] text-slate-500">模型、密钥、路径与外观</span>
        </span>
      </button>
    </div>
  );
});

const SidebarAssetRow = memo(function SidebarAssetRow({
  asset,
  onOpen,
}: {
  asset: SidebarAssetItem;
  onOpen: (url: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(asset.url)}
      className="flex w-full items-center gap-2 rounded-[14px] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
    >
      {asset.kind === "image" ? (
        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.05]">
          <img src={asset.url} alt={asset.label} className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/[0.08]" />
        </span>
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-slate-200">
          <Clapperboard className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] text-slate-100">{asset.label}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-500">
          <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 uppercase tracking-[0.18em] text-[9px] text-slate-400">
            {asset.kind}
          </span>
          <span className="truncate">{asset.meta}</span>
        </span>
      </span>
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
    <div className="space-y-3.5 pb-7 pt-2.5 sm:space-y-4 sm:pb-8 sm:pt-3 [content-visibility:auto]">
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
            <div className="max-w-[748px]">
              <div className="flex gap-2.5">
                <div className="mt-1.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-white/68">
                  <Sparkles className="h-3 w-3" />
                </div>
                <div className="whitespace-pre-wrap break-words pt-0.5 text-[13.5px] leading-[1.72] text-white/80 sm:text-[14px] sm:leading-[1.8]">
                  {message.content}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-[80%] rounded-[18px] bg-white/[0.045] px-3.5 py-2.5 text-[13.5px] leading-[1.65] text-white/84 sm:max-w-[72%] sm:text-[14px] sm:leading-[1.72]">
              {message.content}
            </div>
          )}
        </motion.div>
      ))}
      <div ref={endRef} />
    </div>
  );
});

const DesktopSidebar = memo(function DesktopSidebar({
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
  return (
    <aside className="hidden lg:block">
      <div
        className="fixed inset-y-0 left-0 z-40 border-r border-white/[0.06] bg-[#141518] [contain:layout_paint]"
        style={{ width: DESKTOP_SIDEBAR_WIDTH }}
      >
        <div className="flex h-[72px] items-center border-b border-white/[0.06] px-5">
          <BrandMark className="h-8" />
          <div className="ml-3 min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-slate-100">{SIDEBAR_BRAND}</div>
            <div className="truncate text-[10px] text-slate-500">{idle ? "开始一段新会话" : "当前首页会话"}</div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-4">
          <button
            type="button"
            onClick={onNewProject}
            className="mb-4 flex w-full items-center gap-3 rounded-[16px] px-3 py-2 text-left text-[12.5px] text-slate-100 transition-colors hover:bg-white/[0.04]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.9] text-slate-950">
              <Plus className="h-4 w-4 shrink-0" />
            </span>
            <span>{idle ? "开始新项目" : "新建项目"}</span>
          </button>

          {idle ? (
            <section className="px-2 pb-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">快捷任务</div>
              <div className="grid grid-cols-2 gap-1.5">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onTemplateLaunch(template.prompt, template.title)}
                    className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-[11.5px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{template.title}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="px-2 py-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <History className="h-3.5 w-3.5" />
              对话历史
            </div>
            <div className="space-y-0.5">
              {recentProjects.slice(0, 10).map((project) => (
                <button
                  key={project.projectId}
                  type="button"
                  onClick={() => onOpenProject(project.projectId)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[14px] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.035]",
                    currentProjectId === project.projectId && "bg-white/[0.05]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full bg-white/[0.12]",
                      currentProjectId === project.projectId && "bg-[#7c92ff]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-slate-100">{project.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">
                      {projectKindLabel(project.projectKind)} · {project.derivedStage} · {formatDateLabel(project.updatedAt)}
                    </div>
                    {currentProjectId === project.projectId ? (
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        {truncateCopy(project.currentObjective || project.agentSummary, 44)}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
              {!recentProjects.length ? (
                <div className="px-3 py-2 text-[12.5px] leading-6 text-slate-500">
                  {recentProjectsReady ? "还没有历史项目。" : "正在整理最近项目…"}
                </div>
              ) : null}
            </div>
          </section>

          {!idle ? (
            <section className="px-2 pb-2 pt-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                <Image className="h-3.5 w-3.5" />
                素材库
              </div>
              <div className="space-y-0.5">
                {assets.length ? (
                  assets.map((asset) => (
                    <SidebarAssetRow
                      key={asset.id}
                      asset={asset}
                      onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                    />
                  ))
                ) : (
                  <div className="px-3 py-2 text-[12.5px] leading-6 text-slate-500">
                    当前对话还没有图像或视频素材。
                  </div>
                )}
              </div>
            </section>
          ) : null}
          </div>
          <SidebarFooter onOpenSettings={onOpenSettings} />
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className={cn(MOBILE_NAV_SHEET, "lg:hidden")}>
        <SheetHeader className="sr-only">
          <SheetTitle>导航</SheetTitle>
          <SheetDescription>当前首页会话的导航、历史项目和素材库。</SheetDescription>
        </SheetHeader>
        <div className="flex h-[72px] items-center border-b border-white/[0.06] px-5">
          <BrandMark className="h-8" />
          <div className="ml-3 min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-slate-100">{SIDEBAR_BRAND}</div>
            <div className="truncate text-[10px] text-slate-500">{idle ? "开始一段新会话" : "当前首页会话"}</div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-4">
          <button
            type="button"
            onClick={() => {
              onNewProject();
              onOpenChange(false);
            }}
            className="mb-4 flex w-full items-center gap-3 rounded-[16px] px-3 py-2 text-left text-[12.5px] text-slate-100 transition-colors hover:bg-white/[0.04]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.9] text-slate-950">
              <Plus className="h-4 w-4 shrink-0" />
            </span>
            <span>{idle ? "开始新项目" : "新建项目"}</span>
          </button>

          {idle ? (
            <section className="border-b border-white/[0.06] px-2 pb-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">快捷任务</div>
              <div className="grid grid-cols-2 gap-1.5">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      onTemplateLaunch(template.prompt, template.title);
                      onOpenChange(false);
                    }}
                    className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-[11.5px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{template.title}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="border-b border-white/[0.06] px-2 py-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <History className="h-3.5 w-3.5" />
              对话历史
            </div>
            <div className="space-y-0.5">
              {recentProjects.slice(0, 10).map((project) => (
                <button
                  key={project.projectId}
                  type="button"
                  onClick={() => {
                    onOpenProject(project.projectId);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[14px] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.035]",
                    currentProjectId === project.projectId && "bg-white/[0.05]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full bg-white/[0.12]",
                      currentProjectId === project.projectId && "bg-[#7c92ff]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-slate-100">{project.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">
                      {projectKindLabel(project.projectKind)} · {project.derivedStage} · {formatDateLabel(project.updatedAt)}
                    </div>
                    {currentProjectId === project.projectId ? (
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        {truncateCopy(project.currentObjective || project.agentSummary, 40)}
                      </div>
                    ) : null}
                  </div>
                </button>
              ))}
              {!recentProjects.length ? (
                <div className="px-3 py-2.5 text-[13px] leading-6 text-slate-500">
                  {recentProjectsReady ? "还没有历史项目。" : "正在整理最近项目…"}
                </div>
              ) : null}
            </div>
          </section>

          {!idle ? (
            <section className="px-2 py-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                <Image className="h-3.5 w-3.5" />
                素材库
              </div>
              <div className="space-y-0.5">
                {assets.length ? (
                  assets.map((asset) => (
                    <SidebarAssetRow
                      key={asset.id}
                      asset={asset}
                      onOpen={(url) => window.open(url, "_blank", "noopener,noreferrer")}
                    />
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-[13px] leading-6 text-slate-500">
                    当前对话还没有图像或视频素材。
                  </div>
                )}
              </div>
            </section>
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: -18, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.99 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 left-[304px] top-4 z-50 hidden w-[min(456px,calc(100vw-336px))] lg:block"
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
  const [mode, setMode] = useState<"idle" | "active" | "recovering">(
    session?.mode === "recovering" ? "recovering" : hasInitialSession ? "active" : "idle",
  );
  const [draft, setDraft] = useState(session?.draft ?? "");
  const [streaming, setStreaming] = useState(false);
  const [qState, setQState] = useState<QState | null>(session?.qState ?? null);
  const [suggested, setSuggested] = useState<ComposerQuestion | null>(null);
  const [selectedValues, setSelectedValues] = useState<string[]>(session?.selectedValues ?? []);
  const [recentProjectsReady, setRecentProjectsReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanelId>(initialUtility);
  const [activeProjectId, setActiveProjectId] = useState(
    session?.projectId ?? session?.currentProjectSnapshot?.projectId,
  );

  const runtimeRef = useRef(runtime);
  const engineRef = useRef<QueryEngineClass | null>(null);
  const engineDepsRef = useRef<Promise<EngineDeps> | null>(null);
  const projectStoreRef = useRef<Promise<ProjectStoreModule> | null>(null);
  const apiConfigRef = useRef<Promise<ApiConfigModule> | null>(null);
  const askQuestionRef = useRef<Promise<AskUserQuestionModule> | null>(null);
  const structuredParserRef = useRef<Promise<StructuredQuestionParserModule> | null>(null);
  const handoffRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const previousQuestionStepRef = useRef<string | null>(
    session?.qState ? `${session.qState.request.id}:${session.qState.currentIndex}` : null,
  );

  const currentProject = runtime.currentProjectSnapshot;
  const baseQuestion = useMemo(() => qToComposer(qState) || suggested, [qState, suggested]);
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
  const recentSessionSummary = useMemo(
    () =>
      deferredMessages
        .slice(-6)
        .map((message) => `${message.role}: ${truncateCopy(message.content, 120)}`)
        .join(" | "),
    [deferredMessages],
  );

  const composerShellClass = idle
    ? "overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,rgba(35,36,40,0.96),rgba(24,25,28,0.98))] shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
    : "overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(33,34,38,0.96),rgba(24,25,28,0.98))]";
  const sidebarAssets = useMemo(
    () => collectConversationAssets(runtime.currentVideoProject).slice(0, 12),
    [runtime.currentVideoProject],
  );
  const deferredSidebarAssets = useDeferredValue(sidebarAssets);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    setUtilityPanel(initialUtility);
  }, [initialUtility]);

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
    const stepKey = qState ? `${qState.request.id}:${qState.currentIndex}` : null;
    if (stepKey === previousQuestionStepRef.current) return;
    previousQuestionStepRef.current = stepKey;
    if (!stepKey) return;
    setSelectedValues([]);
    setDraft("");
  }, [qState]);

  useEffect(() => {
    if (idle) {
      clearStudioSession();
      return;
    }

    const cancelTask = scheduleBackgroundTask(() => {
      writeStudioSession({
        mode,
        messages: deferredMessages,
        currentProjectSnapshot: deferredProjectSnapshot,
        recentMessageSummary: recentSessionSummary,
        projectId: activeProjectId,
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
    async (seed: HomeAgentMessage[]) => {
      if (engineRef.current) return engineRef.current;

      const deps = await loadEngineDeps();
      const apiConfig = await loadApiConfigModule();
      const tools = deps
        .createDefaultTools()
        .filter((tool) => ["AskUserQuestion", "HomeStudioWorkflow"].includes(tool.name));
      const cfg = apiConfig.getApiConfig();
      const apiKey = cfg.claudeKey || cfg.geminiKey || cfg.gptKey;
      const baseUrl = cfg.claudeEndpoint || cfg.geminiEndpoint || cfg.gptEndpoint;

      if (!apiKey) {
        throw new Error("当前没有可用的文本模型 API Key，请先在设置中完成配置。");
      }

      engineRef.current = new deps.QueryEngine({
        apiKey,
        baseUrl,
        model: apiConfig.resolveConfiguredModelName("claude-sonnet-4-6"),
        tools,
        systemPrompt: PROMPT,
        initialMessages: toQuery(seed),
        maxTurns: 12,
        getAppState: () => runtimeRef.current,
        setAppState: (updater) => setRuntime((prev) => updater(prev) as StudioRuntimeState),
      });

      return engineRef.current;
    },
    [loadApiConfigModule, loadEngineDeps],
  );

  const send = useCallback(
    async (prompt: string, shown?: string) => {
      const cleaned = prompt.trim();
      if (!cleaned) return;

      push("user", shown || cleaned);
      setSuggested(null);
      setMode("active");
      setDraft("");
      setStreaming(true);

      try {
        const activeEngine = await getEngine(messages);
        for await (const event of activeEngine.submitMessage(cleaned)) {
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
    [getEngine, loadStructuredQuestionParser, messages, push],
  );

  const reset = useCallback(() => {
    if (qState) {
      void loadAskUserQuestionModule().then((mod) => {
        mod.rejectAskUserQuestion(qState.request.id, "User reset conversation");
      });
    }

    engineRef.current?.interrupt();
    engineRef.current = null;
    setQState(null);
    setSuggested(null);
    setSelectedValues([]);
    setMode("idle");
    setMessages([]);
    setDraft("");
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
      setActiveProjectId(projectId);

      if (savedSession) {
        setQState(savedSession.qState ?? null);
        setSuggested(null);
        setSelectedValues(savedSession.selectedValues ?? []);
        setMode(savedSession.mode === "recovering" ? "recovering" : "active");
        setMessages(savedSession.messages.length ? savedSession.messages : [mk("assistant", brief(snapshot))]);
        setDraft(savedSession.draft ?? "");
        previousQuestionStepRef.current = savedSession.qState
          ? `${savedSession.qState.request.id}:${savedSession.qState.currentIndex}`
          : null;
      } else {
        setQState(null);
        setSuggested(recQuestion(snapshot));
        setSelectedValues([]);
        setMode("active");
        setMessages([mk("assistant", brief(snapshot))]);
        setDraft("");
        previousQuestionStepRef.current = null;
      }

      setRuntime((prev) => ({
        ...prev,
        sessionId: crypto.randomUUID(),
        currentProjectSnapshot: snapshot,
        currentDramaProject: source.dramaProject,
        currentVideoProject: source.videoProject,
        recentProjects: [
          snapshot,
          ...prev.recentProjects.filter((item) => item.projectId !== snapshot.projectId),
        ].slice(0, 8),
      }));
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
      setSuggested(null);
      setQState(createQState(detail));
      setSelectedValues([]);
      setDraft("");
      setMode("active");
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
    [answer, qState, question],
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

  const composer = (
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
        onSelect={handleChoiceSelect}
        onConfirm={qState ? confirmStructuredAnswer : undefined}
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
        ) : currentProject ? (
          <div className="flex items-center justify-between gap-3 px-4 pb-0 pt-2 text-[10px] tracking-[0.02em] text-white/34 md:px-6">
            <div className="truncate">{`${currentProject.title} · ${currentProject.derivedStage}`}</div>
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
                if (qState && (question?.submissionMode === "confirm" || question?.multiSelect)) {
                  confirmStructuredAnswer();
                  return;
                }
                if (qState) {
                  answer(draft);
                } else {
                  void send(draft);
                }
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
                  onClick={() => {
                    engineRef.current?.interrupt();
                    setStreaming(false);
                  }}
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
                onClick={() => {
                  if (qState && (question?.submissionMode === "confirm" || question?.multiSelect)) {
                    confirmStructuredAnswer();
                    return;
                  }
                  if (qState) {
                    answer(draft);
                  } else {
                    void send(draft);
                  }
                }}
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

  return (
    <LayoutGroup id="home-agent-shell">
      <div className="relative min-h-screen overflow-hidden bg-[#131314] text-white">
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
      <DesktopSidebar
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
      <DesktopSettingsPanel open={settingsOpen} onClose={() => handleSettingsOpenChange(false)} />
      <MobileSettingsSheet open={settingsOpen} onOpenChange={handleSettingsOpenChange} />

      <div className="relative z-10 flex min-h-screen flex-col">
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
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4.5 w-4.5" />
          </Button>
        </header>
        <main
          className={cn(
            "relative flex-1 overflow-x-clip px-3.5 sm:px-4 md:px-8",
            idle ? "pb-0 pt-4 lg:pl-[320px]" : "pb-0 pt-2 lg:pl-[320px]",
          )}
        >
          {idle ? (
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
                <div className={cn("mx-auto w-full", IDLE_TRACK_CLASS)}>{composer}</div>
              </motion.div>
            </motion.div>
          ) : (
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
                <ConversationTimeline messages={deferredMessages} endRef={endRef} />
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
                <div className="relative">{composer}</div>
              </motion.div>
            </motion.div>
          )}
        </main>
      </div>
      </div>
    </LayoutGroup>
  );
}
