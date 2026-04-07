import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Copy,
  Loader2,
  Menu,
  Paperclip,
  PencilLine,
  RefreshCw,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CreationGuideDimensionId } from "@/lib/home-agent/creation-guide-presets";
import type { HomeAgentMessage, ComposerQuestion } from "@/lib/home-agent/types";
import type { Task as RuntimeTask } from "@/lib/agent/tools/task-tools";
import { cn } from "@/lib/utils";
import { AssistantCreationGuideBody } from "./AssistantCreationGuideBody";
import ComposerChoiceModal from "./ComposerChoiceModal";
import { HomeTextModelPicker } from "./HomeTextModelPicker";
import type { HomeAgentTextModelGroup } from "@/lib/home-agent/text-models";
import {
  formatTaskDockTimestamp,
  isTerminalTask,
  parseTaskHeading,
  parseTaskPreview,
  taskStatusClass,
  taskStatusLabel,
  truncateCopy,
} from "./home-agent-task-utils";

const { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

/** Assistant avatar in the conversation stream (static asset in /public). */
function HomeAgentAiAvatar({
  className,
  glowing,
  reduceMotion,
}: {
  className?: string;
  glowing?: boolean;
  reduceMotion?: boolean;
}) {
  const wantsGlow = Boolean(glowing);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-visible",
        className,
      )}
    >
      <img
        src="/home-agent-ai-avatar.png"
        alt=""
        className={cn(
          "h-full w-full object-contain select-none",
          wantsGlow && "home-agent-ai-avatar-breath",
        )}
        draggable={false}
        aria-hidden
      />
    </div>
  );
}

type ReactNode = React.ReactNode;
type RefObject<T> = React.RefObject<T>;

export interface HomeComposerVideoTransportHint {
  label: string;
  detail: string;
  tone?: "neutral" | "ready" | "warning";
}

export interface HomeComposerLaunchNotice {
  level: "warning" | "critical";
  title: string;
  description: string;
  actions: Array<{
    id: string;
    label: string;
  }>;
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  shouldAnimate,
  reduceMotion,
  editsDisabled,
  onEditUserMessage,
  onAssistantFeedback,
  onRegenerateAssistant,
  assistantAvatarGlowing,
  autoOpenCreationGuidePicker,
  onCreationGuidePick,
}: {
  message: HomeAgentMessage;
  shouldAnimate: boolean;
  reduceMotion: boolean;
  editsDisabled?: boolean;
  onEditUserMessage?: (messageId: string, newContent: string) => void | Promise<void>;
  onAssistantFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
  onRegenerateAssistant?: (messageId: string) => void | Promise<void>;
  /** True when this assistant row is the latest and a reply is still streaming in. */
  assistantAvatarGlowing?: boolean;
  /** Latest assistant message when idle — allows auto-opening the creation-guide preset modal once. */
  autoOpenCreationGuidePicker?: boolean;
  onCreationGuidePick?: (dimension: CreationGuideDimensionId, value: string, label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editLayout, setEditLayout] = useState<{
    width: number;
    bubbleMinHeight: number;
  } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setEditDraft(message.content);
  }, [message.content, editing]);

  useLayoutEffect(() => {
    if (!editing || !editLayout) return;
    const ta = editTextareaRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.max(editLayout.bubbleMinHeight, ta.scrollHeight);
    ta.style.height = `${next}px`;
  }, [editing, editDraft, editLayout]);

  const beginUserEdit = () => {
    const el = bubbleRef.current;
    if (el) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const stretched = Math.min(Math.round(w * 1.32 + 56), 620);
      setEditLayout({ width: stretched, bubbleMinHeight: h });
    } else {
      setEditLayout(null);
    }
    setEditDraft(message.content);
    setEditing(true);
  };

  const endUserEdit = () => {
    setEditing(false);
    setEditLayout(null);
  };

  const showUserEdit = message.role === "user" && onEditUserMessage && !editsDisabled;
  const showUserActions = message.role === "user" && !editing;

  const canSubmitUserEdit =
    editDraft.trim().length > 0 && editDraft.trim() !== message.content.trim();

  const handleCopyUserMessage = () => {
    void navigator.clipboard.writeText(message.content).catch(() => {});
  };

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
      className={cn("flex overflow-visible", message.role === "user" ? "justify-end" : "justify-start")}
    >
      {message.role === "assistant" ? (
        <div className="group max-w-[820px] overflow-visible">
          {/* gap-3.5: breathing room; -mt aligns 32px icon center with first line box (12.5/1.74 & 13/1.8) */}
          <div className="flex items-start gap-3.5 overflow-visible">
            <div className="-mt-[5px] shrink-0 overflow-visible pl-3 pr-1 sm:-mt-1">
              <HomeAgentAiAvatar
                className="h-8 w-8"
                glowing={assistantAvatarGlowing}
                reduceMotion={reduceMotion}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-3 sm:pr-4">
              <AssistantCreationGuideBody
                messageId={message.id}
                autoOpenPresetPicker={Boolean(autoOpenCreationGuidePicker)}
                content={message.content}
                onCreationGuidePick={onCreationGuidePick}
                picksDisabled={Boolean(editsDisabled)}
                className="text-white/82"
              />
              {message.status === "pending" && message.streamLabel ? (
                <div className="inline-flex items-center gap-2 pl-0.5 text-[11.5px] leading-5 text-white/38 sm:text-[12px]">
                  <span>{message.streamLabel}</span>
                  <span className="inline-flex gap-1">
                    <span className="h-1 w-1 rounded-full bg-white/28" />
                    <span className="h-1 w-1 rounded-full bg-white/22" />
                    <span className="h-1 w-1 rounded-full bg-white/16" />
                  </span>
                </div>
              ) : null}
              {onAssistantFeedback ? (
                <div className="flex items-center gap-px pl-0.5 opacity-[0.85] transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    title="好"
                    aria-label="评价为好"
                    aria-pressed={message.feedback === "up"}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      message.feedback === "up"
                        ? "bg-white/[0.1] text-white/88"
                        : "text-white/45 hover:bg-white/[0.06] hover:text-white/78",
                    )}
                    onClick={() =>
                      onAssistantFeedback(message.id, message.feedback === "up" ? null : "up")
                    }
                  >
                    <ThumbsUp className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    title="不好"
                    aria-label="评价为不好"
                    aria-pressed={message.feedback === "down"}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                      message.feedback === "down"
                        ? "bg-white/[0.1] text-white/88"
                        : "text-white/45 hover:bg-white/[0.06] hover:text-white/78",
                    )}
                    onClick={() =>
                      onAssistantFeedback(message.id, message.feedback === "down" ? null : "down")
                    }
                  >
                    <ThumbsDown className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  {onRegenerateAssistant ? (
                    <button
                      type="button"
                      title="重新生成"
                      aria-label="重新生成此条回复"
                      disabled={Boolean(editsDisabled)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                        editsDisabled
                          ? "cursor-not-allowed text-white/22"
                          : "text-white/45 hover:bg-white/[0.06] hover:text-white/78",
                      )}
                      onClick={() => {
                        if (editsDisabled) return;
                        void onRegenerateAssistant(message.id);
                      }}
                    >
                      <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="group flex max-w-[min(100%,720px)] items-center justify-end gap-1 sm:max-w-[min(92%,680px)]">
          {editing ? (
            <div
              className="pointer-events-none flex shrink-0 select-none items-center gap-px pr-0.5 opacity-0"
              aria-hidden
            >
              <span className="h-8 w-8" />
              <span className="h-8 w-8" />
            </div>
          ) : showUserActions ? (
            <div className="flex shrink-0 items-center gap-px pr-0.5 text-white/55 opacity-[0.85] transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                title="复制"
                aria-label="复制消息"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] hover:text-white/95"
                onClick={handleCopyUserMessage}
              >
                <Copy className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {showUserEdit ? (
                <button
                  type="button"
                  title="编辑并从此条重新生成"
                  aria-label="编辑并从此条重新生成"
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] hover:text-white/95"
                  onClick={beginUserEdit}
                >
                  <PencilLine className="h-4 w-4" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            ref={editing ? undefined : bubbleRef}
            className={cn(
              "min-w-0",
              editing
                ? "border-0 bg-transparent p-0 shadow-none"
                : "max-w-[68%] rounded-[18px] border border-white/[0.045] bg-white/[0.04] px-3.5 py-2 text-[12.5px] leading-[1.62] text-white/74 sm:max-w-[60%] sm:text-[13px] sm:leading-[1.68]",
            )}
            style={
              editing && editLayout
                ? { width: editLayout.width, minWidth: editLayout.width, maxWidth: editLayout.width }
                : undefined
            }
          >
            {editing ? (
              <div className="flex w-full min-w-0 flex-col gap-2">
                <Textarea
                  ref={editTextareaRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={1}
                  spellCheck={false}
                  className={cn(
                    "box-border min-h-0 w-full resize-none overflow-hidden rounded-[22px] border px-3.5 py-2 text-[12.5px] leading-[1.62] text-white/74 shadow-none outline-none transition-[border-color,box-shadow] sm:text-[13px] sm:leading-[1.68]",
                    "border-[#A5C5FF]/85 bg-white/[0.04] placeholder:text-white/35",
                    "whitespace-pre-wrap break-words scrollbar-none",
                    "focus-visible:border-[#A5C5FF] focus-visible:ring-0 focus-visible:ring-offset-0",
                  )}
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    className="text-[13px] font-medium text-[#A5C5FF] transition-opacity hover:opacity-90"
                    onClick={() => {
                      endUserEdit();
                      setEditDraft(message.content);
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    title={canSubmitUserEdit ? "更新并从此条重新生成" : undefined}
                    disabled={!canSubmitUserEdit}
                    className={cn(
                      "rounded-full px-5 py-2 text-[13px] font-medium transition-colors",
                      "bg-[#2A2A2A]",
                      canSubmitUserEdit
                        ? "text-[#A5C5FF] hover:bg-[#333333]"
                        : "cursor-not-allowed text-[#666666]",
                    )}
                    onClick={() => {
                      if (!canSubmitUserEdit) return;
                      void onEditUserMessage?.(message.id, editDraft.trim());
                      endUserEdit();
                    }}
                  >
                    更新
                  </button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            )}
          </div>
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
  onEditUserMessage,
  onAssistantFeedback,
  onRegenerateAssistant,
  onCreationGuidePick,
}: {
  messages: HomeAgentMessage[];
  endRef: RefObject<HTMLDivElement | null>;
  streaming?: boolean;
  hasFloatingDock?: boolean;
  onEditUserMessage?: (messageId: string, newContent: string) => void | Promise<void>;
  onAssistantFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
  onRegenerateAssistant?: (messageId: string) => void | Promise<void>;
  onCreationGuidePick?: (dimension: CreationGuideDimensionId, value: string, label: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const animateFromIndex = Math.max(messages.length - 4, 0);
  const lastIndex = messages.length - 1;

  return (
    <div
      className={cn(
        "flex min-h-[calc(100vh-254px)] flex-col justify-end overflow-visible",
      )}
    >
      <div className="space-y-3.5 overflow-x-visible overflow-y-visible pb-5 pt-2 sm:space-y-4 sm:pb-6 sm:pt-3">
        {messages.map((message, index) => (
          <ConversationMessageRow
            key={message.id}
            message={message}
            shouldAnimate={index >= animateFromIndex}
            reduceMotion={Boolean(reduceMotion)}
            editsDisabled={Boolean(streaming)}
            onEditUserMessage={onEditUserMessage}
            onAssistantFeedback={onAssistantFeedback}
            onRegenerateAssistant={
              message.role === "assistant" && index === lastIndex
                ? onRegenerateAssistant
                : undefined
            }
            assistantAvatarGlowing={
              Boolean(streaming) && message.role === "assistant" && index === lastIndex
            }
            autoOpenCreationGuidePicker={
              message.role === "assistant" && index === lastIndex && !streaming
            }
            onCreationGuidePick={onCreationGuidePick}
          />
        ))}
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
  onEditUserMessage,
  onAssistantFeedback,
  onRegenerateAssistant,
  onCreationGuidePick,
}: {
  messages: HomeAgentMessage[];
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  streaming: boolean;
  trackClassName: string;
  onEditUserMessage?: (messageId: string, newContent: string) => void | Promise<void>;
  onAssistantFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
  onRegenerateAssistant?: (messageId: string) => void | Promise<void>;
  onCreationGuidePick?: (dimension: CreationGuideDimensionId, value: string, label: string) => void;
}) {
  const isMobile = useIsMobile();

  return (
    <div className={cn("relative mx-auto w-full flex-1 overflow-visible", trackClassName)}>
      {tasks.length ? (
        <>
          {isMobile ? (
            <div className="mb-2.5">
              <BackgroundTaskDock tasks={tasks} onStopTask={onStopTask} />
            </div>
          ) : (
            <div className="pointer-events-none fixed right-3 top-3 z-30 md:right-5 md:top-4">
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
        onEditUserMessage={onEditUserMessage}
        onAssistantFeedback={onAssistantFeedback}
        onRegenerateAssistant={onRegenerateAssistant}
        onCreationGuidePick={onCreationGuidePick}
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
    <>
      {/* Keep composer always docked to viewport bottom. */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 px-3.5 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3 transition-[left,padding-left] duration-300 motion-reduce:transition-none sm:px-4 md:px-8 lg:left-[var(--home-sidebar-offset)]"
        style={{
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "left,padding-left",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(19,19,20,0),rgba(19,19,20,0.92)_38%,rgba(19,19,20,0.98))]" />
        <div className={cn("pointer-events-auto relative mx-auto w-full", trackClassName)}>{composer}</div>
      </div>
      {/* Reserve room so latest message isn't hidden behind fixed composer. */}
      <div aria-hidden className="h-[198px] sm:h-[212px] md:h-[224px]" />
    </>
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
  onEditUserMessage,
  onAssistantFeedback,
  onRegenerateAssistant,
  onCreationGuidePick,
}: {
  messages: HomeAgentMessage[];
  tasks: RuntimeTask[];
  onStopTask: (taskId: string) => void;
  endRef: RefObject<HTMLDivElement | null>;
  composer: ReactNode;
  streaming: boolean;
  trackClassName: string;
  onEditUserMessage?: (messageId: string, newContent: string) => void | Promise<void>;
  onAssistantFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
  onRegenerateAssistant?: (messageId: string) => void | Promise<void>;
  onCreationGuidePick?: (dimension: CreationGuideDimensionId, value: string, label: string) => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-112px)] w-full flex-col overflow-visible">
      <ActiveConversationViewport
        messages={messages}
        tasks={tasks}
        onStopTask={onStopTask}
        endRef={endRef}
        streaming={streaming}
        trackClassName={trackClassName}
        onEditUserMessage={onEditUserMessage}
        onAssistantFeedback={onAssistantFeedback}
        onRegenerateAssistant={onRegenerateAssistant}
        onCreationGuidePick={onCreationGuidePick}
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
  videoTransportHint?: HomeComposerVideoTransportHint | null;
  launchNotice?: HomeComposerLaunchNotice | null;
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
  selectedTextModelKey: string;
  selectedTextModelLabel: string;
  textModelGroups: HomeAgentTextModelGroup[];
  onSelectTextModel: (key: string) => void;
  onSelectChoice: (value: string, label: string) => void;
  onConfirmQuestion?: () => void;
  onBackQuestion?: () => void;
  onLaunchAction?: (actionId: string) => void;
  onSubmit: () => void;
  onInterrupt: () => void;
}

export const HomeComposer = memo(function HomeComposer({
  idle,
  maintenanceHint,
  launchNotice,
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
  selectedTextModelKey,
  selectedTextModelLabel,
  textModelGroups,
  onSelectTextModel,
  onSelectChoice,
  onConfirmQuestion,
  onBackQuestion,
  onLaunchAction,
  onSubmit,
  onInterrupt,
}: HomeComposerProps) {
  const [draft, setLocalDraft] = useState(initialDraft);
  const [attachedFileCount, setAttachedFileCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalDraft(initialDraft);
    setAttachedFileCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialDraft, draftResetVersion]);

  return (
    <motion.div
      layoutId="home-studio-composer"
      transition={
        reduceMotion
          ? { duration: 0 }
          : idle
            ? {
                type: "spring",
                stiffness: 340,
                damping: 34,
                mass: 0.9,
              }
            : {
                duration: 0.14,
                ease: [0.22, 1, 0.36, 1],
              }
      }
      className="pointer-events-auto relative w-full"
    >
      <ComposerChoiceModal
        question={question}
        onSelect={onSelectChoice}
        onConfirm={onConfirmQuestion}
        onBack={onBackQuestion}
        canConfirm={selectedValues.length > 0 || draftPresence || !!draft.trim()}
        tone={activeTheme ? "dark" : "light"}
      />
      <motion.div
        initial={reduceMotion ? false : idle ? { opacity: 0.92 } : false}
        animate={reduceMotion ? undefined : idle ? { opacity: 1 } : undefined}
        transition={
          reduceMotion
            ? undefined
            : {
                duration: idle ? 0.16 : 0.12,
                ease: [0.22, 1, 0.36, 1],
              }
        }
        className={composerShellClass}
      >
        {idle ? null : maintenanceHint ? (
          <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-0 pt-1 md:px-6">
            {maintenanceHint ? (
              <div className="hidden max-w-[200px] truncate rounded-full border border-white/[0.035] bg-white/[0.018] px-2 py-1 text-[9px] text-white/18 xl:block">
                {maintenanceHint}
              </div>
            ) : null}
          </div>
        ) : null}
        {launchNotice ? (
          <div
            className={cn(
              "mx-3.5 mt-2 rounded-[18px] border px-3.5 py-3 md:mx-6",
              launchNotice.level === "critical"
                ? "border-amber-300/18 bg-amber-300/[0.06]"
                : "border-white/[0.05] bg-white/[0.03]",
            )}
          >
            <div className="text-[12px] font-medium text-white/88">{launchNotice.title}</div>
            <div className="mt-1 text-[11px] leading-[1.6] text-white/52">{launchNotice.description}</div>
            {launchNotice.actions.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {launchNotice.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10.5px] transition",
                      launchNotice.level === "critical"
                        ? "bg-amber-50 text-slate-950 hover:bg-white"
                        : "bg-white/[0.07] text-white/82 hover:bg-white/[0.11]",
                    )}
                    onClick={() => onLaunchAction?.(action.id)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={cn("px-3.5 pb-3 pt-1 sm:px-4 sm:pb-3.5 md:px-6 md:pb-3.5", !idle && "pt-1")}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setAttachedFileCount(files.length);
            }}
          />
          <Textarea
            value={draft}
            onChange={(e) => {
              const nextValue = e.target.value;
              setLocalDraft(nextValue);
              onDraftChange(nextValue);
            }}
            placeholder={placeholder}
            rows={idle ? 3 : 3}
            className={cn(
              "h-[88px] resize-none overflow-y-auto border-none bg-transparent px-0 pb-2 pt-1.5 text-[13.5px] leading-6.5 shadow-none outline-none ring-0 ring-offset-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-[96px] sm:text-[14px]",
              activeTheme
                ? "text-white placeholder:text-white/28"
                : "text-slate-900 placeholder:text-slate-400",
              idle && "h-[112px] sm:h-[120px] md:h-[128px]",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "h-9 w-9 rounded-full sm:h-10 sm:w-10",
                  activeTheme
                    ? "bg-white/[0.04] text-white/78 hover:bg-white/[0.1] hover:text-white"
                    : "bg-black/5 text-slate-700 hover:bg-black/10",
                )}
                title={attachedFileCount > 0 ? `已选择 ${attachedFileCount} 个文件` : "上传文件"}
                aria-label={attachedFileCount > 0 ? `已选择 ${attachedFileCount} 个文件` : "上传文件"}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <HomeTextModelPicker
                activeTheme={activeTheme}
                selectedKey={selectedTextModelKey}
                selectedLabel={selectedTextModelLabel}
                groups={textModelGroups}
                onSelect={onSelectTextModel}
              />
            </div>
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
