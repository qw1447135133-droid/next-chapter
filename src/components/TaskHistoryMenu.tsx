import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, CheckCircle2, XCircle, Loader2, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getTaskHistory,
  loadComplianceStandaloneRestore,
  removeComplianceTask,
  type ComplianceTaskHistoryEntry,
  type TaskHistoryStatus,
} from "@/lib/task-history";
import { buildAgentHandoff, saveAgentHandoff } from "@/lib/agent-intake";

function statusLabel(status: TaskHistoryStatus) {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function StatusIcon({ status }: { status: TaskHistoryStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
    case "cancelled":
      return <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    default:
      return null;
  }
}

export function TaskHistoryMenu() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ComplianceTaskHistoryEntry[]>([]);

  useEffect(() => {
    const load = () => {
      const all = getTaskHistory().filter((entry): entry is ComplianceTaskHistoryEntry => entry.kind === "compliance");
      setItems(all);
    };

    load();
    window.addEventListener("storyforge-task-history-updated", load);
    return () => window.removeEventListener("storyforge-task-history-updated", load);
  }, []);

  const running = items.filter((item) => item.status === "running").length;

  const openTask = (entry: ComplianceTaskHistoryEntry) => {
    if (entry.source === "script-creator" && entry.projectId) {
      saveAgentHandoff(
        buildAgentHandoff("恢复这个项目，并优先继续处理合规审查。", {
          route: "script-creator",
          title: "已把历史合规任务收口到首页会话",
          subtitle: "我会直接恢复项目上下文，并在首页继续合规分析和修订建议。",
          resumeProjectId: entry.projectId,
        }),
      );
      navigate("/");
      return;
    }

    const restore = loadComplianceStandaloneRestore(entry.id);
    const prompt = restore?.scriptText?.trim()
      ? `请在首页继续这个合规审查任务，并先基于以下内容给出风险分析：\n\n${restore.scriptText}`
      : "请在首页继续这个合规审查任务，并先告诉我需要补充哪些上下文。";

    saveAgentHandoff(
      buildAgentHandoff(prompt, {
        route: "script-creator",
        title: "已把历史合规任务收口到首页会话",
        subtitle: "后续的审查、追问和修订建议都会在首页会话里完成。",
      }),
    );
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <History className="h-4 w-4" />
          任务历史
          {running > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0 text-[10px] text-primary-foreground tabular-nums">
              {running}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(100vw-2rem,22rem)] p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          合规审查任务
        </div>
        <div className="max-h-[min(70vh,320px)] overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无记录</div>
          ) : (
            <div className="space-y-1 p-1.5">
              {items.map((entry) => {
                const time = new Date(entry.updatedAt);
                const timeLabel = time.toLocaleString("zh-CN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const modeLabel = entry.reviewMode === "script" ? "剧情审查" : "文本审查";
                const sourceLabel =
                  entry.source === "script-creator" ? "剧本创作项目" : "独立合规任务";
                const segmentLabel =
                  entry.status === "running" && entry.segmentProgress
                    ? `第 ${entry.segmentProgress.current}/${entry.segmentProgress.total} 段`
                    : "";

                return (
                  <DropdownMenuItem
                    key={entry.id}
                    className="cursor-pointer rounded-md bg-muted/40 p-0 text-xs hover:bg-muted/70 focus:bg-muted/70 data-[highlighted]:bg-muted/70"
                    onSelect={() => openTask(entry)}
                  >
                    <div className="flex min-w-0 w-full items-start gap-1 pr-1">
                      <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2">
                        <StatusIcon status={entry.status} />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="truncate font-medium text-foreground" title={entry.title}>
                            {entry.title || "合规审查"}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>{sourceLabel}</span>
                            <span>·</span>
                            <span>{modeLabel}</span>
                            <span>·</span>
                            <span>{statusLabel(entry.status)}</span>
                            {segmentLabel ? <span className="text-primary">{segmentLabel}</span> : null}
                          </div>
                          {entry.detail ? (
                            <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground" title={entry.detail}>
                              {entry.detail}
                            </div>
                          ) : null}
                          <div className="mt-1 text-[10px] text-muted-foreground/80">{timeLabel}</div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="删除这条记录"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          removeComplianceTask(entry.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
