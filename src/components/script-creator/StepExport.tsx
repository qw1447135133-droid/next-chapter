import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Film, Loader2, Square } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
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
  const [streamingText, setStreamingText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildExportPrompt(setup, dramaTitle, creativePlan, characters, episodes);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 16384 },
        abortRef.current.signal,
      );
      setExportedText(finalText);
      setStreamingText("");
      toast({ title: "剧本导出完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        const partial = streamingText;
        if (partial) setExportedText(partial);
        toast({ title: "已停止生成" });
      } else {
        toast({ title: "导出失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleQuickExport = () => {
    // Extract scene list from episodes
    const sceneSet = new Set<string>();
    const soundtrackList: { ep: number; scene: string; music: string }[] = [];
    episodes.sort((a, b) => a.number - b.number).forEach((ep) => {
      // Extract scenes
      const sceneMatches = ep.content.matchAll(/\*\*场景[：:]\*\*\s*(.+)/g);
      for (const m of sceneMatches) sceneSet.add(m[1].trim());
      const intExtMatches = ep.content.matchAll(/\*\*(INT\.|EXT\.|内景|外景)\s*(.+?)\*\*/g);
      for (const m of intExtMatches) sceneSet.add(`${m[1]} ${m[2]}`.trim());
      // Extract soundtracks
      const musicMatches = ep.content.matchAll(/♪\s*(?:音乐提示|Music|Score|OST|音楽)[：:]?\s*(.+)/g);
      let sceneIdx = 0;
      for (const m of musicMatches) {
        sceneIdx++;
        soundtrackList.push({ ep: ep.number, scene: `场次${sceneIdx}`, music: m[1].trim() });
      }
    });

    // Extract character table from characters text
    const characterLines: string[] = [];
    const charMatches = characters.matchAll(/(?:^|\n)(?:###?\s*)?\d*\.?\s*\*{0,2}(.+?)\*{0,2}\s*[（(](\d+岁?.+?)[）)]/g);
    for (const m of charMatches) {
      characterLines.push(`| ${m[1].trim()} | ${m[2].trim()} |`);
    }

    const parts = [
      `# ${dramaTitle || "未命名短剧"}`,
      "",
      `> 题材：${setup.genres.join(" + ")} | 受众：${setup.audience} | 基调：${setup.tone} | 集数：${setup.totalEpisodes}`,
      "",
      "---",
      "",
      "## 角色表",
      "",
      "| 角色名 | 简介 |",
      "|--------|------|",
      ...(characterLines.length > 0 ? characterLines : ["| （请参考角色档案） | |"]),
      "",
      "---",
      "",
      "## 场景清单",
      "",
      ...(sceneSet.size > 0
        ? [...sceneSet].map((s, i) => `${i + 1}. ${s}`)
        : ["（未提取到场景信息）"]),
      "",
      "---",
      "",
      "## 配乐提示表",
      "",
      ...(soundtrackList.length > 0
        ? [
            "| 集数 | 场次 | 配乐描述 |",
            "|------|------|----------|",
            ...soundtrackList.map((s) => `| 第${s.ep}集 | ${s.scene} | ${s.music} |`),
          ]
        : ["（未提取到配乐提示）"]),
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
    toast({ title: "快速拼接完成（含角色表、场景清单、配乐表）" });
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

  const handleDownloadEpisode = (ep: EpisodeScript) => {
    const content = `# 第${ep.number}集：${ep.title}\n\n${ep.content}`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ep${String(ep.number).padStart(3, "0")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    // Download each episode as separate files (zip not available, download sequentially)
    episodes.sort((a, b) => a.number - b.number).forEach((ep, idx) => {
      setTimeout(() => handleDownloadEpisode(ep), idx * 200);
    });
    toast({ title: `正在下载 ${episodes.length} 个分集文件…` });
  };

  const handleUseInVideo = () => {
    const allScript = episodes
      .sort((a, b) => a.number - b.number)
      .map((ep) => ep.content)
      .join("\n\n---\n\n");
    sessionStorage.setItem("imported-script", allScript);
    navigate("/workspace");
  };

  const displayText = isExporting ? streamingText : exportedText;

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
            <Button onClick={handleQuickExport} variant="outline" className="gap-1.5" disabled={isExporting}>
              <Download className="h-4 w-4" />
              快速拼接
            </Button>
            {isExporting ? (
              <Button variant="destructive" onClick={handleStop} className="gap-1.5">
                <Square className="h-4 w-4" />
                停止
              </Button>
            ) : (
              <Button onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                AI 整合导出
              </Button>
            )}
            <Button onClick={handleUseInVideo} variant="secondary" className="gap-1.5" disabled={episodes.length === 0}>
              <Film className="h-4 w-4" />
              用于视频创作
            </Button>
          </div>
        </CardContent>
      </Card>

      {displayText && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              导出结果
              {isExporting && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {streamingText.length} 字…
                </span>
              )}
            </CardTitle>
            {!isExporting && (
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
            )}
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {displayText}
              {isExporting && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StepExport;
