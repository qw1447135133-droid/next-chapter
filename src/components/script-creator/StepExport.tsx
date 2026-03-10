import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Film, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGemini, extractText } from "@/lib/gemini-client";
import { buildExportPrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeScript } from "@/types/drama";

interface StepExportProps {
  setup: DramaSetup;
  dramaTitle: string;
  creativePlan: string;
  characters: string;
  episodes: EpisodeScript[];
}

const StepExport = ({ setup, dramaTitle, creativePlan, characters, episodes }: StepExportProps) => {
  const navigate = useNavigate();
  const [exportedText, setExportedText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const prompt = buildExportPrompt(setup, dramaTitle, creativePlan, characters, episodes);
      const data = await callGemini("gemini-2.5-flash", [
        { role: "user", parts: [{ text: prompt }] },
      ], { maxOutputTokens: 16384 });
      const text = extractText(data);
      setExportedText(text);
      toast({ title: "剧本导出完成" });
    } catch (e: any) {
      toast({ title: "导出失败", description: e?.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  // 快速拼接版（不走 AI）
  const handleQuickExport = () => {
    const parts = [
      `# ${dramaTitle || "未命名短剧"}`,
      "",
      `> 题材：${setup.genres.join(" + ")} | 受众：${setup.audience} | 基调：${setup.tone} | 集数：${setup.totalEpisodes}`,
      "",
      "---",
      "",
      "## 创作方案",
      "",
      creativePlan,
      "",
      "---",
      "",
      "## 角色档案",
      "",
      characters,
      "",
      "---",
      "",
      "## 分集剧本",
      "",
      ...episodes
        .sort((a, b) => a.number - b.number)
        .map((ep) => `### 第${ep.number}集：${ep.title}\n\n${ep.content}\n\n---\n`),
    ];
    setExportedText(parts.join("\n"));
    toast({ title: "快速拼接完成" });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      toast({ title: "已复制到剪贴板" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([exportedText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dramaTitle || "剧本"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUseInVideo = () => {
    // 拼接所有剧本内容传入视频创作模块
    const allScript = episodes
      .sort((a, b) => a.number - b.number)
      .map((ep) => ep.content)
      .join("\n\n---\n\n");
    sessionStorage.setItem("imported-script", allScript);
    navigate("/workspace");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导出剧本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-muted-foreground">题材</div>
              <div className="font-medium mt-0.5">{setup.genres.join(" + ")}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-muted-foreground">已完成</div>
              <div className="font-medium mt-0.5">{episodes.length} / {setup.totalEpisodes} 集</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-muted-foreground">总字数</div>
              <div className="font-medium mt-0.5">{episodes.reduce((s, e) => s + e.wordCount, 0).toLocaleString()}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="text-muted-foreground">剧名</div>
              <div className="font-medium mt-0.5">{dramaTitle || "未命名"}</div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleQuickExport} variant="outline" className="gap-1.5">
              <Download className="h-4 w-4" />
              快速拼接
            </Button>
            <Button onClick={handleExport} disabled={isExporting} className="gap-1.5">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              AI 整合导出
            </Button>
            <Button onClick={handleUseInVideo} variant="secondary" className="gap-1.5" disabled={episodes.length === 0}>
              <Film className="h-4 w-4" />
              用于视频创作
            </Button>
          </div>
        </CardContent>
      </Card>

      {exportedText && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">导出结果</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                下载 .md
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {exportedText}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StepExport;
