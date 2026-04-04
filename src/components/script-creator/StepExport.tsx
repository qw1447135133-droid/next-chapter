import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Download, FileText, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { buildAgentHandoff, saveAgentHandoff } from "@/lib/agent-intake";
import { buildExportPrompt } from "@/lib/drama-prompts";
import { exportToDocx } from "@/lib/export-docx";
import { callGeminiStream } from "@/lib/gemini-client";
import { readStoredDecomposeModel } from "@/lib/gemini-text-models";
import type { DramaSetup, EpisodeScript } from "@/types/drama";

interface StepExportProps {
  setup: DramaSetup;
  dramaTitle: string;
  creativePlan: string;
  characters: string;
  episodes: EpisodeScript[];
}

function sortEpisodes(episodes: EpisodeScript[]): EpisodeScript[] {
  return [...episodes].sort((a, b) => a.number - b.number);
}

function formatEpisodeTitle(episode: EpisodeScript): string {
  return `第${episode.number}集：${episode.title || "未命名分集"}`;
}

function extractCharacterRows(characters: string): string[] {
  const rows: string[] = [];
  const matches = characters.matchAll(
    /(?:^|\n)(?:#{1,3}\s*)?(?:\d+[.)、]?\s*)?\*{0,2}([^\n：（(:]+?)\*{0,2}\s*[：:（(]([^\n]+?)[）)]?(?=\n|$)/g,
  );

  for (const match of matches) {
    const name = match[1]?.trim();
    const summary = match[2]?.trim();
    if (name && summary) {
      rows.push(`| ${name} | ${summary} |`);
    }
  }

  return rows;
}

function extractScenes(episodes: EpisodeScript[]): string[] {
  const scenes = new Set<string>();

  for (const episode of episodes) {
    for (const match of episode.content.matchAll(/\*\*场景[：:]\*\*\s*(.+)/g)) {
      const scene = match[1]?.trim();
      if (scene) scenes.add(scene);
    }

    for (const match of episode.content.matchAll(/\*\*(INT\.|EXT\.|内景|外景)\s*(.+?)\*\*/g)) {
      const scene = `${match[1]} ${match[2]}`.trim();
      if (scene) scenes.add(scene);
    }
  }

  return [...scenes];
}

function extractSoundtracks(episodes: EpisodeScript[]): Array<{ ep: number; scene: string; music: string }> {
  const soundtrackList: Array<{ ep: number; scene: string; music: string }> = [];

  for (const episode of episodes) {
    let sceneIndex = 0;
    for (
      const match of episode.content.matchAll(
        /(?:^|\n)\s*(?:[-*•]|🎵|♪|♫)?\s*(?:音乐提示|音乐|配乐|音效|BGM|Music|Score|OST)[：:]?\s*(.+)/g,
      )
    ) {
      sceneIndex += 1;
      const music = match[1]?.trim();
      if (!music) continue;
      soundtrackList.push({
        ep: episode.number,
        scene: `场次 ${sceneIndex}`,
        music,
      });
    }
  }

  return soundtrackList;
}

function buildQuickExportMarkdown(
  setup: DramaSetup,
  dramaTitle: string,
  creativePlan: string,
  characters: string,
  episodes: EpisodeScript[],
): string {
  const sortedEpisodes = sortEpisodes(episodes);
  const characterRows = extractCharacterRows(characters);
  const sceneList = extractScenes(sortedEpisodes);
  const soundtrackList = extractSoundtracks(sortedEpisodes);

  return [
    `# ${dramaTitle || "未命名短剧"}`,
    "",
    `> 题材：${setup.genres.join(" + ") || "待补充"} | 受众：${setup.audience || "待补充"} | 基调：${setup.tone || "待补充"} | 集数：${setup.totalEpisodes || sortedEpisodes.length || "待补充"}`,
    "",
    "---",
    "",
    "## 角色表",
    "",
    "| 角色名 | 简介 |",
    "|--------|------|",
    ...(characterRows.length > 0 ? characterRows : ["| （请参考角色档案） | |"]),
    "",
    "---",
    "",
    "## 场景清单",
    "",
    ...(sceneList.length > 0 ? sceneList.map((scene, index) => `${index + 1}. ${scene}`) : ["（未提取到场景信息）"]),
    "",
    "---",
    "",
    "## 配乐提示表",
    "",
    ...(soundtrackList.length > 0
      ? [
          "| 集数 | 场次 | 配乐描述 |",
          "|------|------|----------|",
          ...soundtrackList.map((item) => `| 第${item.ep}集 | ${item.scene} | ${item.music} |`),
        ]
      : ["（未提取到配乐提示）"]),
    "",
    "---",
    "",
    "## 创作方案",
    "",
    creativePlan || "（暂无创作方案）",
    "",
    "---",
    "",
    "## 角色档案",
    "",
    characters || "（暂无角色档案）",
    "",
    "---",
    "",
    "## 分集剧本",
    "",
    ...sortedEpisodes.flatMap((episode) => [
      `### ${formatEpisodeTitle(episode)}`,
      "",
      episode.content,
      "",
      "---",
      "",
    ]),
  ].join("\n");
}

const StepExport = ({ setup, dramaTitle, creativePlan, characters, episodes }: StepExportProps) => {
  const navigate = useNavigate();
  const abortRef = useRef<AbortController | null>(null);
  const [exportedText, setExportedText] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [copied, setCopied] = useState(false);

  const sortedEpisodes = useMemo(() => sortEpisodes(episodes), [episodes]);
  const totalWords = useMemo(
    () => sortedEpisodes.reduce((sum, episode) => sum + episode.wordCount, 0),
    [sortedEpisodes],
  );
  const displayText = isExporting ? streamingText : exportedText;

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      await exportToDocx(setup, dramaTitle, creativePlan, characters, sortedEpisodes);
      toast({ title: "Word 文档导出成功" });
    } catch (error: any) {
      toast({
        title: "Word 导出失败",
        description: error?.message || "请稍后重试",
        variant: "destructive",
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setStreamingText("");
    abortRef.current = new AbortController();

    try {
      const prompt = buildExportPrompt(
        setup,
        dramaTitle,
        creativePlan,
        characters,
        sortedEpisodes,
      );
      const model = readStoredDecomposeModel();
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
    } catch (error: any) {
      const aborted =
        error?.name === "AbortError" ||
        typeof error?.message === "string" && error.message.includes("取消");

      if (aborted) {
        if (streamingText.trim()) {
          setExportedText(streamingText);
        }
        toast({ title: "已停止生成，保留当前导出内容" });
      } else {
        toast({
          title: "导出失败",
          description: error?.message || "请稍后重试",
          variant: "destructive",
        });
      }
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleQuickExport = () => {
    setExportedText(
      buildQuickExportMarkdown(
        setup,
        dramaTitle,
        creativePlan,
        characters,
        sortedEpisodes,
      ),
    );
    toast({ title: "已生成快速整合稿，可继续复制或下载" });
  };

  const handleCopy = async () => {
    if (!exportedText.trim()) return;

    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      toast({ title: "已复制到剪贴板" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    if (!exportedText.trim()) return;

    const blob = new Blob([exportedText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${dramaTitle || "剧本整合稿"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadEpisode = (episode: EpisodeScript) => {
    const content = `# ${formatEpisodeTitle(episode)}\n\n${episode.content}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ep${String(episode.number).padStart(3, "0")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    sortedEpisodes.forEach((episode, index) => {
      window.setTimeout(() => handleDownloadEpisode(episode), index * 200);
    });
    toast({ title: `正在下载 ${sortedEpisodes.length} 个分集文件` });
  };

  const handleUseInVideo = () => {
    const allScript = sortedEpisodes.map((episode) => episode.content).join("\n\n---\n\n");

    saveAgentHandoff(
      buildAgentHandoff(allScript, {
        route: "script-creator",
        scriptMode: "traditional",
        title: "Agent 已接管视频出片准备",
        subtitle: "我会先根据现有剧本整理分镜、镜头意图和视频生成需求，并继续留在首页会话里推进。",
      }),
    );

    navigate("/");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导出剧本</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-muted-foreground">题材</div>
              <div className="mt-0.5 font-medium">{setup.genres.join(" + ") || "待补充"}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-muted-foreground">已完成</div>
              <div className="mt-0.5 font-medium">
                {sortedEpisodes.length} / {setup.totalEpisodes || sortedEpisodes.length} 集
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-muted-foreground">总字数</div>
              <div className="mt-0.5 font-medium">{totalWords.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="text-muted-foreground">剧名</div>
              <div className="mt-0.5 font-medium">{dramaTitle || "未命名短剧"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleQuickExport}
              variant="outline"
              className="gap-1.5"
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
              快速整合
            </Button>
            {isExporting ? (
              <Button variant="destructive" onClick={handleStop} className="gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                停止
              </Button>
            ) : (
              <Button onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                AI 整合导出
              </Button>
            )}
            <Button
              onClick={handleUseInVideo}
              variant="secondary"
              className="gap-1.5"
              disabled={sortedEpisodes.length === 0}
            >
              <Film className="h-4 w-4" />
              用于视频创作
            </Button>
            <Button
              onClick={handleDownloadAll}
              variant="outline"
              className="gap-1.5"
              disabled={sortedEpisodes.length === 0}
            >
              <Download className="h-4 w-4" />
              下载全部分集
            </Button>
            <Button
              onClick={handleExportDocx}
              variant="outline"
              className="gap-1.5"
              disabled={sortedEpisodes.length === 0 || isExportingDocx}
            >
              {isExportingDocx ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              导出 Word
            </Button>
          </div>
        </CardContent>
      </Card>

      {displayText && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              导出预览
              {isExporting && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {streamingText.length} 字
                </span>
              )}
            </CardTitle>
            {!isExporting && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5"
                  disabled={!exportedText.trim()}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "已复制" : "复制"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1.5"
                  disabled={!exportedText.trim()}
                >
                  <Download className="h-3.5 w-3.5" />
                  下载 .md
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
              {displayText}
              {isExporting && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
              )}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StepExport;
