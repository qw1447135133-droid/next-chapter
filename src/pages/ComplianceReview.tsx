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
  // 审核模式：文字审核 | 剧本审核
  const [reviewMode, setReviewMode] = useState<ReviewMode>("text");
  const [model, setModel] = useState<ComplianceModel>(
    () => (localStorage.getItem("compliance-model") as ComplianceModel) || "gemini-3.1-pro-preview"
  );
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useAutoScroll<HTMLPreElement>(isGenerating, streamingText);
  const paletteScrollRef = useRef<HTMLDivElement>(null);
  // 分段审核进度
  const [segmentProgress, setSegmentProgress] = useState<{ current: number; total: number } | null>(null);
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
    const patterns: [RegExp, RiskLevel][] = [
      [/⛔\s*【([^】]+)】/g, "red"],
      [/⚠️\s*【([^】]+)】/g, "high"],
      [/ℹ️\s*【([^】]+)】/g, "info"],
    ];
    for (const [regex, level] of patterns) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(complianceReport)) !== null) {
        const phrase = m[1];
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

  const activeRiskMap = useMemo(() => {
    const map = new Map<string, RiskLevel>(riskMap);
    for (const [original, replacement] of phraseReplacements.entries()) {
      const level = riskMap.get(original);
      if (level && !map.has(replacement)) {
        map.set(replacement, level);
      }
    }
    return map;
  }, [riskMap, phraseReplacements]);

  const activeRiskPhrases = useMemo(() => [...activeRiskMap.keys()], [activeRiskMap]);

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
请对以下存在画面合规风险的**整个段落**进行优化改写，在保持剧情完整的前提下，使其画面呈现符合审核标准。

## 原始段落
${phrase}

## 风险等级
${level === "red" ? "红线问题（画面必然违规）" : level === "high" ? "高风险内容（画面存在较大违规风险）" : "优化建议（可通过镜头优化降低风险）"}

## 改写原则

1. **保持剧情完整**
   - 情节走向不变
   - 人物关系和情感不变
   - 关键信息保留

2. **画面合规改写**
   - 暴力情节：改为"推搡"、"摔倒"等轻度动作，或用侧面描写、心理描写替代
   - 亲密情节：改为含蓄的"相拥"、"低语"等，或用转场、暗示替代
   - 其他风险：用安全的表现方式替代

3. **整体改写**
   - 改写整个段落的画面呈现方式
   - 可以调整动作描写、环境描写、心理描写
   - 确保改写后的画面效果安全合规

## 输出格式
只输出改写后的完整段落，不要任何解释或标记。`
      : `你是短剧内容合规审核专家。

## 你的任务
请对以下存在违规词汇的片段进行**最小化修改**，只替换关键违规词汇。

## 原始片段
${phrase}

## 风险等级
${level === "red" ? "红线问题" : level === "high" ? "高风险内容" : "优化建议"}

## 改写原则
1. **最小改动**：只替换违规词汇，保持原文结构不变
2. **词汇替换**：用委婉词汇替代敏感词
3. **保持原意**：语义和氛围基本一致

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

      if (!replacement || !isGenuinelyDifferent(phrase, replacement, reviewMode === "script")) {
        toast({ title: "改写失败", description: "AI 未生成有效改写", variant: "destructive" });
        return;
      }

      // 更新文本
      const currentText = inputMode === "table" && tableData
        ? tableData.rows.map(row => row.join("\t")).join("\n")
        : paletteText || scriptText;

      const newText = currentText.split(phrase).join(replacement);

      // 更新替换记录
      const originalPhrase = replacementToOriginal.get(phrase) || phrase;
      setPhraseReplacements(prev => {
        const newMap = new Map(prev);
        newMap.set(originalPhrase, replacement);
        return newMap;
      });

      // 根据模式更新
      if (inputMode === "table" && tableData) {
        const newRows = tableData.rows.map(row =>
          row.map(cell => {
            const cellStr = String(cell ?? "");
            return cellStr.split(phrase).join(replacement);
          })
        );
        setTableData({ ...tableData, rows: newRows });
        const textContent = [tableData.headers, ...newRows].map(row => (row as any[]).join("\t")).join("\n");
        setScriptText(textContent);
        setPaletteText(textContent);
      } else {
        setPaletteText(newText);
        setScriptText(newText);
      }

      toast({ title: "改写成功", description: `已将「${phrase.slice(0, 20)}...」改写为「${replacement.slice(0, 20)}...」` });
    } catch (e: any) {
      toast({ title: "改写失败", description: e?.message, variant: "destructive" });
    } finally {
      setAdjustingSinglePhrase(null);
    }
  }, [adjustingSinglePhrase, model, inputMode, tableData, paletteText, scriptText, replacementToOriginal, reviewMode]);

  const buildHighlightedParts = useCallback((text: string, blankPhrases?: Set<string>) => {
    if (!text || activeRiskPhrases.length === 0) return <>{text}</>;

    const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);
    const matching = sorted.filter(p => text.includes(p));

    // 情节审核模式：额外检查风险段落是否包含这段文本
    if (reviewMode === "script") {
      for (const phrase of sorted) {
        if (!matching.includes(phrase) && phrase.includes(text)) {
          matching.push(phrase);
        }
      }
    }

    if (matching.length === 0) return <>{text}</>;

    const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);

    return parts.map((part, i) => {
      const level = activeRiskMap.get(part);
      if (level) {
        const isBlank = blankPhrases?.has(part);
        const originalText = replacementToOriginal.get(part);
        const showTooltip = !!originalText;
        const isAdjusting = adjustingSinglePhrase === part;

        return (
          <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""}`} title={showTooltip ? `原文: ${originalText}` : undefined}>
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
  }, [activeRiskPhrases, activeRiskMap, replacementToOriginal, adjustingSinglePhrase, handleSingleAdjust, isAutoAdjusting, reviewMode]);

  const highlightedScript = useMemo(() => {
    const text = paletteText || scriptText;
    return buildHighlightedParts(text, isAutoAdjusting ? adjustingPhrases : undefined);
  }, [paletteText, scriptText, buildHighlightedParts, isAutoAdjusting, adjustingPhrases]);

  // 表格编辑相关状态
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const tableCellInputRef = useRef<HTMLInputElement>(null);

  // 表格编辑历史记录
  const [tableHistory, setTableHistory] = useState<{
    rows: (string | number | null)[][];
    timestamp: number;
    cell?: { row: number; col: number };
    oldValue?: string | number | null;
    newValue?: string;
  }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 开始编辑表格单元格
  const handleTableCellEdit = useCallback((rowIndex: number, colIndex: number) => {
    const cellValue = tableData?.rows[rowIndex]?.[colIndex];
    setEditingCell({ row: rowIndex, col: colIndex });
    setEditingValue(String(cellValue ?? ""));
    setTimeout(() => tableCellInputRef.current?.focus(), 0);
  }, [tableData]);

  // 保存表格单元格编辑
  const handleTableCellSave = useCallback(() => {
    if (editingCell && tableData) {
      const oldValue = tableData.rows[editingCell.row]?.[editingCell.col];

      if (String(oldValue ?? "") === editingValue) {
        setEditingCell(null);
        setEditingValue("");
        return;
      }

      const newRows = [...tableData.rows];
      newRows[editingCell.row] = [...newRows[editingCell.row]];
      newRows[editingCell.row][editingCell.col] = editingValue;

      const newHistory = tableHistory.slice(0, historyIndex + 1);
      newHistory.push({
        rows: tableData.rows.map(row => [...row]),
        timestamp: Date.now(),
        cell: { ...editingCell },
        oldValue,
        newValue: editingValue
      });

      if (newHistory.length > 50) {
        newHistory.shift();
      }

      setTableHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setTableData({ ...tableData, rows: newRows });

      const textContent = [tableData.headers, ...newRows].map(row => (row as any[]).join("\t")).join("\n");
      setScriptText(textContent);
    }
    setEditingCell(null);
    setEditingValue("");
  }, [editingCell, tableData, editingValue, tableHistory, historyIndex]);

  // 撤销表格编辑
  const handleTableUndo = useCallback(() => {
    if (historyIndex < 0 || !tableData) return;
    const historyEntry = tableHistory[historyIndex];
    setTableData({ ...tableData, rows: historyEntry.rows });
    setHistoryIndex(historyIndex - 1);
    const textContent = [tableData.headers, ...historyEntry.rows].map(row => (row as any[]).join("\t")).join("\n");
    setScriptText(textContent);
  }, [historyIndex, tableHistory, tableData]);

  // 重做表格编辑
  const handleTableRedo = useCallback(() => {
    if (historyIndex >= tableHistory.length - 1 || !tableData) return;
    const nextIndex = historyIndex + 1;
    const historyEntry = tableHistory[nextIndex];
    setTableData({ ...tableData, rows: historyEntry.rows });
    setHistoryIndex(nextIndex);
    const textContent = [tableData.headers, ...historyEntry.rows].map(row => (row as any[]).join("\t")).join("\n");
    setScriptText(textContent);
  }, [historyIndex, tableHistory, tableData]);

  // 取消表格单元格编辑
  const handleTableCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);

  // 渲染带风险高亮的表格
  const renderHighlightedTable = useCallback(() => {
    if (!tableData) return null;

    // 找出需要排除的列索引（镜号、场景、集数等表头）
    const excludedColumns = new Set<number>();
    const excludeHeaders = ["镜号", "场景", "场次", "序号", "编号", "集数", "集", "Episode", "第几集"];
    tableData.headers.forEach((header, index) => {
      const headerStr = String(header);
      if (excludeHeaders.some(h => headerStr.includes(h))) {
        excludedColumns.add(index);
      }
    });

    // 情节审核模式：预处理每行的风险信息
    const rowRiskInfo = reviewMode === "script" ? (() => {
      const info = new Map<number, { level: RiskLevel; phrase: string; matchedText: string }>();
      const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);

      const hasCommonSubstring = (a: string, b: string, minLen: number): boolean => {
        for (let i = 0; i <= a.length - minLen; i++) {
          const sub = a.slice(i, i + minLen);
          if (b.includes(sub)) return true;
        }
        return false;
      };

      tableData.rows.forEach((row, rowIndex) => {
        const rowText = row
          .filter((_, idx) => !excludedColumns.has(idx))
          .map(cell => String(cell ?? ""))
          .join(" ");

        for (const phrase of sorted) {
          const phraseContent = phrase.replace(/^[第\d\-集\s：:]+/, "").trim();

          const hasOverlap = phrase.includes(rowText) ||
            rowText.includes(phraseContent) ||
            (phraseContent.length > 10 && rowText.includes(phraseContent.slice(0, 30))) ||
            (phrase.length > 15 && rowText.length > 15 && hasCommonSubstring(phrase, rowText, 15));

          if (hasOverlap) {
            const level = activeRiskMap.get(phrase);
            if (level) {
              info.set(rowIndex, { level, phrase, matchedText: rowText.slice(0, 50) });
              break;
            }
          }
        }
      });

      return info;
    })() : null;

    const renderCell = (cell: string | number | null, rowIndex: number, cellIndex: number) => {
      const cellStr = String(cell ?? "");
      const isEditing = editingCell?.row === rowIndex && editingCell?.col === cellIndex;
      const isExcludedColumn = excludedColumns.has(cellIndex);

      if (isEditing) {
        return (
          <textarea
            ref={tableCellInputRef as any}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={handleTableCellSave}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTableCellSave(); }
              if (e.key === "Escape") handleTableCellCancel();
            }}
            className="w-full px-1 py-0.5 text-xs bg-background border-2 border-primary rounded outline-none resize-none min-w-[80px] min-h-[2rem]"
            rows={Math.max(2, Math.ceil(editingValue.length / 20))}
          />
        );
      }

      if (isExcludedColumn) {
        return (
          <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
            {cellStr}
          </span>
        );
      }

      // 情节审核模式：检查整行是否被标记
      if (reviewMode === "script" && rowRiskInfo) {
        const rowInfo = rowRiskInfo.get(rowIndex);
        if (rowInfo) {
          return (
            <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title={`风险段落: ${rowInfo.phrase.slice(0, 100)}...`}>
              <mark className={`${RISK_STYLES[rowInfo.level]} text-foreground rounded px-0.5`}>
                {cellStr}
              </mark>
            </span>
          );
        }
      }

      // 文字审核模式或无风险的单元格
      if (!cellStr || activeRiskPhrases.length === 0) {
        return (
          <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
            {cellStr}
          </span>
        );
      }

      // 文字审核模式：检查单元格内的风险短语
      const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);
      const matching = sorted.filter(p => cellStr.includes(p));

      if (matching.length === 0) {
        return (
          <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
            {cellStr}
          </span>
        );
      }

      const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const regex = new RegExp(`(${escaped.join("|")})`, "g");
      const parts = cellStr.split(regex);

      return (
        <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
          {parts.map((part, i) => {
            const level = activeRiskMap.get(part);
            if (level) {
              const originalText = replacementToOriginal.get(part);
              const isAdjusting = adjustingSinglePhrase === part;

              return (
                <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5`} title={originalText ? `原文: ${originalText}` : undefined}>
                  {part}
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
          })}
        </span>
      );
    };

    return (
      <div className="max-h-[600px] overflow-auto rounded-md border border-border">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {tableData.headers.map((header, i) => (
                <th key={i} className="text-xs font-medium text-muted-foreground whitespace-nowrap px-3 py-2 border-b border-border text-left">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="text-xs px-3 py-2 align-top max-w-[300px]">
                    {renderCell(cell, rowIndex, cellIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [tableData, activeRiskPhrases, activeRiskMap, editingCell, editingValue, replacementToOriginal, handleTableCellEdit, handleTableCellSave, handleTableCellCancel, adjustingSinglePhrase, handleSingleAdjust, isAutoAdjusting, reviewMode]);

  const normalizeForCompare = (value: string) => value.replace(/\s+/g, "").trim();

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

  // Auto-adjust: only red-line/high-risk
  const handleAutoAdjust = async () => {
    const targetEntries: { original: string; current: string; level: RiskLevel }[] = [];

    const textToCheck = inputMode === "table" && tableData
      ? tableData.rows.map(row => row.join("\t")).join("\n")
      : paletteText || scriptText;

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

## 你的任务
你将收到"存在画面合规风险的完整段落"，请对每个段落进行整体改写，在保持剧情完整的前提下，使其画面呈现符合审核标准。

## 改写原则

1. **保持剧情完整**：
   - 情节走向不变
   - 人物关系不变
   - 情感基调不变
   - 关键信息保留

2. **画面合规改写**：
   - 暴力情节：改为轻度动作或用侧面描写替代
   - 亲密情节：改为含蓄表达或用转场暗示
   - 其他风险：用安全的表现方式替代

3. **整体改写段落**：
   - 改写整个段落的画面呈现
   - 可以调整动作、环境、心理描写
   - 确保画面效果安全合规

4. **必须实际改写**：
   - ❌ 禁止原样返回原文
   - ❌ 禁止只改动个别词汇
   - ✅ 必须整体改写画面呈现方式`
        : `你是短剧内容合规审核专家。

## 你的任务
你将收到"存在违规词汇的片段"，请**仅替换关键违规词汇**，保持原文整体结构和表达方式不变。

## 改写原则
1. **最小改动原则**：
   - 只替换具体的违规词汇，不要改写整个句子
   - 保持原文的句式结构、语气、节奏
   - 尽量只改动1-2个词

2. **词汇替换示例**：
   - "鲜血" → "鲜血" 可保留，但"喷涌而出" → "渗出"
   - "赤裸" → "衣着单薄"
   - "呻吟" → "低吟"
   - "抚摸全身" → "轻轻拥抱"
   - 直接引用的歌词/台词 → 改为概括性描述

3. **保持原意**：
   - 改动后语义要基本一致
   - 情感和氛围要保留

## 输出格式
只输出改写后的文本，不要任何解释。`;

      const prompt = `${basePrompt}
${strict ? "\n4. **二次改写提醒**：上一次改写仍与原文过于相似，请使用更明显的不同表达方式，确保文字有明显变化。" : ""}

## 输出格式
只输出 JSON 数组，不要 markdown 代码块，不要任何解释：
[{"id":1,"replacement":"改写后的文本"}]

## 待改写片段
${JSON.stringify(payload, null, 2)}`;

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
      let workingText = inputMode === "table" && tableData
        ? tableData.rows.map(row => row.join("\t")).join("\n")
        : paletteText || scriptText;
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

      // 如果是表格模式，同步更新表格数据
      if (inputMode === "table" && tableData) {
        const newRows = tableData.rows.map(row =>
          row.map(cell => {
            const cellStr = String(cell ?? "");
            let result = cellStr;
            for (const [original, replacement] of workingReplacements.entries()) {
              result = result.split(original).join(replacement);
            }
            return result;
          })
        );
        setTableData({ ...tableData, rows: newRows });
        const textContent = [tableData.headers, ...newRows].map(row => (row as any[]).join("\t")).join("\n");
        setScriptText(textContent);
      }

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
      // Save: paletteText is already updated via onChange
      setScriptText(paletteText || scriptText);
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

    const chineseCount = (scriptText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const nonChineseCount = scriptText.length - chineseCount;
    const totalChars = scriptText.length;

    const MAX_CHINESE = 20000;
    const MAX_ENGLISH = 60000;
    const MAX_TOTAL = 20000;
    const needsSegment = chineseCount > MAX_CHINESE || nonChineseCount > MAX_ENGLISH || totalChars > MAX_TOTAL;

    setIsGenerating(true);
    setStreamingText("");
    setReportOpen(true);
    setComplianceReport("");
    setPhraseReplacements(new Map());
    abortRef.current = new AbortController();

    try {
      const promptGenerator = reviewMode === "script" ? SCRIPT_REVIEW_PROMPT : STANDALONE_COMPLIANCE_PROMPT;
      const prompt = promptGenerator(scriptText);

      if (!needsSegment) {
        setSegmentProgress(null);

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
        const segmentSize = chineseRatio > 0.3 ? MAX_CHINESE : MAX_ENGLISH;

        const isTableMode = inputMode === "table" && tableData;
        const paragraphs = isTableMode
          ? scriptText.split(/\n/)
          : scriptText.split(/\n\n+/);

        let currentSegment = "";

        for (const para of paragraphs) {
          if ((currentSegment + para).length > segmentSize && currentSegment.length > 0) {
            segments.push(currentSegment.trim());
            currentSegment = para;
          } else {
            currentSegment += (currentSegment ? (isTableMode ? "\n" : "\n\n") : "") + para;
          }
        }
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
        }

        const totalSegments = segments.length;
        const segmentReports: string[] = [];

        for (let i = 0; i < segments.length; i++) {
          if (abortRef.current?.signal.aborted) break;

          setSegmentProgress({ current: i + 1, total: totalSegments });
          setStreamingText(`正在审核第 ${i + 1}/${totalSegments} 段（${segments[i].length} 字）…`);

          const segPrompt = promptGenerator(segments[i]);
          const report = await callGeminiStream(
            model,
            [{ role: "user", parts: [{ text: segPrompt }] }],
            () => {},
            { maxOutputTokens: 8192 },
            abortRef.current.signal,
          );

          segmentReports.push(`## 第 ${i + 1} 段审核报告\n\n${report}`);
        }

        if (segmentReports.length > 0) {
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
        const errorMsg = e?.message || "未知错误";
        toast({
          title: "审核失败",
          description: errorMsg.length > 100 ? errorMsg.slice(0, 100) + "..." : errorMsg,
          variant: "destructive"
        });
        if (streamingText) {
          setComplianceReport(streamingText);
        }
      }
    } finally {
      setIsGenerating(false);
      setSegmentProgress(null);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();
  const displayText = isGenerating ? streamingText : complianceReport;

  // Count unique phrases per level from riskMap
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

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-8">
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

            {/* 表格显示模式 */}
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
              /* 文本显示模式 */
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
                        ? "情节审核：文字违规+画面违规双重审查"
                        : "文字审核：检测字面上的激烈冲突、版权问题、敏感亲密内容"}
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

        {/* Risk Highlight Comparison */}
        {complianceReport && !isGenerating && scriptText && riskPhrases.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                <span className="text-sm font-normal text-muted-foreground">
                  共识别 {riskPhrases.length} 处风险片段，{riskPhrases.filter(p => (paletteText || scriptText).includes(p)).length} 处已标记
                </span>
              </CardTitle>
              <div className="flex gap-2">
                {/* 表格模式下的撤销/重做 */}
                {inputMode === "table" && tableData && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleTableUndo} disabled={historyIndex < 0} className="gap-1" title="撤销">
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleTableRedo} disabled={historyIndex >= tableHistory.length - 1} className="gap-1" title="重做">
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
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
                {inputMode !== "table" && (
                  <Button variant="outline" size="sm" onClick={handlePaletteEditToggle} className="gap-1.5" disabled={isAutoAdjusting}>
                    {paletteEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {paletteEditing ? "完成" : "编辑"}
                  </Button>
                )}
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
              {/* 表格模式使用高亮表格，文本模式使用高亮文本 */}
              {inputMode === "table" && tableData ? (
                renderHighlightedTable()
              ) : paletteEditing ? (
                <div ref={paletteScrollRef} className="max-h-[600px] overflow-auto rounded-md border border-border bg-muted/30">
                  <Textarea
                    value={paletteText || scriptText}
                    onChange={(e) => setPaletteText(e.target.value)}
                    rows={20}
                    className="font-mono text-sm border-0 focus-visible:ring-0 bg-transparent min-h-[300px]"
                  />
                </div>
              ) : highlightedScript ? (
                <div ref={paletteScrollRef} className="max-h-[600px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                  <pre
                    ref={paletteEditRef}
                    className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90"
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
