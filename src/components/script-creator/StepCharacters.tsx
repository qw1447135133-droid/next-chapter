import { useState, useRef, useEffect, useCallback } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, RefreshCw, Pencil, Eye, Square, GitBranch } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildCharactersPrompt } from "@/lib/drama-prompts";
import type { DramaSetup } from "@/types/drama";

interface StepCharactersProps {
  setup: DramaSetup;
  creativePlan: string;
  characters: string;
  onUpdate: (characters: string) => void;
  onNext: () => void;
}

/** Extract mermaid code block from markdown text */
function extractMermaid(text: string): string | null {
  const match = text.match(/```mermaid\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** Remove mermaid code blocks from text for display */
function removeMermaid(text: string): string {
  return text.replace(/```mermaid\s*\n[\s\S]*?```\s*/g, "").trim();
}

/** Lazy Mermaid renderer — only loads the library when mounted */
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const renderDiagram = useCallback(async () => {
    setLoading(true);
    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
      });
      const id = `mermaid-${Date.now()}`;
      const { svg: rendered } = await mermaid.render(id, code);
      setSvg(rendered);
      setError("");
    } catch (e: any) {
      setError(e?.message || "Mermaid 渲染失败");
      setSvg("");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        加载关系图中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-muted-foreground p-3 border rounded bg-muted/30">
        <p className="font-medium mb-1">关系图渲染失败</p>
        <pre className="text-xs whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto border rounded-lg p-4 bg-background"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const StepCharacters = ({ setup, creativePlan, characters, onUpdate, onNext }: StepCharactersProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showRelationship, setShowRelationship] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildCharactersPrompt(setup, creativePlan);
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
      toast({ title: "角色档案生成完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        const partial = streamingText;
        if (partial) onUpdate(partial);
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
  const displayText = isGenerating ? streamingText : (characters ? removeMermaid(characters) : "");
  const mermaidCode = characters ? extractMermaid(characters) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">角色开发</CardTitle>
          <div className="flex gap-2">
            {mermaidCode && !isGenerating && (
              <Button
                variant={showRelationship ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRelationship(!showRelationship)}
                className="gap-1.5"
              >
                <GitBranch className="h-3.5 w-3.5" />
                关系图
              </Button>
            )}
            {characters && !isGenerating && (
              <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editing ? "预览" : "编辑"}
              </Button>
            )}
            {isGenerating ? (
              <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : (
              <Button
                variant={characters ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {characters ? "重新生成" : "AI 生成"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mermaid relationship diagram */}
          {showRelationship && mermaidCode && !isGenerating && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">角色关系图</p>
              <MermaidDiagram code={mermaidCode} />
            </div>
          )}

          {!displayText ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 生成"按钮，AI 将根据创作方案生成完整角色体系</p>
              <p className="text-xs mt-2">包含：角色档案、关系图（Mermaid）、弧光设计、四层反派体系</p>
            </div>
          ) : editing && !isGenerating ? (
            <Textarea
              value={characters}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {displayText}
              {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          )}
        </CardContent>
      </Card>

      {characters && !isGenerating && (
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

export default StepCharacters;
