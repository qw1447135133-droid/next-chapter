import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Pencil, Eye, Square, ShieldCheck, Upload, Film, FileText, ChevronDown, ChevronUp, Palette, Wand2, Download, Table as TableIcon, FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "@/components/script-creator/TranslateButton";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
// xlsx 类型声明
declare module "xlsx" {
  interface WorkBook {
    SheetNames: string[];
    Sheets: { [sheet: string]: WorkSheet };
  }
  interface WorkSheet {
    [key: string]: any;
  }
  function read(data: ArrayBuffer, opts: { type: string }): WorkBook;
  namespace utils {
    function sheet_to_json<T = any>(worksheet: WorkSheet, opts?: { header?: number; defval?: any }): T[];
  }
}

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

**⚠️ 极其重要的标记规则 - 必须严格遵守：**

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

// 表格数据类型
type TableData = {
  headers: string[];
  rows: (string | number | null)[][];
  fileName: string;
  sheetName?: string;
  // 保存原始数据用于导出
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
    // Only sync if no adjustments have been made yet
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

  const buildHighlightedParts = useCallback((text: string, blankPhrases?: Set<string>) => {
    if (!text || activeRiskPhrases.length === 0) return null;
    const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);
    const matching = sorted.filter(p => text.includes(p));
    if (matching.length === 0) return null;
    const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = text.split(regex);
    return parts.map((part, i) => {
      const level = activeRiskMap.get(part);
      if (level) {
        const isBlank = blankPhrases?.has(part);
        return (
          <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""}`}>
            {isBlank ? "\u00A0".repeat(Math.max(part.length, 2)) : part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [activeRiskPhrases, activeRiskMap]);

  const highlightedScript = useMemo(() => {
    // Always use paletteText in the palette view (it syncs with scriptText when no changes)
    const text = paletteText || scriptText;
    return buildHighlightedParts(text, isAutoAdjusting ? adjustingPhrases : undefined);
  }, [paletteText, scriptText, buildHighlightedParts, isAutoAdjusting, adjustingPhrases]);

  // 表格编辑相关状态 - 必须在 renderHighlightedTable 之前定义
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const tableCellInputRef = useRef<HTMLInputElement>(null);

  // 开始编辑表格单元格
  const handleTableCellEdit = useCallback((rowIndex: number, colIndex: number) => {
    const cellValue = tableData?.rows[rowIndex]?.[colIndex];
    setEditingCell({ row: rowIndex, col: colIndex });
    setEditingValue(String(cellValue ?? ""));
    // 延迟聚焦，确保 input 已渲染
    setTimeout(() => tableCellInputRef.current?.focus(), 0);
  }, [tableData]);

  // 保存表格单元格编辑
  const handleTableCellSave = useCallback(() => {
    if (editingCell && tableData) {
      const newRows = [...tableData.rows];
      newRows[editingCell.row] = [...newRows[editingCell.row]];
      newRows[editingCell.row][editingCell.col] = editingValue;
      setTableData({ ...tableData, rows: newRows });
      
      // 同时更新 scriptText 用于合规审核
      const textContent = [tableData.headers, ...newRows].map(row => row.join("\t")).join("\n");
      setScriptText(textContent);
    }
    setEditingCell(null);
    setEditingValue("");
  }, [editingCell, tableData]);

  // 取消表格单元格编辑
  const handleTableCellCancel = useCallback(() => {
    setEditingCell(null);
    setEditingValue("");
  }, []);

  // 渲染带风险高亮的表格
  const renderHighlightedTable = useCallback(() => {
    if (!tableData) return null;
    
    const renderCell = (cell: string | number | null, rowIndex: number, cellIndex: number) => {
      const cellStr = String(cell ?? "");
      const isEditing = editingCell?.row === rowIndex && editingCell?.col === cellIndex;
      
      // 编辑模式
      if (isEditing) {
        return (
          <input
            ref={tableCellInputRef}
            type="text"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={handleTableCellSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTableCellSave();
              if (e.key === "Escape") handleTableCellCancel();
            }}
            className="w-full px-1 py-0.5 text-sm bg-background border border-primary rounded outline-none min-w-[60px]"
          />
        );
      }
      
      // 显示模式 - 点击可编辑
      if (!cellStr || activeRiskPhrases.length === 0) {
        return (
          <span 
            className="cursor-pointer hover:bg-accent/50 rounded px-0.5" 
            onClick={() => handleTableCellEdit(rowIndex, cellIndex)}
            title="点击编辑"
          >
            {cellStr}
          </span>
        );
      }
      
      // 检查单元格是否包含风险短语
      const sorted = [...activeRiskPhrases].sort((a, b) => b.length - a.length);
      const matching = sorted.filter(p => cellStr.includes(p));
      if (matching.length === 0) {
        return (
          <span 
            className="cursor-pointer hover:bg-accent/50 rounded px-0.5" 
            onClick={() => handleTableCellEdit(rowIndex, cellIndex)}
            title="点击编辑"
          >
            {cellStr}
          </span>
        );
      }
      
      const escaped = matching.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const regex = new RegExp(`(${escaped.join("|")})`, "g");
      const parts = cellStr.split(regex);
      
      return (
        <span 
          className="cursor-pointer hover:bg-accent/50 rounded px-0.5" 
          onClick={() => handleTableCellEdit(rowIndex, cellIndex)}
          title="点击编辑"
        >
          {parts.map((part, i) => {
            const level = activeRiskMap.get(part);
            if (level) {
              return (
                <mark key={i} className={`${RISK_STYLES[level]} text-foreground rounded px-0.5`}>
                  {part}
                </mark>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      );
    };

    return (
      <div className="rounded-md border max-h-[500px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {tableData.headers.map((header, i) => (
                <TableHead key={i} className="font-medium whitespace-nowrap">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex} className="whitespace-nowrap">
                    {renderCell(cell, rowIndex, cellIndex)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }, [tableData, activeRiskPhrases, activeRiskMap, editingCell, editingValue]);

  const normalizeForCompare = (value: string) => value.replace(/\s+/g, "").trim();

  // Check if replacement is genuinely different (not just punctuation/whitespace changes)
  const isGenuinelyDifferent = (original: string, replacement: string) => {
    const normOrig = normalizeForCompare(original);
    const normRep = normalizeForCompare(replacement);
    
    // Must not be identical after normalization
    if (normOrig === normRep) return false;
    
    // Remove all punctuation and compare again
    const noPunctOrig = normOrig.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    const noPunctRep = normRep.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    
    // If only punctuation differs, it's not genuinely different
    if (noPunctOrig === noPunctRep) return false;
    
    // Check character-level similarity (must have at least 30% different characters)
    const minLen = Math.min(noPunctOrig.length, noPunctRep.length);
    const maxLen = Math.max(noPunctOrig.length, noPunctRep.length);
    
    // If lengths are very different, it's definitely different
    if (maxLen > minLen * 1.5 || minLen < maxLen * 0.7) return true;
    
    // Count character differences
    let diffCount = 0;
    const shorter = noPunctOrig.length <= noPunctRep.length ? noPunctOrig : noPunctRep;
    const longer = noPunctOrig.length > noPunctRep.length ? noPunctOrig : noPunctRep;
    
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) diffCount++;
    }
    diffCount += longer.length - shorter.length;
    
    // At least 30% of characters should be different
    const diffRatio = diffCount / maxLen;
    return diffRatio >= 0.3;
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

  // Auto-adjust: only red-line/high-risk, and only send target fragments to AI
  const handleAutoAdjust = async () => {
    const targetEntries: { original: string; current: string; level: RiskLevel }[] = [];
    
    // 根据模式获取待检查的文本
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

      const prompt = `你是短剧内容合规改写专家。

## 你的任务
你将收到"需要修改的风险片段"，请对每个片段进行**和谐化改写**，使其能够通过内容审核。

## 和谐化改写原则
1. **替换敏感表达**：用委婉、含蓄的说法替代直接、露骨的描写
   - 血腥暴力：弱化细节描写，用"受伤"、"倒下"等模糊表达
   - 色情内容：用"亲密"、"温存"等含蓄表达替代露骨描写
   - 版权问题：改写为原创表达，保留剧情但换种说法

2. **保持语义等价**：改写后的内容要与原文表达相同的意思
   - 剧情发展不变
   - 人物关系不变
   - 情感基调不变
   - 对话意图不变

3. **必须实际改写**：
   - ❌ 禁止原样返回原文
   - ❌ 禁止只改动标点符号
   - ❌ 禁止返回空字符串
   - ✅ 必须用不同的文字表达相同的意思
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
      // 根据模式初始化工作文本
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
          // Check if replacement is genuinely different, not just punctuation changes
          if (!replacement || !isGenuinelyDifferent(entry.current, replacement)) {
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
            // 应用所有替换
            let result = cellStr;
            for (const [original, replacement] of workingReplacements.entries()) {
              result = result.split(original).join(replacement);
            }
            return result;
          })
        );
        setTableData({ ...tableData, rows: newRows });
        
        // 同步更新 scriptText
        const textContent = [tableData.headers, ...newRows].map(row => row.join("\t")).join("\n");
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
      // 如果是表格模式，导出 xlsx
      if (inputMode === "table" && tableData) {
        // 准备导出数据：合并表头和数据行
        const exportData = [tableData.headers, ...tableData.rows];
        
        // 创建工作表
        const ws = XLSX.utils.aoa_to_sheet(exportData);
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, tableData.sheetName || "Sheet1");
        
        // 生成文件名
        const baseName = tableData.fileName.replace(/\.[^.]+$/, "");
        const exportFileName = `${baseName}_合规审核_${new Date().toISOString().slice(0, 10)}.xlsx`;
        
        // 导出
        XLSX.writeFile(wb, exportFileName);
        toast({ title: "导出成功", description: `已导出为 ${exportFileName}` });
        return;
      }

      // 文本模式导出 docx
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
              children: [new TextRun({ text: "合规审核 - 调色盘文本对比", bold: true, size: 32 })],
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
      // Exiting edit mode - sync text from contentEditable
      if (paletteEditRef.current) {
        const newText = paletteEditRef.current.innerText;
        setPaletteText(newText);
        setScriptText(newText);
      } else {
        setScriptText(paletteText);
      }
    } else {
      // 进入编辑模式时，不要覆盖已有的 paletteText（自动调整后的内容）
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
        // 解析 Excel 文件
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // 转换为 JSON 格式
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as (string | number | null)[][];
        
        if (jsonData.length === 0) {
          toast({ title: "表格为空", description: "未找到有效数据", variant: "destructive" });
          return;
        }

        // 第一行作为表头
        const headers = (jsonData[0] as string[]).map((h, i) => String(h || `列${i + 1}`));
        const rows = jsonData.slice(1).map(row => 
          (row as (string | number | null)[]).map(cell => cell ?? "")
        );

        setTableData({
          headers,
          rows,
          fileName: file.name,
          sheetName,
          originalData: jsonData
        });
        setInputMode("table");
        
        // 同时生成文本版本用于合规审核
        const textContent = jsonData.map(row => row.join("\t")).join("\n");
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
                <TabsList className="grid w-full max-w-[300px] grid-cols-2">
                  <TabsTrigger value="table" className="gap-1.5">
                    <TableIcon className="h-3.5 w-3.5" />
                    表格模式
                  </TabsTrigger>
                  <TabsTrigger value="text" className="gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    文本模式
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {/* 表格显示模式 */}
            {inputMode === "table" && tableData ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>{tableData.fileName}</span>
                  {tableData.sheetName && <span className="text-xs">· {tableData.sheetName}</span>}
                  <span className="text-xs">({tableData.rows.length} 行)</span>
                </div>
                <div className="rounded-md border max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableData.headers.map((header, i) => (
                          <TableHead key={i} className="font-medium whitespace-nowrap">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.rows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <TableCell key={cellIndex} className="whitespace-nowrap">
                              {String(cell ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              /* 文本显示模式 */
              <Textarea
                value={scriptText}
                onChange={(e) => {
                  setScriptText(e.target.value);
                  if (tableData) setTableData(null);
                }}
                placeholder="粘贴剧本内容，或点击上方按钮上传 TXT / PDF / DOCX / XLSX / XLS / CSV 文档..."
                rows={12}
                className="font-mono text-sm"
              />
            )}
            <div className="text-xs text-muted-foreground mt-2 text-right">
              {scriptText.length} 字
            </div>
          </CardContent>
        </Card>

        {/* Compliance Report Card - Collapsible */}
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
                调色盘{inputMode === "table" ? "表格" : "文本"}对比
                <span className="text-sm font-normal text-muted-foreground">
                  共识别 {riskPhrases.length} 处风险片段
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
                {inputMode === "text" && (
                  <Button variant="outline" size="sm" onClick={handlePaletteEditToggle} className="gap-1.5" disabled={isAutoAdjusting}>
                    {paletteEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {paletteEditing ? "完成" : "编辑"}
                  </Button>
                )}
                {inputMode === "table" && tableData && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    点击单元格可编辑
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={handlePaletteExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  导出{inputMode === "table" ? " XLSX" : ""}
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
              {/* 表格模式 */}
              {inputMode === "table" && tableData ? (
                renderHighlightedTable()
              ) : (
                /* 文本模式 */
                highlightedScript ? (
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
                )
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ComplianceReview;
