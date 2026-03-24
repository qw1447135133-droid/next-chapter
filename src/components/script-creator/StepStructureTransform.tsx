import { useMemo, useState, useRef, useEffect } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowRight,
  RefreshCw,
  Pencil,
  Eye,
  Loader2,
  Columns2,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildStructureTransformPrompt } from "@/lib/drama-prompts";
import { FRAMEWORK_STYLES, TARGET_MARKETS } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";
import {
  useTranslation,
  InterleavedText,
  TranslateToggle,
  TranslationProgress,
  isNonChineseText,
} from "./TranslateButton";

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

/** 与「选择框架风格」触发器同宽，保证上下对齐 */
const FRAMEWORK_ROW_WIDTH = "w-[min(520px,calc(100vw-2rem))]";
const FRAMEWORK_CONTROL_WRAP = `${FRAMEWORK_ROW_WIDTH} min-w-0 shrink-0`;

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [showComparison, setShowComparison] = useState(true);
  const [selectedStyles, setSelectedStyles] = useState<string[]>(() => {
    if (!frameworkStyle) return [];
    return frameworkStyle
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  });
  // 当前选择的转换目标市场（默认跟随 setup.targetMarket，但允许切换）
  const [transformMarket, setTransformMarket] = useState<string>(setup?.targetMarket || "cn");
  const groupedStyles = useMemo(() => {
    // 过滤：只显示当前市场支持的风栵，或多市场共享的风栵
    const filtered = FRAMEWORK_STYLES.filter(
      (style) => style.markets.includes(transformMarket),
    );
    const groups = new Map<string, Array<(typeof FRAMEWORK_STYLES)[number]>>();
    for (const style of filtered) {
      const list = groups.get(style.category) ?? [];
      list.push(style);
      groups.set(style.category, list);
    }
    return Array.from(groups.entries());
  }, [transformMarket]);
  /** 框架风格：主下拉 → 先分类列表，点分类再进具体风格 */
  const [frameworkMenuOpen, setFrameworkMenuOpen] = useState(false);
  const [frameworkDrillCategory, setFrameworkDrillCategory] = useState<string | null>(null);

  const stylesInDrillCategory = useMemo(() => {
    if (!frameworkDrillCategory) return [];
    const entry = groupedStyles.find(([c]) => c === frameworkDrillCategory);
    return entry?.[1] ?? [];
  }, [groupedStyles, frameworkDrillCategory]);

  const handleFrameworkMenuOpenChange = (open: boolean) => {
    setFrameworkMenuOpen(open);
    if (!open) setFrameworkDrillCategory(null);
  };

  useEffect(() => {
    setFrameworkMenuOpen(false);
    setFrameworkDrillCategory(null);
  }, [transformMarket]);

  const abortRef = useRef<AbortController | null>(null);

  const keepOriginal = selectedStyles.length === 0;
  const frameworkLabel = keepOriginal
    ? "保持原剧类型"
    : selectedStyles.join("、");
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const {
    isTranslating,
    showTranslation,
    translate,
    stopTranslation,
    clearTranslation,
    getTranslation,
    hasTranslation,
    progress: transProgress,
    canResume: transCanResume,
    resumeTranslation,
  } = useTranslation();
  const nonChinese = isNonChineseText(structureTransform);

  const handleGenerate = async () => {
    if (!referenceStructure) {
      toast({
        title: "请先在「参考剧本」步骤完成识别，提取原文结构",
        variant: "destructive",
      });
      return;
    }
    onStyleChange(keepOriginal ? "" : selectedStyles.join("、"));
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildStructureTransformPrompt(
        setup,
        referenceStructure,
        keepOriginal ? "" : selectedStyles.join("、"),
        transformMarket,
      );
      const model =
        localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
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
        toast({
          title: "生成失败",
          description: e?.message,
          variant: "destructive",
        });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const displayText = isGenerating ? streamingText : structureTransform;
  const hasSavedResult = structureTransform.trim().length > 0;
  const toggleFrameworkStyle = (value: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(value)) return prev.filter((s) => s !== value);
      if (prev.length >= 2) {
        toast({ title: "最多选择 2 个框架风格", variant: "destructive" });
        return prev;
      }
      return [...prev, value];
    });
  };

  return (
    <div className="space-y-4">
      {/* Framework style selection: market switcher + style picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">框架风格（最多 2 个）</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            点击下拉先选分类，再选具体风格；不选则沿用原剧类型改编。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Market switcher — 外层宽度与下方「选择框架风格」一致 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0 h-7 flex items-center">
                目标市场：
              </span>
              <span
                className={`text-xs shrink-0 h-7 flex items-center gap-1 transition-opacity ${
                  transformMarket !== setup?.targetMarket
                    ? "text-amber-500 opacity-100"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                已切换目标市场
              </span>
            </div>
            <div className={FRAMEWORK_CONTROL_WRAP}>
              <div className="flex w-full rounded-lg border border-border bg-muted/50 p-0.5 gap-0.5">
                {TARGET_MARKETS.map((market) => (
                  <button
                    key={market.value}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => {
                      setTransformMarket(market.value);
                      setSelectedStyles([]);
                    }}
                    className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-center text-[11px] font-medium leading-tight transition-all sm:px-2 sm:text-xs ${
                      transformMarket === market.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                    title={`${market.label} — ${market.desc}`}
                  >
                    {market.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 框架风格：主按钮下拉 → 仅分类；点分类再出具体风格 */}
          <div className="flex flex-wrap items-start gap-3">
            <div className={FRAMEWORK_CONTROL_WRAP}>
              {groupedStyles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  当前目标市场暂无可选框架风格，请切换目标市场后重试。
                </div>
              ) : (
                <Popover
                  open={frameworkMenuOpen}
                  onOpenChange={handleFrameworkMenuOpenChange}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      className="h-10 w-full min-w-0 justify-between gap-2 px-3 font-normal shadow-sm"
                      disabled={isGenerating}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {selectedStyles.length === 0
                          ? "选择框架风格（最多 2 个）"
                          : selectedStyles.join("、")}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 opacity-90 transition-transform ${
                          frameworkMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className={`${FRAMEWORK_ROW_WIDTH} max-w-[min(520px,calc(100vw-2rem))] p-2`}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {!frameworkDrillCategory ? (
                      <div className="flex flex-col gap-1" role="menu">
                        <p className="px-2 pb-1 text-[11px] text-muted-foreground">
                          请选择分类
                        </p>
                        {groupedStyles.map(([category]) => (
                          <button
                            key={category}
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent/60"
                            onClick={() => setFrameworkDrillCategory(category)}
                          >
                            <span>{category}</span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mb-2 h-8 justify-start px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => setFrameworkDrillCategory(null)}
                        >
                          ← 返回分类
                        </Button>
                        <p className="px-1 pb-2 text-xs font-medium text-foreground">
                          {frameworkDrillCategory}
                        </p>
                        <div className="max-h-[min(420px,50vh)] space-y-2 overflow-y-auto pr-0.5">
                          {stylesInDrillCategory.map((style) => {
                            const isSelected = selectedStyles.includes(style.value);
                            return (
                              <button
                                key={style.value}
                                type="button"
                                disabled={isGenerating}
                                onClick={() => toggleFrameworkStyle(style.value)}
                                className={`relative w-full rounded-lg border p-3 text-left text-sm transition-all ${
                                  isSelected
                                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                                    : "border-border hover:border-primary/50 hover:bg-accent/30"
                                } disabled:opacity-50`}
                              >
                                {isSelected && (
                                  <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded bg-primary text-primary-foreground">
                                    <Check className="h-3 w-3" />
                                  </span>
                                )}
                                <div className="pr-6 font-medium">{style.label}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {style.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {keepOriginal && (
              <div
                className="inline-flex h-10 shrink-0 items-center rounded-md border border-border/60 bg-muted/50 px-2.5 text-xs text-muted-foreground sm:text-sm"
                role="status"
                aria-live="polite"
              >
                <span
                  className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  aria-hidden
                />
                保持原剧类型（改名+洗稿60%）
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transform result */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">结构转换</CardTitle>
          <div className="flex gap-2">
            {(hasSavedResult || isGenerating) && (
              <>
                {hasSavedResult ? (
                  <TranslateToggle
                    isNonChinese={nonChinese}
                    isTranslating={isTranslating}
                    showTranslation={showTranslation}
                    onTranslate={() => translate(structureTransform)}
                    onClear={clearTranslation}
                    onStop={stopTranslation}
                    disabled={editing || isGenerating}
                  />
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowComparison(!showComparison)}
                  className="gap-1.5"
                  disabled={isGenerating}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  {showComparison ? "关闭对照" : "原文对照"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(!editing)}
                  className="gap-1.5"
                  disabled={isGenerating || !hasSavedResult}
                >
                  {editing ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                  {editing ? "预览" : "编辑"}
                </Button>
              </>
            )}
            {isGenerating ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                className="gap-1.5"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                停止
              </Button>
            ) : (
              <Button
                variant={structureTransform ? "outline" : "default"}
                size="sm"
                onClick={handleGenerate}
                className="gap-1.5"
                disabled={false}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {structureTransform ? "重新生成" : "AI 转换"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isTranslating || transCanResume) && (
            <TranslationProgress
              progress={transProgress}
              canResume={transCanResume}
              onResume={resumeTranslation}
            />
          )}
          {showComparison ? (
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
                  转换结果（{frameworkLabel}）
                </h4>
                {isGenerating ? (
                  <div className="max-h-[600px] min-h-[280px] overflow-auto border rounded-md p-3 bg-muted/20">
                    {!streamingText ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">生成中……</p>
                        <p className="text-xs text-center px-4">
                          {keepOriginal
                            ? "保持原剧类型，改名与洗稿进行中"
                            : "正在转换为所选框架风格的创作方案"}
                        </p>
                      </div>
                    ) : (
                      <pre
                        ref={scrollRef}
                        className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90"
                      >
                        {streamingText}
                        <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                      </pre>
                    )}
                  </div>
                ) : editing ? (
                  <Textarea
                    value={structureTransform}
                    onChange={(e) => onUpdate(e.target.value)}
                    rows={20}
                    className="font-mono text-sm min-h-[280px]"
                  />
                ) : showTranslation && hasTranslation(structureTransform) ? (
                  <div className="max-h-[600px] min-h-[280px] overflow-auto border rounded-md p-3">
                    <InterleavedText
                      text={structureTransform}
                      translatedLines={getTranslation(structureTransform)!}
                    />
                  </div>
                ) : hasSavedResult ? (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] min-h-[280px] overflow-auto border rounded-md p-3">
                    {structureTransform}
                  </pre>
                ) : (
                  <div className="max-h-[600px] min-h-[280px] overflow-auto border rounded-md p-3 bg-muted/20 text-sm text-muted-foreground flex flex-col items-center justify-center text-center py-12 px-4">
                    <p>点击右上角「AI 转换」生成</p>
                    <p className="text-xs mt-2">
                      {keepOriginal
                        ? "不选风格时默认保持原剧类型（改名+洗稿约60%）"
                        : "将保留原文核心情节，转换为所选风格"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : !hasSavedResult && !isGenerating ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击「AI 转换」生成；不选风格时默认保持原剧类型</p>
              <p className="text-xs mt-2">
                {keepOriginal
                  ? "AI 将保持原剧类型，仅改人物/场景/道具名称，洗稿约60%"
                  : "AI 将保留原文的核心情节，转换为所选风格的创作方案"}
              </p>
            </div>
          ) : isGenerating ? (
            <div className="max-h-[600px] min-h-[280px] overflow-auto border rounded-md p-3 bg-muted/20">
              {!streamingText ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">生成中……</p>
                  <p className="text-xs text-center px-4">
                    {keepOriginal
                      ? "保持原剧类型，改名与洗稿进行中"
                      : "正在转换为所选框架风格的创作方案"}
                  </p>
                </div>
              ) : (
                <pre
                  ref={scrollRef}
                  className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90"
                >
                  {streamingText}
                  <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                </pre>
              )}
            </div>
          ) : editing ? (
            <Textarea
              value={structureTransform}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : showTranslation && hasTranslation(structureTransform) ? (
            <div className="max-h-[600px] overflow-auto">
              <InterleavedText
                text={structureTransform}
                translatedLines={getTranslation(structureTransform)!}
              />
            </div>
          ) : (
            <pre
              ref={scrollRef}
              className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto"
            >
              {displayText}
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
