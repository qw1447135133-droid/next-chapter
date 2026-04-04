import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Loader2, Menu, Send, Sparkles, Square } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { HomeAgentMessage, ComposerQuestion } from "@/lib/home-agent/types";
import type { Task as RuntimeTask } from "@/lib/agent/tools/task-tools";
import { cn } from "@/lib/utils";
import ComposerChoicePopover from "./ComposerChoicePopover";

const { memo, useEffect, useMemo, useState } = React;

type ReactNode = React.ReactNode;
type RefObject<T> = React.RefObject<T>;

function truncateCopy(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
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

const BackgroundTaskDock = memo(function BackgroundTaskDock({
  tasks,
  onStopTask,
  floating = false,
}: {
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  floating?: boolean;
}) {
  const { visibleTasks, collapsedTerminalTasks, runningCount } = useMemo(() => {
    const sortedTasks = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
    const activeTasks = sortedTasks.filter((task) => !isTerminalTask(task));
    const terminalTasks = sortedTasks.filter((task) => isTerminalTask(task));
    const activeLimit = Math.min(activeTasks.length, 3);
    const terminalLimit = Math.max(0, 4 - activeLimit);

    return {
      visibleTasks: [...activeTasks.slice(0, 3), ...terminalTasks.slice(0, terminalLimit)].slice(0, 4),
      collapsedTerminalTasks: terminalTasks.slice(terminalLimit),
      runningCount: tasks.filter((task) => task.status === "running").length,
    };
  }, [tasks]);

  return (
    <div className={cn("space-y-1.5", floating ? "w-full max-w-[312px]" : "mb-2.5")}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/34">
          <Bot className="h-3.5 w-3.5" />
          Agent 任务
        </div>
        <div className="text-[10.5px] text-white/32">
          {runningCount > 0 ? `${runningCount} 项后台处理中` : `${tasks.length} 项任务记录`}
        </div>
      </div>
      <div className="space-y-1">
        {visibleTasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2 rounded-[15px] border border-white/[0.05] bg-white/[0.022] px-3 py-2">
            <div
              className={cn(
                "mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] tracking-[0.08em]",
                taskStatusClass(task.status),
              )}
            >
              {taskStatusLabel(task.status)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-[11.5px] text-white/80">
                  {parseTaskHeading(task.prompt) ?? truncateCopy(task.prompt, 84)}
                </div>
                {isTerminalTask(task) ? (
                  <span className="shrink-0 text-[10px] text-white/20">{formatTaskDockTimestamp(task.updatedAt)}</span>
                ) : null}
              </div>
              {task.output ? (
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-[1.42] text-white/38">{truncateCopy(task.output, 136)}</div>
              ) : (
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-[1.42] text-white/30">
                  {parseTaskPreview(task.prompt) || "Agent 正在后台处理中，结果会自动回流到当前会话。"}
                </div>
              )}
            </div>
            {task.status === "running" ? (
              <button
                type="button"
                onClick={() => onStopTask(task.id)}
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/78"
              >
                停止
              </button>
            ) : null}
          </div>
        ))}
        {collapsedTerminalTasks.length ? (
          <div className="flex items-center justify-between gap-3 rounded-[15px] border border-white/[0.05] bg-white/[0.02] px-3 py-2">
            <div className="min-w-0">
              <div className="text-[10.5px] text-white/50">
                已整理 {collapsedTerminalTasks.length} 条较早任务记录
              </div>
              <div className="mt-0.5 truncate text-[10px] text-white/28">
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

const ActiveConversationViewport = memo(function ActiveConversationViewport({
  messages,
  tasks,
  onStopTask,
  endRef,
  streaming,
  trackClassName,
}: {
  messages: HomeAgentMessage[];
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  streaming: boolean;
  trackClassName: string;
}) {
  const isMobile = useIsMobile();

  return (
    <div className={cn("relative mx-auto w-full flex-1", trackClassName)}>
      {tasks.length ? (
        <>
          {isMobile ? (
            <div className="mb-2.5">
              <BackgroundTaskDock tasks={tasks} onStopTask={onStopTask} />
            </div>
          ) : (
            <div className="pointer-events-none absolute right-0 top-1 z-10">
              <div className="pointer-events-auto">
                <BackgroundTaskDock tasks={tasks} onStopTask={onStopTask} floating />
              </div>
            </div>
          )}
        </>
      ) : null}
      <ConversationTimeline
        messages={messages}
        endRef={endRef}
        streaming={streaming}
        hasFloatingDock={tasks.length > 0 && !isMobile}
      />
    </div>
  );
});

const ActiveComposerDock = memo(function ActiveComposerDock({
  composer,
  trackClassName,
}: {
  composer: ReactNode;
  trackClassName: string;
}) {
  return (
    <div className={cn("sticky bottom-0 z-20 mx-auto w-full pb-[calc(10px+env(safe-area-inset-bottom))] pt-3", trackClassName)}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(19,19,20,0),rgba(19,19,20,0.92)_38%,rgba(19,19,20,0.98))]" />
      <div className="relative">{composer}</div>
    </div>
  );
});

export const ActiveConversationShell = memo(function ActiveConversationShell({
  messages,
  tasks,
  onStopTask,
  endRef,
  composer,
  streaming,
  trackClassName,
}: {
  messages: HomeAgentMessage[];
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  composer: ReactNode;
  streaming: boolean;
  trackClassName: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-112px)] w-full flex-col">
      <ActiveConversationViewport
        messages={messages}
        tasks={tasks}
        onStopTask={onStopTask}
        endRef={endRef}
        streaming={streaming}
        trackClassName={trackClassName}
      />
      <ActiveComposerDock composer={composer} trackClassName={trackClassName} />
    </div>
  );
});

export const HomeSurfaceBackdrop = memo(function HomeSurfaceBackdrop({ idle }: { idle: boolean }) {
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

export const MobileTopbar = memo(function MobileTopbar({
  idle,
  brandLabel,
  onOpenNavigation,
}: {
  idle: boolean;
  brandLabel: string;
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
          <div className="truncate text-[15px] font-semibold tracking-[0.02em] text-white">{brandLabel}</div>
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

export interface HomeComposerProps {
  idle: boolean;
  currentProjectTitle?: string;
  currentProjectStage?: string;
  maintenanceHint?: string | null;
  initialDraft: string;
  draftResetVersion: number;
  draftPresence: boolean;
  onDraftChange: (value: string) => void;
  placeholder: string;
  question: ComposerQuestion | null;
  qState: unknown | null;
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

export const HomeComposer = memo(function HomeComposer({
  idle,
  currentProjectTitle,
  currentProjectStage,
  maintenanceHint,
  initialDraft,
  draftResetVersion,
  draftPresence,
  onDraftChange,
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
  const [draft, setLocalDraft] = useState(initialDraft);

  useEffect(() => {
    setLocalDraft(initialDraft);
  }, [initialDraft, draftResetVersion]);

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
      className="pointer-events-auto relative w-full"
    >
      <ComposerChoicePopover
        question={question}
        onSelect={onSelectChoice}
        onConfirm={qState ? onConfirmQuestion : undefined}
        canConfirm={selectedValues.length > 0 || draftPresence || !!draft.trim()}
        tone={activeTheme ? "dark" : "light"}
      />
      <motion.div
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
          <div className="flex items-center gap-2 px-4 pb-0 pt-3 text-[10px] text-white/38 md:px-6">
            <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/78">
              <Sparkles className="h-2.5 w-2.5" />
            </div>
            <div className="truncate text-[10.5px] text-white/50">首页主控会话</div>
          </div>
        ) : currentProjectTitle || maintenanceHint ? (
          <div className="flex items-center gap-1.5 px-3.5 pb-0 pt-1 md:px-6">
            {currentProjectTitle ? (
              <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/[0.04] bg-white/[0.025] px-2.5 py-1 text-[9.5px] text-white/38">
                <span className="truncate text-white/68">{currentProjectTitle}</span>
                {currentProjectStage ? (
                  <>
                    <span className="h-1 w-1 shrink-0 rounded-full bg-white/[0.16]" />
                    <span className="shrink-0 uppercase tracking-[0.12em] text-white/26">{currentProjectStage}</span>
                  </>
                ) : null}
              </div>
            ) : null}
            {maintenanceHint ? (
              <div className="hidden max-w-[200px] truncate rounded-full border border-white/[0.035] bg-white/[0.018] px-2 py-1 text-[9px] text-white/18 xl:block">
                {maintenanceHint}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("px-3.5 pb-3 pt-1 sm:px-4 sm:pb-3.5 md:px-6 md:pb-3.5", !idle && "pt-1")}>
          <Textarea
            value={draft}
            onChange={(e) => {
              const nextValue = e.target.value;
              setLocalDraft(nextValue);
              onDraftChange(nextValue);
            }}
            placeholder={placeholder}
            rows={idle ? 5 : 3}
            className={cn(
              "resize-none border-none bg-transparent px-0 pb-2 pt-1.5 text-[13.5px] leading-6.5 shadow-none ring-0 focus-visible:ring-0 sm:text-[14px]",
              activeTheme
                ? "min-h-[78px] text-white placeholder:text-white/28 sm:min-h-[88px]"
                : "min-h-[104px] text-slate-900 placeholder:text-slate-400",
              idle && "min-h-[136px] sm:min-h-[154px] md:min-h-[188px]",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="flex items-end justify-end gap-2">
            <div className="flex items-center gap-1.5">
              {streaming && !qState ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-9 w-9 rounded-full sm:h-10 sm:w-10",
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
                disabled={(!(draftPresence || draft.trim()) && !(qState && selectedValues.length > 0)) || (streaming && !qState)}
                className={cn(
                  "h-9 w-9 rounded-full shadow-none sm:h-10 sm:w-10",
                  activeTheme ? "bg-white text-slate-950 hover:bg-white/90" : "bg-slate-950 text-white hover:bg-slate-900",
                )}
                onClick={onSubmit}
              >
                {streaming && !qState ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

export const IdleLanding = memo(function IdleLanding({
  composer,
  reduceMotion,
  title,
  trackClassName,
}: {
  composer: ReactNode;
  reduceMotion: boolean;
  title: string;
  trackClassName: string;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-100px)] w-full max-w-[1060px] flex-col justify-center pb-14 pt-4 sm:pb-[4.5rem]">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={reduceMotion ? undefined : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-[760px]"
      >
        <div className="mb-4 space-y-1.5 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.035] px-3 py-1.5 text-[10.5px] text-white/52">
            <Bot className="h-3.5 w-3.5" />
            单首页会话
          </div>
          <h1 className="text-[21px] font-medium tracking-[-0.045em] text-white md:text-[28px]">{title}</h1>
          <p className="mx-auto max-w-[520px] text-[12.5px] leading-5.5 text-white/40 sm:text-[13px]">
            直接开始说目标。会话启动后，同一个输入框会在这一页自然沉到底部，继续推进完整工作流。
          </p>
        </div>
        <div className={cn("mx-auto w-full", trackClassName)}>{composer}</div>
      </motion.div>
    </div>
  );
});
