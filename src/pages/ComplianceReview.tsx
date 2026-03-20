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
const STANDALONE_COMPLIANCE_PROMPT = (scriptText: string) => `你是一位资深的短剧内容合规审核专家。

## 待审核内容（原文）
\`\`\`
${scriptText}
\`\`\`

---

## 审核维度

1. 激烈冲突内容
2. 版权问题
3. 敏感亲密内容
4. 对话长度密度（每集150-180词，连续对白≤20词）

---

## ⛔⛔⛔ 强制要求：复制粘贴原文标记 ⛔⛔⛔

当你发现问题时，必须从上面的"待审核内容"中**精确复制**有问题的文本。

### 格式
- 红线：⛔【从原文复制的文本】
- 高风险：⚠️【从原文复制的文本】
- 建议：ℹ️【从原文复制的文本】

### 步骤
1. 在上面的代码块中找到有问题的句子
2. 选中并复制（Ctrl+C）
3. 粘贴到标记中（Ctrl+V）
4. 不要手动输入，不要修改任何字符

### 示例

原文：
\`\`\`
他狠狠地打了她一巴掌，她的嘴角流出了鲜血。
\`\`\`

正确输出：
⛔【他狠狠地打了她一巴掌，她的嘴角流出了鲜血。】

错误输出（会被系统拒绝）：
⛔【他打她巴掌】 ← 缺字
⛔【他狠狠的打了她】 ← 改字（"的"vs"地"）

---

用 Markdown 格式输出审核结果。`;

// 情节审核提示词 - 审核整个段落的画面表现 + 文字违规
const SCRIPT_REVIEW_PROMPT = (scriptText: string) => `你是一位资深的短剧内容合规审核专家。

## 待审核剧本（原文）
\`\`\`
${scriptText}
\`\`\`

---

## 审核维度

1. 文字违规（激烈冲突、版权、敏感内容）
2. 画面违规（肢体冲突、亲密场景等）
3. 对话密度（每集150-180词，连续对白≤20词）

---

## ⛔⛔⛔ 强制要求：复制粘贴原文标记 ⛔⛔⛔

当你发现问题时，必须从上面的"待审核剧本"中**精确复制**有问题的文本。

### 格式
- 红线：⛔【从原文复制的段落】
- 高风险：⚠️【从原文复制的段落】
- 建议：ℹ️【从原文复制的段落】

### 步骤
1. 在上面的代码块中找到有问题的段落
2. 选中并复制（Ctrl+C）
3. 粘贴到标记中（Ctrl+V）
4. 不要手动输入，不要修改任何字符

---

用 Markdown 格式输出审核结果。`;

## 输出格式

使用以下标记标注风险：

- ⛔ 红线问题（必须修改）
- ⚠️ 高风险内容（建议修改）
- ℹ️ 优化建议（可选修改）

## ⚠️ 重要：标记规则

标记时必须**严格引用原文**，一字不改：
- 文字违规：⛔【原文中的完整句子，不可修改任何字】
- 画面违规：⛔【原文中的完整段落，不可修改任何字】

**必须完全复制原文**，不能有任何修改或省略。

## 输出结构

1. **合规总评**
2. **文字违规检测**
3. **画面违规检测**
4. **对话长度密度检测**
5. **对话调优方案**（如有超标）
6. **风险汇总**
7. **修改建议**

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

  // Extract risk phrases with severity levels from report
  type RiskLevel = "red" | "high" | "info";
  const riskMap = useMemo(() => {
    if (!complianceReport) return new Map<string, RiskLevel>();
    const map = new Map<string, RiskLevel>();
    // Match multiple formats: ⛔【...】, ⛔[...], ⛔「...」, and also just emoji followed by content
    const patterns: [RegExp, RiskLevel][] = [
      // 中文方括号格式
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
    if (!text) return <>{text}</>;
    // 使用合并后的风险映射（包含手动标记）
    if (activeRiskPhrases.length === 0) return <>{text}</>;
    
    // 标准化函数：去除空格、常见标点差异
    const normalize = (s: string) => 
      s.replace(/\s+/g, "")
       .replace(/[，。！？、；：""''（）【】「」,.!?;:'"()]/g, "");
    
    // 创建原文的标准化映射
    const normalizedText = normalize(text);
    
    // 扩展的风险映射（包含模糊匹配）
    const extendedRiskMap = new Map<string, RiskLevel>(activeRiskMap);
    
    // 对每个风险片段进行匹配
    for (const phrase of activeRiskPhrases) {
      // 如果已经精确匹配，跳过
      if (text.includes(phrase)) continue;
      
      const level = activeRiskMap.get(phrase);
      if (!level) continue;
      
      const normalizedPhrase = normalize(phrase);
      if (normalizedPhrase.length < 5) continue; // 太短跳过
      
      // 在标准化后的原文中查找
      const normIdx = normalizedText.indexOf(normalizedPhrase);
      if (normIdx === -1) {
        // 尝试查找部分匹配（前70%）
        const partialLen = Math.floor(normalizedPhrase.length * 0.7);
        const partialPhrase = normalizedPhrase.slice(0, partialLen);
        const partialIdx = normalizedText.indexOf(partialPhrase);
        
        if (partialIdx !== -1) {
          // 找到部分匹配，尝试确定原文中的边界
          // 在原文中找到对应位置
          let charCount = 0;
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (!/\s/.test(ch) && !/[，。！？、；：""''（）【】「」,.!?;:'"()]/.test(ch)) {
              if (charCount === partialIdx) {
                // 找到起始位置，尝试提取对应的原文
                const estimatedLen = Math.ceil(phrase.length * 1.2);
                const candidate = text.slice(i, i + estimatedLen);
                extendedRiskMap.set(candidate, level);
                break;
              }
              charCount++;
            }
          }
        }
        continue;
      }
      
      // 找到完全匹配，确定原文边界
      let charCount = 0;
      let startPos = -1;
      
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!/\s/.test(ch) && !/[，。！？、；：""''（）【】「」,.!?;:'"()]/.test(ch)) {
          if (charCount === normIdx) {
            startPos = i;
          }
          charCount++;
        }
      }
      
      if (startPos !== -1) {
        // 估算原文长度
        const estimatedLen = phrase.length + Math.floor(phrase.length * 0.3);
        const candidate = text.slice(startPos, startPos + estimatedLen);
        extendedRiskMap.set(candidate, level);
      }
    }
    
    // 收集所有匹配文本
    const allPhrases = [...extendedRiskMap.keys()].sort((a, b) => b.length - a.length);
    
    // 只保留在原文中存在的
    const matching = allPhrases.filter(p => text.includes(p));
    if (matching.length === 0) return <>{text}</>;
    
    const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);
    
    return parts.map((part, i) => {
      const level = extendedRiskMap.get(part);
      if (level) {
        const isBlank = blankPhrases?.has(part);
        const isAdjusting = adjustingSinglePhrase === part;
        return (
          <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""}`}>
            {isBlank ? "\u00A0".repeat(Math.max(part.length, 2)) : part}
            {!isBlank && !isAdjusting && (
              <button
                className="inline-flex items-center justify-center w-4 h-4 ml-0.5 text-[10px] rounded hover:bg-foreground/10 align-middle cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSingleAdjust(part, level);
                }}
                disabled={isAutoAdjusting}
                title="重新生成"
              >
                ↻
              </button>
            )}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [activeRiskPhrases, activeRiskMap, adjustingSinglePhrase, handleSingleAdjust, isAutoAdjusting]);

  const highlightedScript = useMemo(() => {
    const text = paletteText || scriptText;
    // 如果正在生成，只显示文本（手动标记仍然生效）
    if (isGenerating) {
      if (manualRiskMap.size > 0) {
        return buildHighlightedParts(text, undefined);
      }
      return <>{text}</>;
    }
    return buildHighlightedParts(text, isAutoAdjusting ? adjustingPhrases : undefined);
  }, [paletteText, scriptText, buildHighlightedParts, isAutoAdjusting, adjustingPhrases, isGenerating, manualRiskMap]);
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
        ? `你是短剧情节优化专家。\n\n你将收到"存在画面合规风险的完整段落"，请对每个段落进行整体改写，在保持剧情完整的前提下，使其画面呈现符合审核标准。\n\n改写原则：\n1. 保持剧情完整\n2. 画面合规改写\n3. 整体改写段落\n4. 必须实际改写`
        : `你是短剧内容合规审核专家。\n\n你将收到"存在违规词汇的片段"，请仅替换关键违规词汇，保持原文整体结构不变。\n\n改写原则：\n1. 最小改动原则\n2. 词汇替换\n3. 保持原意`;

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
  }, [paletteEditing, paletteText, scriptText, activeRiskMap, inputMode, tableData]);

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
                {!isGenerating && combinedRiskPhrases.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    共 {combinedRiskPhrases.length} 处标记（AI {riskPhrases.length} + 手动 {manualRiskMap.size}）
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
              {riskPhrases.length === 0 && manualRiskMap.size === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm bg-amber-50 dark:bg-amber-900/20 rounded-md mb-4">
                  <p>暂无标记</p>
                  <p className="mt-1 text-xs">AI 审核后自动标记，或使用上方按钮手动添加标记</p>
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
                <div ref={paletteScrollRef} className="max-h-[500px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                  {paletteEditing ? (
                    <pre
                      ref={paletteEditRef}
                      className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 outline-none"
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
                  ) : (
                    <div 
                      ref={paletteContainerRef}
                      className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 select-text"
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
              {riskPhrases.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      🔍 AI 标记匹配状态（{riskPhrases.length} 个）
                    </summary>
                    <div className="mt-2 space-y-1 max-h-[200px] overflow-auto">
                      {riskPhrases.map((phrase, idx) => {
                        const isMatched = (paletteText || scriptText).includes(phrase);
                        const level = riskMap.get(phrase);
                        return (
                          <div
                            key={idx}
                            className={`p-1.5 rounded text-xs ${
                              isMatched ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}
                          >
                            <span className="font-mono">
                              {level === "red" ? "⛔" : level === "high" ? "⚠️" : "ℹ️"}
                              {isMatched ? "✓" : "✗"}
                            </span>
                            <span className="ml-2">{phrase.slice(0, 50)}{phrase.length > 50 ? "..." : ""}</span>
                            {!isMatched && (
                              <button
                                className="ml-2 text-blue-600 hover:underline"
                                onClick={() => {
                                  navigator.clipboard.writeText(phrase);
                                  toast({ title: "已复制", description: "可粘贴到手动标记" });
                                }}
                              >
                                复制
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!riskPhrases.every(p => (paletteText || scriptText).includes(p)) && (
                      <p className="mt-2 text-xs text-amber-600">
                        💡 未匹配的标记可能是 AI 修改了原文。可以复制后用"手动标记"功能添加。
                      </p>
                    )}
                  </details>
                </div>
              )}
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
