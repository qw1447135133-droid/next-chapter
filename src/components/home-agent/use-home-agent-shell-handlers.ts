import { useCallback } from "react";
import { getAllTasks, stopTask, type Task } from "@/lib/agent/tools/task-tools";

export function useHomeAgentShellHandlers(params: {
  openProject: (projectId: string) => Promise<void>;
  reset: () => void;
  /** Current utility panel from route / parent (single source of truth). */
  utilityPanel: "settings" | undefined;
  setMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  setDesktopSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onUtilityChange?: (panel?: "settings") => void;
  areTaskListsEquivalent: (a: Task[], b: Task[]) => boolean;
}) {
  const {
    openProject,
    reset,
    utilityPanel,
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

  /** Always opens the settings panel (e.g. from launch notices). */
  const handleOpenSettings = useCallback(() => {
    onUtilityChange?.("settings");
    setMobileNavOpen(false);
  }, [onUtilityChange, setMobileNavOpen]);

  /** Toggles the settings panel (sidebar / mobile nav settings control). */
  const handleToggleSettings = useCallback(() => {
    const next = utilityPanel === "settings" ? undefined : "settings";
    onUtilityChange?.(next);
    if (next === "settings") {
      setMobileNavOpen(false);
    }
  }, [utilityPanel, onUtilityChange, setMobileNavOpen]);

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
      onUtilityChange?.(open ? "settings" : undefined);
    },
    [onUtilityChange],
  );

  const handleCloseSettings = useCallback(() => {
    handleSettingsOpenChange(false);
  }, [handleSettingsOpenChange]);

  return {
    handleOpenProject,
    handleReset,
    handleOpenSettings,
    handleToggleSettings,
    handleOpenMobileNavigation,
    handleStopTask,
    handleToggleDesktopSidebar,
    handleSettingsOpenChange,
    handleCloseSettings,
  };
}
