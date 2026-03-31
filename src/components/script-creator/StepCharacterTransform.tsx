import { useState, useRef, useEffect } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, RefreshCw, Pencil, Eye, Loader2, GitBranch } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildCharacterTransformPrompt } from "@/lib/drama-prompts";
import { readStoredDecomposeModel } from "@/lib/gemini-text-models";
import type { DramaSetup } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

/** Extract mermaid code from text */
function extractMermaid(text: string): string | null {
  const match = text.match(/```mermaid\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

/** Remove mermaid code blocks from text */
function removeMermaid(text: string): string {
  return text.replace(/```mermaid\s*\n[\s\S]*?```\s*/g, "").trim();
}

/** Sanitise mermaid code – make AI-generated graphs parseable */
function sanitiseMermaidCode(code: string): string {
  // Process line by line for reliability
  return code.split("\n").map(line => {
    // Skip declaration lines (graph TD, etc.)
    if (/^\s*(graph|flowchart|subgraph|end|style|classDef|click)\b/i.test(line.trim())) return line;
    // Replace smart quotes
    let l = line.replace(/[""]/g, '"').replace(/['']/g, "'");
    // Escape ampersands inside labels
    l = l.replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;");
    // Replace single quotes with backticks everywhere (mermaid chokes on them)
    l = l.replace(/'/g, "`");
    // Wrap bare node labels that contain special chars: A[Some-Label] → A["Some-Label"]
    l = l.replace(/\[([^\]"]+)\]/g, (_m, inner: string) => {
      // Only quote if it contains chars that might confuse mermaid
      if (/[#`/\\(){}|<>]/.test(inner)) return `["${inner}"]`;
      return `[${inner}]`;
    });
    return l;
  }).join("\n");
}
/** Lazy mermaid renderer */
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
        if (cancelled) return;
        const id = `mermaid-ct-${Date.now()}`;
        const sanitised = sanitiseMermaidCode(code);
        const { svg: rendered } = await mermaid.render(id, sanitised);
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "渲染失败");
          setSvg("");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) return <p className="text-xs text-muted-foreground py-4 text-center">加载关系图中…</p>;
  if (error) return (
    <div className="text-xs text-muted-foreground p-3 border rounded bg-muted/30">
      <p className="font-medium mb-1">关系图渲染失败</p>
      <pre className="text-xs whitespace-pre-wrap">{code}</pre>
    </div>
  );
  return <div ref={containerRef} className="overflow-auto border rounded-lg p-4 bg-background" dangerouslySetInnerHTML={{ __html: svg }} />;
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
  const [showDiagram, setShowDiagram] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(characterTransform);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildCharacterTransformPrompt(setup, referenceScript, frameworkStyle, structureTransform);
      const model = readStoredDecomposeModel();
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
          <CardTitle className="text-lg">
            角色转换（{frameworkStyle ? `${frameworkStyle}风格` : "保持原剧类型"}）
          </CardTitle>
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
                  onStop={stopTranslation}
                  disabled={editing}
                />
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                  {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editing ? "预览" : "编辑"}
                </Button>
              </>
            )}
            {isGenerating ? (
              <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
          {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
          {showDiagram && mermaidCode && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
              <MermaidDiagram code={mermaidCode} />
            </div>
          )}

          {editing && !isGenerating ? (
            <Textarea
              value={characterTransform}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : showTranslation && !isGenerating && hasTranslation(removeMermaid(characterTransform)) ? (
            <div className="max-h-[600px] overflow-auto">
              <InterleavedText text={removeMermaid(characterTransform)} translatedLines={getTranslation(removeMermaid(characterTransform))!} />
            </div>
          ) : (
            <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {cleanText}
              {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          )}
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
