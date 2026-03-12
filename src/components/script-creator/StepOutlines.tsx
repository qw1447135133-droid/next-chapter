import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Loader2, RefreshCw, Square, FileText, CheckCircle2, XCircle, RotateCw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildOutlinePrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeEntry } from "@/types/drama";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

interface StepOutlinesProps {
  setup: DramaSetup;
  creativePlan: string;
  characters: string;
  directory: EpisodeEntry[];
  directoryRaw: string;
  onUpdate: (directory: EpisodeEntry[], raw: string) => void;
  onNext: () => void;
}

function parseOutlines(text: string): Map<number, string> {
  const map = new Map<number, string>();
  const blocks = text.split(/【第(\d+)集细纲】/);
  for (let i = 1; i < blocks.length; i += 2) {
    const num = parseInt(blocks[i]);
    const content = (blocks[i + 1] || "").replace(/^[^\n]*\n/, "").replace(/---\s*$/, "").trim();
    if (num && content) {
      map.set(num, content);
    }
  }
  return map;
}

interface OutlineBatchStatus {
  index: number;
  label: string;
  status: "pending" | "processing" | "done" | "failed";
  error?: string;
  startEp: number;
  endEp: number;
}

function useAnimatedProgress(ceilPercent: number, floorPercent: number, hasProcessing: boolean) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const lastTimeRef = useRef(performance.now());
  const prevCeilRef = useRef(ceilPercent);
  const ceilDropped = ceilPercent < prevCeilRef.current;

  useEffect(() => { prevCeilRef.current = ceilPercent; }, [ceilPercent]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      setDisplay(prev => {
        const hardCap = Math.max(0, ceilPercent - 0.1);
        if (!hasProcessing && !ceilDropped) {
          if (prev > floorPercent) {
            const rollSpeed = Math.max(1, (prev - floorPercent) * 0.08) * 12;
            return Math.max(prev - rollSpeed * dt, floorPercent);
          }
          return floorPercent;
        }
        if (prev > hardCap) {
          const rollSpeed = Math.max(1, (prev - hardCap) * 0.08) * 12;
          return Math.max(prev - rollSpeed * dt, hardCap);
        }
        const base = Math.max(prev, floorPercent);
        const gap = hardCap - base;
        if (gap <= 0) return hardCap;
        const chunkRange = ceilPercent - floorPercent;
        const baseSpeed = chunkRange > 0 ? chunkRange / 75 : 0.2;
        const ratio = gap / (chunkRange || 1);
        const speed = baseSpeed * Math.max(0.05, ratio);
        return Math.min(base + speed * dt, hardCap);
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ceilPercent, floorPercent, hasProcessing, ceilDropped]);

  useEffect(() => { setDisplay(prev => Math.max(prev, floorPercent)); }, [floorPercent]);
  return Math.round(display * 10) / 10;
}

const BATCH_SIZE = 30;

const StepOutlines = ({ setup, creativePlan, characters, directory, directoryRaw, onUpdate, onNext }: StepOutlinesProps) => {
  const [outlineBatches, setOutlineBatches] = useState<OutlineBatchStatus[]>([]);
  const [isGeneratingOutlines, setIsGeneratingOutlines] = useState(false);
  const outlineAbortRef = useRef<AbortController | null>(null);
  const [expandedOutlines, setExpandedOutlines] = useState<Set<number>>(new Set());

  const buildBatches = useCallback((): OutlineBatchStatus[] => {
    const batches: OutlineBatchStatus[] = [];
    for (let i = 0; i < directory.length; i += BATCH_SIZE) {
      const slice = directory.slice(i, i + BATCH_SIZE);
      const startEp = slice[0].number;
      const endEp = slice[slice.length - 1].number;
      const allHaveOutline = slice.every(ep => ep.outline);
      batches.push({
        index: batches.length,
        label: `第${startEp}-${endEp}集`,
        status: allHaveOutline ? "done" : "pending",
        startEp,
        endEp,
      });
    }
    return batches;
  }, [directory]);

  const handleGenerateOutlines = async () => {
    if (directory.length === 0) return;
    setIsGeneratingOutlines(true);
    outlineAbortRef.current = new AbortController();
    const batches = buildBatches();
    setOutlineBatches(batches.map(b => b.status === "done" ? b : { ...b, status: "pending" as const }));

    const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
    const updatedDirectory = [...directory];

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (outlineAbortRef.current?.signal.aborted) break;
      const batch = batches[bIdx];
      if (batch.status === "done") continue;

      setOutlineBatches(prev => prev.map((b, i) => i === bIdx ? { ...b, status: "processing" } : b));

      const batchEpisodes = directory.filter(ep => ep.number >= batch.startEp && ep.number <= batch.endEp);
      const prompt = buildOutlinePrompt(
        setup, creativePlan, characters,
        batchEpisodes.map(ep => ({ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType })),
        directoryRaw,
      );

      try {
        const result = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          () => {},
          { maxOutputTokens: 8192 },
          outlineAbortRef.current!.signal,
        );

        const outlines = parseOutlines(result);
        for (const [num, outline] of outlines) {
          const idx = updatedDirectory.findIndex(ep => ep.number === num);
          if (idx >= 0) {
            updatedDirectory[idx] = { ...updatedDirectory[idx], outline };
          }
        }
        onUpdate([...updatedDirectory], directoryRaw);
        setOutlineBatches(prev => prev.map((b, i) => i === bIdx ? { ...b, status: "done" } : b));
      } catch (e: any) {
        if (e?.message?.includes("取消")) {
          setOutlineBatches(prev => prev.map((b, i) => i === bIdx ? { ...b, status: "failed", error: "已取消" } : b));
          break;
        }
        setOutlineBatches(prev => prev.map((b, i) => i === bIdx ? { ...b, status: "failed", error: e?.message } : b));
      }
    }

    setIsGeneratingOutlines(false);
    outlineAbortRef.current = null;
    const doneCount = directory.filter(ep => updatedDirectory.find(u => u.number === ep.number)?.outline).length;
    toast({ title: `细纲生成完成（${doneCount}/${directory.length} 集）` });
  };

  const handleRetryBatch = async (batchIndex: number) => {
    const batch = outlineBatches[batchIndex];
    if (!batch) return;
    setIsGeneratingOutlines(true);
    outlineAbortRef.current = new AbortController();
    setOutlineBatches(prev => prev.map((b, i) => i === batchIndex ? { ...b, status: "processing", error: undefined } : b));

    const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
    const batchEpisodes = directory.filter(ep => ep.number >= batch.startEp && ep.number <= batch.endEp);
    const prompt = buildOutlinePrompt(
      setup, creativePlan, characters,
      batchEpisodes.map(ep => ({ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType })),
      directoryRaw,
    );

    try {
      const result = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 8192 },
        outlineAbortRef.current!.signal,
      );

      const outlines = parseOutlines(result);
      const updatedDirectory = [...directory];
      for (const [num, outline] of outlines) {
        const idx = updatedDirectory.findIndex(ep => ep.number === num);
        if (idx >= 0) {
          updatedDirectory[idx] = { ...updatedDirectory[idx], outline };
        }
      }
      onUpdate(updatedDirectory, directoryRaw);
      setOutlineBatches(prev => prev.map((b, i) => i === batchIndex ? { ...b, status: "done" } : b));
    } catch (e: any) {
      setOutlineBatches(prev => prev.map((b, i) => i === batchIndex ? { ...b, status: "failed", error: e?.message } : b));
    } finally {
      setIsGeneratingOutlines(false);
      outlineAbortRef.current = null;
    }
  };

  const handleStopOutlines = () => outlineAbortRef.current?.abort();

  const toggleOutline = (epNumber: number) => {
    setExpandedOutlines(prev => {
      const next = new Set(prev);
      next.has(epNumber) ? next.delete(epNumber) : next.add(epNumber);
      return next;
    });
  };

  // Progress calculations
  const outlineDone = outlineBatches.filter(b => b.status === "done").length;
  const outlineProcessing = outlineBatches.some(b => b.status === "processing");
  const outlineFailed = outlineBatches.filter(b => b.status === "failed").length;
  const outlineTotal = outlineBatches.length;
  const outlineCeil = outlineTotal > 0 ? Math.round(((outlineDone + (outlineProcessing ? 1 : 0)) / outlineTotal) * 100) : 0;
  const outlineFloor = outlineTotal > 0 ? Math.round((outlineDone / outlineTotal) * 100) : 0;
  const outlinePercent = useAnimatedProgress(outlineCeil, outlineFloor, outlineProcessing);
  const outlineComplete = outlineTotal > 0 && outlineDone === outlineTotal && outlineFailed === 0;

  const outlinesExist = directory.some(ep => ep.outline);
  const outlinesCount = directory.filter(ep => ep.outline).length;

  // Translation
  const allOutlinesText = directory
    .filter(ep => ep.outline)
    .map(ep => `【第${ep.number}集】\n${ep.outline}`)
    .join("\n\n");
  const nonChinese = isNonChineseText(allOutlinesText);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();

  // Build per-episode translation line slices
  const epTranslationSlices = (() => {
    const translatedLines = showTranslation && hasTranslation(allOutlinesText) ? getTranslation(allOutlinesText)! : null;
    if (!translatedLines) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    let lineOffset = 0;
    const epsWithOutline = directory.filter(ep => ep.outline);
    for (let i = 0; i < epsWithOutline.length; i++) {
      const ep = epsWithOutline[i];
      const headerLine = `【第${ep.number}集】`;
      const epLines = (headerLine + "\n" + ep.outline!).split("\n");
      const outlineOnlyLines = ep.outline!.split("\n");
      // skip the header line offset + 1, then take outline lines
      map.set(ep.number, translatedLines.slice(lineOffset + 1, lineOffset + 1 + outlineOnlyLines.length));
      // total lines for this block = header(1) + outline lines + separator(blank line between blocks, except last)
      lineOffset += epLines.length;
      if (i < epsWithOutline.length - 1) {
        lineOffset += 1; // the "\n\n" join adds one extra blank line
      }
    }
    return map;
  })();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            单集细纲
            {outlinesExist && (
              <span className="text-sm font-normal text-muted-foreground">
                {outlinesCount}/{directory.length} 集已生成
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {outlinesExist && !isGeneratingOutlines && (
              <TranslateToggle
                isNonChinese={nonChinese}
                isTranslating={isTranslating}
                showTranslation={showTranslation}
                onTranslate={() => translate(allOutlinesText)}
                onClear={clearTranslation}
                onStop={stopTranslation}
                disabled={false}
              />
            )}
            {isGeneratingOutlines ? (
              <Button variant="destructive" size="sm" onClick={handleStopOutlines} className="gap-1.5">
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : (
              <Button
                variant={outlinesExist ? "outline" : "default"}
                size="sm"
                onClick={handleGenerateOutlines}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {outlinesExist ? "重新生成细纲" : "生成细纲"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
          {!outlinesExist && !isGeneratingOutlines && outlineBatches.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>点击"生成细纲"按钮，为每集生成约 300 字的详细细纲</p>
              <p className="text-xs mt-2">
                {directory.length > BATCH_SIZE
                  ? `将分 ${Math.ceil(directory.length / BATCH_SIZE)} 批生成（每批 ${BATCH_SIZE} 集）`
                  : `共 ${directory.length} 集，一次性生成`}
              </p>
            </div>
          )}

          {/* Progress bar */}
          {outlineBatches.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">细纲生成进度</span>
                <AnimatePresence mode="wait">
                  {outlineComplete ? (
                    <motion.span
                      key="complete"
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="text-accent font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      细纲生成完成
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
                      {outlineDone}/{outlineTotal} 批完成
                      {outlineFailed > 0 && <span className="text-destructive ml-1">（{outlineFailed} 批失败）</span>}
                      <span className="ml-2 font-semibold text-foreground">{outlinePercent.toFixed(1)}%</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <Progress
                value={outlinePercent}
                className={`h-2 transition-all duration-500 ${outlineComplete ? "progress-done" : ""}`}
              />

              {/* Batch grid */}
              <div className={`grid gap-1.5 ${outlineTotal > 10 ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5'}`}>
                {outlineBatches.map((batch) => (
                  <div
                    key={batch.index}
                    className={`group relative flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                      batch.status === "done"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : batch.status === "failed"
                        ? "bg-destructive/10 text-destructive border-destructive/20"
                        : batch.status === "processing"
                        ? "bg-accent text-accent-foreground border-border animate-pulse"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                    title={batch.error || batch.label}
                  >
                    {batch.status === "done" && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                    {batch.status === "failed" && <XCircle className="h-2.5 w-2.5 shrink-0" />}
                    {batch.status === "processing" && <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />}
                    <span className="truncate">{batch.label}</span>
                    {batch.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleRetryBatch(batch.index)}
                        disabled={isGeneratingOutlines}
                        title="重试"
                      >
                        <RotateCw className="h-2.5 w-2.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Episode list with outlines */}
          {directory.length > 0 && (
            <div className="max-h-[500px] overflow-auto space-y-1">
              {directory.map((ep) => (
                <div key={ep.number}>
                  <div
                    className={`flex items-start gap-2 px-3 py-2 rounded text-sm cursor-pointer hover:bg-muted/30 transition-colors ${
                      ep.outline ? "" : "opacity-60"
                    }`}
                    onClick={() => ep.outline && toggleOutline(ep.number)}
                  >
                    <span className="text-muted-foreground w-12 shrink-0 font-mono">
                      {String(ep.number).padStart(2, "0")}
                    </span>
                    <span className="font-medium min-w-[80px]">{ep.title}</span>
                    <span className="text-muted-foreground flex-1 truncate">{ep.summary}</span>
                    {ep.outline ? (
                      <span className="shrink-0 text-primary">
                        {expandedOutlines.has(ep.number) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">未生成</span>
                    )}
                  </div>
                  <AnimatePresence>
                    {ep.outline && expandedOutlines.has(ep.number) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="ml-14 mr-4 mb-2 px-3 py-2 rounded bg-muted/30 border border-border/50 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                          {showTranslation && hasTranslation(allOutlinesText) ? (
                            <InterleavedText text={ep.outline} translatedLines={epTranslationSlices.get(ep.number) || []} />
                          ) : (
                            ep.outline
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {directory.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认细纲，进入分集撰写
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepOutlines;
