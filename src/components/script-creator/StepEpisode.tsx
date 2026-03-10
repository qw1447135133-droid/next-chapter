import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Loader2, Play, Check, Square, RefreshCw, History, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildEpisodePrompt, buildSceneRegenPrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeEntry, EpisodeScript, EpisodeVersion } from "@/types/drama";

interface StepEpisodeProps {
  setup: DramaSetup;
  characters: string;
  directory: EpisodeEntry[];
  episodes: EpisodeScript[];
  onUpdate: (episodes: EpisodeScript[]) => void;
  onNext: () => void;
}

/** Parse episode content into scenes by splitting on ## 场次 headers */
function parseScenes(content: string): { header: string; body: string }[] {
  // Split by scene headers like "## 场次一", "## 场次二" etc.
  const sceneRegex = /^(##\s*场次.*)$/gm;
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
  const firstScene = content.match(/^##\s*场次/m);
  if (!firstScene || firstScene.index === undefined) return content;
  return content.slice(0, firstScene.index).trim();
}

/** Get the content after the last scene (hooks/preview) */
function getEpisodePostamble(content: string): string {
  const sceneRegex = /^##\s*场次/gm;
  const matches = [...content.matchAll(sceneRegex)];
  if (matches.length === 0) return "";
  const lastMatch = matches[matches.length - 1];
  // Find the next --- after the last scene to get postamble
  const afterLastScene = content.slice(lastMatch.index!);
  // Look for closing section (钩子/下集预告)
  const hookMatch = afterLastScene.match(/\n>\s*🎣/);
  if (hookMatch && hookMatch.index !== undefined) {
    return afterLastScene.slice(hookMatch.index).trim();
  }
  return "";
}

const StepEpisode = ({ setup, characters, directory, episodes, onUpdate, onNext }: StepEpisodeProps) => {
  const [rangeInput, setRangeInput] = useState("1");
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
  const abortRef = useRef<AbortController | null>(null);

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
    return [...(ep.history || []), prev];
  };

  const handleGenerate = async (overrideRange?: string) => {
    const nums = parseRange(overrideRange || rangeInput);
    if (nums.length === 0) {
      toast({ title: "请输入有效的集数", variant: "destructive" });
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

        const prompt = buildEpisodePrompt(setup, characters, directory, num, previousContent, episodeRegenInstruction.trim() || undefined);
        const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          (chunk) => setStreamingText(chunk),
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );

        const epEntry = directory.find((d) => d.number === num);
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
            const epEntry = directory.find((d) => d.number === num);
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
    // Save current as history before restoring
    const history = pushHistory(selectedScript, "恢复前备份");
    const updatedEp: EpisodeScript = {
      ...selectedScript,
      content: version.content,
      wordCount: version.wordCount,
      history,
    };
    const updatedEpisodes = episodes.map((e) =>
      e.number === selectedEp ? updatedEp : e,
    );
    onUpdate(updatedEpisodes);
    setShowHistory(false);
    toast({ title: `已恢复到历史版本` });
  };

  const handleStop = () => abortRef.current?.abort();

  const completedNums = new Set(episodes.map((e) => e.number));
  const selectedScript = episodes.find((e) => e.number === selectedEp);
  const scenes = selectedScript ? parseScenes(selectedScript.content) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            分集撰写
            <span className="text-sm font-normal text-muted-foreground ml-2">
              已完成 {episodes.length}/{setup.totalEpisodes} 集
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-sm mb-1.5 block">生成集数（支持范围如 1-5，或逗号分隔如 1,3,5）</Label>
              <Input
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="例如：1-5"
                disabled={isGenerating}
              />
            </div>
            {isGenerating ? (
              <Button variant="destructive" onClick={handleStop} className="gap-2">
                <Square className="h-4 w-4" />
                停止
              </Button>
            ) : (
              <Button onClick={() => handleGenerate()} className="gap-2">
                <Play className="h-4 w-4" />
                开始撰写
              </Button>
            )}
          </div>

          {/* 集数列表 */}
          <div className="flex flex-wrap gap-1.5">
            {directory.map((ep) => {
              const done = completedNums.has(ep.number);
              const active = selectedEp === ep.number;
              const generating = currentGen === ep.number;
              return (
                <button
                  key={ep.number}
                  onClick={() => {
                    const next = ep.number === selectedEp ? null : ep.number;
                    setSelectedEp(next);
                    if (next != null) {
                      setRangeInput(String(next));
                    }
                    setShowHistory(false);
                  }}
                  className={`w-9 h-9 rounded text-xs font-mono flex items-center justify-center border transition-all cursor-pointer ${
                    generating
                      ? "border-primary bg-primary/20 animate-pulse"
                      : done
                      ? active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-accent bg-accent/10 text-accent-foreground hover:bg-accent/20"
                      : active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                  title={`第${ep.number}集：${ep.title}`}
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
            <ScrollArea className="h-[400px]">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* 已完成的集预览 */}
      {selectedEp != null && !(isGenerating && regenSceneIdx == null) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              第 {selectedEp} 集：{selectedScript?.title || directory.find(d => d.number === selectedEp)?.title || `第${selectedEp}集`}
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
                  <div className="absolute top-full right-0 pt-2 z-10">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestoreVersion(realIdx)}
                        className="h-7 text-xs"
                      >
                        恢复
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedScript ? (
              <>
                {/* Scene-by-scene view with regen buttons */}
                {scenes.length > 0 ? (
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
                                <div className="absolute top-full right-0 mt-1 z-10 bg-popover border rounded-lg shadow-lg p-2 min-w-[260px]">
                                  <Input
                                    value={sceneRegenInstructions[idx] || ""}
                                    onChange={(e) => setSceneRegenInstructions(prev => ({ ...prev, [idx]: e.target.value }))}
                                    placeholder="场次重写指令（如：增加对话…）"
                                    className="text-xs h-7"
                                    onClick={(e) => e.stopPropagation()}
                                  />
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
    </div>
  );
};

export default StepEpisode;
