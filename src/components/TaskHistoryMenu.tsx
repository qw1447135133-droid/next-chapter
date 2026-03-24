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
import { getTaskHistory, removeComplianceTask, type ComplianceTaskHistoryEntry, type TaskHistoryStatus } from "@/lib/task-history";

function statusLabel(s: TaskHistoryStatus) {
  switch (s) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已停止";
    default:
      return s;
  }
}

function StatusIcon({ status }: { status: TaskHistoryStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
    case "cancelled":
      return <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    default:
      return null;
  }
}

export function TaskHistoryMenu() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ComplianceTaskHistoryEntry[]>([]);

  useEffect(() => {
    const load = () => {
      const all = getTaskHistory().filter((e): e is ComplianceTaskHistoryEntry => e.kind === "compliance");
      setItems(all);
    };
    load();
    window.addEventListener("storyforge-task-history-updated", load);
    return () => window.removeEventListener("storyforge-task-history-updated", load);
  }, []);

  const running = items.filter((i) => i.status === "running").length;

  const openTask = (entry: ComplianceTaskHistoryEntry) => {
    if (entry.source === "script-creator") {
      if (entry.projectId) {
        navigate(`/script-creator?id=${encodeURIComponent(entry.projectId)}&step=compliance`);
      } else {
        navigate("/script-creator");
      }
      return;
    }
    navigate(`/compliance-review?task=${encodeURIComponent(entry.id)}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <History className="h-4 w-4" />
          任务历史
          {running > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0 text-[10px] text-primary-foreground tabular-nums">
              {running}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(100vw-2rem,22rem)] p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">合规审核任务</div>
        <div className="max-h-[min(70vh,320px)] overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无记录</div>
          ) : (
            <div className="p-1.5 space-y-1">
              {items.map((e) => {
                const t = new Date(e.updatedAt);
                const timeStr = t.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                const mode = e.reviewMode === "script" ? "情节" : "文字";
                const src = e.source === "script-creator" ? "剧本创作" : "合规审核";
                const seg =
                  e.status === "running" && e.segmentProgress
                    ? ` 第 ${e.segmentProgress.current}/${e.segmentProgress.total} 段`
                    : "";
                return (
                  <DropdownMenuItem
                    key={e.id}
                    className="cursor-pointer rounded-md p-0 text-xs bg-muted/40 hover:bg-muted/70 focus:bg-muted/70 data-[highlighted]:bg-muted/70"
                    onSelect={() => openTask(e)}
                  >
                    <div className="flex items-start gap-1 w-full min-w-0 pr-1">
                      <div className="flex items-start gap-2 flex-1 min-w-0 px-2 py-2">
                        <StatusIcon status={e.status} />
                        <div className="min-w-0 flex-1 text-left">
                          <div className="font-medium text-foreground truncate" title={e.title}>
                            {e.title || "合规审核"}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                            <span>{src}</span>
                            <span>·</span>
                            <span>{mode}</span>
                            <span>·</span>
                            <span>{statusLabel(e.status)}</span>
                            {seg && <span className="text-primary">{seg}</span>}
                          </div>
                          {e.detail && (
                            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2" title={e.detail}>
                              {e.detail}
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground/80 mt-1">{timeStr}</div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="删除此条记录"
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          removeComplianceTask(e.id);
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
