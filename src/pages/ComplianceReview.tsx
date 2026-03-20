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
const STANDALONE_COMPLIANCE_PROMPT = (scriptText: string) => `你是一位**极其严格**的短剧内容合规审核专家，必须对所有潜在风险进行标记。

## 待审核内容
${scriptText}

---

## 审核标准（严格）

### 一、激烈冲突内容（必须标记）
- 打斗、殴打、摔打、推搡等肢体冲突描写
- 身体损伤描写（流血、受伤、疼痛）
- 威胁、恐吓、强迫的动作描写
- **注意**：只标记动作描写，不标记角色台词

### 二、敏感亲密内容（必须标记）
- 亲吻、拥抱、抚摸等亲密接触的动作描写
- 身体暴露描写
- 暧昧、调情场景的动作描写
- **注意**：只标记动作描写，不标记角色台词

### 三、版权问题（必须标记）
- 引用歌词、诗句、台词
- 模仿知名IP
- 品牌名称

### 四、对话密度问题（标记超出限制的台词）
- 每集超过180词时，标记超标的台词部分
- 连续对白超过20词时，标记超标的台词部分
- **只有触发字数限制时才标记台词**

---

## ⛔ 不标记的内容

1. **角色台词**：引号内的对话内容（除非触发字数限制）
2. **音效标记**：【音效：XXX】格式的内容
3. **镜头标记**：【镜头：XXX】格式的内容

---

## 必须输出风险标记

你**必须**在报告末尾列出所有有问题的文本。格式如下：

**风险标记：**
⛔【原文中的动作描写文本】
⚠️【原文中的动作描写文本】
ℹ️【建议修改的动作描写文本】

**重要规则：**
1. 必须从原文**精确复制**文本（一字不改）
2. 不要修改、省略或重写
3. 不要标记台词和音效（除非触发字数限制）
4. 如果没问题，也要说明"未发现明显风险"

---

## 输出结构

1. **合规总评**
2. **激烈冲突检测**
3. **敏感内容检测**
4. **对话密度检测**（仅当超标时）
5. **风险标记**（必须包含！）

用 Markdown 格式输出。`;

// 情节审核提示词 - 审核整个段落的画面表现 + 文字违规
const SCRIPT_REVIEW_PROMPT = (scriptText: string) => `你是一位**极其严格**的短剧内容合规审核专家，必须对所有潜在风险进行标记。

## 待审核剧本
${scriptText}

---

## 审核标准（严格）

### 一、文字违规（必须标记）
- 打斗、殴打、流血、伤害的动作描写
- 威胁、强迫、恐吓的动作描写
- 亲密接触、身体暴露的动作描写
- **注意**：只标记动作描写，不标记角色台词

### 二、画面违规（必须标记）
- 能在画面中呈现的冲突场景
- 能在画面中呈现的亲密场景
- 未成年人参与的敏感场景

### 三、对话密度（仅当超标时标记）
- 每集超过180词时，标记超标的台词部分
- 连续对白超过20词时，标记超标的台词部分
- **只有触发字数限制时才标记台词**

---

## ⛔ 不标记的内容

1. **角色台词**：引号内的对话内容（除非触发字数限制）
2. **音效标记**：【音效：XXX】格式的内容
3. **镜头标记**：【镜头：XXX】格式的内容

---

## 必须输出风险标记

你**必须**在报告末尾列出所有有问题的文本。格式如下：

**风险标记：**
⛔【红线问题：原文中的动作描写文本】
⚠️【高风险：原文中的动作描写文本】
ℹ️【建议修改：原文中的动作描写文本】

**重要规则：**
1. 必须从原文**精确复制**文本（一字不改）
2. 不要标记台词和音效（除非触发字数限制）

---

## 输出结构

1. **合规总评**
2. **文字违规检测**
3. **画面违规检测**
4. **对话密度检测**（仅当超标时）
5. **风险标记**（必须包含！）

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
  
  // 手动标记相关状态
  const [manualRiskMap, setManualRiskMap] = useState<Map<string, RiskLevel>>(new Map());
  const [selectedText, setSelectedText] = useState("");
  const [showRiskSelector, setShowRiskSelector] = useState(false);
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteContainerRef = useRef<HTMLDivElement>(null);

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

  // 从报告中解析风险标记（支持 JSON 和 emoji 两种格式）
  const positionBasedRisks = useMemo(() => {
    if (!complianceReport || !scriptText) return [];
    
    const result: { level: RiskLevel; start: number; end: number; text: string }[] = [];
    const matchedTexts = new Set<string>(); // 记录已匹配的文本
    
    // 方式1：尝试解析 JSON 格式
    const jsonMatch = complianceReport.match(/###\s*风险标记列表[^\n]*\n([\s\S]*?)(?=\n###|\n##\s|$)/i);
    if (jsonMatch) {
      const jsonText = jsonMatch[1].trim();
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (!item || typeof item !== "object") continue;
              if (!["red", "high", "info"].includes(item.level)) continue;
              if (typeof item.start !== "number" || typeof item.end !== "number") continue;
              if (item.start < 0 || item.end > scriptText.length || item.start >= item.end) continue;
              
              const text = item.text || scriptText.slice(item.start, item.end);
              result.push({
                level: item.level as RiskLevel,
                start: item.start,
                end: item.end,
                text
              });
              matchedTexts.add(text);
            }
          }
        } catch (e) {
          console.error("解析风险标记JSON失败:", e);
        }
      }
    }
    
    // 辅助函数：尝试在原文中查找文本
    const findInScript = (text: string): { start: number; end: number } | null => {
      // 1. 精确匹配
      const exactIdx = scriptText.indexOf(text);
      if (exactIdx !== -1) {
        return { start: exactIdx, end: exactIdx + text.length };
      }
      
      // 2. 忽略空格和标点差异
      const normalize = (s: string) => s.replace(/[，。！？、；：""''（）【】「」\s\n\r]/g, "");
      const normalizedText = normalize(text);
      const normalizedScript = normalize(scriptText);
      
      if (normalizedScript.includes(normalizedText) && normalizedText.length >= 5) {
        // 找到了，尝试定位原文位置
        const normIdx = normalizedScript.indexOf(normalizedText);
        let charCount = 0;
        for (let i = 0; i < scriptText.length; i++) {
          if (!/[，。！？、；：""''（）【】「」\s\n\r]/.test(scriptText[i])) {
            if (charCount === normIdx) {
              // 找到起始位置，估算结束位置
              let endPos = i;
              let remaining = text.length;
              while (endPos < scriptText.length && remaining > 0) {
                if (!/[，。！？、；：""''（）【】「」\s\n\r]/.test(scriptText[endPos])) {
                  remaining--;
                }
                endPos++;
              }
              return { start: i, end: endPos };
            }
            charCount++;
          }
        }
      }
      
      // 3. 部分匹配（前80%）
      const partialLen = Math.floor(text.length * 0.8);
      if (partialLen >= 10) {
        const partialText = text.slice(0, partialLen);
        const partialIdx = scriptText.indexOf(partialText);
        if (partialIdx !== -1) {
          return { start: partialIdx, end: partialIdx + text.length };
        }
      }
      
      return null;
    };
    
    // 方式2：解析 emoji 格式
    const emojiPatterns: [RegExp, RiskLevel][] = [
      [/⛔\s*【([^】]+)】/g, "red"],
      [/⚠️\s*【([^】]+)】/g, "high"],
      [/ℹ️\s*【([^】]+)】/g, "info"],
      [/⛔\s*\[([^\]]+)\]/g, "red"],
      [/⚠️\s*\[([^\]]+)\]/g, "high"],
      [/ℹ️\s*\[([^\]]+)\]/g, "info"],
    ];
    
    for (const [regex, level] of emojiPatterns) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(complianceReport)) !== null) {
        let text = m[1].trim();
        // 移除可能的前缀文字
        text = text.replace(/^(红线问题|高风险|建议修改)[：:]*\s*/i, "");
        if (text.length < 2) continue;
        if (matchedTexts.has(text)) continue; // 已匹配，跳过
        
        const found = findInScript(text);
        if (found) {
          result.push({ level, ...found, text: scriptText.slice(found.start, found.end) });
          matchedTexts.add(text);
        }
      }
    }
    
    // 按起始位置排序并合并重叠
    result.sort((a, b) => a.start - b.start);
    const merged: typeof result = [];
    for (const r of result) {
      const last = merged[merged.length - 1];
      if (last && r.start < last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        merged.push(r);
      }
    }
    
    return merged;
  }, [complianceReport, scriptText]);

  // 提取风险片段（兼容旧格式）
  type RiskLevel = "red" | "high" | "info";
  const riskMap = useMemo(() => {
    if (!complianceReport) return new Map<string, RiskLevel>();
    const map = new Map<string, RiskLevel>();
    // Match ⛔【...】, ⚠️【...】, ℹ️【...】 patterns
    const patterns: [RegExp, RiskLevel][] = [
      [/⛔\s*【([^】]+)】/g, "red"],
      [/⚠️\s*【([^】]+)】/g, "high"],
      [/ℹ️\s*【([^】]+)】/g, "info"],
      // 英文方括号格式
      [/⛔\s*\[([^\]]+)\]/g, "red"],
      [/⚠️\s*\[([^\]]+)\]/g, "high"],
      [/ℹ️\s*\[([^\]]+)\]/g, "info"],
      // 日文引号格式
      [/⛔\s*「([^」]+)」/g, "red"],
      [/⚠️\s*「([^」]+)」/g, "high"],
      [/ℹ️\s*「([^」]+)」/g, "info"],
    ];
    for (const [regex, level] of patterns) {
      let m: RegExpExecArray | null;
      // Reset regex lastIndex
      regex.lastIndex = 0;
      while ((m = regex.exec(complianceReport)) !== null) {
        const phrase = m[1].trim();
        if (phrase.length < 2) continue; // Skip very short matches
        // Keep highest severity if duplicate
        if (!map.has(phrase) || (level === "red") || (level === "high" && map.get(phrase) === "info")) {
          map.set(phrase, level);
        }
      }
    }
    return map;
  }, [complianceReport]);

  const riskPhrases = useMemo(() => [...riskMap.keys()], [riskMap]);
  
  // 合并 AI 识别和手动标记的风险
  const combinedRiskMap = useMemo(() => {
    const map = new Map<string, RiskLevel>(riskMap);
    // 添加手动标记（手动标记优先）
    for (const [phrase, level] of manualRiskMap.entries()) {
      map.set(phrase, level);
    }
    return map;
  }, [riskMap, manualRiskMap]);
  
  const combinedRiskPhrases = useMemo(() => [...combinedRiskMap.keys()], [combinedRiskMap]);

  // 处理文本选择
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowRiskSelector(false);
      setSelectedText("");
      return;
    }
    
    const text = selection.toString().trim();
    if (text.length < 2) {
      setShowRiskSelector(false);
      return;
    }
    
    // 获取选中文本的位置
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    setSelectedText(text);
    setSelectionPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 5 });
    setShowRiskSelector(true);
  }, []);
  
  // 添加手动标记
  const addManualMark = useCallback((level: RiskLevel) => {
    if (!selectedText) return;
    
    setManualRiskMap(prev => {
      const newMap = new Map(prev);
      newMap.set(selectedText, level);
      return newMap;
    });
    
    // 同步到调色盘文本
    if (!paletteText && scriptText) {
      setPaletteText(scriptText);
    }
    
    setShowRiskSelector(false);
    setSelectedText("");
    
    toast({ title: "已添加标记", description: `「${selectedText.slice(0, 20)}...」标记为${level === "red" ? "红线问题" : level === "high" ? "高风险内容" : "优化建议"}` });
  }, [selectedText, paletteText, scriptText]);
  
  // 移除手动标记
  const removeManualMark = useCallback((phrase: string) => {
    setManualRiskMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(phrase);
      return newMap;
    });
  }, []);
  
  // 清除所有手动标记
  const clearManualMarks = useCallback(() => {
    setManualRiskMap(new Map());
    toast({ title: "已清除所有手动标记" });
  }, []);

  const RISK_STYLES: Record<RiskLevel, string> = {
    red: "bg-red-200 dark:bg-red-800/60 border-b-2 border-red-500",
    high: "bg-orange-200 dark:bg-orange-700/60 border-b-2 border-orange-500",
    info: "bg-blue-200 dark:bg-blue-700/60 border-b-2 border-blue-500",
  };

  // Build highlighted script with risk phrases marked by severity color
  // Supports: normal view, editing (contentEditable), and auto-adjusting (blanks for adjusting phrases)
  // Build a combined map that includes both original phrases and their replacements
  const activeRiskMap = useMemo(() => {
    const map = new Map<string, RiskLevel>(combinedRiskMap);
    // Add replaced phrases with their original risk level
    for (const [original, replacement] of phraseReplacements.entries()) {
      const level = combinedRiskMap.get(original);
      if (level && !map.has(replacement)) {
        map.set(replacement, level);
      }
    }
    return map;
  }, [combinedRiskMap, phraseReplacements]);

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
      ? `你是短剧情节优化专家。

## 你的任务
请对以下存在画面合规风险的**动作描写和场景描述**进行优化改写。

## 原始段落
${phrase}

## 风险等级
${level === "red" ? "红线问题（画面必然违规）" : level === "high" ? "高风险内容（画面存在较大违规风险）" : "优化建议（可通过镜头优化降低风险）"}

## ⛔ 重要规则（必须遵守）

1. **不要修改台词内容**：角色说的话（引号内内容）保持原样
2. **不要修改音效**：如【音效：XXX】保持原样
3. **只修改动作描写和场景描述**：用更委婉的方式呈现
4. **保持剧情完整**

## 改写示例
原文：他狠狠地打了她一巴掌，她的脸肿了起来。
改写：他愤怒地挥出手，她捂着脸，眼中含泪。

## 输出格式
只输出改写后的文本，不要任何解释。`
      : `你是短剧内容合规审核专家。

## 你的任务
请对以下存在违规词汇的**动作描写**进行最小化修改。

## 原始片段
${phrase}

## 风险等级
${level === "red" ? "红线问题" : level === "high" ? "高风险内容" : "优化建议"}

## ⛔ 重要规则（必须遵守）

1. **不要修改台词内容**：角色说的话（引号内内容）保持原样
2. **不要修改音效**：如【音效：XXX】保持原样
3. **只修改动作描写**：用委婉词汇替代敏感词
4. **保持原意**

## 输出格式
只输出修改后的文本，不要任何解释。`;

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
    if (!text) return <>{text}</>;
    
    // 收集所有风险区间
    const ranges: { start: number; end: number; level: RiskLevel; text: string }[] = [];
    
    // 1. 添加基于位置的风险（最高优先级）
    for (const risk of positionBasedRisks) {
      if (risk.start >= 0 && risk.end <= text.length && risk.start < risk.end) {
        ranges.push({ ...risk });
      }
    }
    
    // 2. 添加手动标记
    for (const [phrase, level] of manualRiskMap.entries()) {
      let searchStart = 0;
      while (searchStart < text.length) {
        const idx = text.indexOf(phrase, searchStart);
        if (idx === -1) break;
        // 检查是否与已有区间重叠
        const overlaps = ranges.some(r => idx < r.end && idx + phrase.length > r.start);
        if (!overlaps) {
          ranges.push({ start: idx, end: idx + phrase.length, level, text: phrase });
        }
        searchStart = idx + 1;
      }
    }
    
    // 3. 添加基于文本匹配的风险（兼容旧格式）
    for (const [phrase, level] of riskMap.entries()) {
      if (phrase.length < 2) continue;
      let searchStart = 0;
      while (searchStart < text.length) {
        const idx = text.indexOf(phrase, searchStart);
        if (idx === -1) break;
        // 检查是否与已有区间重叠
        const overlaps = ranges.some(r => idx < r.end && idx + phrase.length > r.start);
        if (!overlaps) {
          ranges.push({ start: idx, end: idx + phrase.length, level, text: phrase });
        }
        searchStart = idx + 1;
      }
    }
    
    // 如果没有任何风险，返回原文本
    if (ranges.length === 0) return <>{text}</>;
    
    // 按起始位置排序
    ranges.sort((a, b) => a.start - b.start);
    
    // 合并重叠的区间
    const merged: typeof ranges = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start < last.end) {
        // 重叠，扩展或更新
        last.end = Math.max(last.end, range.end);
        // 保留更高级别的风险
        if (range.level === "red" || (range.level === "high" && last.level === "info")) {
          last.level = range.level;
        }
        last.text = text.slice(last.start, last.end);
      } else {
        merged.push({ ...range });
      }
    }
    
    // 构建高亮结果
    const result: React.ReactNode[] = [];
    let cursor = 0;
    
    for (let i = 0; i < merged.length; i++) {
      const range = merged[i];
      
      // 添加普通文本
      if (range.start > cursor) {
        result.push(<span key={`text-${i}`}>{text.slice(cursor, range.start)}</span>);
      }
      
      // 添加高亮文本
      const highlightedText = text.slice(range.start, range.end);
      const originalText = replacementToOriginal.get(highlightedText);
      const isBlank = blankPhrases?.has(highlightedText);
      
      result.push(
        <mark 
          key={`mark-${i}`}
          className={`${RISK_STYLES[range.level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""} ${originalText ? "cursor-help" : ""}`}
          title={originalText ? `原文：${originalText}` : undefined}
        >
          {isBlank ? "\u00A0".repeat(Math.max(highlightedText.length, 2)) : highlightedText}
        </mark>
      );
      
      cursor = range.end;
    }
    
    // 添加剩余文本
    if (cursor < text.length) {
      result.push(<span key="text-end">{text.slice(cursor)}</span>);
    }
    
    return <>{result}</>;
  }, [positionBasedRisks, manualRiskMap, riskMap, replacementToOriginal]);

  // 表格模式下高亮单个单元格
  const highlightTableCell = useCallback((cellText: string, cellStartPos?: number) => {
    if (!cellText) return <>{cellText}</>;
    
    // 收集当前单元格内的风险区间
    const cellRanges: { start: number; end: number; level: RiskLevel }[] = [];
    
    // 1. 基于位置的风险
    if (cellStartPos !== undefined) {
      const cellEndPos = cellStartPos + cellText.length;
      for (const risk of positionBasedRisks) {
        if (risk.start >= cellStartPos && risk.end <= cellEndPos) {
          cellRanges.push({
            start: risk.start - cellStartPos,
            end: risk.end - cellStartPos,
            level: risk.level
          });
        }
      }
    }
    
    // 2. 手动标记
    for (const [phrase, level] of manualRiskMap.entries()) {
      if (phrase.length < 2) continue;
      let searchStart = 0;
      while (searchStart < cellText.length) {
        const idx = cellText.indexOf(phrase, searchStart);
        if (idx === -1) break;
        const overlaps = cellRanges.some(r => idx < r.end && idx + phrase.length > r.start);
        if (!overlaps) {
          cellRanges.push({ start: idx, end: idx + phrase.length, level });
        }
        searchStart = idx + 1;
      }
    }
    
    // 3. 基于文本的风险
    for (const [phrase, level] of riskMap.entries()) {
      if (phrase.length < 2) continue;
      let searchStart = 0;
      while (searchStart < cellText.length) {
        const idx = cellText.indexOf(phrase, searchStart);
        if (idx === -1) break;
        const overlaps = cellRanges.some(r => idx < r.end && idx + phrase.length > r.start);
        if (!overlaps) {
          cellRanges.push({ start: idx, end: idx + phrase.length, level });
        }
        searchStart = idx + 1;
      }
    }
    
    if (cellRanges.length === 0) return <>{cellText}</>;
    
    // 排序并合并
    cellRanges.sort((a, b) => a.start - b.start);
    const merged: typeof cellRanges = [];
    for (const range of cellRanges) {
      const last = merged[merged.length - 1];
      if (last && range.start < last.end) {
        last.end = Math.max(last.end, range.end);
        if (range.level === "red" || (range.level === "high" && last.level === "info")) {
          last.level = range.level;
        }
      } else {
        merged.push({ ...range });
      }
    }
    
    // 构建高亮
    const result: React.ReactNode[] = [];
    let cursor = 0;
    
    for (let i = 0; i < merged.length; i++) {
      const range = merged[i];
      if (range.start > cursor) {
        result.push(<span key={`text-${i}`}>{cellText.slice(cursor, range.start)}</span>);
      }
      result.push(
        <mark key={`mark-${i}`} className={`${RISK_STYLES[range.level]} rounded px-0.5`}>
          {cellText.slice(range.start, range.end)}
        </mark>
      );
      cursor = range.end;
    }
    
    if (cursor < cellText.length) {
      result.push(<span key="text-end">{cellText.slice(cursor)}</span>);
    }
    
    return <>{result}</>;
  }, [positionBasedRisks, manualRiskMap, riskMap]);

  const highlightedScript = useMemo(() => {
    const text = paletteText || scriptText;
    // 如果正在生成，只显示文本（手动标记仍然生效）
    if (isGenerating) {
      if (manualRiskMap.size > 0 || positionBasedRisks.length > 0) {
        return buildHighlightedParts(text, undefined);
      }
      return <>{text}</>;
    }
    return buildHighlightedParts(text, isAutoAdjusting ? adjustingPhrases : undefined);
  }, [paletteText, scriptText, buildHighlightedParts, isAutoAdjusting, adjustingPhrases, isGenerating, manualRiskMap, positionBasedRisks, riskMap]);
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

  // Check if replacement is genuinely different
  const isGenuinelyDifferent = (original: string, replacement: string, isScriptMode: boolean = false) => {
    const normOrig = normalizeForCompare(original);
    const normRep = normalizeForCompare(replacement);
    if (normOrig === normRep) return false;
    const noPunctOrig = normOrig.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    const noPunctRep = normRep.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    if (noPunctOrig === noPunctRep) return false;
    if (!isScriptMode) return noPunctOrig !== noPunctRep;
    const minLen = Math.min(noPunctOrig.length, noPunctRep.length);
    const maxLen = Math.max(noPunctOrig.length, noPunctRep.length);
    if (maxLen > minLen * 1.5 || minLen < maxLen * 0.7) return true;
    let diffCount = 0;
    const shorter = noPunctOrig.length <= noPunctRep.length ? noPunctOrig : noPunctRep;
    const longer = noPunctOrig.length > noPunctRep.length ? noPunctOrig : noPunctRep;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) diffCount++;
    }
    diffCount += longer.length - shorter.length;
    return (diffCount / maxLen) >= 0.3;
  };

  // Auto-adjust: only red-line/high-risk, and only send target fragments to AI
  const handleAutoAdjust = async () => {
    const targetEntries: { original: string; current: string; level: RiskLevel }[] = [];
    const textToCheck = paletteText || scriptText;

    for (const [phrase, level] of riskMap.entries()) {
      if (level !== "red" && level !== "high") continue;
      if (textToCheck.includes(phrase)) {
        targetEntries.push({ original: phrase, current: phrase, level });
        continue;
      }
      const replaced = phraseReplacements.get(phrase);
      if (replaced && textToCheck.includes(replaced)) {
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

      const basePrompt = reviewMode === "script"
        ? `你是短剧情节优化专家。

你将收到"存在画面合规风险的完整段落"，请对每个段落进行整体改写，在保持剧情完整的前提下，使其画面呈现符合审核标准。

## ⛔ 重要规则（必须遵守）
1. **不要修改台词内容**：角色说的话（引号内内容）保持原样
2. **不要修改音效**：如【音效：XXX】保持原样
3. **只修改动作描写和场景描述**：用更委婉的方式呈现
4. 必须实际改写`
        : `你是短剧内容合规审核专家。

你将收到"存在违规词汇的片段"，请仅替换关键违规词汇，保持原文整体结构不变。

## ⛔ 重要规则（必须遵守）
1. **不要修改台词内容**：角色说的话（引号内内容）保持原样
2. **不要修改音效**：如【音效：XXX】保持原样
3. **只修改动作描写**：用委婉词汇替代敏感词`;

      const prompt = `${basePrompt}\n${strict ? "\n二次改写提醒：上一次改写仍与原文过于相似，请使用更明显的不同表达方式。" : ""}\n\n输出格式：\n只输出 JSON 数组，不要 markdown 代码块：\n[{"id":1,"replacement":"改写后的文本"}]\n\n待改写片段：\n${JSON.stringify(payload, null, 2)}`;

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
      let workingText = paletteText || scriptText;
      let workingReplacements = new Map(phraseReplacements);
      let pending = [...targetEntries];
      let appliedCount = 0;

      for (const strict of [false, true]) {
        if (pending.length === 0) break;

        const rewrites = await requestRewrite(pending, strict);
        const nextPending: typeof pending = [];

        pending.forEach((entry, idx) => {
          const replacement = rewrites.get(idx + 1)?.trim();
          if (!replacement || !isGenuinelyDifferent(entry.current, replacement, reviewMode === "script")) {
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
        toast({ title: "自动调整未生效", description: "AI 改写结果与原文过于相似，请点击「自动调整」重试，或手动编辑文本", variant: "destructive" });
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

  // Export palette text - xlsx if table mode, otherwise docx
  const handlePaletteExport = useCallback(async () => {
    try {
      // 如果是表格模式，导出 xlsx
      if (inputMode === "table" && tableData) {
        const exportData = [tableData.headers, ...tableData.rows];
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tableData.sheetName || "Sheet1");
        
        // 添加修改记录 sheet
        if (phraseReplacements.size > 0) {
          const modificationData = [
            ["序号", "原文", "调整后", "风险等级"],
            ...[...phraseReplacements.entries()].map(([original, replacement], idx) => {
              // 查找风险等级
              const level = combinedRiskMap.get(replacement) || combinedRiskMap.get(original);
              const levelText = level === "red" ? "红线问题" : level === "high" ? "高风险" : level === "info" ? "建议" : "-";
              return [idx + 1, original, replacement, levelText];
            })
          ];
          const wsModifications = XLSX.utils.aoa_to_sheet(modificationData);
          // 设置列宽
          wsModifications["!cols"] = [
            { wch: 6 },   // 序号
            { wch: 50 },  // 原文
            { wch: 50 },  // 调整后
            { wch: 10 },  // 风险等级
          ];
          XLSX.utils.book_append_sheet(wb, wsModifications, "修改记录");
        }
        
        const baseName = tableData.fileName.replace(/\.[^.]+$/, "");
        const exportFileName = `${baseName}_合规审核_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, exportFileName);
        toast({ title: "导出成功", description: `已导出为 ${exportFileName}` });
        return;
      }

      // 文本模式导出 docx
      const textToExport = paletteEditing ? paletteText : scriptText;
      const lines = textToExport.split("\n");
      const paragraphs = lines.map(line => {
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
        matchingPhrases.sort((a, b) => a.start - b.start);
        const runs: TextRun[] = [];
        let cursor = 0;
        for (const mp of matchingPhrases) {
          if (mp.start > cursor) {
            runs.push(new TextRun({ text: line.slice(cursor, mp.start), size: 24 }));
          }
          const color = mp.level === "red" ? "FF0000" : mp.level === "high" ? "FF8C00" : "2563EB";
          // 检查是否是被调整过的文本
          const originalText = replacementToOriginal.get(mp.phrase);
          const textWithOriginal = originalText 
            ? `${mp.phrase}（原：${originalText}）`
            : mp.phrase;
          runs.push(new TextRun({ text: textWithOriginal, size: 24, highlight: mp.level === "red" ? "red" : mp.level === "high" ? "yellow" : "cyan", color }));
          cursor = mp.start + mp.phrase.length;
        }
        if (cursor < line.length) {
          runs.push(new TextRun({ text: line.slice(cursor), size: 24 }));
        }
        return new Paragraph({ children: runs });
      });

      // 修改记录部分
      const modificationParagraphs = phraseReplacements.size > 0 ? [
        new Paragraph({
          children: [new TextRun({ text: "修改记录", bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
        ...[...phraseReplacements.entries()].map(([original, replacement]) => 
          new Paragraph({
            children: [
              new TextRun({ text: "原文：", bold: true, size: 22 }),
              new TextRun({ text: original, size: 22, color: "FF0000", strike: true }),
              new TextRun({ text: "  →  ", size: 22 }),
              new TextRun({ text: "调整后：", bold: true, size: 22 }),
              new TextRun({ text: replacement, size: 22, color: "008000" }),
            ],
            spacing: { after: 100 },
          })
        ),
      ] : [];

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
            ...modificationParagraphs,
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `合规审核_调色盘对比_${new Date().toISOString().slice(0, 10)}.docx`);
      toast({ title: "导出成功" });
    } catch (e: any) {
      toast({ title: "导出失败", description: e?.message, variant: "destructive" });
    }
  }, [paletteEditing, paletteText, scriptText, activeRiskMap, inputMode, tableData, replacementToOriginal, phraseReplacements, combinedRiskMap]);

  const handlePaletteEditToggle = () => {
    if (paletteEditing) {
      if (paletteEditRef.current) {
        const newText = paletteEditRef.current.innerText;
        setPaletteText(newText);
        setScriptText(newText);
      } else {
        setScriptText(paletteText);
      }
    } else {
      if (!paletteText) {
        setPaletteText(scriptText);
      }
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
        setTableData(null);
        setInputMode("text");
        toast({ title: "文件已加载" });
      } else if (["xlsx", "xls", "csv"].includes(ext)) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, { header: 1, defval: "" });

        if (jsonData.length === 0) {
          toast({ title: "表格为空", description: "未找到有效数据", variant: "destructive" });
          return;
        }

        const headers = (jsonData[0] as string[]).map((h, i) => String(h || `列${i + 1}`));
        const rows = jsonData.slice(1).map(row =>
          (row as (string | number | null)[]).map(cell => cell ?? "")
        );

        setTableData({ headers, rows, fileName: file.name, sheetName, originalData: jsonData });
        setInputMode("table");
        const textContent = jsonData.map(row => (row as any[]).join("\t")).join("\n");
        setScriptText(textContent);
        toast({ title: "表格已加载", description: `${file.name} - ${sheetName} (${rows.length} 行数据)` });
      } else if (["pdf", "docx", "doc"].includes(ext)) {
        const formData = new FormData();
        formData.append("file", file);
        const { data, error } = await supabase.functions.invoke("parse-document", { body: formData });
        if (error) throw error;
        if (data?.text) {
          setScriptText((prev) => (prev ? prev + "\n\n" : "") + data.text);
          setTableData(null);
          setInputMode("text");
          toast({ title: "文档解析完成" });
        }
      } else {
        toast({ title: "不支持的格式", description: "支持 TXT、PDF、DOCX、XLSX、XLS、CSV 文件", variant: "destructive" });
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

    // 判断是否需要分段
    const totalChars = scriptText.length;
    const chineseCount = (scriptText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const MAX_TOTAL = 20000;
    const needsSegment = totalChars > MAX_TOTAL;

    setIsGenerating(true);
    setStreamingText("");
    setReportOpen(true);
    setComplianceReport("");
    setPhraseReplacements(new Map());
    // 保留手动标记，不要清除
    // 同时确保 paletteText 有值
    if (!paletteText && scriptText) {
      setPaletteText(scriptText);
    }
    abortRef.current = new AbortController();

    try {
      const promptGenerator = reviewMode === "script" ? SCRIPT_REVIEW_PROMPT : STANDALONE_COMPLIANCE_PROMPT;

      if (!needsSegment) {
        setSegmentProgress(null);
        const prompt = promptGenerator(scriptText);
        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          (chunk) => setStreamingText(chunk),
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );
        setComplianceReport(finalText);
        setStreamingText("");
        toast({ title: reviewMode === "script" ? "情节审核完成" : "文字审核完成" });
      } else {
        // 长文本分段处理
        const segments: string[] = [];
        const chineseRatio = chineseCount / totalChars;
        const segmentSize = chineseRatio > 0.3 ? 20000 : 60000;
        const isTableMode = inputMode === "table" && tableData;
        const paragraphs = isTableMode ? scriptText.split(/\n/) : scriptText.split(/\n\n+/);

        let currentSegment = "";
        for (const para of paragraphs) {
          if ((currentSegment + para).length > segmentSize && currentSegment.length > 0) {
            segments.push(currentSegment.trim());
            currentSegment = para;
          } else {
            currentSegment += (currentSegment ? (isTableMode ? "\n" : "\n\n") : "") + para;
          }
        }
        if (currentSegment.trim()) segments.push(currentSegment.trim());

        const totalSegments = segments.length;
        const segmentReports: string[] = [];

        for (let i = 0; i < segments.length; i++) {
          if (abortRef.current?.signal.aborted) break;
          setSegmentProgress({ current: i + 1, total: totalSegments });
          setStreamingText(`正在审核第 ${i + 1}/${totalSegments} 段（${segments[i].length} 字）…`);

          const prompt = promptGenerator(segments[i]);
          const report = await callGeminiStream(
            model,
            [{ role: "user", parts: [{ text: prompt }] }],
            () => {},
            { maxOutputTokens: 8192 },
            abortRef.current.signal,
          );
          segmentReports.push(`## 第 ${i + 1} 段审核报告\n\n${report}`);
        }

        if (segmentReports.length > 0) {
          const nonChineseCount = totalChars - chineseCount;
          const combinedReport = `# 合规审核报告（分 ${totalSegments} 段审核）\n\n` +
            `> 原文共 ${chineseCount} 中文字 + ${nonChineseCount} 非中文字，已拆分为 ${totalSegments} 段分别审核。\n\n` +
            segmentReports.join("\n\n---\n\n");
          setComplianceReport(combinedReport);
          setStreamingText("");
          toast({ title: "合规审核完成", description: `已完成 ${totalSegments} 段分段审核` });
        }
      }
    } catch (e: any) {
      if (e?.message?.includes("取消") || e?.name === "AbortError") {
        const partial = streamingText;
        if (partial) setComplianceReport(partial);
        toast({ title: "已停止生成" });
      } else {
        toast({ title: "审核失败", description: e?.message, variant: "destructive" });
        if (streamingText) setComplianceReport(streamingText);
      }
    } finally {
      setIsGenerating(false);
      setSegmentProgress(null);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();
  const displayText = isGenerating ? streamingText : complianceReport;

  // Count unique phrases per level (include position-based risks)
  const redLineCount = useMemo(() => 
    positionBasedRisks.filter(r => r.level === "red").length + [...riskMap.values()].filter(l => l === "red").length,
    [positionBasedRisks, riskMap]);
  const highRiskCount = useMemo(() => 
    positionBasedRisks.filter(r => r.level === "high").length + [...riskMap.values()].filter(l => l === "high").length,
    [positionBasedRisks, riskMap]);
  const infoCount = useMemo(() => 
    positionBasedRisks.filter(r => r.level === "info").length + [...riskMap.values()].filter(l => l === "info").length,
    [positionBasedRisks, riskMap]);

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
                accept=".txt,.pdf,.docx,.doc,.xlsx,.xls,.csv"
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
            {/* 输入模式切换 */}
            {tableData && (
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "table")} className="mb-4">
                <TabsList>
                  <TabsTrigger value="table"><TableIcon className="h-3.5 w-3.5 mr-1" />表格模式</TabsTrigger>
                  <TabsTrigger value="text"><FileText className="h-3.5 w-3.5 mr-1" />文本模式</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {inputMode === "table" && tableData ? (
              <div className="max-h-[400px] overflow-auto rounded-md border border-border">
                <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {tableData.fileName}
                  {tableData.sheetName && <span>· {tableData.sheetName}</span>}
                  <span>({tableData.rows.length} 行)</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableData.headers.map((header, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">{header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs py-1.5">{String(cell ?? "")}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <>
                <Textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="粘贴剧本内容，或点击上方按钮上传 TXT / PDF / DOCX / XLSX 文档..."
                  rows={12}
                  className="font-mono text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2 text-right">
                  {scriptText.length} 字
                </div>
              </>
            )}
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
                <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                  {/* 审核模式切换 */}
                  <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                    <button
                      onClick={() => setReviewMode("text")}
                      className={`px-2 py-1 text-xs rounded transition-colors ${reviewMode === "text" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      文字审核
                    </button>
                    <button
                      onClick={() => setReviewMode("script")}
                      className={`px-2 py-1 text-xs rounded transition-colors ${reviewMode === "script" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      情节审核
                    </button>
                  </div>

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
                      {complianceReport ? (reviewMode === "script" ? "重新情节审核" : "重新文字审核") : (reviewMode === "script" ? "情节审核" : "文字审核")}
                    </Button>
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {segmentProgress && (
                  <div className="mb-4 space-y-1">
                    <div className="text-xs text-muted-foreground">
                      正在审核第 {segmentProgress.current}/{segmentProgress.total} 段
                    </div>
                    <Progress value={(segmentProgress.current / segmentProgress.total) * 100} className="h-1.5" />
                  </div>
                )}
                {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
                {!displayText ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <p>输入或上传剧本内容后，点击审核按钮进行合规检查</p>
                    <p className="text-xs mt-2">
                      {reviewMode === "script"
                        ? "情节审核：文字违规+画面违规+对话密度三重审查"
                        : "文字审核：检测激烈冲突、版权问题、敏感内容、对话密度"}
                    </p>
                    <p className="text-xs mt-1 text-amber-600">
                      💬 对话标准：每集150-180词，连续对白≤20词
                    </p>
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

        {/* Risk Highlight Comparison - 只要有剧本内容就显示 */}
        {scriptText && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                {isGenerating && <span className="text-xs text-muted-foreground animate-pulse">（审核中...）</span>}
                {!isGenerating && (positionBasedRisks.length > 0 || riskMap.size > 0 || manualRiskMap.size > 0) && (
                  <span className="text-sm font-normal text-muted-foreground">
                    共 {positionBasedRisks.length + riskMap.size + manualRiskMap.size} 处标记
                    {positionBasedRisks.length > 0 && <span className="text-green-600 ml-1">({positionBasedRisks.length} 精确定位)</span>}
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {/* 手动标记按钮 */}
                <div className="flex items-center gap-1 mr-2">
                  <span className="text-xs text-muted-foreground">手动标记：</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const text = prompt("输入要标记为红线问题的文本：");
                      if (text) {
                        setManualRiskMap(prev => {
                          const newMap = new Map(prev);
                          newMap.set(text, "red");
                          return newMap;
                        });
                        if (!paletteText && scriptText) setPaletteText(scriptText);
                        toast({ title: "已添加红线标记" });
                      }
                    }}
                  >
                    ⛔ 红线
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs border-orange-300 text-orange-600 hover:bg-orange-50"
                    onClick={() => {
                      const text = prompt("输入要标记为高风险的文本：");
                      if (text) {
                        setManualRiskMap(prev => {
                          const newMap = new Map(prev);
                          newMap.set(text, "high");
                          return newMap;
                        });
                        if (!paletteText && scriptText) setPaletteText(scriptText);
                        toast({ title: "已添加高风险标记" });
                      }
                    }}
                  >
                    ⚠️ 高风险
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      const text = prompt("输入要标记为优化建议的文本：");
                      if (text) {
                        setManualRiskMap(prev => {
                          const newMap = new Map(prev);
                          newMap.set(text, "info");
                          return newMap;
                        });
                        if (!paletteText && scriptText) setPaletteText(scriptText);
                        toast({ title: "已添加优化建议标记" });
                      }
                    }}
                  >
                    ℹ️ 建议
                  </Button>
                  {manualRiskMap.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={clearManualMarks}
                    >
                      清除手动
                    </Button>
                  )}
                </div>
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
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                  💡 提示：选中文本后可点击上方按钮手动标记
                </span>
              </div>
              {riskPhrases.length === 0 && manualRiskMap.size === 0 && positionBasedRisks.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm bg-amber-50 dark:bg-amber-900/20 rounded-md mb-4">
                  <p>暂无风险标记</p>
                  <p className="mt-1 text-xs">AI 审核后自动标记，或使用上方按钮手动添加标记</p>
                  {complianceReport && (
                    <p className="mt-2 text-xs">
                      提示：展开下方"调试信息"查看 AI 输出状态
                    </p>
                  )}
                </div>
              )}
              {riskPhrases.length > 0 && (() => {
                const matchedCount = riskPhrases.filter(p => (paletteText || scriptText).includes(p)).length;
                const unmatchedCount = riskPhrases.length - matchedCount;
                return unmatchedCount > 0 ? (
                  <div className="text-center py-3 text-muted-foreground text-sm bg-blue-50 dark:bg-blue-900/20 rounded-md mb-4">
                    <p>📊 AI 识别 {riskPhrases.length} 处，成功匹配 {matchedCount} 处</p>
                    <p className="mt-1 text-xs">有 {unmatchedCount} 处因文字差异未精确匹配，可手动添加标记</p>
                  </div>
                ) : null;
              })()}
              {highlightedScript || (paletteText || scriptText) ? (
                <div ref={paletteScrollRef} className="max-h-[500px] overflow-auto rounded-md border border-border bg-muted/30">
                  {paletteEditing ? (
                    <pre
                      ref={paletteEditRef}
                      className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 outline-none p-4"
                      contentEditable={true}
                      suppressContentEditableWarning
                      onBlur={() => {
                        if (paletteEditing && paletteEditRef.current) {
                          setPaletteText(paletteEditRef.current.innerText);
                        }
                      }}
                    >
                      {paletteText || scriptText}
                    </pre>
                  ) : inputMode === "table" && tableData ? (
                    // 表格模式：显示表格并高亮
                    (() => {
                      // 计算每个单元格在 scriptText 中的位置
                      let pos = 0;
                      const cellPositions: { row: number; col: number; start: number }[] = [];
                      
                      for (let rowIndex = 0; rowIndex < tableData.rows.length; rowIndex++) {
                        const row = tableData.rows[rowIndex];
                        for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
                          const cellText = String(row[cellIndex] ?? "");
                          cellPositions.push({ row: rowIndex, col: cellIndex, start: pos });
                          pos += cellText.length;
                          if (cellIndex < row.length - 1) pos += 1; // tab
                        }
                        if (rowIndex < tableData.rows.length - 1) pos += 1; // newline
                      }
                      
                      return (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {tableData.headers.map((header, i) => (
                                <TableHead key={i} className="text-xs whitespace-nowrap">{header}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tableData.rows.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                {row.map((cell, cellIndex) => {
                                  const cellPos = cellPositions.find(p => p.row === rowIndex && p.col === cellIndex);
                                  return (
                                    <TableCell key={cellIndex} className="text-xs py-1.5">
                                      {highlightTableCell(String(cell ?? ""), cellPos?.start)}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      );
                    })()
                  ) : (
                    <div 
                      ref={paletteContainerRef}
                      className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 select-text p-4"
                      onMouseUp={handleTextSelection}
                    >
                      {highlightedScript || (paletteText || scriptText)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p>请先输入或上传剧本内容</p>
                </div>
              )}
              
              {/* 手动标记列表 */}
              {manualRiskMap.size > 0 && (
                <div className="mt-4 border-t pt-4">
                  <h4 className="text-sm font-medium mb-2">手动标记列表</h4>
                  <div className="flex flex-wrap gap-2">
                    {[...manualRiskMap.entries()].map(([phrase, level]) => (
                      <div
                        key={phrase}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          level === "red" ? "bg-red-100 text-red-700" :
                          level === "high" ? "bg-orange-100 text-orange-700" :
                          "bg-blue-100 text-blue-700"
                        }`}
                      >
                        <span className="max-w-[200px] truncate">{phrase}</span>
                        <button
                          onClick={() => removeManualMark(phrase)}
                          className="hover:opacity-70 ml-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* AI 标记匹配状态调试 */}
              <div className="mt-4 border-t pt-4">
                <details className="text-sm" open={positionBasedRisks.length === 0 && riskMap.size === 0}>
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    🔍 调试信息（点击展开）
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium">报告状态：</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>报告长度：{complianceReport?.length || 0} 字符</li>
                        <li>位置标记：{positionBasedRisks.length} 个</li>
                        <li>文本标记：{riskMap.size} 个</li>
                        <li>手动标记：{manualRiskMap.size} 个</li>
                      </ul>
                    </div>
                    
                    {complianceReport && (
                      <div className="p-2 bg-muted/50 rounded">
                        <p className="font-medium">报告中风险标记数量：</p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>⛔ 标记：{(complianceReport.match(/⛔/g) || []).length} 个</li>
                          <li>⚠️ 标记：{(complianceReport.match(/⚠️/g) || []).length} 个</li>
                          <li>ℹ️ 标记：{(complianceReport.match(/ℹ️/g) || []).length} 个</li>
                          <li>【】括号：{(complianceReport.match(/【[^】]+】/g) || []).length} 个</li>
                        </ul>
                        {positionBasedRisks.length > 0 ? (
                          <div className="mt-2 p-2 bg-green-50 text-green-700 rounded">
                            ✅ 已成功匹配 {positionBasedRisks.length} 个标记到原文
                          </div>
                        ) : (complianceReport.match(/⛔|⚠️|ℹ️/g) || []).length > 0 && (
                          <div className="mt-2 p-2 bg-amber-50 text-amber-700 rounded">
                            <p className="font-medium">⚠️ 发现 emoji 标记，但未能匹配到原文</p>
                            <p className="mt-1">可能原因：AI 修改了原文文本</p>
                            <p className="mt-1">解决方案：使用"手动标记"功能</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {positionBasedRisks.length > 0 && (
                      <div className="p-2 bg-green-50 text-green-700 rounded">
                        <p className="font-medium">✅ 已识别的标记：</p>
                        {positionBasedRisks.slice(0, 10).map((item, idx) => (
                          <div key={idx} className="mt-1 font-mono text-[11px]">
                            {item.level === "red" ? "⛔" : item.level === "high" ? "⚠️" : "ℹ️"} [{item.start}-{item.end}] {item.text.slice(0, 30)}...
                          </div>
                        ))}
                        {positionBasedRisks.length > 10 && (
                          <p className="mt-1">... 还有 {positionBasedRisks.length - 10} 个</p>
                        )}
                      </div>
                    )}
                    
                    {positionBasedRisks.length === 0 && riskMap.size === 0 && complianceReport && (
                      <div className="p-2 bg-amber-50 text-amber-700 rounded">
                        <p className="font-medium">⚠️ 未识别到任何风险标记</p>
                        {(complianceReport.match(/⛔|⚠️|ℹ️/g) || []).length === 0 ? (
                          <>
                            <p className="mt-1">AI 没有输出任何 emoji 标记</p>
                            <p className="mt-1">可能原因：内容确实合规，或 AI 未按格式输出</p>
                          </>
                        ) : (
                          <>
                            <p className="mt-1">AI 输出了 emoji 标记，但文本无法在原文中匹配</p>
                            <p className="mt-1">解决方案：使用"手动标记"按钮</p>
                          </>
                        )}
                      </div>
                    )}
                    
                    {/* 显示报告中的【】内容，方便手动添加 */}
                    {complianceReport && (() => {
                      const bracketMatches = complianceReport.match(/【[^】]+】/g) || [];
                      const unmatchedBrackets = bracketMatches.filter(m => {
                        const text = m.slice(1, -1);
                        return !scriptText.includes(text);
                      });
                      return unmatchedBrackets.length > 0 ? (
                        <div className="p-2 bg-red-50 text-red-700 rounded">
                          <p className="font-medium">❌ 未匹配的【】内容（可手动标记）：</p>
                          <div className="mt-1 max-h-[150px] overflow-auto space-y-1">
                            {unmatchedBrackets.slice(0, 20).map((match, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-[11px] font-mono flex-1 truncate">{match}</span>
                                <button
                                  className="text-[10px] text-blue-600 hover:underline shrink-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(match.slice(1, -1));
                                    toast({ title: "已复制", description: "可用手动标记功能添加" });
                                  }}
                                >
                                  复制
                                </button>
                              </div>
                            ))}
                            {unmatchedBrackets.length > 20 && (
                              <p className="text-[10px]">... 还有 {unmatchedBrackets.length - 20} 个</p>
                            )}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </details>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* 风险选择浮窗 */}
        {!isGenerating && !paletteEditing && showRiskSelector && selectedText && selectionPosition && (
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-2 flex gap-1"
            style={{ left: selectionPosition.x, top: selectionPosition.y, transform: "translateX(-50%)" }}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => addManualMark("red")}
            >
              ⛔ 红线
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs border-orange-300 text-orange-600 hover:bg-orange-50"
              onClick={() => addManualMark("high")}
            >
              ⚠️ 高风险
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
              onClick={() => addManualMark("info")}
            >
              ℹ️ 建议
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setShowRiskSelector(false);
                setSelectedText("");
              }}
            >
              取消
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default ComplianceReview;
