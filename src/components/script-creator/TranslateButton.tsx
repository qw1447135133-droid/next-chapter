import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Languages, Loader2, X, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { readStoredDecomposeModel } from "@/lib/gemini-text-models";
import { motion, AnimatePresence } from "framer-motion";

const TRANSLATION_CACHE_KEY = "storyforge_translation_cache";
const MAX_CACHE_ENTRIES = 30;
const LINES_PER_BATCH = 200;

/** Simple hash for cache key */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/** Read cache from localStorage */
function readCache(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write cache to localStorage, evicting old entries */
function writeCache(cache: Record<string, string[]>) {
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    const toRemove = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
    for (const k of toRemove) delete cache[k];
  }
  try {
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    localStorage.removeItem(TRANSLATION_CACHE_KEY);
  }
}

/**
 * Animated progress with creep + one decimal place.
 * Matches DecomposeProgress logic.
 */
function useAnimatedProgress(ceilPercent: number, floorPercent: number, hasProcessing: boolean) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const lastTimeRef = useRef(performance.now());
  const prevCeilRef = useRef(ceilPercent);

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
        const hardCap = Math.max(0, ceilPercent - 0.1);

        if (!hasProcessing && !ceilDropped) {
          if (prev > floorPercent) {
            const diff = prev - floorPercent;
            const rollSpeed = Math.max(1, diff * 0.08) * 12;
            return Math.max(prev - rollSpeed * dt, floorPercent);
          }
          return floorPercent;
        }

        if (prev > hardCap) {
          const diff = prev - hardCap;
          const rollSpeed = Math.max(1, diff * 0.08) * 12;
          return Math.max(prev - rollSpeed * dt, hardCap);
        }

        const base = Math.max(prev, floorPercent);
        const gap = hardCap - base;
        if (gap <= 0) return hardCap;

        const chunkRange = ceilPercent - floorPercent;
        const baseSpeed = chunkRange > 0 ? chunkRange / 75 : 0.2;
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

  useEffect(() => {
    setDisplay(prev => Math.max(prev, floorPercent));
  }, [floorPercent]);

  return Math.round(display * 10) / 10;
}

export interface TranslationProgress {
  done: number;
  total: number;
  processing: boolean;
  failed?: boolean;
}

interface ResumeState {
  text: string;
  key: string;
  resultLines: string[];
  startBatch: number;
  totalBatches: number;
}

/**
 * Shared translation hook with localStorage caching, chunked translation, and resume support.
 */
export function useTranslation() {
  const [translatedMap, setTranslatedMap] = useState<Map<string, string[]>>(new Map());
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress>({ done: 0, total: 0, processing: false });
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<ResumeState | null>(null);

  const runTranslation = async (text: string, startBatch: number, existingResults?: string[]) => {
    const key = hashText(text);
    const model = readStoredDecomposeModel();
    const originalLines = text.split("\n");
    const totalLines = originalLines.length;
    const resultLines = existingResults || new Array<string>(totalLines).fill("");
    const totalBatches = Math.ceil(totalLines / LINES_PER_BATCH);

    setIsTranslating(true);
    setShowTranslation(true);
    abortRef.current = new AbortController();
    resumeRef.current = null;

    try {
      if (totalBatches <= 1) {
        setProgress({ done: 0, total: 1, processing: true });
        const batchResult = await translateBatch(model, originalLines, 0, totalLines, abortRef.current.signal);
        for (let i = 0; i < batchResult.length; i++) {
          resultLines[i] = batchResult[i];
        }
        setProgress({ done: 1, total: 1, processing: false });
      } else {
        setProgress({ done: startBatch, total: totalBatches, processing: true });

        for (let batch = startBatch; batch < totalBatches; batch++) {
          if (abortRef.current?.signal.aborted) break;

          setProgress({ done: batch, total: totalBatches, processing: true });

          const startLine = batch * LINES_PER_BATCH;
          const endLine = Math.min(startLine + LINES_PER_BATCH, totalLines);
          const batchLines = originalLines.slice(startLine, endLine);

          const batchResult = await translateBatch(model, batchLines, 0, batchLines.length, abortRef.current!.signal);

          for (let i = 0; i < batchResult.length; i++) {
            resultLines[startLine + i] = batchResult[i];
          }

          setProgress({ done: batch + 1, total: totalBatches, processing: batch + 1 < totalBatches });
        }
      }

      if (abortRef.current?.signal.aborted) {
        toast({ title: "已停止翻译" });
        // Save resume state for manual stop
        const doneBatches = Math.max(startBatch, ...Array.from({ length: totalBatches }, (_, i) => {
          const sl = i * LINES_PER_BATCH;
          return resultLines[sl]?.trim() ? i + 1 : 0;
        }));
        if (doneBatches < totalBatches) {
          resumeRef.current = { text, key, resultLines: [...resultLines], startBatch: doneBatches, totalBatches };
          setProgress({ done: doneBatches, total: totalBatches, processing: false, failed: true });
        }
        return;
      }

      // Save to in-memory and localStorage
      setTranslatedMap((prev) => new Map(prev).set(key, resultLines));
      const updatedCache = readCache();
      updatedCache[key] = resultLines;
      writeCache(updatedCache);

      toast({ title: "翻译完成" });
      resumeRef.current = null;
      setProgress({ done: 0, total: 0, processing: false });
    } catch (e: any) {
      if (e?.message?.includes("取消") || e?.name === "AbortError") {
        toast({ title: "已停止翻译" });
      } else {
        toast({ title: "翻译失败", description: e?.message, variant: "destructive" });
      }
      // Calculate how many batches completed successfully
      const doneBatches = Math.max(startBatch, ...Array.from({ length: totalBatches }, (_, i) => {
        const sl = i * LINES_PER_BATCH;
        return resultLines[sl]?.trim() ? i + 1 : 0;
      }));
      if (doneBatches < totalBatches && doneBatches > 0) {
        resumeRef.current = { text, key, resultLines: [...resultLines], startBatch: doneBatches, totalBatches };
        setProgress({ done: doneBatches, total: totalBatches, processing: false, failed: true });
        // Show partial results
        setTranslatedMap((prev) => new Map(prev).set(key, [...resultLines]));
      } else {
        setProgress({ done: 0, total: 0, processing: false });
        setShowTranslation(false);
      }
    } finally {
      setIsTranslating(false);
      abortRef.current = null;
    }
  };

  const translate = async (text: string) => {
    if (!text.trim()) return;

    const key = hashText(text);

    // Check in-memory first
    if (translatedMap.has(key)) {
      setShowTranslation((v) => !v);
      return;
    }

    // Check localStorage cache
    const cache = readCache();
    if (cache[key]) {
      const cached = cache[key];
      setTranslatedMap((prev) => new Map(prev).set(key, cached));
      setShowTranslation(true);
      toast({ title: "翻译已加载（缓存）" });
      return;
    }

    resumeRef.current = null;
    await runTranslation(text, 0);
  };

  const resumeTranslation = useCallback(async () => {
    const state = resumeRef.current;
    if (!state) return;
    await runTranslation(state.text, state.startBatch, [...state.resultLines]);
  }, []);

  const canResume = !isTranslating && resumeRef.current !== null;

  const stopTranslation = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearTranslation = () => {
    setShowTranslation(false);
    resumeRef.current = null;
    setProgress({ done: 0, total: 0, processing: false });
  };

  const getTranslation = (text: string): string[] | undefined => {
    return translatedMap.get(hashText(text));
  };

  const hasTranslation = (text: string): boolean => {
    return translatedMap.has(hashText(text));
  };

  return {
    isTranslating,
    showTranslation,
    translate,
    stopTranslation,
    clearTranslation,
    getTranslation,
    hasTranslation,
    progress,
    canResume,
    resumeTranslation,
  };
}

/** Translate a batch of lines using numbered format */
async function translateBatch(
  model: string,
  lines: string[],
  _startIdx: number,
  _endIdx: number,
  signal: AbortSignal,
): Promise<string[]> {
  const numberedText = lines.map((line, i) => `[${i + 1}] ${line}`).join("\n");

  const prompt = `你是一位专业的翻译。请将以下外语文本逐行翻译为中文。

## 严格规则
1. 原文共 ${lines.length} 行，你必须输出恰好 ${lines.length} 行翻译
2. 每行格式为 [行号] 翻译内容，例如 [1] 这是翻译
3. 空行也要保留，输出 [行号]（后面留空）
4. 保留 Markdown 标记（## # ** 等）
5. 保留特殊符号（🔥 ⚡ 💰 ⛔ ⚠️ ℹ️ 等）
6. 只输出翻译行，不要输出任何解释或额外文字

## 原文（${lines.length} 行）
${numberedText}`;

  const finalText = await callGeminiStream(
    model,
    [{ role: "user", parts: [{ text: prompt }] }],
    () => {},
    { maxOutputTokens: 8192 },
    signal,
  );

  const resultLines = new Array<string>(lines.length).fill("");
  const outputLines = finalText.split("\n");

  for (const line of outputLines) {
    const match = line.match(/^\[(\d+)\]\s?(.*)/);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (idx >= 0 && idx < lines.length) {
        resultLines[idx] = match[2] || "";
      }
    }
  }

  return resultLines;
}

/** Render interleaved original + translated lines */
export function InterleavedText({
  text,
  translatedLines,
}: {
  text: string;
  translatedLines: string[];
}) {
  const originalLines = text.split("\n");

  return (
    <div>
      {originalLines.map((line, i) => (
        <div key={i}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 py-0.5">
            {line || "\u00A0"}
          </div>
          {translatedLines[i] !== undefined && translatedLines[i].trim() !== "" && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-sm mb-1">
              {translatedLines[i]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Translation progress bar — decompose-style with animated creep + resume button */
export function TranslationProgress({
  progress,
  canResume,
  onResume,
}: {
  progress: TranslationProgress;
  canResume?: boolean;
  onResume?: () => void;
}) {
  const { done, total, processing, failed } = progress;
  if (total <= 1 && !failed) return null;

  const ceilPercent = total > 0 ? ((done + (processing ? 1 : 0)) / total) * 100 : 0;
  const floorPercent = total > 0 ? (done / total) * 100 : 0;
  const percent = useAnimatedProgress(ceilPercent, floorPercent, processing);
  const isComplete = done === total && !processing && !failed;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">翻译进度</span>
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
              <CheckCircle2 className="h-3 w-3" />
              翻译完成
            </motion.span>
          ) : failed ? (
            <motion.span
              key="failed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-destructive tabular-nums"
            >
              {done}/{total} 段（已中断）
              <span className="ml-2 font-semibold">{percent.toFixed(1)}%</span>
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
              {done}/{total} 段
              <span className="ml-2 font-semibold text-foreground">{percent.toFixed(1)}%</span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <Progress value={percent} className="h-2" />
      {canResume && onResume && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResume}
          className="gap-1.5 w-full mt-1"
        >
          <PlayCircle className="h-3.5 w-3.5" />
          继续翻译（从第 {done + 1} 段）
        </Button>
      )}
    </div>
  );
}

/** Translation toggle button */
export function TranslateToggle({
  isNonChinese,
  isTranslating,
  showTranslation,
  onTranslate,
  onClear,
  onStop,
  disabled,
}: {
  isNonChinese: boolean;
  isTranslating: boolean;
  showTranslation: boolean;
  onTranslate: () => void;
  onClear: () => void;
  onStop?: () => void;
  disabled?: boolean;
}) {
  if (!isNonChinese) return null;

  return isTranslating ? (
    <Button
      variant="destructive"
      size="sm"
      onClick={onStop}
      className="gap-1.5"
      disabled={disabled}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      停止翻译
    </Button>
  ) : showTranslation ? (
    <Button
      variant="outline"
      size="sm"
      onClick={onClear}
      className="gap-1.5"
      disabled={disabled}
    >
      <X className="h-3.5 w-3.5" />
      关闭翻译
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      onClick={onTranslate}
      disabled={disabled}
      className="gap-1.5"
    >
      <Languages className="h-3.5 w-3.5" />
      翻译
    </Button>
  );
}

/** Detect if text is primarily non-Chinese */
export function isNonChineseText(text: string): boolean {
  if (!text || text.length < 20) return false;
  const sample = text.slice(0, 500);
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const ratio = chineseChars / sample.length;
  return ratio < 0.15;
}
