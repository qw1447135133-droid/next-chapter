import { useState, useEffect, useRef, useCallback } from "react";
import {
  FolderOpen, Play, Download, RefreshCw, Loader2, CheckCircle, XCircle,
  Clock, Wifi, WifiOff, ChevronDown, Terminal, ExternalLink, FolderSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import {
  jimengSubmitGenerate,
  jimengSubmitDownload,
  jimengSubmitGenerateFromScenes,
  jimengPollUntilDone,
  jimengGetStatus,
  jimengOnStatusChange,
  jimengOpenSetup,
  jimengOpenBrowserData,
  jimengHealth,
  type JimengTask,
  type JimengTaskStatus,
} from "@/lib/jimeng-client";

function isElectronApp(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.jimeng;
}
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StoryboardAspectRatio } from "@/components/workspace/StoryboardPreview";

const DURATION_OPTIONS = [
  { value: "4s", label: "4s" },
  { value: "5s", label: "5s" },
  { value: "8s", label: "8s" },
  { value: "10s", label: "10s" },
  { value: "15s", label: "15s" },
];

const STATUS_CONFIG: Record<JimengTaskStatus, { label: string; color: string; icon: typeof Loader2 }> = {
  pending:   { label: "等待中",   color: "text-yellow-600 dark:text-yellow-400", icon: Clock },
  running:   { label: "执行中",   color: "text-blue-600 dark:text-blue-400", icon: Loader2 },
  success:   { label: "已完成",   color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle },
  failed:    { label: "失败",     color: "text-red-600 dark:text-red-400", icon: XCircle },
};

type ServerStatus = "idle" | "starting" | "running" | "stopped" | "error";

const SERVER_STATUS_CONFIG: Record<ServerStatus, { label: string; color: string; desc: string }> = {
  idle:     { label: "未启动",    color: "text-muted-foreground", desc: "点击「开始生成」自动启动服务" },
  starting: { label: "启动中...", color: "text-blue-600 dark:text-blue-400", desc: "正在初始化 Python 环境，请稍候" },
  running:  { label: "运行中",    color: "text-emerald-600 dark:text-emerald-400", desc: "服务运行正常" },
  stopped:  { label: "已停止",    color: "text-muted-foreground", desc: "服务已退出" },
  error:    { label: "启动失败",  color: "text-red-600 dark:text-red-400", desc: "请查看下方日志排查问题" },
};

interface JimengVideoPanelProps {
  /** 分镜列表，用于生成即梦 xlsx */
  scenes: Array<{
    id: string;
    sceneNumber: number;
    description: string;
    dialogue?: string;
    characters: string[];
    cameraDirection?: string;
    segmentLabel?: string;
  }>;
  /** 角色列表 */
  characters: Array<{ id: string; name: string; description?: string }>;
  /** 与顶部栏「分镜比例」一致 */
  aspectRatio: StoryboardAspectRatio;
}

const JimengVideoPanel = ({ scenes, characters, aspectRatio }: JimengVideoPanelProps) => {
  const [duration, setDuration] = useState("15s");
  const [skipExisting, setSkipExisting] = useState(true);
  /** 即梦 xlsx 生成并写入后，保存 workDir 用于后续下载 */
  const [preparedWorkDir, setPreparedWorkDir] = useState<string | null>(null);

  const [serverStatus, setServerStatus] = useState<ServerStatus>("idle");
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string>("");

  const [currentTask, setCurrentTask] = useState<JimengTask | null>(null);
  const [polling, setPolling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const logBottomRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ---------- 服务状态：Electron IPC 订阅 / Web 模式轮询 ----------
  useEffect(() => {
    // Electron 模式：通过 IPC 订阅主进程推送的状态变化
    const unsub = jimengOnStatusChange((s) => {
      setServerStatus(s.status as ServerStatus);
      if (s.message) setServerError(s.message);
      if (s.logs) setServerLogs(s.logs);
    });
    unsubscribeRef.current = unsub;

    // 立即获取一次初始状态
    jimengGetStatus().then((s) => {
      setServerStatus(s.status as ServerStatus);
      if (s.message) setServerError(s.message);
      if (s.logs) setServerLogs(s.logs);
    });

    // Web 模式：额外轮询健康检查（Electron IPC 不覆盖 Web 场景）
    const webPollInterval = setInterval(async () => {
      try {
        const health = await jimengHealth();
        setServerStatus("running");
        setServerError("");
      } catch {
        // 服务未启动：仅提示，不覆盖 Electron IPC 的状态
        setServerStatus("stopped");
      }
    }, 5000);

    return () => {
      unsub();
      clearInterval(webPollInterval);
    };
  }, []);

  // 自动滚动日志
  useEffect(() => {
    if (logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverLogs.length, currentTask?.logs.length]);

  // ---------- 提交生成任务 ----------
  const handleSubmit = async () => {
    if (scenes.length === 0) {
      toast({ title: "没有可生成的分镜", description: "请先在剧本拆解步骤生成分镜", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    setCurrentTask(null);
    setServerError("");

    try {
      const res = await jimengSubmitGenerateFromScenes({
        scenes,
        characters,
        aspectRatio,
        duration,
        skipExisting,
      });

      setPreparedWorkDir(res.workDir ?? null);

      setPolling(true);

      const finalTask = await jimengPollUntilDone(
        res.task_id,
        (task) => setCurrentTask(task),
        3000,
      );

      setCurrentTask(finalTask);
      setPolling(false);

      if (finalTask.status === "success") {
        toast({ title: "视频生成完成", description: "可以点击下载按钮获取视频" });
      } else {
        toast({ title: "生成失败", description: finalTask.result?.error as string, variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "提交失败", description: msg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- 下载视频 ----------
  const handleDownload = async () => {
    if (!currentTask || currentTask.status !== "success") return;
    setIsDownloading(true);
    try {
      const res = await jimengSubmitDownload(preparedWorkDir ?? undefined);
      setPolling(true);
      const finalTask = await jimengPollUntilDone(
        res.task_id,
        (task) => setCurrentTask(task),
        3000,
      );
      setCurrentTask(finalTask);
      if (finalTask.status === "success") toast({ title: "下载完成" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "下载失败", description: msg, variant: "destructive" });
    } finally {
      setPolling(false);
      setIsDownloading(false);
    }
  };

  // ---------- 重置 ----------
  const handleReset = () => {
    setCurrentTask(null);
    setPolling(false);
    setPreparedWorkDir(null);
  };

  const taskStatusCfg = currentTask ? STATUS_CONFIG[currentTask.status] : null;
  const TaskIcon = taskStatusCfg?.icon ?? Loader2;
  const progressPct = currentTask && currentTask.total > 0
    ? Math.round((currentTask.progress / currentTask.total) * 100)
    : currentTask?.status === "running" ? 50 : 0;

  const serverCfg = (() => {
    const base = SERVER_STATUS_CONFIG[serverStatus];
    if (!isElectronApp() && serverStatus === "idle") {
      return { ...base, desc: `请手动启动服务：cd C:\\Users\\admin\\Downloads\\auto_jimeng\\auto_jimeng && uv run python start_api.py` };
    }
    return base;
  })();
  const canSubmit = serverStatus === "running" && !polling && !isSubmitting;
  const isWorking = polling || isSubmitting || isDownloading;

  return (
    <div className="space-y-4">
      {/* 服务状态栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-sm ${serverCfg.color}`}>
            {serverStatus === "running" ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : serverStatus === "error" ? (
              <XCircle className="h-3.5 w-3.5" />
            ) : serverStatus === "starting" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">{serverCfg.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{serverCfg.desc}</span>
        </div>
        {isElectronApp() && (
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={jimengOpenSetup}
            title="打开即梦网页（首次需登录授权）"
            className="text-xs gap-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            授权登录
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={jimengOpenBrowserData}
            title="打开浏览器数据目录"
            className="text-xs gap-1"
          >
            <FolderSearch className="h-3.5 w-3.5" />
            数据目录
          </Button>
        </div>
        )}
      </div>

      {/* 错误提示 */}
      {(serverStatus === "error" || serverError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <p className="font-medium mb-1 flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            服务启动失败
          </p>
          <p className="text-xs opacity-80 font-mono whitespace-pre-wrap">{serverError || "未知错误，请查看日志"}</p>
        </div>
      )}

      {/* 配置区 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            分镜配置
          </CardTitle>
          <CardDescription>
            共 {scenes.length} 个分镜，即梦自动化将从角色与场景中提取角色信息
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 分镜摘要 */}
          {scenes.length > 0 && (
            <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground/70 mb-1">当前分镜预览（前3条）</p>
              {scenes.slice(0, 3).map((s) => (
                <p key={s.id} className="text-muted-foreground truncate">
                  #{s.sceneNumber}
                  {s.segmentLabel && <span className="ml-1 opacity-60">[{s.segmentLabel}]</span>}
                  {s.characters.length > 0 && <span className="ml-1 text-primary/70">· {s.characters.join("、")}</span>}
                </p>
              ))}
              {scenes.length > 3 && <p className="text-muted-foreground/50">…还有 {scenes.length - 3} 条</p>}
            </div>
          )}

          {/* 参数行 */}
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">时长</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={isWorking}>
                    {duration}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-32 p-1" align="start">
                  {DURATION_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded-sm transition-colors ${
                        duration === o.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      }`}
                      onClick={() => setDuration(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">已有视频</Label>
              <div className="flex items-center h-8">
                <button
                  type="button"
                  onClick={() => setSkipExisting((v) => !v)}
                  disabled={isWorking}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    skipExisting
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${skipExisting ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                  跳过
                </button>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            {!isWorking && !currentTask ? (
              <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-1.5">
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {isSubmitting ? "提交中..." : "开始生成"}
              </Button>
            ) : !isWorking && currentTask?.status === "success" ? (
              <Button onClick={handleDownload} disabled={isDownloading} className="gap-1.5">
                {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isDownloading ? "下载中..." : "下载视频"}
              </Button>
            ) : polling ? (
              <Button variant="outline" onClick={handleReset} className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" />
                取消
              </Button>
            ) : null}

            {currentTask && !polling && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                重新开始
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 服务日志（Electron IPC 推送） */}
      {(serverLogs.length > 0) && serverStatus !== "running" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              启动日志
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40 rounded-md border border-border/50 bg-muted/30 p-3">
              <div className="space-y-0.5 text-xs font-mono">
                {serverLogs.map((log, i) => (
                  <p key={i} className="text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">{log}</p>
                ))}
                {serverStatus === "starting" && (
                  <p className="text-blue-600 dark:text-blue-400 italic">正在初始化...</p>
                )}
                <div ref={logBottomRef} />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* 任务进度 & 日志区 */}
      {(currentTask || polling) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  执行日志
                </CardTitle>
                {taskStatusCfg && (
                  <Badge variant="outline" className={`${taskStatusCfg.color} border-current/30 text-xs gap-1`}>
                    <TaskIcon className={`h-3 w-3 ${currentTask?.status === "running" ? "animate-spin" : ""}`} />
                    {taskStatusCfg.label}
                  </Badge>
                )}
              </div>
              {currentTask && currentTask.total > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  {currentTask.progress}/{currentTask.total}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(polling || currentTask?.status === "running") && (
              <Progress value={progressPct} className="h-1.5" />
            )}

            <ScrollArea className="h-48 rounded-md border border-border/50 bg-muted/30 p-3">
              <div className="space-y-0.5 text-xs font-mono">
                {(currentTask?.logs ?? []).length === 0 && (
                  <p className="text-muted-foreground italic">等待任务启动...</p>
                )}
                {(currentTask?.logs ?? []).map((log, i) => (
                  <p key={i} className="text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">{log}</p>
                ))}
                {polling && !currentTask && (
                  <p className="text-blue-600 dark:text-blue-400 italic">正在等待服务响应...</p>
                )}
                <div ref={logBottomRef} />
              </div>
            </ScrollArea>

            {currentTask?.status === "failed" && currentTask.result?.error && (
              <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <p className="font-medium mb-0.5">错误信息</p>
                <p className="opacity-80">{String(currentTask.result.error)}</p>
              </div>
            )}

            {currentTask?.status === "success" && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                <p className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  任务执行完成，视频已生成。可以点击「下载视频」按钮获取文件。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 使用说明 */}
      {!currentTask && !polling && (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground/80 mb-2">使用说明</p>
          <p>1. 分镜数据从剧本拆解步骤提取，角色从「角色与场景」步骤提取</p>
          <p>2. 即梦自动化将根据分镜描述和角色信息生成 xlsx 并写入临时目录</p>
          <p>3. 参考图片放入集数文件夹内的 <code className="font-mono text-xs bg-muted px-1 rounded">场景/</code> 和 <code className="font-mono text-xs bg-muted px-1 rounded">角色/</code> 子目录</p>
          <p>4. 点击「开始生成」，即梦浏览器自动化将自动启动并执行</p>
          <p className="text-xs opacity-70 mt-2">
            即梦自动化服务源码：
            <code className="font-mono">C:\Users\admin\Downloads\auto_jimeng\auto_jimeng</code>
          </p>
        </div>
      )}
    </div>
  );
};

export default JimengVideoPanel;
