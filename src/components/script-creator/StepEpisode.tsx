import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Loader2, Play, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGemini, extractText } from "@/lib/gemini-client";
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
  const [selectedEp, setSelectedEp] = useState<number | null>(null);

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
    const updatedEpisodes = [...episodes];

    for (const num of nums) {
      setCurrentGen(num);
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
        const data = await callGemini(model, [
          { role: "user", parts: [{ text: prompt }] },
        ], { maxOutputTokens: 8192 });
        const text = extractText(data);

        const epEntry = directory.find((d) => d.number === num);
        const newEp: EpisodeScript = {
          number: num,
          title: epEntry?.title || `第${num}集`,
          content: text,
          wordCount: text.length,
        };

        const existIdx = updatedEpisodes.findIndex((e) => e.number === num);
        if (existIdx >= 0) updatedEpisodes[existIdx] = newEp;
        else updatedEpisodes.push(newEp);

        onUpdate([...updatedEpisodes]);
        toast({ title: `第 ${num} 集撰写完成（${text.length}字）` });
      } catch (e: any) {
        toast({ title: `第 ${num} 集生成失败`, description: e?.message, variant: "destructive" });
        break;
      }
    }

    setCurrentGen(null);
    setIsGenerating(false);
  };

  const completedNums = new Set(episodes.map((e) => e.number));
  const selectedScript = episodes.find((e) => e.number === selectedEp);

  return (
    <div className="space-y-4">
      {/* 生成控制 */}
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
            <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在撰写第 {currentGen} 集…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  开始撰写
                </>
              )}
            </Button>
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
                  onClick={() => done && setSelectedEp(ep.number === selectedEp ? null : ep.number)}
                  className={`w-9 h-9 rounded text-xs font-mono flex items-center justify-center border transition-all ${
                    generating
                      ? "border-primary bg-primary/20 animate-pulse"
                      : done
                      ? active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-accent bg-accent/10 text-accent-foreground cursor-pointer hover:bg-accent/20"
                      : "border-border text-muted-foreground"
                  }`}
                  disabled={!done}
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

      {/* 预览 */}
      {selectedScript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              第 {selectedScript.number} 集：{selectedScript.title}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {selectedScript.wordCount} 字
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                {selectedScript.content}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {episodes.length > 0 && (
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
