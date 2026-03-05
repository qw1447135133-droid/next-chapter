import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RotateCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export interface ChunkStatus {
  index: number;
  label: string;
  status: "pending" | "processing" | "done" | "failed" | "cancelled";
  error?: string;
}

interface DecomposeProgressProps {
  chunks: ChunkStatus[];
  onRetryChunk: (chunkIndex: number) => void;
  isRetrying?: number | null;
}

/**
 * Animated progress with:
 * - Slow creep toward ceiling (never reaches it, caps at ceil - 0.1)
 * - Smooth rollback on failure
 * - One decimal place
 * - ~75s to traverse one chunk's range
 */
function useAnimatedProgress(ceilPercent: number, floorPercent: number, hasProcessing: boolean) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const lastTimeRef = useRef(performance.now());
  const prevCeilRef = useRef(ceilPercent);

  // Detect ceiling drop (chunk failed) → animate down smoothly
  const ceilDropped = ceilPercent < prevCeilRef.current;
  useEffect(() => {
    prevCeilRef.current = ceilPercent;
  }, [ceilPercent]);

  useEffect(() => {
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setDisplay(prev => {
        // Hard cap: never exceed ceil - 0.1
        const hardCap = Math.max(0, ceilPercent - 0.1);

        if (!hasProcessing && !ceilDropped) {
          // No processing: snap to floor
          if (prev > floorPercent) {
            // Smooth rollback
            const diff = prev - floorPercent;
            const rollSpeed = Math.max(1, diff * 0.08) * 12;
            return Math.max(prev - rollSpeed * dt, floorPercent);
          }
          return floorPercent;
        }

        // If display is above hardCap (e.g. chunk failed, ceiling dropped), roll back smoothly
        if (prev > hardCap) {
          const diff = prev - hardCap;
          const rollSpeed = Math.max(1, diff * 0.08) * 12;
          return Math.max(prev - rollSpeed * dt, hardCap);
        }

        // Creep upward: ~75s to cover one chunk's range
        // chunkRange = ceilPercent - floorPercent (e.g. 20 for 5 chunks)
        // base speed = chunkRange / 75 ≈ 0.267 %/s for 5 chunks
        const base = Math.max(prev, floorPercent);
        const gap = hardCap - base;
        if (gap <= 0) return hardCap;

        const chunkRange = ceilPercent - floorPercent;
        const baseSpeed = chunkRange > 0 ? chunkRange / 75 : 0.2;
        // Decay: slower as we approach ceiling
        const ratio = gap / (chunkRange || 1);
        const speed = baseSpeed * Math.max(0.05, ratio);
        const next = base + speed * dt;
        return Math.min(next, hardCap);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ceilPercent, floorPercent, hasProcessing, ceilDropped]);

  // Jump up when floor rises (chunk completed)
  useEffect(() => {
    setDisplay(prev => Math.max(prev, floorPercent));
  }, [floorPercent]);

  // Round to 1 decimal
  return Math.round(display * 10) / 10;
}

const DecomposeProgress = ({ chunks, onRetryChunk, isRetrying }: DecomposeProgressProps) => {
  const done = chunks.filter(c => c.status === "done").length;
  const failed = chunks.filter(c => c.status === "failed").length;
  const processing = chunks.some(c => c.status === "processing");
  const total = chunks.length;
  const ceilingChunks = done + (processing ? 1 : 0);
  const ceilPercent = total > 0 ? Math.round((ceilingChunks / total) * 100) : 0;
  const floorPercent = total > 0 ? Math.round((done / total) * 100) : 0;
  const percent = useAnimatedProgress(ceilPercent, floorPercent, processing);

  const isComplete = total > 1 && done === total && failed === 0;
  const [showCelebration, setShowCelebration] = useState(false);
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (isComplete && !celebratedRef.current) {
      celebratedRef.current = true;
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      return () => clearTimeout(timer);
    }
    if (!isComplete) {
      celebratedRef.current = false;
    }
  }, [isComplete]);

  if (chunks.length <= 1) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          分镜拆解进度
        </span>
        <span className="text-muted-foreground tabular-nums relative overflow-hidden">
          <AnimatePresence mode="wait">
            {isComplete ? (
              <motion.span
                key="complete"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="inline-flex items-center gap-1 font-semibold text-accent"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                拆解完成
              </motion.span>
            ) : (
              <motion.span
                key="progress"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                {done}/{total} 段完成{failed > 0 && <span className="text-destructive ml-1">（{failed} 段失败）</span>}
                <span className="ml-2 font-semibold text-foreground">{percent.toFixed(1)}%</span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <div className="relative">
        <Progress
          value={percent}
          className={`h-2 shimmer-progress transition-all duration-500 ${
            showCelebration ? "progress-celebrate" : ""
          } ${isComplete ? "progress-done" : ""}`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {chunks.map((chunk) => (
          <div
            key={chunk.index}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              chunk.status === "done"
                ? "bg-primary/10 text-primary border-primary/20"
                : chunk.status === "failed"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : chunk.status === "cancelled"
                ? "bg-muted text-muted-foreground border-border line-through opacity-60"
                : chunk.status === "processing"
                ? "bg-accent text-accent-foreground border-border animate-pulse"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {chunk.status === "done" && <CheckCircle2 className="h-3 w-3" />}
            {chunk.status === "failed" && <XCircle className="h-3 w-3" />}
            {chunk.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>{chunk.label}</span>
            {(chunk.status === "failed" || chunk.status === "cancelled") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-0.5"
                onClick={() => onRetryChunk(chunk.index)}
                disabled={isRetrying != null}
                title={chunk.status === "cancelled" ? "点击重试已取消的段落" : (chunk.error || "点击重试")}
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
