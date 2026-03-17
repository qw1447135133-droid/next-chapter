import { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, RefreshCw, Pencil, Eye, Square, ShieldCheck, Upload, Film, FileText, ChevronDown, ChevronUp, Palette } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "@/components/script-creator/TranslateButton";

type ComplianceModel = "gemini-3.1-pro-preview" | "gemini-3-pro-preview" | "gemini-3-flash-preview";

const MODEL_OPTIONS: { value: ComplianceModel; label: string }[] = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

const STANDALONE_COMPLIANCE_PROMPT = (scriptText: string) => `你是一位资深的短剧内容合规审核专家，精通各类内容监管法规与平台规范。

## 待审核内容
${scriptText}

---

## 审核要求

请对上述内容进行全面合规审查，按以下四个维度检查并输出报告：

### 一、红线检测
检查以下内容是否存在：
- 政治敏感内容（损害国家形象、歪曲历史、分裂国家等）
- 违法犯罪美化（美化暴力、教唆犯罪、展示犯罪细节等）
- 色情低俗内容（裸露描写、性暗示、低俗对话等）
- 歧视侮辱内容（性别歧视、种族歧视、地域歧视等）

### 二、高风险内容
检查以下内容是否存在：
- 未成年人相关风险（恋爱、暴力、不良诱导等）
- 宗教民族敏感（不当引用、刻板印象等）
- 历史事件引用（是否符合史实、是否有不当戏说等）
- 医疗法律相关（虚假医疗信息、错误法律知识等）

### 三、正能量校验
评估以下方面：
- 整体价值观导向是否积极健康
- 是否存在消极示范（拜金、暴力解决问题等）
- 社会影响评估
- 是否有正面引导意义

### 四、广告植入审查
检查以下方面：
- 是否存在软广/硬广内容
- 品牌露出方式是否合规
- 是否存在虚假宣传暗示

### 特别注意（国内市场）
- 广电总局《微短剧管理办法》相关要求
- 平台审核标准（抖音/快手/微信视频号等）
- 备案所需的内容安全合规要求

## 输出格式

使用以下标记标注问题严重程度：
- ⛔ 红线问题（必须修改，否则无法过审）
- ⚠️ 高风险内容（建议修改，存在被退回风险）
- ℹ️ 优化建议（可选修改，提升合规安全性）

输出结构：
1. **合规总评**：一段话总结合规状态
2. **红线检测结果**：逐项检查结果
3. **高风险内容排查**：逐项检查结果
4. **正能量校验**：评估结论
5. **广告植入审查**：检查结论
6. **问题清单汇总**：按严重程度排序的完整问题列表
7. **修改建议**：针对每个问题的具体修改方案

**重要：在修改建议中，请明确引用原文中存在合规风险的具体语句或段落，用【】标记出原文中的风险片段，例如：【风险原文片段】。这将用于后续自动标注。**

用 Markdown 格式输出，清晰分区。`;

const ComplianceReview = () => {
  const navigate = useNavigate();
  const [scriptText, setScriptText] = useState("");
  const [complianceReport, setComplianceReport] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);
  const [model, setModel] = useState<ComplianceModel>(
    () => (localStorage.getItem("compliance-model") as ComplianceModel) || "gemini-3.1-pro-preview"
  );
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(complianceReport);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleModelChange = (m: ComplianceModel) => {
    setModel(m);
    localStorage.setItem("compliance-model", m);
    setModelDropdownOpen(false);
  };

  // Extract risk phrases from report (marked with 【】)
  const riskPhrases = useMemo(() => {
    if (!complianceReport) return [];
    const matches = complianceReport.match(/【([^】]+)】/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  }, [complianceReport]);

  // Build highlighted script with risk phrases marked
  const highlightedScript = useMemo(() => {
    if (!scriptText || riskPhrases.length === 0) return null;
    // Build a regex matching any risk phrase
    const escaped = riskPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = scriptText.split(regex);
    return parts.map((part, i) => {
      if (riskPhrases.includes(part)) {
        return (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 text-foreground rounded px-0.5">
            {part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [scriptText, riskPhrases]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "文件过大", description: "最大支持 10MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      if (ext === "txt") {
        const text = await file.text();
        setScriptText((prev) => (prev ? prev + "\n\n" : "") + text);
        toast({ title: "文件已加载" });
      } else if (["pdf", "docx", "doc"].includes(ext)) {
        const formData = new FormData();
        formData.append("file", file);
        const { data, error } = await supabase.functions.invoke("parse-document", { body: formData });
        if (error) throw error;
        if (data?.text) {
          setScriptText((prev) => (prev ? prev + "\n\n" : "") + data.text);
          toast({ title: "文档解析完成" });
        }
      } else {
        toast({ title: "不支持的格式", description: "支持 TXT、PDF、DOCX 文件", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "文件解析失败", description: err?.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!scriptText.trim()) {
      toast({ title: "请先输入或上传剧本内容", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    setStreamingText("");
    setReportOpen(true);
    abortRef.current = new AbortController();
    try {
      const prompt = STANDALONE_COMPLIANCE_PROMPT(scriptText);
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );
      setComplianceReport(finalText);
      setStreamingText("");
      toast({ title: "合规审核完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        const partial = streamingText;
        if (partial) setComplianceReport(partial);
        toast({ title: "已停止生成" });
      } else {
        toast({ title: "审核失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();
  const displayText = isGenerating ? streamingText : complianceReport;

  const redLineCount = (complianceReport.match(/⛔/g) || []).length;
  const highRiskCount = (complianceReport.match(/⚠️/g) || []).length;
  const infoCount = (complianceReport.match(/ℹ️/g) || []).length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold font-[Space_Grotesk]">Infinio</span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-4xl mx-auto w-full space-y-6">
        {/* Script Input Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              剧本内容
            </CardTitle>
            <div className="flex gap-2 items-center">
              {/* Model Selector */}
              <div className="relative" ref={modelDropdownRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                  className="gap-1.5 min-w-[140px] justify-between"
                >
                  <span className="truncate">{MODEL_OPTIONS.find(o => o.value === model)?.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </Button>
                {modelDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]">
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleModelChange(opt.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${model === opt.value ? "bg-accent/50 font-medium" : ""}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx,.doc"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                {isUploading ? "解析中..." : "上传文档"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="粘贴剧本内容，或点击上方按钮上传 TXT / PDF / DOCX 文档..."
              rows={12}
              className="font-mono text-sm"
            />
            <div className="text-xs text-muted-foreground mt-2 text-right">
              {scriptText.length} 字
            </div>
          </CardContent>
        </Card>

        {/* Compliance Report Card — Collapsible */}
        <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none hover:bg-accent/30 transition-colors rounded-t-lg">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  合规审核报告
                  {complianceReport && !isGenerating && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ⛔{redLineCount} · ⚠️{highRiskCount} · ℹ️{infoCount}
                    </span>
                  )}
                  {reportOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {complianceReport && !isGenerating && (
                    <>
                      <TranslateToggle
                        isNonChinese={nonChinese}
                        isTranslating={isTranslating}
                        showTranslation={showTranslation}
                        onTranslate={() => translate(complianceReport)}
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
                      <Square className="h-3.5 w-3.5" />
                      停止
                    </Button>
                  ) : (
                    <Button
                      variant={complianceReport ? "outline" : "default"}
                      size="sm"
                      onClick={handleGenerate}
                      disabled={!scriptText.trim()}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {complianceReport ? "重新审核" : "开始审核"}
                    </Button>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
                {!displayText ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>输入或上传剧本内容后，点击"开始审核"进行合规检查</p>
                    <p className="text-xs mt-2">检查维度：红线检测、高风险内容、正能量校验、广告植入合规</p>
                  </div>
                ) : editing && !isGenerating ? (
                  <Textarea
                    value={complianceReport}
                    onChange={(e) => setComplianceReport(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                ) : showTranslation && !isGenerating && hasTranslation(complianceReport) ? (
                  <div className="max-h-[600px] overflow-auto">
                    <InterleavedText text={complianceReport} translatedLines={getTranslation(complianceReport)!} />
                  </div>
                ) : (
                  <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
                    {displayText}
                    {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
                  </pre>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Risk Highlight Comparison */}
        {complianceReport && !isGenerating && scriptText && riskPhrases.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                <span className="text-sm font-normal text-muted-foreground">
                  共标记 {riskPhrases.length} 处风险片段
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-yellow-200 dark:bg-yellow-700/60 border border-yellow-400/50" />
                  合规风险标记
                </span>
              </div>
              <div className="max-h-[500px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                  {highlightedScript}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ComplianceReview;
