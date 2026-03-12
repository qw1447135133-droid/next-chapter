import { useState, useRef, useMemo } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Loader2, Play, Check, Square, RefreshCw, History, ChevronDown, ChevronUp, Trash2, ClipboardCheck, X, Wrench, BarChart3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildEpisodePrompt, buildSceneRegenPrompt, buildReviewPrompt, getDurationConstraints } from "@/lib/drama-prompts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { DramaSetup, EpisodeEntry, EpisodeScript, EpisodeVersion } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

interface ReviewScore {
  score: number;
  comment: string;
}

interface ReviewResult {
  scores: {
    rhythm: ReviewScore;
    satisfaction: ReviewScore;
    dialogue: ReviewScore;
    format: ReviewScore;
    continuity: ReviewScore;
  };
  total: number;
  grade: string;
  highlights: string[];
  issues: { level: string; description: string }[];
  suggestions: string[];
}

interface StepEpisodeProps {
  setup: DramaSetup;
  characters: string;
  directory: EpisodeEntry[];
  episodes: EpisodeScript[];
  onUpdate: (episodes: EpisodeScript[]) => void;
  onNext: () => void;
}

/** Parse episode content into scenes by splitting on scene headers like "# N-M ..." or "## 场次..." */
function parseScenes(content: string): { header: string; body: string }[] {
  // Match both new format "# N-M ..." and legacy "## 场次..." headers
  const sceneRegex = /^(#\s*\d+-\d+\s+.*)$|^(##\s*场次.*)$/gm;
  const matches = [...content.matchAll(sceneRegex)];
  if (matches.length === 0) return [];

  const scenes: { header: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const block = content.slice(start, end).trim();
    const headerEnd = block.indexOf("\n");
    scenes.push({
      header: headerEnd > 0 ? block.slice(0, headerEnd).trim() : block.trim(),
      body: headerEnd > 0 ? block.slice(headerEnd).trim() : "",
    });
  }
  return scenes;
}

/** Get the content before the first scene (metadata/header) */
function getEpisodePreamble(content: string): string {
  const firstScene = content.match(/^#\s*\d+-\d+\s+/m) || content.match(/^##\s*场次/m);
  if (!firstScene || firstScene.index === undefined) return content;
  return content.slice(0, firstScene.index).trim();
}

/** Get the content after the last scene (hooks/preview) */
function getEpisodePostamble(content: string): string {
  const sceneRegex = /^(?:#\s*\d+-\d+\s+|##\s*场次)/gm;
  const matches = [...content.matchAll(sceneRegex)];
  if (matches.length === 0) return "";
  const lastMatch = matches[matches.length - 1];
  const afterLastScene = content.slice(lastMatch.index!);
  const hookMatch = afterLastScene.match(/\n>\s*🎣/);
  if (hookMatch && hookMatch.index !== undefined) {
    return afterLastScene.slice(hookMatch.index).trim();
  }
  return "";
}

const StepEpisode = ({ setup, characters, directory, episodes, onUpdate, onNext }: StepEpisodeProps) => {
  // Fallback: if directory is empty (e.g. adaptation mode), generate placeholder entries from totalEpisodes
  const displayDirectory: EpisodeEntry[] = useMemo(() => {
    if (directory.length > 0) return directory;
    const total = setup.totalEpisodes || 60;
    return Array.from({ length: total }, (_, i) => ({
      number: i + 1,
      title: `第${i + 1}集`,
      summary: "",
      hookType: "",
      isKey: false,
      isClimax: false,
      isPaywall: false,
    }));
  }, [directory, setup.totalEpisodes]);

  const completedNums = new Set(episodes.map((e) => e.number));
  /** Check if an episode is locked (previous episode not yet generated) */
  const isLocked = (num: number) => num > 1 && !completedNums.has(num - 1);
  const nextUnwritten = displayDirectory.find(d => !completedNums.has(d.number))?.number;
  const [rangeInput, setRangeInput] = useState(String(nextUnwritten || 1));
  const [durationOption, setDurationOption] = useState("90");
  const [customDuration, setCustomDuration] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGen, setCurrentGen] = useState<number | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [selectedEp, setSelectedEp] = useState<number | null>(null);
  const [regenSceneIdx, setRegenSceneIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [episodeRegenInstruction, setEpisodeRegenInstruction] = useState("");
  const [sceneRegenInstructions, setSceneRegenInstructions] = useState<Record<number, string>>({});
  const [hoverEpisodeRegen, setHoverEpisodeRegen] = useState(false);
  const [hoverSceneIdx, setHoverSceneIdx] = useState<number | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewEpNum, setReviewEpNum] = useState<number | null>(null);
  // Batch review state
  const [batchReviewResults, setBatchReviewResults] = useState<Map<number, ReviewResult>>(new Map());
  const [isBatchReviewing, setIsBatchReviewing] = useState(false);
  const [batchReviewProgress, setBatchReviewProgress] = useState<{ current: number; total: number; epNum: number | null }>({ current: 0, total: 0, epNum: null });
  const [showBatchReviewDialog, setShowBatchReviewDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useAutoScroll<HTMLDivElement>(isGenerating && regenSceneIdx == null, streamingText);
  const batchAbortRef = useRef<AbortController | null>(null);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();

  const DIMENSION_LABELS: Record<string, string> = {
    rhythm: "节奏",
    satisfaction: "爽点",
    dialogue: "台词",
    format: "格式",
    continuity: "连贯性",
  };

  const getGradeColor = (grade: string) => {
    if (grade === "卓越") return "text-green-500";
    if (grade === "优良") return "text-blue-500";
    if (grade === "合格") return "text-yellow-500";
    if (grade === "需改进") return "text-orange-500";
    return "text-destructive";
  };

  const handleReview = async (epNum: number) => {
    const ep = episodes.find(e => e.number === epNum);
    if (!ep) return;

    setReviewEpNum(epNum);
    setIsReviewing(true);
    setReviewResult(null);
    setShowReviewDialog(true);

    try {
      const prevEp = episodes.find(e => e.number === epNum - 1);
      const nextEp = episodes.find(e => e.number === epNum + 1);

      const prompt = buildReviewPrompt(
        setup, characters, displayDirectory, epNum, ep.content,
        prevEp?.content, nextEp?.content,
      );
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 4096 },
      );

      // Extract JSON from response
      const jsonMatch = finalText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("未能解析评分结果");
      const result: ReviewResult = JSON.parse(jsonMatch[0]);
      setReviewResult(result);
    } catch (e: any) {
      toast({ title: "质量审查失败", description: e?.message, variant: "destructive" });
      setShowReviewDialog(false);
    } finally {
      setIsReviewing(false);
    }
  };

  /** Batch review all completed episodes */
  const handleBatchReview = async () => {
    const completedEps = episodes.filter(e => e.content).sort((a, b) => a.number - b.number);
    if (completedEps.length === 0) {
      toast({ title: "没有已撰写的集数可审查", variant: "destructive" });
      return;
    }

    setIsBatchReviewing(true);
    setBatchReviewResults(new Map());
    setBatchReviewProgress({ current: 0, total: completedEps.length, epNum: null });
    setShowBatchReviewDialog(true);
    batchAbortRef.current = new AbortController();

    const results = new Map<number, ReviewResult>();
    const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";

    for (let i = 0; i < completedEps.length; i++) {
      if (batchAbortRef.current?.signal.aborted) break;
      const ep = completedEps[i];
      setBatchReviewProgress({ current: i + 1, total: completedEps.length, epNum: ep.number });

      try {
        const prevEp = episodes.find(e => e.number === ep.number - 1);
        const nextEp = episodes.find(e => e.number === ep.number + 1);
        const prompt = buildReviewPrompt(
          setup, characters, displayDirectory, ep.number, ep.content,
          prevEp?.content, nextEp?.content,
        );
        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          () => {},
          { maxOutputTokens: 4096 },
          batchAbortRef.current.signal,
        );
        const jsonMatch = finalText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result: ReviewResult = JSON.parse(jsonMatch[0]);
          results.set(ep.number, result);
          setBatchReviewResults(new Map(results));
        }
      } catch (e: any) {
        if (e?.message?.includes("取消") || e?.name === "AbortError") break;
        console.error(`批量审查第${ep.number}集失败:`, e);
      }
    }

    setIsBatchReviewing(false);
    batchAbortRef.current = null;
  };

  const parseRange = (input: string): number[] => {
    const parts = input.split(/[,，]/);
    const nums: number[] = [];
    for (const part of parts) {
      const rangeMatch = part.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        for (let i = start; i <= end; i++) nums.push(i);
      } else {
        const n = parseInt(part.trim());
        if (!isNaN(n)) nums.push(n);
      }
    }
    return [...new Set(nums)].sort((a, b) => a - b);
  };

  /** Save current content as a history version before overwriting */
  const pushHistory = (ep: EpisodeScript, label: string): EpisodeVersion[] => {
    const prev: EpisodeVersion = {
      content: ep.content,
      wordCount: ep.wordCount,
      timestamp: new Date().toISOString(),
      label,
    };
    const history = [...(ep.history || []), prev];
    // Keep only the last 10 versions
    return history.slice(-10);
  };

  const handleGenerate = async (overrideRange?: string, overrideInstruction?: string) => {
    const nums = parseRange(overrideRange || rangeInput);
    const instruction = overrideInstruction ?? episodeRegenInstruction;
    if (nums.length === 0) {
      toast({ title: "请输入有效的集数", variant: "destructive" });
      return;
    }

    // Check prerequisites: for the first episode in range, previous must exist (unless it's ep 1 or already completed)
    const currentCompleted = new Set(episodes.map(e => e.number));
    const firstBlocked = nums.find(n => n > 1 && !currentCompleted.has(n - 1) && !currentCompleted.has(n) && !nums.includes(n - 1));
    if (firstBlocked) {
      toast({ title: `无法生成第 ${firstBlocked} 集`, description: `请先生成第 ${firstBlocked - 1} 集，需要按顺序生成以保证剧情连贯`, variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    abortRef.current = new AbortController();
    const updatedEpisodes = [...episodes];

    for (const num of nums) {
      if (abortRef.current?.signal.aborted) break;
      setCurrentGen(num);
      setStreamingText("");
      try {
        const previousContent = updatedEpisodes
          .filter((ep) => ep.number < num)
          .sort((a, b) => b.number - a.number)
          .slice(0, 2)
          .reverse()
          .map((ep) => `--- 第${ep.number}集 ---\n${ep.content.slice(-800)}`)
          .join("\n\n");

        const effectiveDuration = durationOption === "custom" ? parseInt(customDuration) || 90 : parseInt(durationOption);
        const prompt = buildEpisodePrompt(setup, characters, displayDirectory, num, previousContent, instruction.trim() || undefined, effectiveDuration);
        const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          (chunk) => setStreamingText(chunk),
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );

        const epEntry = displayDirectory.find((d) => d.number === num);
        const existing = updatedEpisodes.find((e) => e.number === num);
        const history = existing ? pushHistory(existing, "整集重写") : [];

        const newEp: EpisodeScript = {
          number: num,
          title: epEntry?.title || `第${num}集`,
          content: finalText,
          wordCount: finalText.length,
          history,
        };

        const existIdx = updatedEpisodes.findIndex((e) => e.number === num);
        if (existIdx >= 0) updatedEpisodes[existIdx] = newEp;
        else updatedEpisodes.push(newEp);

        onUpdate([...updatedEpisodes]);
        toast({ title: `第 ${num} 集撰写完成（${finalText.length}字）` });
      } catch (e: any) {
        if (e?.message?.includes("取消")) {
          const partial = streamingText;
          if (partial) {
            const epEntry = displayDirectory.find((d) => d.number === num);
            const existing = updatedEpisodes.find((e) => e.number === num);
            const history = existing ? pushHistory(existing, "整集重写（中断）") : [];
            const newEp: EpisodeScript = {
              number: num,
              title: epEntry?.title || `第${num}集`,
              content: partial,
              wordCount: partial.length,
              history,
            };
            const existIdx = updatedEpisodes.findIndex((e) => e.number === num);
            if (existIdx >= 0) updatedEpisodes[existIdx] = newEp;
            else updatedEpisodes.push(newEp);
            onUpdate([...updatedEpisodes]);
          }
          toast({ title: "已停止生成" });
        } else {
          toast({ title: `第 ${num} 集生成失败`, description: e?.message, variant: "destructive" });
        }
        break;
      }
    }

    setCurrentGen(null);
    setStreamingText("");
    setIsGenerating(false);
    abortRef.current = null;
  };

  /** Regenerate a single scene within an episode */
  const handleSceneRegen = async (sceneIndex: number) => {
    if (!selectedEp || !selectedScript) return;
    const scenes = parseScenes(selectedScript.content);
    if (sceneIndex >= scenes.length) return;

    const sceneContent = `${scenes[sceneIndex].header}\n${scenes[sceneIndex].body}`;
    setIsGenerating(true);
    setRegenSceneIdx(sceneIndex);
    setStreamingText("");
    abortRef.current = new AbortController();

    try {
      const prompt = buildSceneRegenPrompt(
        setup, characters, selectedEp, selectedScript.content, sceneIndex, sceneContent, (sceneRegenInstructions[sceneIndex] || "").trim() || undefined,
      );
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const newSceneText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 4096 },
        abortRef.current.signal,
      );

      // Rebuild content by replacing the scene
      const preamble = getEpisodePreamble(selectedScript.content);
      const newScenes = [...scenes];
      // Parse the new scene text
      const newHeader = newSceneText.match(/^##\s*场次.*/m)?.[0] || scenes[sceneIndex].header;
      const newBody = newSceneText.replace(/^##\s*场次.*\n?/m, "").trim();
      newScenes[sceneIndex] = { header: newHeader, body: newBody };

      const postamble = getEpisodePostamble(selectedScript.content);
      const rebuiltContent = [
        preamble,
        "",
        ...newScenes.map((s) => `${s.header}\n\n${s.body}`),
        "",
        postamble,
      ].filter(Boolean).join("\n\n");

      const history = pushHistory(selectedScript, `场次${sceneIndex + 1}重写`);
      const updatedEp: EpisodeScript = {
        ...selectedScript,
        content: rebuiltContent,
        wordCount: rebuiltContent.length,
        history,
      };

      const updatedEpisodes = episodes.map((e) =>
        e.number === selectedEp ? updatedEp : e,
      );
      onUpdate(updatedEpisodes);
      toast({ title: `场次${sceneIndex + 1} 重写完成` });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        toast({ title: "已停止生成" });
      } else {
        toast({ title: `场次重写失败`, description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsGenerating(false);
      setRegenSceneIdx(null);
      setStreamingText("");
      abortRef.current = null;
    }
  };

  /** Restore a historical version */
  const handleRestoreVersion = (versionIndex: number) => {
    if (!selectedScript || !selectedScript.history) return;
    const version = selectedScript.history[versionIndex];
    // Restore without adding a new history entry
    const updatedEp: EpisodeScript = {
      ...selectedScript,
      content: version.content,
      wordCount: version.wordCount,
    };
    const updatedEpisodes = episodes.map((e) =>
      e.number === selectedEp ? updatedEp : e,
    );
    onUpdate(updatedEpisodes);
    setShowHistory(false);
    toast({ title: `已恢复到历史版本` });
  };

  const handleStop = () => abortRef.current?.abort();

  const selectedScript = episodes.find((e) => e.number === selectedEp);
  const scenes = selectedScript ? parseScenes(selectedScript.content) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            分集撰写
            <span className="text-sm font-normal text-muted-foreground ml-2">
              已完成 {episodes.length}/{setup.totalEpisodes} 集
            </span>
          </CardTitle>
          {episodes.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBatchReview}
              disabled={isGenerating || isBatchReviewing}
              className="gap-1.5"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {isBatchReviewing ? "审查中…" : "批量质量审查"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-sm mb-1.5 block">生成集数（支持范围如 1-5，或逗号分隔如 1,3,5）</Label>
              <Input
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="例如：1-5"
                disabled={isGenerating}
              />
            </div>
            <div className="min-w-[140px]">
              <Label className="text-sm mb-1.5 block">单集时长</Label>
              <div className="flex gap-2">
                <Select value={durationOption} onValueChange={(v) => setDurationOption(v)} disabled={isGenerating}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">60秒</SelectItem>
                    <SelectItem value="90">90秒</SelectItem>
                    <SelectItem value="120">120秒</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
                {durationOption === "custom" && (
                  <Input
                    type="number"
                    min={30}
                    max={600}
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="秒"
                    className="w-[80px]"
                    disabled={isGenerating}
                  />
                )}
              </div>
              {(() => {
                const dur = durationOption === "custom" ? parseInt(customDuration) || 90 : parseInt(durationOption);
                const c = getDurationConstraints(dur);
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    △ {c.triangleMin}-{c.triangleMax}个 · 台词≤{c.maxDialogues}句
                  </p>
                );
              })()}
            </div>
            {isGenerating ? (
              <Button variant="destructive" onClick={handleStop} className="gap-2">
                <Square className="h-4 w-4" />
                停止
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => handleGenerate()} className="gap-2">
                  <Play className="h-4 w-4" />
                  开始撰写
                </Button>
                {nextUnwritten && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRangeInput(String(nextUnwritten));
                      handleGenerate(String(nextUnwritten));
                    }}
                    className="gap-2"
                  >
                    <ArrowRight className="h-4 w-4" />
                    续写第{nextUnwritten}集
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 集数列表 */}
          <div className="flex flex-wrap gap-1.5">
            {displayDirectory.map((ep) => {
              const done = completedNums.has(ep.number);
              const active = selectedEp === ep.number;
              const generating = currentGen === ep.number;
              const locked = isLocked(ep.number) && !done;
              return (
                <button
                  key={ep.number}
                  onClick={() => {
                    if (locked) {
                      toast({ title: `请先生成第 ${ep.number - 1} 集`, description: "需要按顺序生成剧本以保证剧情连贯", variant: "destructive" });
                      return;
                    }
                    const next = ep.number === selectedEp ? null : ep.number;
                    setSelectedEp(next);
                    if (next != null) {
                      setRangeInput(String(next));
                    }
                    setShowHistory(false);
                  }}
                  className={`w-9 h-9 rounded text-xs font-mono flex items-center justify-center border transition-all ${
                    locked
                      ? "border-border bg-muted text-muted-foreground/40 cursor-not-allowed"
                      : generating
                      ? "border-primary bg-primary/20 animate-pulse cursor-pointer"
                      : done
                      ? active
                        ? "border-primary bg-primary text-primary-foreground cursor-pointer"
                        : "border-accent bg-accent/10 text-accent-foreground hover:bg-accent/20 cursor-pointer"
                      : active
                        ? "border-primary bg-primary/10 text-primary cursor-pointer"
                        : "border-border text-muted-foreground hover:border-muted-foreground/50 cursor-pointer"
                  }`}
                  title={locked ? `需先生成第${ep.number - 1}集` : `第${ep.number}集：${ep.title}`}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    ep.number
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 流式输出预览 — only for full episode generation, not scene regen */}
      {isGenerating && regenSceneIdx == null && streamingText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              正在撰写第 {currentGen} 集…
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {streamingText.length} 字
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={scrollRef} className="h-[400px] overflow-auto">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已完成的集预览 */}
      {selectedEp != null && !(isGenerating && regenSceneIdx == null) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              第 {selectedEp} 集：{selectedScript?.title || displayDirectory.find(d => d.number === selectedEp)?.title || `第${selectedEp}集`}
              {selectedScript && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {selectedScript.wordCount} 字
                </span>
              )}
            </CardTitle>
            {selectedScript && (
              <div
                className="relative flex gap-2"
                onMouseEnter={() => setHoverEpisodeRegen(true)}
                onMouseLeave={() => setHoverEpisodeRegen(false)}
              >
                <TranslateToggle
                  isNonChinese={isNonChineseText(selectedScript.content)}
                  isTranslating={isTranslating}
                  showTranslation={showTranslation}
                  onTranslate={() => translate(selectedScript.content)}
                  onClear={clearTranslation}
                  onStop={stopTranslation}
                />
                {(selectedScript.history?.length ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowHistory(!showHistory)}
                    className="gap-1.5"
                  >
                    <History className="h-3.5 w-3.5" />
                    历史 ({selectedScript.history!.length})
                    {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReview(selectedEp!)}
                  disabled={isGenerating || isReviewing}
                  className="gap-1.5"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  {isReviewing && reviewEpNum === selectedEp ? "审查中…" : "质量自检"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRangeInput(String(selectedEp));
                    handleGenerate(String(selectedEp));
                  }}
                  disabled={isGenerating}
                  className="gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新生成
                </Button>
                {hoverEpisodeRegen && (
                  <div className="absolute top-full right-0 pt-1 z-10">
                    <div className="bg-popover border rounded-lg shadow-lg p-2 min-w-[300px]">
                      <Input
                        value={episodeRegenInstruction}
                        onChange={(e) => setEpisodeRegenInstruction(e.target.value)}
                        placeholder="整集重写指令（如：加强冲突感、调整节奏…）"
                        className="text-xs h-8"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {/* History panel */}
            {showHistory && selectedScript?.history && selectedScript.history.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">历史版本</p>
                {[...selectedScript.history].reverse().map((ver, idx) => {
                  const realIdx = selectedScript.history!.length - 1 - idx;
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex-1">
                        <span className="text-muted-foreground text-xs">
                          {new Date(ver.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="ml-2 text-xs">{ver.label || "版本"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{ver.wordCount}字</span>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestoreVersion(realIdx)}
                          className="h-7 text-xs"
                        >
                          恢复
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newHistory = selectedScript.history!.filter((_, i) => i !== realIdx);
                            const updatedEp = { ...selectedScript, history: newHistory };
                            onUpdate(episodes.map(e => e.number === selectedEp ? updatedEp : e));
                            if (newHistory.length === 0) setShowHistory(false);
                          }}
                          className="h-7 text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}

            {selectedScript ? (
            <>
              {/* Translation interleaved view */}
              {showTranslation && hasTranslation(selectedScript.content) ? (
                <div className="max-h-[600px] overflow-auto">
                  <InterleavedText text={selectedScript.content} translatedLines={getTranslation(selectedScript.content)!} />
                </div>
              ) : scenes.length > 0 ? (
                  <div className="space-y-4">
                    {/* Preamble */}
                    {(() => {
                      const preamble = getEpisodePreamble(selectedScript.content);
                      return preamble ? (
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                          {preamble}
                        </pre>
                      ) : null;
                    })()}

                    {/* Scenes */}
                    {scenes.map((scene, idx) => (
                      <div key={idx} className="group relative border rounded-lg p-4 hover:border-primary/30 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">{scene.header.replace(/^##\s*/, "")}</span>
                          {regenSceneIdx === idx ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              重写中…
                            </span>
                          ) : (
                            <div
                              className="relative"
                              onMouseEnter={() => setHoverSceneIdx(idx)}
                              onMouseLeave={() => setHoverSceneIdx(null)}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSceneRegen(idx)}
                                disabled={isGenerating}
                                className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 h-7 text-xs"
                              >
                                <RefreshCw className="h-3 w-3" />
                                重写场次
                              </Button>
                              {hoverSceneIdx === idx && (
                                <div className="absolute top-full right-0 pt-1 z-10">
                                  <div className="bg-popover border rounded-lg shadow-lg p-2 min-w-[260px]">
                                    <Input
                                      value={sceneRegenInstructions[idx] || ""}
                                      onChange={(e) => setSceneRegenInstructions(prev => ({ ...prev, [idx]: e.target.value }))}
                                      placeholder="场次重写指令（如：增加对话…）"
                                      className="text-xs h-7"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {regenSceneIdx === idx ? (
                          <div>
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-primary/80">
                              {streamingText || "生成中…"}
                              <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                            </pre>
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                            {scene.body}
                          </pre>
                        )}
                      </div>
                    ))}

                    {/* Postamble (hooks etc.) */}
                    {(() => {
                      const postamble = getEpisodePostamble(selectedScript.content);
                      return postamble ? (
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                          {postamble}
                        </pre>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                      {selectedScript.content}
                    </pre>
                  </ScrollArea>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <p className="text-sm">该集尚未生成</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRangeInput(String(selectedEp));
                    handleGenerate(String(selectedEp));
                  }}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  生成第 {selectedEp} 集
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {episodes.length > 0 && !isGenerating && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            前往导出
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* 质量审查对话框 */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              第 {reviewEpNum} 集 · 质量审查
            </DialogTitle>
          </DialogHeader>

          {isReviewing && !reviewResult && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在审查中，请稍候…</p>
            </div>
          )}

          {reviewResult && (
            <div className="space-y-5">
              {/* 总分 */}
              <div className="text-center space-y-2">
                <div className="text-4xl font-bold">
                  <span className={getGradeColor(reviewResult.grade)}>{reviewResult.total}</span>
                  <span className="text-lg text-muted-foreground">/50</span>
                </div>
                <span className={`text-lg font-semibold ${getGradeColor(reviewResult.grade)}`}>
                  {reviewResult.grade}
                </span>
              </div>

              {/* 五维评分 */}
              <div className="space-y-3">
                {Object.entries(reviewResult.scores).map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{DIMENSION_LABELS[key] || key}</span>
                      <span className="font-mono text-muted-foreground">{val.score}/10</span>
                    </div>
                    <Progress value={val.score * 10} className="h-2" />
                    <p className="text-xs text-muted-foreground">{val.comment}</p>
                  </div>
                ))}
              </div>

              {/* 亮点 */}
              {reviewResult.highlights.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">✨ 亮点</p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {reviewResult.highlights.map((h, i) => (
                      <li key={i} className="flex gap-2"><span>•</span><span>{h}</span></li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 问题 */}
              {reviewResult.issues.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">📋 问题清单</p>
                  <ul className="text-sm space-y-1">
                    {reviewResult.issues.map((issue, i) => (
                      <li key={i} className="flex gap-2">
                        <span>{issue.level}</span>
                        <span className="text-muted-foreground">{issue.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 修订建议 */}
              {reviewResult.suggestions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">💡 修订建议</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    {reviewResult.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 一键修复 */}
              {(reviewResult.issues.length > 0 || reviewResult.suggestions.length > 0) && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    // Compile issues & suggestions into a rewrite instruction
                    const parts: string[] = [];
                    if (reviewResult.issues.length > 0) {
                      parts.push("【质量审查发现的问题】");
                      reviewResult.issues.forEach((issue) => {
                        parts.push(`${issue.level} ${issue.description}`);
                      });
                    }
                    if (reviewResult.suggestions.length > 0) {
                      parts.push("【修订建议】");
                      reviewResult.suggestions.forEach((s, i) => {
                        parts.push(`${i + 1}. ${s}`);
                      });
                    }
                    // Also include low-score dimensions
                    const lowScores = Object.entries(reviewResult.scores)
                      .filter(([, val]) => val.score <= 6)
                      .map(([key, val]) => `${DIMENSION_LABELS[key] || key}（${val.score}/10）：${val.comment}`);
                    if (lowScores.length > 0) {
                      parts.push("【需重点提升的维度】");
                      parts.push(...lowScores);
                    }
                    const instruction = parts.join("\n");
                    // Set the instruction and trigger regeneration
                    setEpisodeRegenInstruction(instruction);
                    setShowReviewDialog(false);
                    if (reviewEpNum != null) {
                      setRangeInput(String(reviewEpNum));
                      handleGenerate(String(reviewEpNum), instruction);
                    }
                  }}
                  disabled={isGenerating}
                >
                  <Wrench className="h-4 w-4" />
                  一键修复（基于审查结果重写）
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 批量质量审查对话框 */}
      <Dialog open={showBatchReviewDialog} onOpenChange={(open) => {
        if (!open && isBatchReviewing) {
          batchAbortRef.current?.abort();
        }
        setShowBatchReviewDialog(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              批量质量审查报告
              {isBatchReviewing && (
                <span className="text-sm font-normal text-muted-foreground">
                  （{batchReviewProgress.current}/{batchReviewProgress.total}）正在审查第 {batchReviewProgress.epNum} 集…
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Progress bar */}
          {isBatchReviewing && (
            <div className="space-y-2">
              <Progress value={(batchReviewProgress.current / Math.max(batchReviewProgress.total, 1)) * 100} className="h-2" />
              <div className="flex justify-between">
                <p className="text-xs text-muted-foreground">
                  正在审查第 {batchReviewProgress.epNum} 集…
                </p>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => batchAbortRef.current?.abort()}>
                  停止
                </Button>
              </div>
            </div>
          )}

          {batchReviewResults.size > 0 && (
            <div className="space-y-4">
              {/* 汇总统计 */}
              {(() => {
                const entries = [...batchReviewResults.entries()].sort(([a], [b]) => a - b);
                const avgTotal = entries.reduce((sum, [, r]) => sum + r.total, 0) / entries.length;
                const dimAvg: Record<string, number> = {};
                const dims = ["rhythm", "satisfaction", "dialogue", "format", "continuity"];
                dims.forEach(d => {
                  dimAvg[d] = entries.reduce((sum, [, r]) => sum + (r.scores[d as keyof typeof r.scores]?.score || 0), 0) / entries.length;
                });
                const lowestEp = entries.reduce((min, curr) => curr[1].total < min[1].total ? curr : min);
                const highestEp = entries.reduce((max, curr) => curr[1].total > max[1].total ? curr : max);
                const avgGrade = avgTotal >= 45 ? "卓越" : avgTotal >= 38 ? "优良" : avgTotal >= 30 ? "合格" : avgTotal >= 25 ? "需改进" : "需重写";

                return (
                  <>
                    {/* Summary header */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="border rounded-lg p-3">
                        <div className="text-2xl font-bold">
                          <span className={getGradeColor(avgGrade)}>{avgTotal.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">/50</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">平均分</p>
                        <p className={`text-xs font-semibold ${getGradeColor(avgGrade)}`}>{avgGrade}</p>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-2xl font-bold text-green-500">{highestEp[1].total}</div>
                        <p className="text-xs text-muted-foreground mt-1">最高分</p>
                        <p className="text-xs">第 {highestEp[0]} 集</p>
                      </div>
                      <div className="border rounded-lg p-3">
                        <div className="text-2xl font-bold text-orange-500">{lowestEp[1].total}</div>
                        <p className="text-xs text-muted-foreground mt-1">最低分</p>
                        <p className="text-xs">第 {lowestEp[0]} 集</p>
                      </div>
                    </div>

                    {/* 五维平均 */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">五维平均评分</p>
                      {dims.map(d => (
                        <div key={d} className="space-y-0.5">
                          <div className="flex items-center justify-between text-xs">
                            <span>{DIMENSION_LABELS[d]}</span>
                            <span className="font-mono text-muted-foreground">{dimAvg[d].toFixed(1)}/10</span>
                          </div>
                          <Progress value={dimAvg[d] * 10} className="h-1.5" />
                        </div>
                      ))}
                    </div>

                    {/* 各集得分列表 */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">各集评分明细</p>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left p-2">集数</th>
                              <th className="p-2">节奏</th>
                              <th className="p-2">爽点</th>
                              <th className="p-2">台词</th>
                              <th className="p-2">格式</th>
                              <th className="p-2">连贯</th>
                              <th className="p-2">总分</th>
                              <th className="p-2">评级</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map(([epNum, r]) => (
                              <tr key={epNum} className="border-t hover:bg-muted/20">
                                <td className="p-2 font-medium">第{epNum}集</td>
                                <td className="p-2 text-center">{r.scores.rhythm.score}</td>
                                <td className="p-2 text-center">{r.scores.satisfaction.score}</td>
                                <td className="p-2 text-center">{r.scores.dialogue.score}</td>
                                <td className="p-2 text-center">{r.scores.format.score}</td>
                                <td className="p-2 text-center">{r.scores.continuity.score}</td>
                                <td className="p-2 text-center font-semibold">{r.total}</td>
                                <td className={`p-2 text-center font-semibold ${getGradeColor(r.grade)}`}>{r.grade}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 问题汇总 — 只列出有问题的集 */}
                    {(() => {
                      const epsWithIssues = entries.filter(([, r]) => r.issues.length > 0);
                      if (epsWithIssues.length === 0) return null;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">📋 问题汇总</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              disabled={isGenerating}
                              onClick={() => {
                                // Find lowest scoring episodes and fix them
                                const toFix = entries
                                  .filter(([, r]) => r.total < 38 || r.issues.some(i => i.level === "⛔"))
                                  .slice(0, 3);
                                if (toFix.length === 0) {
                                  toast({ title: "所有集数质量达标，无需修复" });
                                  return;
                                }
                                setShowBatchReviewDialog(false);
                                // Fix the first problematic episode
                                const [epNum, result] = toFix[0];
                                const parts: string[] = ["【批量审查发现的问题】"];
                                result.issues.forEach(issue => parts.push(`${issue.level} ${issue.description}`));
                                result.suggestions.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
                                const lowScores = Object.entries(result.scores)
                                  .filter(([, val]) => val.score <= 6)
                                  .map(([key, val]) => `${DIMENSION_LABELS[key] || key}（${val.score}/10）：${val.comment}`);
                                if (lowScores.length > 0) parts.push("【需重点提升】", ...lowScores);
                                const instruction = parts.join("\n");
                                setEpisodeRegenInstruction(instruction);
                                setRangeInput(String(epNum));
                                handleGenerate(String(epNum), instruction);
                                toast({ title: `开始修复第 ${epNum} 集（共 ${toFix.length} 集需修复）` });
                              }}
                            >
                              <Wrench className="h-3 w-3" />
                              一键修复最差集
                            </Button>
                          </div>
                          {epsWithIssues.map(([epNum, r]) => (
                            <div key={epNum} className="border rounded-lg p-2 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">第 {epNum} 集（{r.grade} · {r.total}分）</p>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs gap-1"
                                  disabled={isGenerating}
                                  onClick={() => {
                                    setShowBatchReviewDialog(false);
                                    const parts: string[] = ["【质量审查发现的问题】"];
                                    r.issues.forEach(issue => parts.push(`${issue.level} ${issue.description}`));
                                    r.suggestions.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
                                    const instruction = parts.join("\n");
                                    setEpisodeRegenInstruction(instruction);
                                    setRangeInput(String(epNum));
                                    handleGenerate(String(epNum), instruction);
                                  }}
                                >
                                  <Wrench className="h-3 w-3" />
                                  修复
                                </Button>
                              </div>
                              <ul className="text-xs space-y-0.5">
                                {r.issues.map((issue, i) => (
                                  <li key={i} className="flex gap-1.5">
                                    <span>{issue.level}</span>
                                    <span className="text-muted-foreground">{issue.description}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}

          {!isBatchReviewing && batchReviewResults.size === 0 && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">准备审查…</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StepEpisode;
