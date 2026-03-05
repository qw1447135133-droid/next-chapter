import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RotateCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export interface ChunkStatus {
  index: number;
  label: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
}

interface DecomposeProgressProps {
  chunks: ChunkStatus[];
  onRetryChunk: (chunkIndex: number) => void;
  isRetrying?: number | null; // index of chunk currently retrying
}

const DecomposeProgress = ({ chunks, onRetryChunk, isRetrying }: DecomposeProgressProps) => {
  if (chunks.length <= 1) return null;

  const done = chunks.filter(c => c.status === "done").length;
  const failed = chunks.filter(c => c.status === "failed").length;
  const total = chunks.length;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">分镜拆解进度</span>
        <span className="text-muted-foreground tabular-nums">
          {done}/{total} 段完成{failed > 0 && <span className="text-destructive ml-1">（{failed} 段失败）</span>}
          <span className="ml-2 font-semibold text-foreground">{percent}%</span>
        </span>
      </div>

      <Progress value={percent} className="h-2" />

      <div className="flex flex-wrap gap-2">
        {chunks.map((chunk) => (
          <div
            key={chunk.index}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              chunk.status === "done"
                ? "bg-primary/10 text-primary border-primary/20"
                : chunk.status === "failed"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : chunk.status === "processing"
                ? "bg-accent text-accent-foreground border-border animate-pulse"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {chunk.status === "done" && <CheckCircle2 className="h-3 w-3" />}
            {chunk.status === "failed" && <XCircle className="h-3 w-3" />}
            {chunk.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>{chunk.label}</span>
            {chunk.status === "failed" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-0.5"
                onClick={() => onRetryChunk(chunk.index)}
                disabled={isRetrying != null}
                title={chunk.error || "点击重试"}
              >
                {isRetrying === chunk.index ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCw className="h-3 w-3" />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DecomposeProgress;
