import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Loader2, RefreshCw, FileText, CheckCircle2, XCircle, RotateCw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildOutlinePrompt } from "@/lib/drama-prompts";
import { readStoredDecomposeModel } from "@/lib/gemini-text-models";
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
const OUTLINE_TIMEOUT_MS = 120000;

const StepOutlines = ({ setup, creativePlan, characters, directory, directoryRaw, onUpdate, onNext }: StepOutlinesProps) => {
  const [outlineBatches, setOutlineBatches] = useState<OutlineBatchStatus[]>([]);
  const [isGeneratingOutlines, setIsGeneratingOutlines] = useState(false);
  const outlineAbortRef = useRef<AbortController | null>(null);
  const [expandedOutlines, setExpandedOutlines] = useState<Set<number>>(new Set());
  // Per-episode regen state
  const [regenEpNum, setRegenEpNum] = useState<number | null>(null);
  const [, setHoverRegenEp] = useState<number | null>(null);
  const [regenInstructions, setRegenInstructions] = useState<Record<number, string>>({});
  const singleAbortRef = useRef<AbortController | null>(null);

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

  const callGeminiStreamWithTimeout = async (
    model: string,
    prompt: string,
    outerSignal?: AbortSignal,
    maxOutputTokens = 8192,
  ) => {
    const timeoutAbort = new AbortController();
    let didTimeout = false;
    const timer = window.setTimeout(() => {
      didTimeout = true;
      timeoutAbort.abort();
    }, OUTLINE_TIMEOUT_MS);
    const onOuterAbort = () => timeoutAbort.abort();
    outerSignal?.addEventListener("abort", onOuterAbort, { once: true });
    if (outerSignal?.aborted) timeoutAbort.abort();

    try {
      return await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens },
        timeoutAbort.signal,
      );
    } catch (e: any) {
      if (didTimeout) {
        throw new Error(`请求超时（>${Math.round(OUTLINE_TIMEOUT_MS / 1000)}秒）`);
      }
      throw e;
    } finally {
      window.clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
  };

  const handleGenerateOutlines = async () => {
    if (directory.length === 0) return;
    setIsGeneratingOutlines(true);
    outlineAbortRef.current = new AbortController();
    const batches = buildBatches();
    setOutlineBatches(batches.map(b => b.status === "done" ? b : { ...b, status: "pending" as const }));

    const model = readStoredDecomposeModel();
    const updatedDirectory = [...directory];

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      if (outlineAbortRef.current?.signal.aborted) break;
      const batch = batches[bIdx];
      if (batch.status === "done") continue;

      setOutlineBatches(prev => prev.map((b, i) => i === bIdx ? { ...b, status: "processing" } : b));

      const batchEpisodes = directory.filter(ep => ep.number >= batch.startEp && ep.number <= batch.endEp);
      const expectedNums = batchEpisodes.map((ep) => ep.number);
      const prompt = buildOutlinePrompt(
        setup, creativePlan, characters,
        batchEpisodes.map(ep => ({ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType })),
        directoryRaw,
      );

      try {
        const result = await callGeminiStreamWithTimeout(
          model,
          prompt,
          outlineAbortRef.current!.signal,
          8192,
        );

        const outlines = parseOutlines(result);
        const receivedNums = Array.from(outlines.keys()).sort((a, b) => a - b);
        const missingNums = expectedNums.filter((n) => !outlines.has(n));
        for (const [num, outline] of outlines) {
          const idx = updatedDirectory.findIndex(ep => ep.number === num);
          if (idx >= 0) {
            updatedDirectory[idx] = { ...updatedDirectory[idx], outline };
          }
        }

        // 补偿：若该批仍有缺失细纲，逐集再补一次，避免“中间集拆不出来”
        const missingEpisodes = batchEpisodes.filter((ep) => {
          const row = updatedDirectory.find((u) => u.number === ep.number);
          return !row?.outline?.trim();
        });
        for (const ep of missingEpisodes) {
          if (outlineAbortRef.current?.signal.aborted) break;
          const singlePrompt = buildOutlinePrompt(
            setup,
            creativePlan,
            characters,
            [{ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType }],
            directoryRaw,
          );
          try {
            const singleResult = await callGeminiStreamWithTimeout(
              model,
              singlePrompt,
              outlineAbortRef.current!.signal,
              4096,
            );
            const one = parseOutlines(singleResult).get(ep.number);
            if (one?.trim()) {
              const idx = updatedDirectory.findIndex((u) => u.number === ep.number);
              if (idx >= 0) updatedDirectory[idx] = { ...updatedDirectory[idx], outline: one };
            }
          } catch {
            // keep missing and let batch status reflect failure below
          }
        }

        onUpdate([...updatedDirectory], directoryRaw);
        const stillMissing = batchEpisodes
          .map((ep) => ep.number)
          .filter((n) => !updatedDirectory.find((u) => u.number === n)?.outline?.trim());
        setOutlineBatches((prev) =>
          prev.map((b, i) =>
            i === bIdx
              ? stillMissing.length === 0
                ? { ...b, status: "done" }
                : { ...b, status: "failed", error: `缺失细纲：第 ${stillMissing.join(", ")} 集` }
              : b,
          ),
        );
      } catch (e: any) {
        if (e?.message?.includes("取消") || e?.name === "AbortError") {
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

    const model = readStoredDecomposeModel();
    const batchEpisodes = directory.filter(ep => ep.number >= batch.startEp && ep.number <= batch.endEp);
    const prompt = buildOutlinePrompt(
      setup, creativePlan, characters,
      batchEpisodes.map(ep => ({ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType })),
      directoryRaw,
    );

    try {
      const result = await callGeminiStreamWithTimeout(
        model,
        prompt,
        outlineAbortRef.current!.signal,
        8192,
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

  /** Regenerate a single episode outline with optional user instruction */
  const handleSingleRegen = async (epNum: number) => {
    const ep = directory.find(e => e.number === epNum);
    if (!ep) return;

    setRegenEpNum(epNum);
    singleAbortRef.current = new AbortController();

    const model = readStoredDecomposeModel();
    const instruction = regenInstructions[epNum]?.trim();
    
    // Build prompt for single episode with optional instruction
    let prompt = buildOutlinePrompt(
      setup, creativePlan, characters,
      [{ number: ep.number, title: ep.title, summary: ep.summary, hookType: ep.hookType }],
      directoryRaw,
    );
    if (instruction) {
      prompt += `\n\n## 特别要求\n用户对本集细纲有如下调整要求，请在生成时重点满足：\n${instruction}`;
    }
    if (ep.outline) {
      prompt += `\n\n## 原有细纲（供参考改进）\n${ep.outline}`;
    }

    try {
      const result = await callGeminiStreamWithTimeout(
        model,
        prompt,
        singleAbortRef.current!.signal,
        4096,
      );

      const outlines = parseOutlines(result);
      const newOutline = outlines.get(epNum);
      if (newOutline) {
        const updatedDirectory = directory.map(d =>
          d.number === epNum ? { ...d, outline: newOutline } : d
        );
        onUpdate(updatedDirectory, directoryRaw);
        toast({ title: `第${epNum}集细纲已重新生成` });
      } else {
        toast({ title: "未能解析生成结果", variant: "destructive" });
      }
    } catch (e: any) {
      if (!e?.message?.includes("取消")) {
        toast({ title: "重新生成失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setRegenEpNum(null);
      singleAbortRef.current = null;
    }
  };

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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                        <div className="ml-14 mr-4 mb-2">
                          {showTranslation && hasTranslation(allOutlinesText) ? (
                            <div className="px-3 py-2 rounded bg-muted/30 border border-border/50 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                              <InterleavedText text={ep.outline} translatedLines={epTranslationSlices.get(ep.number) || []} />
                            </div>
                          ) : (
                            <textarea
                              className="w-full rounded bg-muted/30 border border-border/50 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed px-3 py-2 resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
                              value={ep.outline}
                              onChange={(e) => {
                                const updatedDirectory = directory.map(d =>
                                  d.number === ep.number ? { ...d, outline: e.target.value } : d
                                );
                                onUpdate(updatedDirectory, directoryRaw);
                              }}
                              rows={Math.max(4, (ep.outline?.split("\n").length || 4))}
                            />
                          )}
                        </div>
                        {/* Per-episode regen button with inline instruction input */}
                        <div className="ml-14 mr-4 mb-2 flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-xs h-7 shrink-0"
                            disabled={isGeneratingOutlines || regenEpNum !== null}
                            onClick={() => handleSingleRegen(ep.number)}
                          >
                            {regenEpNum === ep.number ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            {regenEpNum === ep.number ? "生成中…" : "重新生成"}
                          </Button>
                          <Input
                            className="h-7 text-xs flex-1"
                            placeholder="输入调整指令，如：加强冲突…"
                            value={regenInstructions[ep.number] || ""}
                            onChange={e => setRegenInstructions(prev => ({ ...prev, [ep.number]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSingleRegen(ep.number);
                              }
                            }}
                            disabled={isGeneratingOutlines || regenEpNum !== null}
                          />
                          {regenEpNum === ep.number && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive shrink-0"
                              onClick={() => singleAbortRef.current?.abort()}
                            >
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              停止
                            </Button>
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
