import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2, RefreshCw, Pencil, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGemini, extractText } from "@/lib/gemini-client";
import { buildDirectoryPrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeEntry } from "@/types/drama";

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
    const match = line.match(/第(\d+)集[：:]\s*(.+?)(?:\s*——\s*|\s*—\s*)(.+)/);
    if (match) {
      const number = parseInt(match[1]);
      const title = match[2].trim();
      const rest = match[3];
      const hookMatch = rest.match(/\[(.*?钩)\]/);
      entries.push({
        number,
        title,
        summary: rest.replace(/\[.*?\]/g, "").replace(/🔥/g, "").replace(/💰/g, "").trim(),
        hookType: hookMatch?.[1] || "悬念钩",
        isKey: line.includes("🔥"),
        isPaywall: line.includes("💰"),
      });
    }
  }
  return entries;
}

const StepDirectory = ({ setup, creativePlan, characters, directory, directoryRaw, onUpdate, onNext }: StepDirectoryProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rawText, setRawText] = useState(directoryRaw);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildDirectoryPrompt(setup, creativePlan, characters);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const data = await callGemini(model, [
        { role: "user", parts: [{ text: prompt }] },
      ], { maxOutputTokens: 8192 });
      const text = extractText(data);
      setRawText(text);
      const parsed = parseDirectory(text);
      onUpdate(parsed, text);
      toast({ title: `分集目录生成完成（解析到 ${parsed.length} 集）` });
    } catch (e: any) {
      toast({ title: "生成失败", description: e?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditSave = () => {
    const parsed = parseDirectory(rawText);
    onUpdate(parsed, rawText);
    setEditing(false);
    toast({ title: `目录已更新（${parsed.length} 集）` });
  };

  const keyCount = directory.filter((d) => d.isKey).length;
  const paywallCount = directory.filter((d) => d.isPaywall).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            分集目录
            {directory.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                共 {directory.length} 集 · 🔥{keyCount} · 💰{paywallCount}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {directoryRaw && (
              <Button variant="outline" size="sm" onClick={() => editing ? handleEditSave() : setEditing(true)} className="gap-1.5">
                {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editing ? "保存" : "编辑"}
              </Button>
            )}
            <Button
              variant={directoryRaw ? "outline" : "default"}
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-1.5"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {directoryRaw ? "重新生成" : "AI 生成"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isGenerating && !directoryRaw ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              AI 正在规划 {setup.totalEpisodes} 集目录…
            </div>
          ) : !directoryRaw ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 生成"按钮，生成完整 {setup.totalEpisodes} 集目录</p>
              <p className="text-xs mt-2">包含：集标题、梗概、钩子类型、🔥关键集/💰付费卡点标记</p>
            </div>
          ) : editing ? (
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <div className="max-h-[600px] overflow-auto space-y-1">
              {directory.map((ep) => (
                <div
                  key={ep.number}
                  className={`flex items-start gap-2 px-3 py-2 rounded text-sm ${
                    ep.isKey || ep.isPaywall ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-muted-foreground w-12 shrink-0 font-mono">
                    {String(ep.number).padStart(2, "0")}
                  </span>
                  <span className="font-medium min-w-[80px]">{ep.title}</span>
                  <span className="text-muted-foreground flex-1">{ep.summary}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{ep.hookType}</span>
                  <span className="shrink-0">
                    {ep.isKey && "🔥"}
                    {ep.isPaywall && "💰"}
                  </span>
                </div>
              ))}
              {directory.length === 0 && directoryRaw && (
                <pre className="whitespace-pre-wrap text-sm text-foreground/90">{directoryRaw}</pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {directoryRaw && (
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
