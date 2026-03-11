import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, RefreshCw, Pencil, Eye, Square, Columns2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildStructureTransformPrompt } from "@/lib/drama-prompts";
import { FRAMEWORK_STYLES } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";

interface StepStructureTransformProps {
  setup: DramaSetup;
  referenceScript: string;
  frameworkStyle: string;
  structureTransform: string;
  onStyleChange: (style: string) => void;
  onUpdate: (content: string) => void;
  onNext: () => void;
}

const StepStructureTransform = ({
  setup,
  referenceScript,
  frameworkStyle,
  structureTransform,
  onStyleChange,
  onUpdate,
  onNext,
}: StepStructureTransformProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState(frameworkStyle || "");
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    if (!selectedStyle) {
      toast({ title: "请先选择框架风格方向", variant: "destructive" });
      return;
    }
    onStyleChange(selectedStyle);
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildStructureTransformPrompt(setup, referenceScript, selectedStyle);
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
      toast({ title: "结构转换完成" });
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

  const displayText = isGenerating ? streamingText : structureTransform;

  return (
    <div className="space-y-4">
      {/* Framework style selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">框架风格方向</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FRAMEWORK_STYLES.map((style) => (
              <Badge
                key={style.value}
                variant={selectedStyle === style.value ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105"
                onClick={() => !isGenerating && setSelectedStyle(style.value)}
              >
                {style.label}
                <span className="ml-1 text-xs opacity-70">{style.desc}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transform result */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">结构转换</CardTitle>
          <div className="flex gap-2">
            {structureTransform && !isGenerating && (
              <>
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
                variant={structureTransform ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
                disabled={!selectedStyle}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {structureTransform ? "重新生成" : "AI 转换"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {showComparison && !isGenerating ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">原文剧本</h4>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/70 max-h-[600px] overflow-auto border rounded-md p-3 bg-muted/30">
                  {referenceScript}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  转换结果（{selectedStyle}）
                </h4>
                {editing ? (
                  <Textarea
                    value={structureTransform}
                    onChange={(e) => onUpdate(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto border rounded-md p-3">
                    {structureTransform}
                  </pre>
                )}
              </div>
            </div>
          ) : !displayText ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>选择框架风格方向后，点击"AI 转换"按钮</p>
              <p className="text-xs mt-2">AI 将保留原文的核心情节，转换为所选风格的创作方案</p>
            </div>
          ) : editing && !isGenerating ? (
            <Textarea
              value={structureTransform}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {displayText}
              {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          )}
        </CardContent>
      </Card>

      {structureTransform && !isGenerating && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认结构，进入角色转换
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepStructureTransform;
