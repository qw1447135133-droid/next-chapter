import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Loader2, Play, Check, Square } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildEpisodePrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeEntry, EpisodeScript } from "@/types/drama";

interface StepEpisodeProps {
  setup: DramaSetup;
  characters: string;
  directory: EpisodeEntry[];
  episodes: EpisodeScript[];
  onUpdate: (episodes: EpisodeScript[]) => void;
  onNext: () => void;
}

const StepEpisode = ({ setup, characters, directory, episodes, onUpdate, onNext }: StepEpisodeProps) => {
  const [rangeInput, setRangeInput] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGen, setCurrentGen] = useState<number | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [selectedEp, setSelectedEp] = useState<number | null>(null);
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

  const handleGenerate = async () => {
    const nums = parseRange(rangeInput);
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

        const prompt = buildEpisodePrompt(setup, characters, directory, num, previousContent);
        const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          (chunk) => setStreamingText(chunk),
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );

        const epEntry = directory.find((d) => d.number === num);
        const newEp: EpisodeScript = {
          number: num,
          title: epEntry?.title || `第${num}集`,
          content: finalText,
          wordCount: finalText.length,
        };

        const existIdx = updatedEpisodes.findIndex((e) => e.number === num);
        if (existIdx >= 0) updatedEpisodes[existIdx] = newEp;
        else updatedEpisodes.push(newEp);

        onUpdate([...updatedEpisodes]);
        toast({ title: `第 ${num} 集撰写完成（${finalText.length}字）` });
      } catch (e: any) {
        if (e?.message?.includes("取消")) {
          // Save partial content
          const partial = streamingText;
          if (partial) {
            const epEntry = directory.find((d) => d.number === num);
            const newEp: EpisodeScript = {
              number: num,
              title: epEntry?.title || `第${num}集`,
              content: partial,
              wordCount: partial.length,
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

  const handleStop = () => abortRef.current?.abort();

  const completedNums = new Set(episodes.map((e) => e.number));
  const selectedScript = episodes.find((e) => e.number === selectedEp);

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
              <Button onClick={handleGenerate} className="gap-2">
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
                    if (next != null && !completedNums.has(next)) {
                      setRangeInput(String(next));
                    }
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

      {/* 流式输出预览 */}
      {isGenerating && streamingText && (
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
      {selectedEp != null && !isGenerating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              第 {selectedEp} 集：{selectedScript?.title || directory.find(d => d.number === selectedEp)?.title || `第${selectedEp}集`}
              {selectedScript && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {selectedScript.wordCount} 字
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedScript ? (
              <ScrollArea className="h-[500px]">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                  {selectedScript.content}
                </pre>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <p className="text-sm">该集尚未生成</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRangeInput(String(selectedEp));
                    handleGenerate();
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
