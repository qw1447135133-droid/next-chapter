import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, RefreshCw, Pencil, Eye, Square, Columns2, GitBranch } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildCharacterTransformPrompt } from "@/lib/drama-prompts";
import type { DramaSetup } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, isNonChineseText } from "./TranslateButton";

/** Extract mermaid code from text */
function extractMermaid(text: string): string | null {
  const match = text.match(/```mermaid\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** Remove mermaid code blocks from text */
function removeMermaid(text: string): string {
  return text.replace(/```mermaid\s*\n[\s\S]*?```\s*/g, "").trim();
}

/** Lazy mermaid renderer */
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default" });
        if (cancelled || !containerRef.current) return;
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "渲染失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) return <p className="text-xs text-muted-foreground py-4 text-center">加载关系图中…</p>;
  if (error) return <p className="text-xs text-destructive py-2">关系图渲染失败: {error}</p>;
  return <div ref={containerRef} className="overflow-auto" />;
}

interface StepCharacterTransformProps {
  setup: DramaSetup;
  referenceScript: string;
  frameworkStyle: string;
  structureTransform: string;
  characterTransform: string;
  onUpdate: (content: string) => void;
  onNext: () => void;
}

const StepCharacterTransform = ({
  setup,
  referenceScript,
  frameworkStyle,
  structureTransform,
  characterTransform,
  onUpdate,
  onNext,
}: StepCharacterTransformProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { isTranslating, showTranslation, translate, clearTranslation, translatedMap } = useTranslation();
  const nonChinese = isNonChineseText(characterTransform);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildCharacterTransformPrompt(setup, referenceScript, frameworkStyle, structureTransform);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );
      onUpdate(finalText);
      setStreamingText("");
      toast({ title: "角色转换完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        if (streamingText) onUpdate(streamingText);
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

  const mermaidCode = characterTransform ? extractMermaid(characterTransform) : null;
  const cleanText = isGenerating ? streamingText : (characterTransform ? removeMermaid(characterTransform) : "");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">角色转换（{frameworkStyle}风格）</CardTitle>
          <div className="flex gap-2">
            {mermaidCode && !isGenerating && (
              <Button variant="outline" size="sm" onClick={() => setShowDiagram(!showDiagram)} className="gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                {showDiagram ? "隐藏关系图" : "角色关系图"}
              </Button>
            )}
            {characterTransform && !isGenerating && (
              <>
                <TranslateToggle
                  isNonChinese={nonChinese}
                  isTranslating={isTranslating}
                  showTranslation={showTranslation}
                  onTranslate={() => translate(removeMermaid(characterTransform))}
                  onClear={clearTranslation}
                  disabled={editing}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowComparison(!showComparison)}
                  className="gap-1.5"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  {showComparison ? "关闭对照" : "原文对照"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                  {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editing ? "预览" : "编辑"}
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
                variant={characterTransform ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {characterTransform ? "重新生成" : "AI 转换"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showDiagram && mermaidCode && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
              <MermaidDiagram code={mermaidCode} />
            </div>
          )}

          {showComparison && !isGenerating ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">原文角色信息</h4>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/70 max-h-[600px] overflow-auto border rounded-md p-3 bg-muted/30">
                  {referenceScript}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  转换角色（{frameworkStyle}）
                </h4>
                {editing ? (
                  <Textarea
                    value={characterTransform}
                    onChange={(e) => onUpdate(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto border rounded-md p-3">
                    {cleanText}
                  </pre>
                )}
              </div>
            </div>
          ) : !cleanText && !isGenerating ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 转换"按钮，AI 将根据{frameworkStyle}风格转换角色体系</p>
              <p className="text-xs mt-2">保留原文角色核心关系，适配新的世界观和风格</p>
            </div>
          ) : editing && !isGenerating ? (
            <Textarea
              value={characterTransform}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : showTranslation && !isGenerating && translatedMap.has(removeMermaid(characterTransform)) ? (
            <div className="max-h-[600px] overflow-auto">
              <InterleavedText text={removeMermaid(characterTransform)} translatedLines={translatedMap.get(removeMermaid(characterTransform))!} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {cleanText}
              {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          )
        </CardContent>
      </Card>

      {characterTransform && !isGenerating && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认角色，进入分集目录
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepCharacterTransform;
