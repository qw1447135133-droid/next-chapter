import * as React from "react";
import { useReducedMotion } from "framer-motion";
import type { ComposerQuestion, ConversationProjectSnapshot, HomeAgentMessage, StudioRuntimeState } from "@/lib/home-agent/types";
import type { Task } from "@/lib/agent/tools/task-tools";
import { collectConversationAssets } from "./home-agent-sidebar-utils";

const { useCallback, useDeferredValue, useMemo } = React;

export function useHomeAgentSurfaceState(params: {
  mode: "idle" | "active" | "recovering" | "maintenance-review";
  messages: HomeAgentMessage[];
  currentProject: ConversationProjectSnapshot | null;
  question: ComposerQuestion | null;
  utilityPanel: "settings" | undefined;
  desktopSidebarCollapsed: boolean;
  runtime: StudioRuntimeState;
  tasks: Task[];
  activeProjectId?: string;
  maintenanceHintTimerRef: React.MutableRefObject<number | null>;
  draftPersistTimerRef: React.MutableRefObject<number | null>;
  draftRef: React.MutableRefObject<string>;
  setMaintenanceHint: React.Dispatch<React.SetStateAction<string | null>>;
  setDraftPresence: React.Dispatch<React.SetStateAction<boolean>>;
  setPersistedDraft: React.Dispatch<React.SetStateAction<string>>;
  setDraftInitialValue: React.Dispatch<React.SetStateAction<string>>;
  setDraftResetVersion: React.Dispatch<React.SetStateAction<number>>;
  truncateCopy: (value: string, max?: number) => string;
  isTaskVisibleForSession: (task: Task, sessionId: string) => boolean;
  idlePlaceholder: string;
  activePlaceholder: string;
  customPlaceholder: string;
  desktopSidebarOffsetExpanded: number;
  desktopSidebarOffsetCollapsed: number;
}) {
  const {
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
    idlePlaceholder,
    activePlaceholder,
    customPlaceholder,
    desktopSidebarOffsetExpanded,
    desktopSidebarOffsetCollapsed,
  } = params;

  const idle = mode === "idle" && messages.length === 0 && !currentProject;
  const activeTheme = true;
  const placeholder = question?.allowCustomInput ? customPlaceholder : idle ? idlePlaceholder : activePlaceholder;
  const deferredMessages = useDeferredValue(messages);
  const deferredProjectSnapshot = useDeferredValue(runtime.currentProjectSnapshot);
  const deferredRecentProjects = useDeferredValue(runtime.recentProjects);
  const reduceMotion = useReducedMotion();
  const settingsOpen = utilityPanel === "settings";
  const desktopSidebarOffset = desktopSidebarCollapsed
    ? desktopSidebarOffsetCollapsed
    : desktopSidebarOffsetExpanded;

  const recentSessionSummary = useMemo(
    () =>
      deferredMessages
        .slice(-6)
        .map((message) => `${message.role}: ${truncateCopy(message.content, 120)}`)
        .join(" | "),
    [deferredMessages, truncateCopy],
  );

  const flashMaintenanceHint = useCallback(
    (message: string, duration = 2200) => {
      setMaintenanceHint(message);
      if (typeof window === "undefined") return;
      if (maintenanceHintTimerRef.current) {
        window.clearTimeout(maintenanceHintTimerRef.current);
      }
      maintenanceHintTimerRef.current = window.setTimeout(() => {
        setMaintenanceHint(null);
        maintenanceHintTimerRef.current = null;
      }, duration);
    },
    [maintenanceHintTimerRef, setMaintenanceHint],
  );

  const syncComposerDraft = useCallback(
    (value: string) => {
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
    },
    [draftPersistTimerRef, draftRef, setDraftPresence, setPersistedDraft],
  );

  const resetComposerDraft = useCallback(
    (value = "") => {
      if (typeof window !== "undefined" && draftPersistTimerRef.current) {
        window.clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
      }
      draftRef.current = value;
      setDraftInitialValue(value);
      setPersistedDraft(value);
      setDraftPresence(Boolean(value.trim()));
      setDraftResetVersion((current) => current + 1);
    },
    [draftPersistTimerRef, draftRef, setDraftInitialValue, setDraftPresence, setDraftResetVersion, setPersistedDraft],
  );

  const composerShellClass = idle
    ? "overflow-hidden rounded-[30px] bg-[linear-gradient(180deg,rgba(35,36,40,0.96),rgba(24,25,28,0.98))] shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
    : "overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(33,34,38,0.96),rgba(24,25,28,0.98))]";

  const sidebarAssets = useMemo(
    () => collectConversationAssets(runtime.currentVideoProject, runtime.currentProjectSnapshot).slice(0, 12),
    [runtime.currentProjectSnapshot, runtime.currentVideoProject],
  );

  const deferredSidebarAssets = useDeferredValue(sidebarAssets);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => isTaskVisibleForSession(task, runtime.sessionId)),
    [isTaskVisibleForSession, runtime.sessionId, tasks],
  );
  const deferredVisibleTasks = useDeferredValue(visibleTasks);
  const deferredActiveProjectId = useDeferredValue(activeProjectId);

  return {
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
  };
}
