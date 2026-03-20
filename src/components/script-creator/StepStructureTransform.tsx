import { useState, useRef } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, RefreshCw, Pencil, Eye, Square, Columns2, Plus, X, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream, callGemini, extractText } from "@/lib/gemini-client";
import { buildStructureTransformPrompt } from "@/lib/drama-prompts";
import { FRAMEWORK_STYLES } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

interface StepStructureTransformProps {
  setup: DramaSetup;
  referenceScript: string;
  referenceStructure: string;
  frameworkStyle: string;
  structureTransform: string;
  onStyleChange: (style: string) => void;
  onUpdate: (content: string) => void;
  onNext: () => void;
}

const StepStructureTransform = ({
  setup,
  referenceScript,
  referenceStructure,
  frameworkStyle,
  structureTransform,
  onStyleChange,
  onUpdate,
  onNext,
}: StepStructureTransformProps) => {
  // 支持多选（最多2个）
  const [selectedStyles, setSelectedStyles] = useState<string[]>(() => {
    if (frameworkStyle) {
      // 兼容旧数据，可能是逗号分隔的多风格
      return frameworkStyle.split(",").filter(Boolean);
    }
    return [];
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  
  // 自定义风格相关
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customStyleInput, setCustomStyleInput] = useState("");
  const [isDetectingStyle, setIsDetectingStyle] = useState(false);
  
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(structureTransform);

  // 切换风格选择
  const toggleStyle = (style: string) => {
    if (isGenerating) return;
    
    setSelectedStyles((prev) => {
      if (prev.includes(style)) {
        // 取消选择
        return prev.filter((s) => s !== style);
      }
      if (prev.length >= 2) {
        // 已选2个，替换第一个
        toast({ title: "最多选择2个风格方向", description: "已自动替换最早选择的风格" });
        return [prev[1], style];
      }
      // 添加选择
      return [...prev, style];
    });
  };

  // AI 识别自定义风格
  const handleDetectCustomStyle = async () => {
    if (!customStyleInput.trim()) {
      toast({ title: "请输入风格描述", variant: "destructive" });
      return;
    }
    
    setIsDetectingStyle(true);
    try {
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const prompt = `你是一位专业的剧本风格分析师。请分析用户输入的风格描述，提炼出一个简洁的风格名称（2-6个字）和简短描述（10-20字）。

用户输入：${customStyleInput}

请以 JSON 格式输出：
{
  "name": "风格名称",
  "desc": "风格描述"
}

只输出 JSON，不要输出其他内容。`;

      const result = await callGemini(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        { maxOutputTokens: 256 },
      );
      
      const text = extractText(result);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const newStyle = parsed.name || "自定义风格";
        
        // 添加到已选风格
        setSelectedStyles((prev) => {
          if (prev.length >= 2) {
            return [prev[1], newStyle];
          }
          return [...prev, newStyle];
        });
        
        setCustomStyleInput("");
        setShowCustomInput(false);
        toast({ title: `已识别风格：${newStyle}`, description: parsed.desc });
      }
    } catch (e: any) {
      toast({ title: "识别失败", description: e?.message, variant: "destructive" });
    } finally {
      setIsDetectingStyle(false);
    }
  };

  // 移除已选风格
  const removeStyle = (style: string) => {
    setSelectedStyles((prev) => prev.filter((s) => s !== style));
  };

  const handleGenerate = async () => {
    if (!referenceStructure) {
      toast({ title: '请先在「参考剧本」步骤完成识别，提取原文结构', variant: "destructive" });
      return;
    }
    
    const styleString = selectedStyles.join(",");
    onStyleChange(styleString);
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildStructureTransformPrompt(setup, referenceStructure, styleString);
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
      toast({ title: selectedStyles.length === 0 ? "结构转换完成（保持原文风格）" : "结构转换完成" });
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
          <CardTitle className="text-lg flex items-center gap-2">
            框架风格方向
            <span className="text-xs font-normal text-muted-foreground">
              （可选，最多2个；不选则保持原文风格但更换所有名称）
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 已选风格显示 */}
          {selectedStyles.length > 0 ? (
            <div className="flex flex-wrap gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <span className="text-xs text-muted-foreground mr-1">已选择：</span>
              {selectedStyles.map((style) => (
                <Badge
                  key={style}
                  variant="default"
                  className="px-3 py-1 text-sm gap-1"
                >
                  {style}
                  <button
                    onClick={() => removeStyle(style)}
                    className="ml-1 hover:bg-primary-foreground/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-muted">
              <span className="text-xs text-muted-foreground">
                未选择风格 → 将保持原文风格，但<strong className="text-foreground">所有人物、地点、道具名称必须更换</strong>（降低查重率）
              </span>
            </div>
          )}
          
          {/* 风格选项 */}
          <div className="flex flex-wrap gap-2">
            {FRAMEWORK_STYLES.map((style) => (
              <Badge
                key={style.value}
                variant={selectedStyles.includes(style.value) ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105"
                onClick={() => toggleStyle(style.value)}
              >
                {style.label}
                <span className="ml-1 text-xs opacity-70">{style.desc}</span>
              </Badge>
            ))}
          </div>
          
          {/* 自定义风格输入 */}
          <div className="pt-2 border-t">
            {!showCustomInput ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCustomInput(true)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                自定义风格
              </Button>
            ) : (
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    value={customStyleInput}
                    onChange={(e) => setCustomStyleInput(e.target.value)}
                    placeholder="输入风格描述，如：赛博朋克+修仙的融合风格..."
                    className="text-sm"
                    disabled={isDetectingStyle}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    描述你想要的风格特点，AI 将自动识别并命名
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleDetectCustomStyle}
                  disabled={!customStyleInput.trim() || isDetectingStyle}
                  className="gap-1.5"
                >
                  {isDetectingStyle ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      识别中
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      AI识别
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomStyleInput("");
                  }}
                >
                  取消
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transform result */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            结构转换
            {selectedStyles.length > 0 ? (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                → {selectedStyles.join(" + ")}
              </span>
            ) : (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                → 保持原文风格（更换名称）
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {structureTransform && !isGenerating && (
              <>
                <TranslateToggle
                  isNonChinese={nonChinese}
                  isTranslating={isTranslating}
                  showTranslation={showTranslation}
                  onTranslate={() => translate(structureTransform)}
                  onClear={clearTranslation}
                  onStop={stopTranslation}
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
                variant={structureTransform ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {structureTransform ? "重新生成" : "AI 转换"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
          {showComparison && !isGenerating ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  原文结构
                </h4>
                {referenceStructure ? (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/70 max-h-[600px] overflow-auto border rounded-md p-3 bg-muted/30">
                    {referenceStructure}
                  </pre>
                ) : (
                  <div className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30 text-center py-8">
                    请先在"参考剧本"步骤完成识别，提取的结构将显示在此处
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  转换结果
                </h4>
                {editing ? (
                  <Textarea
                    value={structureTransform}
                    onChange={(e) => onUpdate(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                ) : showTranslation && hasTranslation(structureTransform) ? (
                  <div className="max-h-[600px] overflow-auto border rounded-md p-3">
                    <InterleavedText text={structureTransform} translatedLines={getTranslation(structureTransform)!} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto border rounded-md p-3">
                    {structureTransform}
                  </pre>
                )}
              </div>
            </div>
          ) : !displayText ? (
            <div className="text-center py-16 text-muted-foreground">
              {selectedStyles.length === 0 ? (
                <>
                  <p>未选择风格，将<strong>保持原文风格</strong>进行改编</p>
                  <p className="text-xs mt-2">所有人物名、地名、道具名将更换为全新名称，确保查重率低</p>
                </>
              ) : (
                <>
                  <p>选择框架风格方向后（最多2个），点击"AI 转换"按钮</p>
                  <p className="text-xs mt-2">AI 将保留原文的核心情节，转换为所选风格的创作方案</p>
                  {selectedStyles.length === 2 && (
                    <p className="text-xs mt-2 text-primary">将融合「{selectedStyles[0]}」与「{selectedStyles[1]}」两种风格特点</p>
                  )}
                </>
              )}
            </div>
          ) : editing && !isGenerating ? (
            <Textarea
              value={structureTransform}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : showTranslation && !isGenerating && hasTranslation(structureTransform) ? (
            <div className="max-h-[600px] overflow-auto">
              <InterleavedText text={structureTransform} translatedLines={getTranslation(structureTransform)!} />
            </div>
          ) : (
            <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
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