import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RotateCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface ChunkStatus {
  index: number;
  label: string;
  status: "pending" | "processing" | "done" | "failed" | "cancelled";
  error?: string;
  segmentCount?: number;
}

interface DecomposeProgressProps {
  chunks: ChunkStatus[];
  onRetryChunk: (chunkIndex: number) => void;
  isRetrying?: number | null;
  onScrollToEpisode?: (episodeIndex: number) => void;
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
const COLLAPSE_THRESHOLD = 12; // Show grid with expand/collapse when more than this

/** Compact grid for episode chunks */
const ChunkGrid = ({ chunks, onRetryChunk, isRetrying, onScrollToEpisode }: { chunks: ChunkStatus[]; onRetryChunk: (i: number) => void; isRetrying?: number | null; onScrollToEpisode?: (i: number) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const isLargeSet = chunks.length > COLLAPSE_THRESHOLD;
  const visibleChunks = isLargeSet && !expanded ? chunks.slice(0, COLLAPSE_THRESHOLD) : chunks;
  const hiddenCount = chunks.length - COLLAPSE_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className={`grid gap-1.5 ${chunks.length > 20 ? 'grid-cols-6 sm:grid-cols-8 md:grid-cols-10' : chunks.length > 10 ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8' : 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6'}`}>
        {visibleChunks.map((chunk) => (
          <div
            key={chunk.index}
            onClick={() => chunk.status === "done" && onScrollToEpisode?.(chunk.index)}
            className={`group relative flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium border transition-colors ${
              chunk.status === "done"
                ? "bg-primary/10 text-primary border-primary/20 cursor-pointer hover:bg-primary/20"
                : chunk.status === "failed"
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : chunk.status === "cancelled"
                ? "bg-muted text-muted-foreground border-border line-through opacity-60"
                : chunk.status === "processing"
                ? "bg-accent text-accent-foreground border-border animate-pulse"
                : "bg-muted text-muted-foreground border-border"
            }`}
            title={chunk.error || chunk.label}
          >
            {chunk.status === "done" && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
            {chunk.status === "failed" && <XCircle className="h-2.5 w-2.5 shrink-0" />}
            {chunk.status === "processing" && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
            <span className="truncate">{chunk.label.replace('第 ', '').replace(' 集', '集').replace(' 段', '段')}</span>
            {chunk.segmentCount != null && (
              <span className="text-muted-foreground font-normal opacity-60 shrink-0">({chunk.segmentCount})</span>
            )}
            {(chunk.status === "failed" || chunk.status === "cancelled" || chunk.status === "done") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onRetryChunk(chunk.index); }}
                disabled={isRetrying != null}
                title={chunk.status === "done" ? "重新拆解" : "重试"}
              >
                {isRetrying === chunk.index ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <RotateCw className="h-2.5 w-2.5" />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
      {isLargeSet && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? '收起' : `展开全部（还有 ${hiddenCount} 集）`}
        </button>
      )}
    </div>
  );
};

const DecomposeProgress = ({ chunks, onRetryChunk, isRetrying, onScrollToEpisode }: DecomposeProgressProps) => {
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
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.span
              key="complete"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="text-accent font-semibold flex items-center gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              拆解完成
            </motion.span>
          ) : (
            <motion.span
              key="progress"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-muted-foreground tabular-nums"
            >
              {done}/{total} 段完成{failed > 0 && <span className="text-destructive ml-1">（{failed} 段失败）</span>}
              <span className="ml-2 font-semibold text-foreground">{percent.toFixed(1)}%</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        <Progress
          value={percent}
          className={`h-2 shimmer-progress transition-all duration-500 ${
            showCelebration ? "progress-celebrate" : ""
          } ${isComplete ? "progress-done" : ""}`}
        />
      </div>

      {/* Collapsible grid for many chunks */}
      <ChunkGrid chunks={chunks} onRetryChunk={onRetryChunk} isRetrying={isRetrying} />
    </div>
  );
};

export default DecomposeProgress;
