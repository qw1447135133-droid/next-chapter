import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, RotateCw, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

export type AnalyzePhase = "idle" | "phase1" | "phase1-done" | "phase2" | "done" | "phase1-failed" | "phase2-failed";

interface AnalyzeProgressProps {
  phase: AnalyzePhase;
  phase1Info?: string;
  phase2Info?: string;
  phase2RetryCount?: number;
  phase2MaxRetries?: number;
  onRetryPhase2?: () => void;
  isRetryingPhase2?: boolean;
  streamingText?: string;
}

const AnalyzeProgress = ({
  phase,
  phase1Info,
  phase2Info,
  phase2RetryCount = 0,
  phase2MaxRetries = 0,
  onRetryPhase2,
  isRetryingPhase2,
  streamingText,
}: AnalyzeProgressProps) => {
  const [expanded, setExpanded] = useState(false);

  if (phase === "idle") return null;

  const phase1Done = phase !== "phase1" && phase !== "phase1-failed";
  const phase1Failed = phase === "phase1-failed";
  const phase1Active = phase === "phase1";

  const phase2Active = phase === "phase2";
  const phase2Done = phase === "done";
  const phase2Failed = phase === "phase2-failed";

  const isStreaming = (phase1Active || phase2Active) && !!streamingText;
  const streamCharCount = streamingText?.length || 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium text-foreground">拆解进度</div>

      {/* Phase 1 */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
          phase1Done ? "bg-primary/15 text-primary" : phase1Failed ? "bg-destructive/15 text-destructive" : "bg-accent text-accent-foreground"
        }`}>
          {phase1Active ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : phase1Done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : phase1Failed ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${phase1Done ? "text-primary" : phase1Failed ? "text-destructive" : phase1Active ? "text-foreground" : "text-muted-foreground"}`}>
            阶段 1/2：识别角色与场景
            {phase1Active && streamCharCount > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                已生成 {streamCharCount.toLocaleString()} 字符
              </span>
            )}
          </div>
          <AnimatePresence mode="wait">
            {phase1Info && (
              <motion.div
                key={phase1Info}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-muted-foreground mt-0.5"
              >
                {phase1Info}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Connector line */}
      <div className="ml-3 w-px h-3 bg-border" />

      {/* Phase 2 */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
          phase2Done ? "bg-primary/15 text-primary" : phase2Failed ? "bg-destructive/15 text-destructive" : phase2Active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {phase2Active || isRetryingPhase2 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : phase2Done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : phase2Failed ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${phase2Done ? "text-primary" : phase2Failed ? "text-destructive" : phase2Active ? "text-foreground" : "text-muted-foreground"}`}>
            阶段 2/2：拆解分镜
            {phase2Active && streamCharCount > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-2">
                已生成 {streamCharCount.toLocaleString()} 字符
              </span>
            )}
          </div>
          <AnimatePresence mode="wait">
            {(phase2Info || (phase2Active && phase2RetryCount > 0)) && (
              <motion.div
                key={`${phase2Info}-${phase2RetryCount}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs text-muted-foreground mt-0.5"
              >
                {phase2RetryCount > 0 && phase2Active && (
                  <span className="text-amber-500 dark:text-amber-400 mr-1.5">
                    第 {phase2RetryCount} 次重试中
                  </span>
                )}
                {phase2Info}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Retry button for phase 2 failure */}
        {phase2Failed && onRetryPhase2 && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={onRetryPhase2}
            disabled={isRetryingPhase2}
          >
            {isRetryingPhase2 ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            重试阶段二
          </Button>
        )}
      </div>

      {/* Streaming text preview */}
      {isStreaming && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "收起实时输出" : "查看实时输出"}
          </button>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <pre className="p-3 rounded-lg bg-muted/50 border border-border/60 text-xs text-foreground/80 overflow-auto max-h-[300px] whitespace-pre-wrap break-words font-mono">
                {streamingText}
                <span className="inline-block w-1.5 h-3 bg-primary animate-pulse ml-0.5 align-text-bottom" />
              </pre>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalyzeProgress;
