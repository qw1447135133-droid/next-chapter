import { useCallback } from "react";
import { getAllTasks, stopTask, type Task } from "@/lib/agent/tools/task-tools";

export function useHomeAgentShellHandlers(params: {
  openProject: (projectId: string) => Promise<void>;
  reset: () => void;
  setUtilityPanel: React.Dispatch<React.SetStateAction<"settings" | undefined>>;
  setMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setDesktopSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onUtilityChange?: (panel?: "settings") => void;
  areTaskListsEquivalent: (a: Task[], b: Task[]) => boolean;
}) {
  const {
    openProject,
    reset,
    setUtilityPanel,
    setMobileNavOpen,
    setTasks,
    setDesktopSidebarCollapsed,
    onUtilityChange,
    areTaskListsEquivalent,
  } = params;

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
  }, [onUtilityChange, setMobileNavOpen, setUtilityPanel]);

  const handleOpenMobileNavigation = useCallback(() => {
    setMobileNavOpen(true);
  }, [setMobileNavOpen]);

  const handleStopTask = useCallback(
    (taskId: string) => {
      stopTask(taskId);
      const nextTasks = getAllTasks();
      setTasks((prev) => (areTaskListsEquivalent(nextTasks, prev) ? prev : nextTasks));
    },
    [areTaskListsEquivalent, setTasks],
  );

  const handleToggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((current) => !current);
  }, [setDesktopSidebarCollapsed]);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      const next = open ? "settings" : undefined;
      setUtilityPanel(next);
      onUtilityChange?.(next);
    },
    [onUtilityChange, setUtilityPanel],
  );

  const handleCloseSettings = useCallback(() => {
    handleSettingsOpenChange(false);
  }, [handleSettingsOpenChange]);

  return {
    handleOpenProject,
    handleReset,
    handleOpenSettings,
    handleOpenMobileNavigation,
    handleStopTask,
    handleToggleDesktopSidebar,
    handleSettingsOpenChange,
    handleCloseSettings,
  };
}
