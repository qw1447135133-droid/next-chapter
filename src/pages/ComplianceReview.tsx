import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, RefreshCw, Pencil, Eye, Square, ShieldCheck, Upload, Film, FileText, ChevronDown, ChevronUp, Palette, Wand2, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "@/components/script-creator/TranslateButton";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";

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

请**仅**对以下三个维度进行合规审查，不检查其它任何项目：

### 一、血腥暴力内容
**仅检查字面上明确的血腥暴力描写**，不考虑引申含义、社会影响或教育问题：
- 明确描写血液、伤口、肢体损伤的文字（如"喷出大量鲜血"、"割破喉咙"、"内脏外露"等）
- 明确描写酷刑虐待过程的文字
- 明确描写致人死亡的暴力行为细节
- **不标记**：推搡、扇耳光、拽头发等轻度肢体冲突；没有血腥细节的打斗；抽象或隐晦的暴力暗示

### 二、版权侵犯
检查是否存在：
- 直接引用受版权保护的作品内容（歌词、台词、小说段落等）
- 明显模仿或抄袭知名 IP 的角色、情节设定
- 未授权使用品牌名称或商标

### 三、色情内容
**仅检查字面上明确的色情描写**，不考虑引申含义：
- 明确的裸露描写或性行为描写
- 明确的性器官描写
- **不标记**：调情对话、亲吻拥抱、暧昧氛围等非明确色情内容

## 输出格式

使用以下标记标注问题严重程度：
- ⛔ 红线问题（必须修改，否则无法过审）
- ⚠️ 高风险内容（建议修改，存在被退回风险）
- ℹ️ 优化建议（可选修改，提升合规安全性）

输出结构：
1. **合规总评**：一段话总结合规状态
2. **血腥暴力检测**：逐项检查结果
3. **版权侵犯排查**：逐项检查结果
4. **色情内容检测**：逐项检查结果
5. **问题清单汇总**：按严重程度排序的完整问题列表
6. **修改建议**：针对每个问题的具体修改方案

**⚠️ 极其重要的标记规则 — 必须严格遵守：**

在整个报告中，每当你提到原文中存在合规风险的具体语句时，**必须**从原文中逐字逐句复制该片段（不得改写、缩写、省略或重新措辞），并用以下格式包裹：
- 红线问题：⛔【原文中逐字复制的风险片段】
- 高风险内容：⚠️【原文中逐字复制的风险片段】
- 优化建议：ℹ️【原文中逐字复制的风险片段】

**要求：**
- 【】内的文字必须与原文完全一致，一个字都不能改动
- 尽量引用完整的句子或段落，不要只引用个别词语
- 每个风险点都必须有对应的原文标记
- 在报告的所有章节中都使用此标记格式，不仅限于修改建议部分

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
  const paletteScrollRef = useRef<HTMLDivElement>(null);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(complianceReport);
  const [paletteEditing, setPaletteEditing] = useState(false);
  const [paletteText, setPaletteText] = useState("");
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(false);
  const autoAdjustAbortRef = useRef<AbortController | null>(null);

  // Sync palette text with script text when not editing
  useEffect(() => {
    if (!paletteEditing) setPaletteText(scriptText);
  }, [scriptText, paletteEditing]);

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

  // Extract risk phrases with severity levels from report
  type RiskLevel = "red" | "high" | "info";
  const riskMap = useMemo(() => {
    if (!complianceReport) return new Map<string, RiskLevel>();
    const map = new Map<string, RiskLevel>();
    // Match ⛔【...】, ⚠️【...】, ℹ️【...】 patterns
    const patterns: [RegExp, RiskLevel][] = [
      [/⛔\s*【([^】]+)】/g, "red"],
      [/⚠️\s*【([^】]+)】/g, "high"],
      [/ℹ️\s*【([^】]+)】/g, "info"],
    ];
    for (const [regex, level] of patterns) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(complianceReport)) !== null) {
        const phrase = m[1];
        // Keep highest severity if duplicate
        if (!map.has(phrase) || (level === "red") || (level === "high" && map.get(phrase) === "info")) {
          map.set(phrase, level);
        }
      }
    }
    return map;
  }, [complianceReport]);

  const riskPhrases = useMemo(() => [...riskMap.keys()], [riskMap]);

  const RISK_STYLES: Record<RiskLevel, string> = {
    red: "bg-red-200 dark:bg-red-800/60 border-b-2 border-red-500",
    high: "bg-orange-200 dark:bg-orange-700/60 border-b-2 border-orange-500",
    info: "bg-blue-200 dark:bg-blue-700/60 border-b-2 border-blue-500",
  };

  // Build highlighted script with risk phrases marked by severity color
  const highlightedScript = useMemo(() => {
    if (!scriptText || riskPhrases.length === 0) return null;
    // Sort by length descending so longer phrases match first
    const sorted = [...riskPhrases].sort((a, b) => b.length - a.length);
    // Filter to only phrases that actually appear in the script
    const matching = sorted.filter(p => scriptText.includes(p));
    if (matching.length === 0) return null;
    const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = scriptText.split(regex);
    return parts.map((part, i) => {
      const level = riskMap.get(part);
      if (level) {
        return (
          <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5`}>
            {part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [scriptText, riskPhrases, riskMap]);
  // Auto-adjust: AI rewrites only marked portions
  const handleAutoAdjust = useCallback(async () => {
    const matching = riskPhrases.filter(p => paletteText.includes(p));
    if (matching.length === 0) {
      toast({ title: "没有需要调整的标记内容" });
      return;
    }
    setIsAutoAdjusting(true);
    autoAdjustAbortRef.current = new AbortController();
    try {
      const issueList = matching.map((phrase, i) => {
        const level = riskMap.get(phrase);
        const label = level === "red" ? "红线问题" : level === "high" ? "高风险内容" : "优化建议";
        return `${i + 1}. [${label}] "${phrase}"`;
      }).join("\n");
      const prompt = `你是一位专业的剧本合规改写专家。

## 任务
请修改以下剧本中被标记的不合规片段，使其通过合规审核。

## 规则
1. **仅改写**下方列出的不合规片段，其它所有文字必须保持原样，一个字都不能动
2. 改写后的内容要保持叙事连贯，语言风格与上下文一致
3. 血腥暴力描写改为隐晦、间接的表述
4. 色情描写改为含蓄暗示
5. 版权内容改为原创替代
6. 直接输出完整的修改后剧本，不要任何解释或注释

## 需要改写的片段
${issueList}

## 原文剧本
${paletteText}`;

      const result = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 16384 },
        autoAdjustAbortRef.current.signal,
      );
      setPaletteText(result);
      setPaletteEditing(true); // Keep in edit mode so user can review
      toast({ title: "自动调整完成", description: "请检查修改结果" });
    } catch (e: any) {
      if (!e?.message?.includes("取消")) {
        toast({ title: "自动调整失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsAutoAdjusting(false);
      autoAdjustAbortRef.current = null;
    }
  }, [paletteText, riskPhrases, riskMap, model]);

  // Export palette text as Word document
  const handlePaletteExport = useCallback(async () => {
    try {
      const textToExport = paletteEditing ? paletteText : scriptText;
      const lines = textToExport.split("\n");
      const paragraphs = lines.map(line => {
        // Check if this line contains a risk phrase for coloring
        const matchingPhrases: { phrase: string; level: RiskLevel; start: number }[] = [];
        for (const [phrase, level] of riskMap.entries()) {
          let idx = line.indexOf(phrase);
          while (idx !== -1) {
            matchingPhrases.push({ phrase, level, start: idx });
            idx = line.indexOf(phrase, idx + 1);
          }
        }
        if (matchingPhrases.length === 0) {
          return new Paragraph({ children: [new TextRun({ text: line, size: 24 })] });
        }
        // Build runs with highlights
        matchingPhrases.sort((a, b) => a.start - b.start);
        const runs: TextRun[] = [];
        let cursor = 0;
        for (const mp of matchingPhrases) {
          if (mp.start > cursor) {
            runs.push(new TextRun({ text: line.slice(cursor, mp.start), size: 24 }));
          }
          const color = mp.level === "red" ? "FF0000" : mp.level === "high" ? "FF8C00" : "2563EB";
          runs.push(new TextRun({ text: mp.phrase, size: 24, highlight: mp.level === "red" ? "red" : mp.level === "high" ? "yellow" : "cyan", color }));
          cursor = mp.start + mp.phrase.length;
        }
        if (cursor < line.length) {
          runs.push(new TextRun({ text: line.slice(cursor), size: 24 }));
        }
        return new Paragraph({ children: runs });
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [new TextRun({ text: "合规审核 — 调色盘文本对比", bold: true, size: 32 })],
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [new TextRun({ text: `导出时间：${new Date().toLocaleString("zh-CN")}`, size: 20, color: "888888" })],
              spacing: { after: 200 },
            }),
            ...paragraphs,
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `合规审核_调色盘对比_${new Date().toISOString().slice(0, 10)}.docx`);
      toast({ title: "导出成功" });
    } catch (e: any) {
      toast({ title: "导出失败", description: e?.message, variant: "destructive" });
    }
  }, [paletteEditing, paletteText, scriptText, riskMap]);

  const handlePaletteEditToggle = () => {
    if (paletteEditing) {
      // Exiting edit mode — apply changes back to script
      setScriptText(paletteText);
    } else {
      setPaletteText(scriptText);
    }
    setPaletteEditing(!paletteEditing);
  };

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
                  共识别 {riskPhrases.length} 处风险片段，{riskPhrases.filter(p => scriptText.includes(p)).length} 处已在原文中标记
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-red-200 dark:bg-red-800/60 border border-red-500" />
                  ⛔ 红线问题
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-orange-200 dark:bg-orange-700/60 border border-orange-500" />
                  ⚠️ 高风险内容
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-blue-200 dark:bg-blue-700/60 border border-blue-500" />
                  ℹ️ 优化建议
                </span>
              </div>
              {highlightedScript ? (
                <div className="max-h-[500px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90">
                    {highlightedScript}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p>AI 报告中标记的风险片段未能在原文中精确匹配。</p>
                  <p className="mt-1">请尝试重新生成报告，AI 将更精确地引用原文。</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ComplianceReview;
