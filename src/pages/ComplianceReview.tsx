import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RefreshCw, Pencil, Eye, Square, ShieldCheck, Upload, Film, FileText, ChevronDown, ChevronUp, Palette, Wand2, Download, Table as TableIcon, FileSpreadsheet, Undo2, Redo2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "@/components/script-creator/TranslateButton";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

type ComplianceModel = "gemini-3.1-pro-preview" | "gemini-3-pro-preview" | "gemini-3-flash-preview";
type ReviewMode = "text" | "script";

const MODEL_OPTIONS: { value: ComplianceModel; label: string }[] = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

// 文字审核提示词 - 检查字面违规
const STANDALONE_COMPLIANCE_PROMPT = (scriptText: string) => `你是一位资深的短剧内容合规审核专家，精通各类内容监管法规与平台规范。

## 待审核内容
${scriptText}

---

## 审核要求

请对以下三个维度进行合规审查：

### 一、激烈冲突内容
检查字面上的激烈冲突描写：
- 描写身体损伤的文字
- 描写冲突过程的文字
- 描写激烈对抗行为的文字
- 轻度肢体冲突可标记为优化建议

### 二、版权问题
检查是否存在：
- 直接引用受版权保护的作品内容
- 明显模仿知名IP的角色、情节设定
- 未授权使用品牌名称

### 三、敏感亲密内容
检查字面上的敏感亲密描写：
- 过度暴露的描写
- 不当行为描写
- 一般亲吻拥抱可标记为优化建议

## 输出格式

使用以下标记标注问题严重程度：
- ⛔ 红线问题（必须修改）
- ⚠️ 高风险内容（建议修改）
- ℹ️ 优化建议（可选修改）

输出结构：
1. **合规总评**：一段话总结合规状态
2. **激烈冲突检测**：逐项检查结果
3. **版权问题排查**：逐项检查结果
4. **敏感内容检测**：逐项检查结果
5. **问题清单汇总**：按严重程度排序
6. **修改建议**：针对每个问题的具体修改方案

**标记规则：**

标记**整句话或整个分镜片段**：
- 红线问题：⛔【包含风险内容的完整句子】
- 高风险内容：⚠️【包含风险内容的完整句子】
- 优化建议：ℹ️【包含风险内容的完整句子】

用 Markdown 格式输出，清晰分区。`;

// 情节审核提示词 - 审核整个段落的画面表现 + 文字违规
const SCRIPT_REVIEW_PROMPT = (scriptText: string) => `你是一位资深的短剧内容合规审核专家，执行**最彻底的合规审查**。

## 待审核剧本
${scriptText}

---

## 审核要求

你需要进行**双重审查**：检查文字层面和画面表现层面的合规风险。

### 第一重：文字违规检查

检查字面上的违规内容：

1. **激烈冲突文字**
   - 描写身体损伤的文字
   - 描写冲突过程的文字
   - 描写激烈对抗的文字

2. **版权问题**
   - 直接引用受版权保护的歌词、台词、小说
   - 明显抄袭知名IP的角色、情节

3. **敏感亲密文字**
   - 过度暴露的描写
   - 不当行为描写

### 第二重：画面违规检查

从画面呈现角度审查整个情节段落：

1. **激烈冲突情节风险**
   - 肢体冲突情节：打斗、摔打等
   - 伤害呈现情节：受伤场景
   - 强对抗情节：威胁等

2. **亲密情节风险**
   - 亲密接触情节：吻戏、拥抱等
   - 身体呈现情节：更衣、沐浴等
   - 暧昧氛围情节：调情等

3. **其他情节风险**
   - 未成年人参与的敏感场景
   - 不良行为展示
   - 其他违规内容

## 输出格式

使用以下标记标注风险：

- ⛔ 红线问题（必须修改）
- ⚠️ 高风险内容（建议修改）
- ℹ️ 优化建议（可选修改）

**标记规则：**

**文字违规**：标记完整句子
- 示例：⛔【他的胸口被刺穿，染红了整件衬衫。】

**画面违规**：标记整个风险段落
- 示例：⛔【他猛地将她推倒，双手掐住她的脖子...（整段完整文字）】

## 输出结构

1. **合规总评**
2. **文字违规检测**
3. **画面违规检测**
4. **风险汇总**
5. **修改建议**

用 Markdown 格式输出。`;

// 表格数据类型
type TableData = {
  headers: string[];
  rows: (string | number | null)[][];
  fileName: string;
  sheetName?: string;
  originalData: (string | number | null)[][];
};

const ComplianceReview = () => {
  const navigate = useNavigate();
  const [scriptText, setScriptText] = useState("");
  const [complianceReport, setComplianceReport] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);
  // 表格数据状态
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [inputMode, setInputMode] = useState<"text" | "table">("text");
  // 审核模式：文字审核 | 情节审核
  const [reviewMode, setReviewMode] = useState<ReviewMode>("text");
  // 分段审核进度
  const [segmentProgress, setSegmentProgress] = useState<{ current: number; total: number } | null>(null);
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
  const [adjustingPhrases, setAdjustingPhrases] = useState<Set<string>>(new Set());
  const paletteEditRef = useRef<HTMLPreElement>(null);
  // Track phrase replacements so re-adjust works: original -> current
  const [phraseReplacements, setPhraseReplacements] = useState<Map<string, string>>(new Map());

  // Sync palette text with script text initially or when script changes and no adjustments made
  useEffect(() => {
    if (phraseReplacements.size === 0 && scriptText) {
      setPaletteText(scriptText);
    }
  }, [scriptText, phraseReplacements.size]);

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
  // Supports: normal view, editing (contentEditable), and auto-adjusting (blanks for adjusting phrases)
  // Build a combined map that includes both original phrases and their replacements
  const activeRiskMap = useMemo(() => {
    const map = new Map<string, RiskLevel>(riskMap);
    // Add replaced phrases with their original risk level
    for (const [original, replacement] of phraseReplacements.entries()) {
      const level = riskMap.get(original);
      if (level && !map.has(replacement)) {
        map.set(replacement, level);
      }
    }
    return map;
  }, [riskMap, phraseReplacements]);

  const activeRiskPhrases = useMemo(() => [...activeRiskMap.keys()], [activeRiskMap]);

  // 反向映射：replacement -> original，用于悬浮显示原文
  const replacementToOriginal = useMemo(() => {
    const map = new Map<string, string>();
    for (const [original, replacement] of phraseReplacements.entries()) {
      map.set(replacement, original);
    }
    return map;
  }, [phraseReplacements]);

  // 单独调整某个片段的状态
  const [adjustingSinglePhrase, setAdjustingSinglePhrase] = useState<string | null>(null);

  // 单独调整某个片段
  const handleSingleAdjust = useCallback(async (phrase: string, level: RiskLevel) => {
    if (adjustingSinglePhrase) return;
    setAdjustingSinglePhrase(phrase);

    const prompt = reviewMode === "script"
      ? `你是短剧情节优化专家。\n\n## 你的任务\n请对以下存在画面合规风险的**整个段落**进行优化改写，在保持剧情完整的前提下，使其画面呈现符合审核标准。\n\n## 原始段落\n${phrase}\n\n## 风险等级\n${level === "red" ? "红线问题（画面必然违规）" : level === "high" ? "高风险内容（画面存在较大违规风险）" : "优化建议（可通过镜头优化降低风险）"}\n\n## 改写原则\n1. 保持剧情完整\n2. 画面合规改写\n3. 整体改写段落\n\n## 输出格式\n只输出改写后的完整段落，不要任何解释或标记。`
      : `你是短剧内容合规审核专家。\n\n## 你的任务\n请对以下存在违规词汇的片段进行**最小化修改**，只替换关键违规词汇。\n\n## 原始片段\n${phrase}\n\n## 风险等级\n${level === "red" ? "红线问题" : level === "high" ? "高风险内容" : "优化建议"}\n\n## 改写原则\n1. 最小改动：只替换违规词汇\n2. 词汇替换：用委婉词汇替代敏感词\n3. 保持原意\n\n## 输出格式\n只输出修改后的文本，不要任何解释。`;

    try {
      const raw = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 1024, temperature: 0.7 },
      );

      const replacement = raw.trim();
      if (!replacement || normalizeForCompare(phrase) === normalizeForCompare(replacement)) {
        toast({ title: "改写失败", description: "AI 未生成有效改写", variant: "destructive" });
        return;
      }

      const currentText = paletteText || scriptText;
      const newText = currentText.split(phrase).join(replacement);

      const originalPhrase = replacementToOriginal.get(phrase) || phrase;
      setPhraseReplacements(prev => {
        const newMap = new Map(prev);
        newMap.set(originalPhrase, replacement);
        return newMap;
      });

      setPaletteText(newText);
      setScriptText(newText);
      toast({ title: "改写成功", description: `已将「${phrase.slice(0, 20)}...」改写为「${replacement.slice(0, 20)}...」` });
    } catch (e: any) {
      toast({ title: "改写失败", description: e?.message, variant: "destructive" });
    } finally {
      setAdjustingSinglePhrase(null);
    }
  }, [adjustingSinglePhrase, model, paletteText, scriptText, replacementToOriginal, reviewMode]);

  const buildHighlightedParts = useCallback((text: string, blankPhrases?: Set<string>) => {
    if (!text || activeRiskPhrases.length === 0) return <>{text}</>;
    const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);
    const matching = sorted.filter(p => text.includes(p));
    if (matching.length === 0) return <>{text}</>;
    const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);
    return parts.map((part, i) => {
      const level = activeRiskMap.get(part);
      if (level) {
        const isBlank = blankPhrases?.has(part);
        const isAdjusting = adjustingSinglePhrase === part;
        return (
          <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""}`}>
            {isBlank ? "\u00A0".repeat(Math.max(part.length, 2)) : part}
            <button
              className="inline-flex items-center justify-center w-4 h-4 ml-0.5 text-[10px] rounded hover:bg-foreground/10 align-middle cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleSingleAdjust(part, level);
              }}
              disabled={isAdjusting || isAutoAdjusting}
              title="重新生成"
            >
              {isAdjusting ? "..." : "↻"}
            </button>
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [activeRiskPhrases, activeRiskMap, adjustingSinglePhrase, handleSingleAdjust, isAutoAdjusting]);

  const highlightedScript = useMemo(() => {
    const text = paletteText || scriptText;
    return buildHighlightedParts(text, isAutoAdjusting ? adjustingPhrases : undefined);
  }, [paletteText, scriptText, buildHighlightedParts, isAutoAdjusting, adjustingPhrases]);
  const normalizeForCompare = (value: string) => value.replace(/\s+/g, "").trim();

  const parseRewriteJson = (raw: string) => {
    const fallback = new Map<number, string>();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? raw.trim();
    const start = fenced.indexOf("[");
    const end = fenced.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) return fallback;

    try {
      const parsed = JSON.parse(fenced.slice(start, end + 1));
      if (!Array.isArray(parsed)) return fallback;
      for (const item of parsed) {
        const id = Number(item?.id);
        const replacement = typeof item?.replacement === "string" ? item.replacement.trim() : "";
        if (Number.isFinite(id) && replacement) fallback.set(id, replacement);
      }
    } catch {
      return fallback;
    }

    return fallback;
  };

  // Auto-adjust: only red-line/high-risk, and only send target fragments to AI
  const handleAutoAdjust = async () => {
    const targetEntries: { original: string; current: string; level: RiskLevel }[] = [];
    for (const [phrase, level] of riskMap.entries()) {
      if (level !== "red" && level !== "high") continue;
      if (paletteText.includes(phrase)) {
        targetEntries.push({ original: phrase, current: phrase, level });
        continue;
      }
      const replaced = phraseReplacements.get(phrase);
      if (replaced && paletteText.includes(replaced)) {
        targetEntries.push({ original: phrase, current: replaced, level });
      }
    }

    if (targetEntries.length === 0) {
      toast({ title: "没有需要调整的红线或高风险内容" });
      return;
    }

    setIsAutoAdjusting(true);
    setAdjustingPhrases(new Set(targetEntries.map((e) => e.current)));
    autoAdjustAbortRef.current = new AbortController();

    const requestRewrite = async (
      entries: { original: string; current: string; level: RiskLevel }[],
      strict = false,
    ) => {
      const payload = entries.map((entry, idx) => ({
        id: idx + 1,
        level: entry.level === "red" ? "red_line" : "high_risk",
        text: entry.current,
      }));

      const prompt = `你是短剧合规改写助手。\n\n你只会收到“需要修改的片段”，不要处理全文。\n目标：对片段做和谐化处理，保留原有表达意思、剧情信息、人物关系和语气，不新增事实。\n\n硬性要求：\n1) 只改写给定片段，不输出解释\n2) replacement 必须与原文不同，不能原样返回\n3) 保持语义等价，长度尽量接近原文\n4) 不要使用空字符串\n${strict ? "5) 如果第一次改写仍接近原文，请使用更明确但同义的合规表达" : ""}\n\n请只输出 JSON 数组（不要 markdown）：\n[{\"id\":1,\"replacement\":\"...\"}]\n\n待改写片段：\n${JSON.stringify(payload, null, 2)}`;

      const raw = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 8192, temperature: strict ? 0.8 : 0.5 },
        autoAdjustAbortRef.current?.signal,
      );

      return parseRewriteJson(raw);
    };

    try {
      let workingText = paletteText;
      let workingReplacements = new Map(phraseReplacements);
      let pending = [...targetEntries];
      let appliedCount = 0;

      for (const strict of [false, true]) {
        if (pending.length === 0) break;

        const rewrites = await requestRewrite(pending, strict);
        const nextPending: typeof pending = [];

        pending.forEach((entry, idx) => {
          const replacement = rewrites.get(idx + 1)?.trim();
          if (!replacement || normalizeForCompare(replacement) === normalizeForCompare(entry.current)) {
            nextPending.push(entry);
            return;
          }
          if (!workingText.includes(entry.current)) {
            nextPending.push(entry);
            return;
          }

          workingText = workingText.split(entry.current).join(replacement);
          workingReplacements.set(entry.original, replacement);
          appliedCount += 1;
        });

        pending = nextPending.filter((entry) => workingText.includes(entry.current));
      }

      if (appliedCount === 0) {
        toast({ title: "自动调整未生效", description: "AI 返回与原文一致，请重试或手动编辑", variant: "destructive" });
        return;
      }

      setPhraseReplacements(workingReplacements);
      setPaletteText(workingText);
      toast({
        title: "自动调整完成",
        description: pending.length > 0 ? `已调整 ${appliedCount} 处，仍有 ${pending.length} 处建议手动调整` : `已调整 ${appliedCount} 处`,
      });
    } catch (e: any) {
      if (!e?.message?.includes("取消")) {
        toast({ title: "自动调整失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setAdjustingPhrases(new Set());
      setIsAutoAdjusting(false);
      autoAdjustAbortRef.current = null;
    }
  };

  // Export palette text as Word document
  const handlePaletteExport = useCallback(async () => {
    try {
      const textToExport = paletteEditing ? paletteText : scriptText;
      const lines = textToExport.split("\n");
      const paragraphs = lines.map(line => {
        // Check if this line contains a risk phrase for coloring
        const matchingPhrases: { phrase: string; level: RiskLevel; start: number }[] = [];
        for (const [phrase, level] of activeRiskMap.entries()) {
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
  }, [paletteEditing, paletteText, scriptText, activeRiskMap]);

  const handlePaletteEditToggle = () => {
    if (paletteEditing) {
      // Exiting edit mode — sync text from contentEditable
      if (paletteEditRef.current) {
        const newText = paletteEditRef.current.innerText;
        setPaletteText(newText);
        setScriptText(newText);
      } else {
        setScriptText(paletteText);
      }
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

  // Count unique phrases per level from riskMap (not emoji occurrences)
  const redLineCount = useMemo(() => [...riskMap.values()].filter(l => l === "red").length, [riskMap]);
  const highRiskCount = useMemo(() => [...riskMap.values()].filter(l => l === "high").length, [riskMap]);
  const infoCount = useMemo(() => [...riskMap.values()].filter(l => l === "info").length, [riskMap]);

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
                    <p className="text-xs mt-2">检查维度：血腥暴力、版权侵犯、色情内容</p>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                <span className="text-sm font-normal text-muted-foreground">
                  共识别 {riskPhrases.length} 处风险片段，{riskPhrases.filter(p => (paletteEditing ? paletteText : scriptText).includes(p)).length} 处已标记
                </span>
              </CardTitle>
              <div className="flex gap-2">
                {isAutoAdjusting ? (
                  <Button variant="destructive" size="sm" onClick={() => autoAdjustAbortRef.current?.abort()} className="gap-1.5">
                    <Square className="h-3.5 w-3.5" />
                    停止
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleAutoAdjust} className="gap-1.5" disabled={paletteEditing || isAutoAdjusting}>
                    <Wand2 className="h-3.5 w-3.5" />
                    自动调整
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handlePaletteEditToggle} className="gap-1.5" disabled={isAutoAdjusting}>
                  {paletteEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {paletteEditing ? "完成" : "编辑"}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePaletteExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  导出
                </Button>
              </div>
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
                <div ref={paletteScrollRef} className="max-h-[500px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                  <pre
                    ref={paletteEditRef}
                    className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 outline-none"
                    contentEditable={paletteEditing}
                    suppressContentEditableWarning
                    onBlur={() => {
                      if (paletteEditing && paletteEditRef.current) {
                        setPaletteText(paletteEditRef.current.innerText);
                      }
                    }}
                  >
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
