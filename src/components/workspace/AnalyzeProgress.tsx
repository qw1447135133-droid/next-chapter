import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from "lucide-react";
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
  streamingText,
}: AnalyzeProgressProps) => {
  const [expanded, setExpanded] = useState(false);

  if (phase === "idle") return null;

  const phase1Done = phase === "done" || phase === "phase1-done";
  const phase1Failed = phase === "phase1-failed";
  const phase1Active = phase === "phase1";

  const isStreaming = phase1Active && !!streamingText;
  const streamCharCount = streamingText?.length || 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium text-foreground">分析进度</div>

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
            识别角色与场景
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