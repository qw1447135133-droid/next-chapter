import * as React from "react";
import { getAllTasks, type Task } from "@/lib/agent/tools/task-tools";
import { readStudioProjectSession } from "@/lib/home-agent/session-store";
import type { ConversationProjectSnapshot, StudioRuntimeState, StudioSessionState } from "@/lib/home-agent/types";

const { useEffect } = React;

type UtilityPanelId = "settings" | undefined;
type DreaminaCapabilityState = {
  ready: boolean;
  available: boolean;
  message?: string;
};

export function useHomeAgentBootstrapEffects(params: {
  runtime: StudioRuntimeState;
  mode: string;
  metaReady: boolean;
  messages: Array<{ id: string; role: string; content: string; createdAt: string; status?: string }>;
  compactedMessageCount: number;
  initialUtility?: UtilityPanelId;
  desktopSidebarCollapsed: boolean;
  dreaminaCapability: DreaminaCapabilityState;
  maintenanceHintTimerRef: React.MutableRefObject<number | null>;
  draftPersistTimerRef: React.MutableRefObject<number | null>;
  messagesRef: React.MutableRefObject<Array<{ id: string; role: string; content: string; createdAt: string; status?: string }>>;
  compactedMessageCountRef: React.MutableRefObject<number>;
  surfacedTaskIdsRef: React.MutableRefObject<Set<string>>;
  surfacedTaskFollowupIdsRef: React.MutableRefObject<Set<string>>;
  surfacedDreaminaHintRef: React.MutableRefObject<boolean>;
  setRuntime: React.Dispatch<React.SetStateAction<StudioRuntimeState>>;
  setRecentProjectsReady: React.Dispatch<React.SetStateAction<boolean>>;
  setMetaReady: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setUtilityPanel: React.Dispatch<React.SetStateAction<UtilityPanelId>>;
  loadProjectStore: () => Promise<{
    listRecentConversationSnapshots(limit?: number): Promise<ConversationProjectSnapshot[]>;
    readSkillDrafts(): StudioRuntimeState["skillDrafts"];
    readMaintenanceReports(): StudioRuntimeState["maintenanceReports"];
  }>;
  resolveDreaminaCapability: () => Promise<DreaminaCapabilityState>;
  flashMaintenanceHint: (message: string, duration?: number) => void;
  scheduleBackgroundTask: (task: () => void, timeout?: number) => () => void;
  areProjectSnapshotsEquivalent: (
    nextProjects: ConversationProjectSnapshot[],
    prevProjects: ConversationProjectSnapshot[],
  ) => boolean;
  areRecentSessionsEquivalent: (
    nextSessions: StudioSessionState[],
    prevSessions: StudioSessionState[] | undefined,
  ) => boolean;
  areTaskListsEquivalent: (nextTasks: Task[], prevTasks: Task[]) => boolean;
  writeDesktopSidebarCollapsed: (collapsed: boolean) => void;
}) {
  const {
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
  } = params;

  useEffect(
    () => () => {
      if (maintenanceHintTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(maintenanceHintTimerRef.current);
      }
      if (draftPersistTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(draftPersistTimerRef.current);
      }
    },
    [draftPersistTimerRef, maintenanceHintTimerRef],
  );

  useEffect(() => {
    surfacedTaskIdsRef.current.clear();
    surfacedTaskFollowupIdsRef.current.clear();
  }, [runtime.sessionId, surfacedTaskFollowupIdsRef, surfacedTaskIdsRef]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages, messagesRef]);

  useEffect(() => {
    compactedMessageCountRef.current = compactedMessageCount;
  }, [compactedMessageCount, compactedMessageCountRef]);

  useEffect(() => {
    setUtilityPanel(initialUtility);
  }, [initialUtility, setUtilityPanel]);

  useEffect(() => {
    writeDesktopSidebarCollapsed(desktopSidebarCollapsed);
  }, [desktopSidebarCollapsed, writeDesktopSidebarCollapsed]);

  useEffect(() => {
    let cancelled = false;

    const hydrateRecentProjects = async () => {
      try {
        const store = await loadProjectStore();
        const items = await store.listRecentConversationSnapshots(8);
        const sessions = items
          .map((snapshot) => readStudioProjectSession(snapshot.projectId))
          .filter((session): session is StudioSessionState => Boolean(session));
        if (cancelled) return;
        React.startTransition(() => {
          setRuntime((prev) => {
            if (
              areProjectSnapshotsEquivalent(items, prev.recentProjects) &&
              areRecentSessionsEquivalent(sessions, prev.recentProjectSessions)
            ) {
              return prev;
            }

            return { ...prev, recentProjects: items, recentProjectSessions: sessions };
          });
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
  }, [
    areProjectSnapshotsEquivalent,
    areRecentSessionsEquivalent,
    loadProjectStore,
    scheduleBackgroundTask,
    setRecentProjectsReady,
    setRuntime,
  ]);

  useEffect(() => {
    if (metaReady || mode === "idle") return;

    let cancelled = false;
    const cancelTask = scheduleBackgroundTask(() => {
      void loadProjectStore()
        .then((store) => {
          if (cancelled) return;
          React.startTransition(() => {
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
  }, [loadProjectStore, metaReady, mode, scheduleBackgroundTask, setMetaReady, setRuntime]);

  useEffect(() => {
    if (runtime.currentProjectSnapshot?.projectId) {
      setActiveProjectId(runtime.currentProjectSnapshot.projectId);
    }
  }, [runtime.currentProjectSnapshot?.projectId, setActiveProjectId]);

  useEffect(() => {
    let cancelled = false;
    const cancelTask = scheduleBackgroundTask(() => {
      void resolveDreaminaCapability().then(() => {
        if (cancelled) return;
      });
    }, 900);

    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [resolveDreaminaCapability, scheduleBackgroundTask]);

  useEffect(() => {
    if (
      !dreaminaCapability.available ||
      surfacedDreaminaHintRef.current ||
      runtime.currentProjectSnapshot?.projectKind !== "video"
    ) {
      return;
    }

    surfacedDreaminaHintRef.current = true;
    flashMaintenanceHint("已接入 Dreamina CLI，可直接使用 Seedance 2.0", 2400);
  }, [dreaminaCapability.available, flashMaintenanceHint, runtime.currentProjectSnapshot?.projectKind, surfacedDreaminaHintRef]);

  useEffect(() => {
    const syncTasks = () => {
      const nextTasks = getAllTasks();
      React.startTransition(() => {
        setTasks((prev) => (areTaskListsEquivalent(nextTasks, prev) ? prev : nextTasks));
      });
    };

    syncTasks();
    window.addEventListener("agent:tasks-updated", syncTasks);
    return () => window.removeEventListener("agent:tasks-updated", syncTasks);
  }, [areTaskListsEquivalent, setTasks]);
}
