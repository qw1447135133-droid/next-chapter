import * as React from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  History,
  Image,
  Plus,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { JimengExecutionMode } from "@/lib/api-config";
import type { ConversationProjectSnapshot } from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";
import type { SidebarAssetItem } from "./home-agent-sidebar-utils";

const { memo, useCallback } = React;

const EXECUTION_MODE_LABEL: Record<JimengExecutionMode, string> = {
  api: "API",
  cli: "CLI",
};

function executionModeHint(mode: JimengExecutionMode, dreaminaCliAvailable?: boolean): string {
  if (mode === "api") return "云端";
  return dreaminaCliAvailable ? "已连接" : "未连接";
}

export type HomeAgentTemplate = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
};

function compactSidebarLabel(value: string): string {
  const trimmed = value.trim();
  return Array.from(trimmed)[0] ?? "•";
}

function projectKindLabel(kind?: ConversationProjectSnapshot["projectKind"]): string {
  return kind === "adaptation" ? "参考改编" : kind === "video" ? "视频工作流" : "原创剧本";
}

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

const SidebarFooter = memo(function SidebarFooter({
  onOpenSettings,
  collapsed = false,
  jimengExecutionMode,
  onChangeJimengExecutionMode,
  dreaminaCliAvailable,
}: {
  onOpenSettings: () => void;
  collapsed?: boolean;
  jimengExecutionMode?: JimengExecutionMode;
  onChangeJimengExecutionMode?: (mode: JimengExecutionMode) => void;
  dreaminaCliAvailable?: boolean;
}) {
  return (
    <div className={cn("border-t border-white/[0.05] pb-3 pt-2", collapsed ? "px-2" : "px-2.5")}>
      {!collapsed && jimengExecutionMode && onChangeJimengExecutionMode ? (
        <div className="mb-1 flex items-center gap-2 px-2.5 py-0.5 text-[10px] text-slate-500">
          <div className="min-w-0 flex items-center gap-1.5">
            <span className="uppercase tracking-[0.22em] text-slate-600">Seedance</span>
            <span
              className={cn(
                "h-1 w-1 shrink-0 rounded-full",
                jimengExecutionMode === "cli"
                  ? dreaminaCliAvailable
                    ? "bg-emerald-300/70"
                    : "bg-amber-300/70"
                  : "bg-slate-400/50",
              )}
            />
            <span
              className={cn(
                "min-w-0 truncate text-[10px]",
                jimengExecutionMode === "cli" && !dreaminaCliAvailable
                  ? "text-amber-200/70"
                  : "text-slate-500",
              )}
            >
              {executionModeHint(jimengExecutionMode, dreaminaCliAvailable)}
            </span>
          </div>
          <div className="ml-auto inline-flex shrink-0 rounded-full bg-white/[0.015] p-[1px]">
            {(["api", "cli"] as const).map((mode) => {
              const active = jimengExecutionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChangeJimengExecutionMode(mode)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-medium transition",
                    active
                      ? "bg-white/[0.08] text-white/92"
                      : "text-slate-600 hover:text-slate-300",
                  )}
                >
                  {EXECUTION_MODE_LABEL[mode]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="打开设置"
        title="设置"
        className={cn(
          "flex w-full items-center rounded-[12px] px-2.5 py-1 text-left text-[11px] text-slate-300 transition-colors hover:bg-white/[0.03] hover:text-slate-100",
          collapsed ? "justify-center" : "gap-2",
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.03] text-slate-300">
          <Settings2 className="h-3.25 w-3.25" />
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium">设置</span>
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
        "flex w-full items-center rounded-[12px] py-1.5 text-left transition-colors hover:bg-white/[0.04]",
        collapsed ? "justify-center px-0" : "gap-2 px-2",
      )}
    >
      {asset.kind === "image" ? (
        <span className="relative h-7.5 w-7.5 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.05]">
          <img src={asset.url} alt={asset.label} className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/[0.08]" />
        </span>
      ) : (
        <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-slate-200">
          <Clapperboard className="h-3.5 w-3.5" />
        </span>
      )}
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10.5px] text-slate-100">{asset.label}</span>
          <span className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-500">
            <span className="uppercase tracking-[0.16em] text-slate-400">{asset.kind}</span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span className="truncate">{asset.meta}</span>
          </span>
        </span>
      ) : null}
    </button>
  );
});

const SidebarBrandHeader = memo(function SidebarBrandHeader({
  idle,
  brandLabel,
  collapsed = false,
  onToggleCollapse,
}: {
  idle: boolean;
  brandLabel: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <div className={cn("relative flex h-[72px] items-center border-b border-white/[0.06]", collapsed ? "justify-center px-2" : "px-5")}>
      <div className="flex min-w-0 items-center">
        <BrandMark className="h-8" />
        {!collapsed ? (
          <div className="ml-3 min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-slate-100">{brandLabel}</div>
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
        "mb-3 flex w-full items-center rounded-[15px] py-2 text-left text-[12px] text-slate-100 transition-colors hover:bg-white/[0.04]",
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
  templates: HomeAgentTemplate[];
  onLaunch: (template: HomeAgentTemplate) => void;
  bordered?: boolean;
  collapsed?: boolean;
}) {
  return (
    <section className={cn("px-2 pb-2", bordered && "border-b border-white/[0.06]")}>
      <div
        className={cn(
          "mb-1.5 px-1 text-[9.5px] uppercase tracking-[0.18em] text-slate-500",
          collapsed && "flex items-center justify-center px-0",
        )}
      >
        {collapsed ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : "快捷任务"}
      </div>
      <div className="space-y-px">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onLaunch(template)}
            aria-label={template.title}
            title={template.title}
            className={cn(
              "flex w-full items-center rounded-[12px] py-1.5 text-left transition-colors hover:bg-white/[0.05]",
              collapsed ? "justify-center px-0" : "justify-between gap-3 px-3",
            )}
          >
            {collapsed ? (
              <template.icon className="h-4 w-4 shrink-0 text-slate-300" />
            ) : (
              <>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-slate-100">{template.title}</span>
                  <span className="block truncate text-[9.5px] text-slate-500">{truncateCopy(template.description, 28)}</span>
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
    <section className={cn("px-2 py-2.5", bordered && "border-b border-white/[0.06]")}>
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 px-1 text-[9.5px] uppercase tracking-[0.2em] text-slate-500",
          collapsed && "justify-center px-0",
        )}
      >
        <History className="h-3.5 w-3.5" />
        {!collapsed ? "对话历史" : null}
      </div>
      <div className="space-y-px">
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
                "flex w-full rounded-[12px] py-1.5 text-left transition-colors hover:bg-white/[0.04]",
                collapsed ? "justify-center px-0" : "items-start gap-2 px-3",
                active && "bg-white/[0.05]",
              )}
            >
              {collapsed ? (
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border text-[10.5px] font-medium",
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
                    <span className="block truncate text-[11px] font-medium text-slate-100">{project.title}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-slate-500">
                      {projectKindLabel(project.projectKind)} · {project.derivedStage} · {formatDateLabel(project.updatedAt)}
                    </span>
                    <span className={cn("mt-0.5 block truncate text-[9px]", active ? "text-slate-400" : "text-slate-600")}>
                      {truncateCopy(project.currentObjective || project.agentSummary, active ? 42 : 24)}
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
              "px-3 py-1.5 text-[12px] leading-5.5 text-slate-500",
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
    <section className="px-2 pb-2 pt-2.5">
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 px-1 text-[9.5px] uppercase tracking-[0.2em] text-slate-500",
          collapsed && "justify-center px-0",
        )}
      >
        <Image className="h-3.5 w-3.5" />
        {!collapsed ? "素材库" : null}
      </div>
      <div className="space-y-px">
        {assets.length ? (
          assets.map((asset) => (
            <SidebarAssetRow key={asset.id} asset={asset} onOpen={onOpenAsset} collapsed={collapsed} />
          ))
        ) : (
          <div
            className={cn(
              "px-3 py-1.5 text-[12px] leading-5.5 text-slate-500",
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

export const DesktopSidebar = memo(function DesktopSidebar({
  idle,
  recentProjects,
  recentProjectsReady,
  templates,
  assets,
  currentProjectId,
  collapsed = false,
  brandLabel,
  expandedWidth,
  collapsedWidth,
  onTemplateLaunch,
  onOpenProject,
  onNewProject,
  onOpenSettings,
  onToggleCollapse,
  jimengExecutionMode,
  onChangeJimengExecutionMode,
  dreaminaCliAvailable,
}: {
  idle: boolean;
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  templates: HomeAgentTemplate[];
  assets: SidebarAssetItem[];
  currentProjectId?: string;
  collapsed?: boolean;
  brandLabel: string;
  expandedWidth: number;
  collapsedWidth: number;
  onTemplateLaunch: (prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
  jimengExecutionMode?: JimengExecutionMode;
  onChangeJimengExecutionMode?: (mode: JimengExecutionMode) => void;
  dreaminaCliAvailable?: boolean;
}) {
  const handleOpenAsset = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleLaunchTemplate = useCallback(
    (template: HomeAgentTemplate) => {
      onTemplateLaunch(template.prompt, template.title);
    },
    [onTemplateLaunch],
  );

  return (
    <aside className="hidden lg:block">
      <div
        className="fixed inset-y-0 left-0 z-40 border-r border-white/[0.06] bg-[#141518] [contain:layout_paint] transition-[width] duration-300"
        style={{
          width: collapsed ? collapsedWidth : expandedWidth,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "width",
        }}
      >
        <SidebarBrandHeader
          idle={idle}
          brandLabel={brandLabel}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className={cn("sidebar-scrollbar flex-1 overflow-y-auto py-4", collapsed ? "px-2.5" : "px-3")}>
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
          <SidebarFooter
            onOpenSettings={onOpenSettings}
            collapsed={collapsed}
            jimengExecutionMode={jimengExecutionMode}
            onChangeJimengExecutionMode={onChangeJimengExecutionMode}
            dreaminaCliAvailable={dreaminaCliAvailable}
          />
        </div>
      </div>
    </aside>
  );
});

export const MobileSidebarSheet = memo(function MobileSidebarSheet({
  open,
  onOpenChange,
  idle,
  recentProjects,
  recentProjectsReady,
  templates,
  assets,
  currentProjectId,
  brandLabel,
  sheetClassName,
  onTemplateLaunch,
  onOpenProject,
  onNewProject,
  onOpenSettings,
  jimengExecutionMode,
  onChangeJimengExecutionMode,
  dreaminaCliAvailable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idle: boolean;
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  templates: HomeAgentTemplate[];
  assets: SidebarAssetItem[];
  currentProjectId?: string;
  brandLabel: string;
  sheetClassName: string;
  onTemplateLaunch: (prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  jimengExecutionMode?: JimengExecutionMode;
  onChangeJimengExecutionMode?: (mode: JimengExecutionMode) => void;
  dreaminaCliAvailable?: boolean;
}) {
  const handleLaunchTemplate = useCallback(
    (template: HomeAgentTemplate) => {
      onTemplateLaunch(template.prompt, template.title);
      onOpenChange(false);
    },
    [onOpenChange, onTemplateLaunch],
  );

  const handleOpenProjectFromSheet = useCallback(
    (projectId: string) => {
      onOpenChange(false);
      window.setTimeout(() => {
        onOpenProject(projectId);
      }, 0);
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
      <SheetContent side="left" className={cn(sheetClassName, "lg:hidden")}>
        <SheetHeader className="sr-only">
          <SheetTitle>导航</SheetTitle>
          <SheetDescription>当前首页会话的导航、历史项目和素材库。</SheetDescription>
        </SheetHeader>
        <SidebarBrandHeader idle={idle} brandLabel={brandLabel} />

        <div className="flex h-[calc(100vh-72px)] flex-col">
          <div className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-4">
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
            jimengExecutionMode={jimengExecutionMode}
            onChangeJimengExecutionMode={onChangeJimengExecutionMode}
            dreaminaCliAvailable={dreaminaCliAvailable}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
});
