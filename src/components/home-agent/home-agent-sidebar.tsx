import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FolderOpen,
  History,
  Image,
  MoreVertical,
  Pin,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { JimengExecutionMode } from "@/lib/api-config";
import type { ConversationProjectSnapshot } from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";
import {
  isLocalSidebarAssetUrl,
  normalizeSidebarAssetPath,
  resolveSidebarAssetPreviewUrl,
  type SidebarAssetItem,
} from "./home-agent-sidebar-utils";

const { memo, useCallback, useEffect, useState } = React;

const EXECUTION_MODE_LABEL: Record<JimengExecutionMode, string> = {
  api: "API",
  cli: "CLI",
};

const ASSET_KIND_LABEL: Record<SidebarAssetItem["kind"], string> = {
  image: "image",
  video: "video",
  bundle: "bundle",
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

function useSidebarAssetPreview(asset: SidebarAssetItem, projectId?: string): string | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    asset.kind === "image" && !isLocalSidebarAssetUrl(asset.url) ? asset.url : null,
  );

  useEffect(() => {
    if (asset.kind !== "image") {
      setPreviewUrl(null);
      return;
    }

    if (!isLocalSidebarAssetUrl(asset.url)) {
      setPreviewUrl(asset.url);
      return;
    }

    let cancelled = false;
    setPreviewUrl(null);

    void resolveSidebarAssetPreviewUrl(asset, projectId).then((resolvedUrl) => {
      if (!cancelled) {
        setPreviewUrl(resolvedUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [asset, asset.kind, asset.url, projectId]);

  return previewUrl;
}

async function openSidebarAsset(asset: SidebarAssetItem): Promise<void> {
  if (asset.kind === "bundle") {
    await window.electronAPI?.storage?.openFolder?.(asset.path);
    return;
  }

  if (asset.kind === "image") {
    return;
  }

  if (isLocalSidebarAssetUrl(asset.url)) {
    const localPath = normalizeSidebarAssetPath(asset.url);
    if (window.electronAPI?.storage?.openPath) {
      await window.electronAPI.storage.openPath(localPath);
      return;
    }
    if (window.electronAPI?.storage?.openFolder) {
      await window.electronAPI.storage.openFolder(localPath);
    }
    return;
  }

  window.open(asset.url, "_blank", "noopener,noreferrer");
}

type SidebarImageAsset = SidebarAssetItem & { kind: "image" };

const SidebarImageLightboxBody = memo(function SidebarImageLightboxBody({
  asset,
  currentProjectId,
}: {
  asset: SidebarImageAsset;
  currentProjectId?: string;
}) {
  const previewUrl = useSidebarAssetPreview(asset, currentProjectId);
  return (
    <>
      <div className="border-b border-white/[0.06] px-5 py-3 pr-12">
        <DialogPrimitive.Title className="text-left text-[13px] font-medium leading-snug text-slate-100">
          {asset.label}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">图像素材大图预览</DialogPrimitive.Description>
      </div>
      <div className="scrollbar-none flex max-h-[min(78vh,720px)] items-center justify-center overflow-auto bg-black/35 p-4">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={asset.label}
            className="max-h-[min(72vh,680px)] max-w-full rounded-xl object-contain shadow-lg"
          />
        ) : (
          <p className="text-sm text-slate-500">正在加载预览…</p>
        )}
      </div>
    </>
  );
});

const SidebarAssetImageLightbox = memo(function SidebarAssetImageLightbox({
  asset,
  onOpenChange,
  currentProjectId,
}: {
  asset: SidebarImageAsset | null;
  onOpenChange: (open: boolean) => void;
  currentProjectId?: string;
}) {
  return (
    <DialogPrimitive.Root open={asset !== null} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-[60] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[60] grid w-[min(96vw,920px)] max-w-[min(96vw,920px)] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1a1b1f] shadow-2xl duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {asset ? <SidebarImageLightboxBody asset={asset} currentProjectId={currentProjectId} /> : null}
          <DialogPrimitive.Close
            type="button"
            aria-label="关闭"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});

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
        aria-label="打开或关闭设置"
        title="打开或关闭设置"
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
  currentProjectId,
  collapsed = false,
}: {
  asset: SidebarAssetItem;
  onOpen: (asset: SidebarAssetItem) => void;
  currentProjectId?: string;
  collapsed?: boolean;
}) {
  const kindLabel = ASSET_KIND_LABEL[asset.kind];
  const previewUrl = useSidebarAssetPreview(asset, currentProjectId);

  return (
    <button
      type="button"
      onClick={() => onOpen(asset)}
      aria-label={asset.label}
      title={asset.label}
      className={cn(
        "flex w-full items-center rounded-[12px] py-1.5 text-left transition-colors hover:bg-white/[0.04]",
        collapsed ? "justify-center px-0" : "gap-2 px-2",
      )}
    >
      {asset.kind === "image" && previewUrl ? (
        <span className="relative size-8 shrink-0 overflow-hidden rounded-[10px] bg-white/[0.05]">
          <img
            src={previewUrl}
            alt={asset.label}
            className="h-full w-full max-h-full max-w-full object-cover"
            loading="lazy"
          />
          <span className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/[0.08]" />
        </span>
      ) : asset.kind === "image" ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05] text-slate-200">
          <Image className="h-3.5 w-3.5" />
        </span>
      ) : asset.kind === "video" ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-slate-200">
          <Clapperboard className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05] text-slate-100 ring-1 ring-inset ring-white/[0.06]">
          <FolderOpen className="h-3.5 w-3.5" />
        </span>
      )}
      {!collapsed ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10.5px] text-slate-100">{asset.label}</span>
          {asset.kind !== "image" ? (
            <span className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-500">
              <span className="uppercase tracking-[0.16em] text-slate-400">{kindLabel}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span className="truncate">{asset.meta}</span>
            </span>
          ) : null}
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
    <div
      className={cn(
        "relative flex h-[72px] items-center border-b border-white/[0.06]",
        collapsed ? "justify-center px-2" : "px-5",
      )}
    >
      {!collapsed ? (
        <>
          <div className="flex min-w-0 flex-1 items-center">
            <BrandMark className="h-8" />
            <div className="ml-3 min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-slate-100">{brandLabel}</div>
              <div className="truncate text-[10px] text-slate-500">{idle ? "开始一段新会话" : "当前首页会话"}</div>
            </div>
          </div>
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="收起侧栏"
              title="收起侧栏"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
        </>
      ) : onToggleCollapse ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="展开侧栏"
          title="展开侧栏"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-100"
        >
          <ChevronRight className="h-4 w-4" />
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
        {collapsed ? <Sparkles className="h-5 w-5 text-slate-300" aria-hidden="true" /> : "快捷任务"}
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
              <template.icon className="h-6 w-6 shrink-0 text-slate-300" />
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
  onTogglePinProject,
  onRenameProject,
  onDeleteProject,
  emptyClassName,
  limit = 10,
  bordered = false,
  collapsed = false,
}: {
  recentProjects: ConversationProjectSnapshot[];
  recentProjectsReady: boolean;
  currentProjectId?: string;
  onOpenProject: (projectId: string) => void;
  onTogglePinProject?: (project: ConversationProjectSnapshot) => void;
  onRenameProject?: (project: ConversationProjectSnapshot) => void;
  onDeleteProject?: (project: ConversationProjectSnapshot) => void;
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
            <div
              key={project.projectId}
              className={cn(
                "group/hist flex w-full items-start rounded-[12px] py-1.5 transition-colors hover:bg-white/[0.04]",
                collapsed ? "justify-center px-0" : "gap-0.5 pl-3 pr-1",
                active && "bg-white/[0.05]",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenProject(project.projectId)}
                aria-label={project.title}
                title={project.title}
                className={cn(
                  "min-w-0 flex-1 text-left",
                  collapsed && "flex justify-center",
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
                  <span className="flex items-start gap-2">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full bg-white/[0.12]", active && "bg-[#7c92ff]")} />
                    <span className="min-w-0 flex-1 pr-1">
                      <span className="block truncate text-[11px] font-medium text-slate-100">
                        {project.pinned ? "📌 " : ""}
                        {project.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] text-slate-500">
                        {projectKindLabel(project.projectKind)} · {project.derivedStage} · {formatDateLabel(project.updatedAt)}
                      </span>
                      <span className={cn("mt-0.5 block truncate text-[9px]", active ? "text-slate-400" : "text-slate-600")}>
                        {truncateCopy(project.currentObjective || project.agentSummary, active ? 42 : 24)}
                      </span>
                    </span>
                  </span>
                )}
              </button>
              {!collapsed && (onTogglePinProject || onRenameProject || onDeleteProject) ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-full border border-transparent bg-[#183d86]/70 text-slate-300 opacity-0 transition hover:bg-[#2153b5] hover:text-white group-hover/hist:opacity-100 data-[state=open]:opacity-100"
                      aria-label="会话菜单"
                      title="会话菜单"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    avoidCollisions={false}
                    className="w-44 rounded-xl border-white/10 bg-[#14171c]/96 p-1.5 text-slate-100 shadow-[0_20px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                  >
                    {onTogglePinProject ? (
                      <DropdownMenuItem
                        className="h-9 rounded-lg px-2.5 text-[13px] text-slate-100 focus:bg-white/[0.08] focus:text-white"
                        onSelect={(e) => {
                          e.preventDefault();
                          onTogglePinProject(project);
                        }}
                      >
                        <Pin className="mr-2 h-4 w-4" />
                        {project.pinned ? "取消置顶" : "固定（置顶）"}
                      </DropdownMenuItem>
                    ) : null}
                    {onRenameProject ? (
                      <DropdownMenuItem
                        className="h-9 rounded-lg px-2.5 text-[13px] text-slate-100 focus:bg-white/[0.08] focus:text-white"
                        onSelect={(e) => {
                          e.preventDefault();
                          onRenameProject(project);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        重命名
                      </DropdownMenuItem>
                    ) : null}
                    {onDeleteProject ? (
                      <DropdownMenuItem
                        className="h-9 rounded-lg px-2.5 text-[13px] text-rose-300 focus:bg-rose-500/20 focus:text-rose-200"
                        onSelect={(e) => {
                          e.preventDefault();
                          onDeleteProject(project);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
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
  currentProjectId,
  emptyClassName,
  collapsed = false,
}: {
  assets: SidebarAssetItem[];
  onOpenAsset: (asset: SidebarAssetItem) => void;
  currentProjectId?: string;
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
            <SidebarAssetRow
              key={asset.id}
              asset={asset}
              onOpen={onOpenAsset}
              currentProjectId={currentProjectId}
              collapsed={collapsed}
            />
          ))
        ) : (
          <div
            className={cn(
              "px-3 py-1.5 text-[12px] leading-5.5 text-slate-500",
              emptyClassName,
              collapsed && "px-0 text-center text-[10.5px] leading-5",
            )}
          >
            {collapsed ? "暂无" : "当前对话还没有图像、视频或状态资产。"}
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
  onTogglePinProject,
  onRenameProject,
  onDeleteProject,
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
  onTemplateLaunch: (templateId: string, prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onTogglePinProject?: (project: ConversationProjectSnapshot) => void;
  onRenameProject?: (project: ConversationProjectSnapshot) => void;
  onDeleteProject?: (project: ConversationProjectSnapshot) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onToggleCollapse: () => void;
  jimengExecutionMode?: JimengExecutionMode;
  onChangeJimengExecutionMode?: (mode: JimengExecutionMode) => void;
  dreaminaCliAvailable?: boolean;
}) {
  const [imageLightboxAsset, setImageLightboxAsset] = useState<SidebarImageAsset | null>(null);

  const handleOpenAsset = useCallback((asset: SidebarAssetItem) => {
    if (asset.kind === "image") {
      setImageLightboxAsset(asset);
      return;
    }
    void openSidebarAsset(asset);
  }, []);

  const handleLaunchTemplate = useCallback(
    (template: HomeAgentTemplate) => {
      onTemplateLaunch(template.id, template.prompt, template.title);
    },
    [onTemplateLaunch],
  );

  return (
    <aside className="hidden lg:block" data-home-desktop-sidebar="true">
      <SidebarAssetImageLightbox
        asset={imageLightboxAsset}
        onOpenChange={(next) => {
          if (!next) setImageLightboxAsset(null);
        }}
        currentProjectId={currentProjectId}
      />
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

            {!collapsed ? (
              <SidebarProjectHistory
                recentProjects={recentProjects}
                recentProjectsReady={recentProjectsReady}
                currentProjectId={currentProjectId}
                onOpenProject={onOpenProject}
                onTogglePinProject={onTogglePinProject}
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
                limit={10}
                collapsed={false}
              />
            ) : null}

            {!idle && !collapsed ? (
              <SidebarAssetLibrary
                assets={assets}
                onOpenAsset={handleOpenAsset}
                currentProjectId={currentProjectId}
                collapsed={false}
              />
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
  onTogglePinProject,
  onRenameProject,
  onDeleteProject,
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
  onTemplateLaunch: (templateId: string, prompt: string, title: string) => void;
  onOpenProject: (projectId: string) => void;
  onTogglePinProject?: (project: ConversationProjectSnapshot) => void;
  onRenameProject?: (project: ConversationProjectSnapshot) => void;
  onDeleteProject?: (project: ConversationProjectSnapshot) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  jimengExecutionMode?: JimengExecutionMode;
  onChangeJimengExecutionMode?: (mode: JimengExecutionMode) => void;
  dreaminaCliAvailable?: boolean;
}) {
  const handleLaunchTemplate = useCallback(
    (template: HomeAgentTemplate) => {
      onTemplateLaunch(template.id, template.prompt, template.title);
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

  const handleDeleteProjectFromSheet = useCallback(
    (project: ConversationProjectSnapshot) => {
      onOpenChange(false);
      onDeleteProject?.(project);
    },
    [onDeleteProject, onOpenChange],
  );
  const handlePinProjectFromSheet = useCallback(
    (project: ConversationProjectSnapshot) => {
      onOpenChange(false);
      onTogglePinProject?.(project);
    },
    [onOpenChange, onTogglePinProject],
  );
  const handleRenameProjectFromSheet = useCallback(
    (project: ConversationProjectSnapshot) => {
      onOpenChange(false);
      onRenameProject?.(project);
    },
    [onOpenChange, onRenameProject],
  );

  const [imageLightboxAsset, setImageLightboxAsset] = useState<SidebarImageAsset | null>(null);

  const handleOpenAsset = useCallback(
    (asset: SidebarAssetItem) => {
      if (asset.kind === "image") {
        setImageLightboxAsset(asset);
        return;
      }
      void openSidebarAsset(asset);
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SidebarAssetImageLightbox
        asset={imageLightboxAsset}
        onOpenChange={(next) => {
          if (!next) setImageLightboxAsset(null);
        }}
        currentProjectId={currentProjectId}
      />
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
              onTogglePinProject={onTogglePinProject ? handlePinProjectFromSheet : undefined}
              onRenameProject={onRenameProject ? handleRenameProjectFromSheet : undefined}
              onDeleteProject={onDeleteProject ? handleDeleteProjectFromSheet : undefined}
              emptyClassName="py-2.5 text-[13px]"
              limit={10}
              bordered
            />

            {!idle ? (
              <SidebarAssetLibrary
                assets={assets}
                onOpenAsset={handleOpenAsset}
                currentProjectId={currentProjectId}
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
