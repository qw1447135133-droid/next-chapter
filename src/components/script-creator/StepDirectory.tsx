import { useState, useRef } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, RefreshCw, Pencil, Eye, Square } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildDirectoryPrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeEntry } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

interface StepDirectoryProps {
  setup: DramaSetup;
  creativePlan: string;
  characters: string;
  directory: EpisodeEntry[];
  directoryRaw: string;
  onUpdate: (directory: EpisodeEntry[], raw: string) => void;
  onNext: () => void;
}

function parseDirectory(raw: string): EpisodeEntry[] {
  const lines = raw.split("\n");
  const entries: EpisodeEntry[] = [];
  for (const line of lines) {
    let match = line.match(/第(\d+)集[：:]\s*(.+?)(?:\s*[-——–—]+\s*)(.+)/);
    if (!match) {
      match = line.match(/^(\d+)[\.、）\)]\s*(.+?)(?:\s*[-——–—]+\s*)(.+)/);
    }
    if (match) {
      const number = parseInt(match[1]);
      const title = match[2].trim();
      const rest = match[3];
      const hookMatch = rest.match(/\[(.*?钩)\]/);
      const emotionMatch = line.match(/[情感情绪][：:强度]*\s*(\d)/);
      entries.push({
        number,
        title,
        summary: rest.replace(/\[.*?\]/g, "").replace(/🔥/g, "").replace(/⚡/g, "").replace(/💰/g, "").trim(),
        hookType: hookMatch?.[1] || "悬念钩",
        isKey: line.includes("🔥"),
        isClimax: line.includes("⚡"),
        isPaywall: line.includes("💰"),
        emotionLevel: emotionMatch ? parseInt(emotionMatch[1]) : undefined,
      });
    }
  }
  return entries;
}

const StepDirectory = ({ setup, creativePlan, characters, directory, directoryRaw, onUpdate, onNext }: StepDirectoryProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [rawText, setRawText] = useState(directoryRaw);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(directoryRaw);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildDirectoryPrompt(setup, creativePlan, characters);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );
      setRawText(finalText);
      const parsed = parseDirectory(finalText);
      onUpdate(parsed, finalText);
      setStreamingText("");
      toast({ title: `分集目录生成完成（解析到 ${parsed.length} 集）` });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        const partial = streamingText;
        if (partial) {
          setRawText(partial);
          const parsed = parseDirectory(partial);
          onUpdate(parsed, partial);
        }
        toast({ title: "已停止生成" });
      } else {
        toast({ title: "生成失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleEditSave = () => {
    const parsed = parseDirectory(rawText);
    onUpdate(parsed, rawText);
    setEditing(false);
    toast({ title: `目录已更新（${parsed.length} 集）` });
  };


  // --- Stats ---
  const keyCount = directory.filter((d) => d.isKey).length;
  const climaxCount = directory.filter((d) => d.isClimax).length;
  const paywallCount = directory.filter((d) => d.isPaywall).length;

  const hookDistribution = directory.reduce<Record<string, number>>((acc, ep) => {
    const hook = ep.hookType || "未知";
    acc[hook] = (acc[hook] || 0) + 1;
    return acc;
  }, {});

  const total = setup.totalEpisodes;
  const segments = [
    { label: "起势段", range: [1, Math.round(total * 0.15)], color: "bg-blue-500" },
    { label: "攀升段", range: [Math.round(total * 0.15) + 1, Math.round(total * 0.45)], color: "bg-green-500" },
    { label: "风暴段", range: [Math.round(total * 0.45) + 1, Math.round(total * 0.8)], color: "bg-amber-500" },
    { label: "决战段", range: [Math.round(total * 0.8) + 1, total], color: "bg-red-500" },
  ];

  const getSegmentForEp = (num: number) => {
    for (const seg of segments) {
      if (num >= seg.range[0] && num <= seg.range[1]) return seg;
    }
    return segments[segments.length - 1];
  };

  const segmentCounts = segments.map((seg) => ({
    ...seg,
    count: directory.filter((ep) => ep.number >= seg.range[0] && ep.number <= seg.range[1]).length,
    expected: seg.range[1] - seg.range[0] + 1,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            分集目录
            {directory.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                共 {directory.length} 集 · 🔥{keyCount} · ⚡{climaxCount} · 💰{paywallCount}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {directoryRaw && !isGenerating && (
              <>
                <TranslateToggle
                  isNonChinese={nonChinese}
                  isTranslating={isTranslating}
                  showTranslation={showTranslation}
                  onTranslate={() => translate(directoryRaw)}
                  onClear={clearTranslation}
                  onStop={stopTranslation}
                  disabled={editing}
                />
                <Button variant="outline" size="sm" onClick={() => editing ? handleEditSave() : setEditing(true)} className="gap-1.5">
                  {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editing ? "保存" : "编辑"}
                </Button>
              </>
            )}
            {isGenerating ? (
              <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : (
              <Button
                variant={directoryRaw ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {directoryRaw ? "重新生成" : "AI 生成"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
          {isGenerating ? (
            <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
            </pre>
          ) : !directoryRaw ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 生成"按钮，生成完整 {setup.totalEpisodes} 集目录</p>
              <p className="text-xs mt-2">包含：集标题、梗概、钩子类型、🔥关键集/⚡高潮卡点标记</p>
            </div>
          ) : editing ? (
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <div className="space-y-4">
              {/* Statistics cards */}
              {directory.length > 0 && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/20">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Hook distribution */}
                    <div>
                      <p className="text-xs font-semibold mb-2">🎣 钩子类型分布</p>
                      <div className="space-y-1.5">
                        {Object.entries(hookDistribution)
                          .sort(([, a], [, b]) => b - a)
                          .map(([hook, count]) => {
                            const pct = Math.round((count / directory.length) * 100);
                            return (
                              <div key={hook} className="flex items-center gap-2 text-xs">
                                <span className="w-16 shrink-0 truncate">{hook}</span>
                                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                  <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-14 text-right text-muted-foreground">{count}集 {pct}%</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                    {/* Rhythm segment distribution */}
                    <div>
                      <p className="text-xs font-semibold mb-2">📈 节奏段落分布</p>
                      <div className="space-y-1.5">
                        {segmentCounts.map((seg) => {
                          const pct = seg.expected > 0 ? Math.round((seg.count / total) * 100) : 0;
                          return (
                            <div key={seg.label} className="flex items-center gap-2 text-xs">
                              <span className="w-16 shrink-0">{seg.label}</span>
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div className={`${seg.color} h-full rounded-full`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-20 text-right text-muted-foreground">
                                {seg.range[0]}-{seg.range[1]}集
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Emotional Waveform */}
                  {directory.some(d => d.emotionLevel) && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold mb-2">🌊 情绪波形图</p>
                      <div className="flex items-end gap-px h-16">
                        {directory.map((ep) => {
                          const level = ep.emotionLevel || 2;
                          const heightPct = (level / 5) * 100;
                          const seg = getSegmentForEp(ep.number);
                          return (
                            <div
                              key={ep.number}
                              className="flex-1 flex flex-col items-center justify-end group relative"
                              title={`第${ep.number}集：${ep.title}（情绪:${level}）`}
                            >
                              <div
                                className={`w-full min-w-[3px] rounded-t-sm ${seg.color} opacity-70 group-hover:opacity-100 transition-opacity`}
                                style={{ height: `${heightPct}%` }}
                              />
                              {(ep.isClimax || ep.isPaywall) && (
                                <div className="absolute -top-3 text-[8px]">
                                  {ep.isClimax && "⚡"}
                                  {ep.isPaywall && "💰"}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>第1集</span>
                        <span>第{Math.round(directory.length / 2)}集</span>
                        <span>第{directory.length}集</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 text-xs text-muted-foreground border-t pt-2 flex-wrap">
                    <span>🔥 关键集 {keyCount} ({directory.length > 0 ? Math.round(keyCount / directory.length * 100) : 0}%，目标25-35%)</span>
                    <span>⚡ 高潮卡点 {climaxCount} ({directory.length > 0 ? Math.round(climaxCount / directory.length * 100) : 0}%，目标10-15%)</span>
                    <span>💰 付费卡点 {paywallCount} ({directory.length > 0 ? Math.round(paywallCount / directory.length * 100) : 0}%，目标10-15%)</span>
                  </div>
                </div>
              )}

              {/* Episode list with outlines */}
              <div className="max-h-[500px] overflow-auto space-y-1">
                {directory.map((ep) => (
                  <div key={ep.number}>
                    <div
                      className={`flex items-start gap-2 px-3 py-2 rounded text-sm cursor-pointer hover:bg-muted/30 transition-colors ${
                        ep.isClimax ? "bg-amber-500/10" : ep.isKey ? "bg-primary/5" : ""
                      }`}
                      onClick={() => ep.outline && toggleOutline(ep.number)}
                    >
                      <span className="text-muted-foreground w-12 shrink-0 font-mono">
                        {String(ep.number).padStart(2, "0")}
                      </span>
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getSegmentForEp(ep.number).color}`} />
                      <span className="font-medium min-w-[80px]">{ep.title}</span>
                      <span className="text-muted-foreground flex-1">{ep.summary}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{ep.hookType}</span>
                      <span className="shrink-0">
                        {ep.isKey && "🔥"}
                        {ep.isClimax && "⚡"}
                        {ep.isPaywall && "💰"}
                      </span>
                      {ep.outline && (
                        <span className="shrink-0 text-muted-foreground">
                          {expandedOutlines.has(ep.number) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </div>
                    {/* Expanded outline */}
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
                            {ep.outline}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                {directory.length === 0 && directoryRaw && (
                  showTranslation && hasTranslation(directoryRaw) ? (
                    <InterleavedText text={directoryRaw} translatedLines={getTranslation(directoryRaw)!} />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-foreground/90">{directoryRaw}</pre>
                  )
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outline generation section */}
      {directory.length > 0 && directoryRaw && !isGenerating && !editing && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              单集细纲
              {outlinesExist && (
                <span className="text-sm font-normal text-muted-foreground">
                  {directory.filter(ep => ep.outline).length}/{directory.length} 集已生成
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2">
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

            {/* Progress bar (DecomposeProgress style) */}
            {outlineBatches.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
          </CardContent>
        </Card>
      )}

      {directoryRaw && !isGenerating && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认目录，进入分集撰写
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepDirectory;
