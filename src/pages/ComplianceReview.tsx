import { useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, RefreshCw, Pencil, Eye, Loader2, ShieldCheck, Upload, Film, FileText, ChevronDown, ChevronUp, Palette, Wand2, Download, FileSpreadsheet, Undo2, Redo2, MessageSquare, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import BrandMark from "@/components/BrandMark";
import { callGeminiStream } from "@/lib/gemini-client";
import { parseDocument } from "@/lib/document-parser";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "@/components/script-creator/TranslateButton";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import {
  addComplianceTask,
  updateComplianceTask,
  saveComplianceStandaloneRestore,
  loadComplianceStandaloneRestore,
} from "@/lib/task-history";
import { TaskHistoryMenu } from "@/components/TaskHistoryMenu";

type ComplianceModel = "gemini-3.1-pro-preview" | "gemini-3-pro-preview" | "gemini-3-flash-preview";
type ReviewMode = "text" | "script";
type StrictnessLevel = "standard" | "strict" | "extreme";

const MODEL_OPTIONS: { value: ComplianceModel; label: string }[] = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

// 严格程度配置
const STRICTNESS_CONFIG: Record<StrictnessLevel, { label: string; desc: string; promptSuffix: string }> = {
  standard: {
    label: "标准",
    desc: "常规合规检查",
    promptSuffix: "",
  },
  strict: {
    label: "严格",
    desc: "提高敏感度，标记更多潜在风险",
    promptSuffix: "\n\n## 严格模式要求\n- 对任何可能引发争议的内容保持高度敏感\n- 即使是暗示性的违规内容也要标记\n- 对边缘案例采取保守态度，宁可错标也不漏标",
  },
  extreme: {
    label: "极严格",
    desc: "最严格的审查标准，最大化风险识别",
    promptSuffix: "\n\n## 极严格模式要求\n- 零容忍政策：任何可能违规的内容必须标记\n- 对隐喻、暗示、双关等间接表达保持最高警惕\n- 即使只有轻微违规可能性的内容也要标记\n- 优先保护平台安全，宁可过度标记也不遗漏",
  },
};

// 文字审核提示词 - 检查字面违规
const STANDALONE_COMPLIANCE_PROMPT = (scriptText: string, strictness: StrictnessLevel) => `你是一位资深的短剧内容合规审核专家，精通各类内容监管法规与平台规范。

## 待审核内容
${scriptText}

---${STRICTNESS_CONFIG[strictness].promptSuffix}

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
- 明确模仿知名IP的角色、情节设定
- 未授权使用品牌名称

### 三、敏感亲密内容
检查字面上的敏感亲密描写：
- 过度暴露的描写
- 不当行为描写
- 一般亲吻拥抱可标记为优化建议

## ⚠️ 排除规则（极其重要）
以下内容**不得标记为任何风险等级**，必须完全跳过：
- **台词/对白**：所有角色对话行（格式为"角色名：台词"或"角色名:台词"），包括旁白
- **音效标记**：所有音效/SFX描述（如"音效：xxx"、"SFX: xxx"、"（音效）"等）
- 仅审核动作描写（△开头的行）和环境/镜头描述

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

标记**整句话或整个分镜片段**（不得标记台词和音效）：
- 红线问题：⛔【包含风险内容的完整句子】
- 高风险内容：⚠️【包含风险内容的完整句子】
- 优化建议：ℹ️【包含风险内容的完整句子】

用 Markdown 格式输出，清晰分区。`;

// 情节审核提示词 - 审核整个段落的画面表现 + 文字违规
const SCRIPT_REVIEW_PROMPT = (scriptText: string, strictness: StrictnessLevel) => `你是一位资深的短剧内容合规审核专家，执行**最彻底的合规审查**。

## 待审核剧本
${scriptText}

---${STRICTNESS_CONFIG[strictness].promptSuffix}

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
   - 明确抄袭知名IP的角色、情节

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

## ⚠️ 排除规则（极其重要）
以下内容**不得标记为任何风险等级**，必须完全跳过：
- **台词/对白**：所有角色对话行（格式为"角色名：台词"或"角色名:台词"），包括旁白
- **音效标记**：所有音效/SFX描述（如"音效：xxx"、"SFX: xxx"、"（音效）"等）
- 仅审核动作描写（△开头的行）、环境/镜头描述和整体画面表现

## 输出格式

使用以下标记标注风险：

- ⛔ 红线问题（必须修改）
- ⚠️ 高风险内容（建议修改）
- ℹ️ 优化建议（可选修改）

**标记规则：**

**文字违规**：标记完整句子（不得标记台词和音效）
- 示例：⛔【他的胸口被刺穿，染红了整件衬衫。】

**画面违规**：标记整个风险段落（不得标记台词和音效）
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

// 台词统计类型
type EpisodeDialogueStats = {
  episodeNum: number;
  totalDialogues: number;
  totalWords: number;
  avgWordsPerDialogue: number;
  maxSingleDialogue: number;
  overLimitCount: number;
  scenes: {
    sceneNum: string;
    dialogues: number;
    words: number;
    overLimit: boolean;
  }[];
};

/** 将「角色名：…」台词行拆成前缀（含说话人、冒号、可选括注）与正文，用于字数超限只标记正文 */
function splitDialoguePrefixContent(line: string): { prefix: string; content: string } | null {
  const leadingMatch = line.match(/^(\s*)/);
  const leading = leadingMatch ? leadingMatch[1] : "";
  const trimmed = line.slice(leading.length);
  const m = trimmed.match(/^([^\s△#]{1,10}[：:]\s*(?:[\(（][^）\)]*[）\)]\s*)?)(.*)$/s);
  if (!m) return null;
  return { prefix: leading + m[1], content: m[2] };
}

type RiskLevel = "red" | "high" | "info";

const RISK_LEVEL_VALUE: Record<RiskLevel, number> = { red: 3, high: 2, info: 1 };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 子串是否可用于「模糊子串」回退：纯拉丁/数字/符号片段过短时极易误命中人名、缩写（如 Maya） */
function isSafeFuzzySubstringForMatch(sub: string): boolean {
  if (sub.length < 4) return false;
  const hasCjk = /[\u4e00-\u9fa5]/.test(sub);
  if (hasCjk) return true;
  // 无中文：仅当长度足够（≥8）才允许模糊匹配，避免 4～7 字母人名/单词误标
  return sub.length >= 8;
}

/** 行内仅含场记板 🎬 与空白（常见于集数标题被换行拆开） */
function isClapperOnlyLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 24) return false;
  const rest = t.replace(/🎬/gu, "").replace(/\s+/g, "");
  return rest.length === 0;
}

/**
 * 单元格为纯集数标题（仅 🎬 与「第N集」，可含空格/全角数字）。
 * 用于表格窄列时避免被浏览器折成「第一行 🎬 第 1 集 / 第二行 🎬」的假两排。
 */
function isEpisodeTitleLikeCell(s: string): boolean {
  const t = String(s).trim();
  if (t.length === 0 || t.length > 120) return false;
  const noEmoji = t.replace(/🎬/gu, "").replace(/\s+/g, "");
  return /^第[\d0-9\uFF10-\uFF19]+集$/.test(noEmoji);
}

/**
 * 将「含 第N集 的一行」与下一行单独的 🎬 合并为一行，避免调色盘等按行渲染时出现两排集数标题。
 */
function normalizeEpisodeClapperLineBreaks(text: string): string {
  if (!text.includes("\n")) return text;
  const hasEpisodeNo = /第\s*\d+\s*集/;
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (out.length > 0 && hasEpisodeNo.test(out[out.length - 1]) && isClapperOnlyLine(line)) {
      const prev = out[out.length - 1];
      out[out.length - 1] = `${prev.replace(/\s+$/, "")} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

/** 表格单元格内 Alt+Enter 等导致的「第N集」与单独 🎬 拆行 */
function normalizeTableCellsEpisodeClapper(rows: (string | number | null)[][]): string[][] {
  return rows.map(r => r.map(c => normalizeEpisodeClapperLineBreaks(String(c ?? ""))));
}

/**
 * 合并连续数据行：上一行某格含「第N集」，下一行各非空格均为仅 🎬 时，把下一行拼入该格（解决 Excel 里占两行的集数标题）。
 */
function mergeEpisodeClapperContinuationRows(rows: string[][]): string[][] {
  const hasEpisodeNo = /第\s*\d+\s*集/;
  const out: string[][] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(c => String(c));

    if (row.every(c => !c.trim())) {
      out.push(row);
      continue;
    }
    if (out.length === 0) {
      out.push(row);
      continue;
    }

    const prev = out[out.length - 1];
    const epCol = prev.findIndex(c => hasEpisodeNo.test(c));
    if (epCol < 0) {
      out.push(row);
      continue;
    }

    const nonEmptyParts = row.map(c => c.trim()).filter(Boolean);
    if (nonEmptyParts.length === 0 || !nonEmptyParts.every(p => isClapperOnlyLine(p))) {
      out.push(row);
      continue;
    }

    const merged = prev.map(c => String(c));
    merged[epCol] = `${merged[epCol].replace(/\s+$/, "")} ${nonEmptyParts.join(" ")}`.trim();
    out[out.length - 1] = merged;
  }

  return out;
}

function normalizeTableRowsForEpisodeClapper(rows: (string | number | null)[][]): string[][] {
  return mergeEpisodeClapperContinuationRows(normalizeTableCellsEpisodeClapper(rows));
}

/**
 * 在剧本正文中定位 AI 报告里引用的风险片段（整篇匹配，支持跨行）。
 * 顺序：精确 → trim 后精确 → 灵活空白/换行 → 冒号全半角统一 → 最长子串（≥4 字；纯英文子串需 ≥8 字）
 */
function findMatchRangesInScript(script: string, phrase: string): [number, number][] {
  const ranges: [number, number][] = [];
  const t = phrase.trim();
  if (!t) return ranges;

  let from = 0;
  let idx = 0;
  while ((idx = script.indexOf(phrase, from)) !== -1) {
    ranges.push([idx, idx + phrase.length]);
    from = idx + 1;
  }
  if (ranges.length > 0) return ranges;

  if (t !== phrase) {
    from = 0;
    while ((idx = script.indexOf(t, from)) !== -1) {
      ranges.push([idx, idx + t.length]);
      from = idx + 1;
    }
    if (ranges.length > 0) return ranges;
  }

  const flex = escapeRegExp(t).replace(/\s+/g, "\\s+");
  try {
    const re = new RegExp(flex, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(script)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  } catch {
    /* ignore */
  }
  if (ranges.length > 0) return ranges;

  const normalizeColons = (s: string) => s.replace(/：/g, ":");
  const scriptN = normalizeColons(script);
  const phraseT = normalizeColons(t);
  if (scriptN !== script || phraseT !== t) {
    from = 0;
    while ((idx = scriptN.indexOf(phraseT, from)) !== -1) {
      ranges.push([idx, idx + phraseT.length]);
      from = idx + 1;
    }
    if (ranges.length > 0) return ranges;
  }

  for (let len = t.length; len >= 4; len--) {
    for (let i = 0; i <= t.length - len; i++) {
      const sub = t.slice(i, i + len);
      if (sub.length < 4) continue;
      if (!isSafeFuzzySubstringForMatch(sub)) continue;
      let f = 0;
      let j = 0;
      while ((j = script.indexOf(sub, f)) !== -1) {
        ranges.push([j, j + sub.length]);
        f = j + 1;
      }
      if (ranges.length > 0) return ranges;
    }
  }

  return ranges;
}

function mergeOverlappingRiskSpans(
  ranges: { start: number; end: number; level: RiskLevel }[],
): { start: number; end: number; level: RiskLevel }[] {
  if (ranges.length === 0) return [];
  const points = new Set<number>();
  for (const r of ranges) {
    points.add(r.start);
    points.add(r.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: { start: number; end: number; level: RiskLevel }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === b) continue;
    let maxVal = 0;
    let maxLevel: RiskLevel = "info";
    for (const r of ranges) {
      if (r.start <= a && r.end >= b) {
        if (RISK_LEVEL_VALUE[r.level] > maxVal) {
          maxVal = RISK_LEVEL_VALUE[r.level];
          maxLevel = r.level;
        }
      }
    }
    if (maxVal > 0) {
      out.push({ start: a, end: b, level: maxLevel });
    }
  }

  const merged: typeof out = [];
  for (const sp of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.end === sp.start && prev.level === sp.level) {
      prev.end = sp.end;
    } else {
      merged.push({ ...sp });
    }
  }
  return merged;
}

function intersectSpansWithRange(
  spans: { start: number; end: number; level: RiskLevel }[],
  rangeStart: number,
  rangeEnd: number,
): { start: number; end: number; level: RiskLevel }[] {
  const out: { start: number; end: number; level: RiskLevel }[] = [];
  for (const sp of spans) {
    const s = Math.max(sp.start, rangeStart);
    const e = Math.min(sp.end, rangeEnd);
    if (s < e) {
      out.push({ start: s - rangeStart, end: e - rangeStart, level: sp.level });
    }
  }
  return out;
}

/** 台词正文计字（与 dialogueOverLimitLines 规则一致） */
function dialogueLineContentWordCount(line: string, isChinese: boolean): number {
  const match = line.trim().match(/^[^\s△#]{1,10}[：:]\s*(?:[\(（][^）\)]*[）\)])?(.*)$/);
  const content = match ? match[1].trim() : line.trim();
  if (isChinese) return (content.match(/[\u4e00-\u9fa5]/g) || []).length;
  return content.split(/\s+/).filter((w) => w.length > 0).length;
}

type RiskSpanBackup = { snippet: string; level: RiskLevel; hintStart: number };

/** 用人编辑前快照的原文片段在当前正文中重新定位（多命中时取距 hintStart 最近） */
function spanBackupsToLocatedSpans(
  body: string,
  backups: RiskSpanBackup[],
): { start: number; end: number; level: RiskLevel }[] {
  const ranges: { start: number; end: number; level: RiskLevel }[] = [];
  for (const b of backups) {
    if (!b.snippet.trim()) continue;
    const found = findMatchRangesInScript(body, b.snippet);
    if (found.length === 0) continue;
    let bestS = found[0][0];
    let bestE = found[0][1];
    let bestDist = Math.abs(found[0][0] - b.hintStart);
    for (const [s, e] of found) {
      const d = Math.abs(s - b.hintStart);
      if (d < bestDist) {
        bestS = s;
        bestE = e;
        bestDist = d;
      }
    }
    ranges.push({ start: bestS, end: bestE, level: b.level });
  }
  return mergeOverlappingRiskSpans(ranges);
}

const ComplianceReview = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scriptText, setScriptText] = useState("");
  const [complianceReport, setComplianceReport] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);
  // 表格数据状态
  const [tableData, setTableData] = useState<TableData | null>(null);
  /** 有表格数据 = 表格模式；否则 = 文本模式（仅由上传/解析决定，不可手动切换） */
  // 审核模式：文字审核 | 剧本审核
  const [reviewMode, setReviewMode] = useState<ReviewMode>("text");
  // 严格程度
  const [strictness, setStrictness] = useState<StrictnessLevel>("standard");
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
  const complianceTaskIdRef = useRef<string | null>(null);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(complianceReport);
  const [paletteEditing, setPaletteEditing] = useState(false);
  const [paletteText, setPaletteText] = useState("");
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(false);
  const autoAdjustAbortRef = useRef<AbortController | null>(null);
  const [adjustingPhrases, setAdjustingPhrases] = useState<Set<string>>(new Set());
  const paletteTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Track phrase replacements so re-adjust works: original -> current
  const [phraseReplacements, setPhraseReplacements] = useState<Map<string, string>>(new Map());
  // 对话审查开关
  const [enableDialogueReview, setEnableDialogueReview] = useState(false);

  // 从任务历史进入：?task=任务 id，恢复本地快照
  const taskRestoreId = searchParams.get("task");
  useEffect(() => {
    if (!taskRestoreId) return;
    const data = loadComplianceStandaloneRestore(taskRestoreId);
    if (data) {
      if (data.tableData) {
        const td = data.tableData;
        const normRows = normalizeTableRowsForEpisodeClapper(td.rows);
        const mergedTable = { ...td, rows: normRows, originalData: [td.headers, ...normRows] };
        setTableData(mergedTable);
        const textContent = [td.headers, ...normRows].map(r => (r as (string | number | null)[]).join("\t")).join("\n");
        setScriptText(textContent);
        setPaletteText(textContent);
      } else {
        const restored = normalizeEpisodeClapperLineBreaks(data.scriptText);
        setScriptText(restored);
        setPaletteText(restored);
        setTableData(null);
      }
      setComplianceReport(data.complianceReport);
      setReviewMode(data.reviewMode);
      setStrictness(data.strictness);
      setReportOpen(!!(data.complianceReport && data.complianceReport.trim()));
      setPhraseReplacements(new Map());
      toast({ title: "已恢复该次审核内容" });
    } else {
      toast({ title: "无法恢复", description: "本地未找到该条记录的内容（可能已清除或为新版本之前的历史）", variant: "destructive" });
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        return next;
      },
      { replace: true },
    );
  }, [taskRestoreId, setSearchParams]);

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

  useEffect(() => {
    if (paletteEditing) {
      paletteTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [paletteEditing]);

  /** 调色盘编辑：textarea 随内容增高，避免出现内部滚动条与外层双拉条 */
  useLayoutEffect(() => {
    const el = paletteTextareaRef.current;
    if (!el || !paletteEditing) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [paletteEditing, paletteText, scriptText]);

  const handleModelChange = (m: ComplianceModel) => {
    setModel(m);
    localStorage.setItem("compliance-model", m);
    setModelDropdownOpen(false);
  };

  // Extract risk phrases with severity levels from report
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
        const phrase = typeof m[1] === "string" ? m[1].trim() : "";
        // 空片段会导致 cellStr.includes("") 恒为真，进而 new RegExp("()") 在长文本上 split 爆炸并卡死/白屏
        if (!phrase) continue;
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

  /** 整篇剧本上合并后的风险区间（直接对应调色盘引用的正文） */
  const mergedRiskSpans = useMemo(() => {
    const body = paletteText || scriptText;
    if (!body.trim() || activeRiskMap.size === 0) return [];
    const ranges: { start: number; end: number; level: RiskLevel }[] = [];
    for (const [phrase, level] of activeRiskMap.entries()) {
      for (const [start, end] of findMatchRangesInScript(body, phrase)) {
        ranges.push({ start, end, level });
      }
    }
    return mergeOverlappingRiskSpans(ranges);
  }, [paletteText, scriptText, activeRiskMap]);

  const [riskSpanBackups, setRiskSpanBackups] = useState<RiskSpanBackup[]>([]);
  const riskSpanCaptureRef = useRef<{ report: string | null; replSize: number }>({
    report: null,
    replSize: -1,
  });

  useEffect(() => {
    if (!complianceReport?.trim()) {
      setRiskSpanBackups([]);
      riskSpanCaptureRef.current = { report: null, replSize: -1 };
      return;
    }
    if (isGenerating) return;
    const body = paletteText || scriptText;
    const replSize = phraseReplacements.size;
    const cap = riskSpanCaptureRef.current;
    const reportChanged = cap.report !== complianceReport;
    const replChanged = cap.replSize !== replSize;
    if (!reportChanged && !replChanged) return;
    riskSpanCaptureRef.current = { report: complianceReport, replSize };
    setRiskSpanBackups(
      mergedRiskSpans
        .map((s) => ({
          snippet: body.slice(s.start, s.end),
          level: s.level,
          hintStart: s.start,
        }))
        .filter((b) => b.snippet.trim().length > 0),
    );
  }, [complianceReport, isGenerating, mergedRiskSpans, phraseReplacements, paletteText, scriptText]);

  const relocatedRiskSpans = useMemo(() => {
    const body = paletteText || scriptText;
    if (!body.trim() || riskSpanBackups.length === 0) return [];
    return spanBackupsToLocatedSpans(body, riskSpanBackups);
  }, [paletteText, scriptText, riskSpanBackups]);

  const displayRiskSpans = useMemo(
    () => mergeOverlappingRiskSpans([...mergedRiskSpans, ...relocatedRiskSpans]),
    [mergedRiskSpans, relocatedRiskSpans],
  );

  const markedRiskPhraseCount = useMemo(() => {
    const body = paletteText || scriptText;
    if (!body.trim()) return 0;
    return riskPhrases.filter((p) => findMatchRangesInScript(body, p).length > 0).length;
  }, [riskPhrases, paletteText, scriptText]);

  // --- Dialogue word count detection ---
  // Detect if text is primarily Chinese
  const isChinese = useMemo(() => {
    const text = paletteText || scriptText;
    const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    return cjk > text.length * 0.15;
  }, [paletteText, scriptText]);

  // Dialogue line patterns
  const isDialogueLine = useCallback((line: string) => {
    const trimmed = line.trim();
    // Chinese: 角色名：台词 or 旁白：
    if (/^[^\s△#]{1,10}[：:]/.test(trimmed) && !/^(音效|SFX|sfx)[：:]/.test(trimmed) && !trimmed.startsWith("△")) return true;
    return false;
  }, []);

  const isSfxLine = useCallback((line: string) => {
    const trimmed = line.trim();
    return /^(音效|SFX|sfx)[：:]/i.test(trimmed) || /^\(音效\)/i.test(trimmed) || /^\(SFX\)/i.test(trimmed);
  }, []);

  // 解析各集台词统计
  const episodeStats = useMemo((): EpisodeDialogueStats[] => {
    if (!enableDialogueReview) return [];
    
    const text = paletteText || scriptText;
    if (!text.trim()) return [];

    const lines = text.split("\n");
    const stats: Map<number, EpisodeDialogueStats> = new Map();

    let currentEpisode = 0;
    let currentScene = "";
    let sceneDialogues = 0;
    let sceneWords = 0;

    const countWords = (line: string) => {
      const match = line.match(/^[^\s△#]{1,10}[：:]\s*(?:[\(（][^）\)]*[）\)])?(.*)$/);
      const content = match ? match[1].trim() : line.trim();
      if (isChinese) {
        return (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      }
      return content.split(/\s+/).filter(w => w.length > 0).length;
    };

    const flushScene = () => {
      if (currentEpisode > 0 && currentScene) {
        const ep = stats.get(currentEpisode);
        if (ep) {
          ep.scenes.push({
            sceneNum: currentScene,
            dialogues: sceneDialogues,
            words: sceneWords,
            overLimit: sceneWords > (isChinese ? 35 : 20),
          });
        }
      }
      sceneDialogues = 0;
      sceneWords = 0;
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect episode header: # 1-1 or # Episode 1 Scene 1
      const episodeMatch = trimmed.match(/^#\s*(\d+)/);
      if (episodeMatch) {
        flushScene();
        const epNum = parseInt(episodeMatch[1]);
        if (epNum !== currentEpisode) {
          currentEpisode = epNum;
          if (!stats.has(epNum)) {
            stats.set(epNum, {
              episodeNum: epNum,
              totalDialogues: 0,
              totalWords: 0,
              avgWordsPerDialogue: 0,
              maxSingleDialogue: 0,
              overLimitCount: 0,
              scenes: [],
            });
          }
        }
        // Extract scene number
        const sceneMatch = trimmed.match(/^#\s*(\d+-\d+)/);
        currentScene = sceneMatch ? sceneMatch[1] : "";
        continue;
      }

      if (isDialogueLine(trimmed) && !isSfxLine(trimmed)) {
        const words = countWords(trimmed);
        const ep = stats.get(currentEpisode);
        if (ep) {
          ep.totalDialogues++;
          ep.totalWords += words;
          ep.maxSingleDialogue = Math.max(ep.maxSingleDialogue, words);
          if (words > (isChinese ? 35 : 20)) {
            ep.overLimitCount++;
          }
        }
        sceneDialogues++;
        sceneWords += words;
      }
    }

    flushScene();

    // Calculate averages
    for (const ep of stats.values()) {
      ep.avgWordsPerDialogue = ep.totalDialogues > 0 ? Math.round(ep.totalWords / ep.totalDialogues) : 0;
    }

    return Array.from(stats.values()).sort((a, b) => a.episodeNum - b.episodeNum);
  }, [paletteText, scriptText, isChinese, isDialogueLine, isSfxLine, enableDialogueReview]);

  // 总统计
  const totalStats = useMemo(() => {
    const totalDialogues = episodeStats.reduce((sum, ep) => sum + ep.totalDialogues, 0);
    const totalWords = episodeStats.reduce((sum, ep) => sum + ep.totalWords, 0);
    const overLimitDialogues = episodeStats.reduce((sum, ep) => sum + ep.overLimitCount, 0);
    return {
      totalDialogues,
      totalWords,
      overLimitDialogues,
      avgWordsPerDialogue: totalDialogues > 0 ? Math.round(totalWords / totalDialogues) : 0,
    };
  }, [episodeStats]);

  // 单行台词字数超限（仅正文计字，与统计里的 overLimitCount 一致；不按场次累计）
  const dialogueOverLimitLines = useMemo(() => {
    if (!enableDialogueReview) return new Set<number>();

    const set = new Set<number>();
    const text = paletteText || scriptText;
    const lines = text.split("\n");
    const perLineLimit = isChinese ? 35 : 20;

    const countWords = (line: string) => {
      const match = line.match(/^[^\s△#]{1,10}[：:]\s*(?:[\(（][^）\)]*[）\)])?(.*)$/);
      const content = match ? match[1].trim() : line.trim();
      if (isChinese) {
        return (content.match(/[\u4e00-\u9fa5]/g) || []).length;
      }
      return content.split(/\s+/).filter(w => w.length > 0).length;
    };

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();
      if (isDialogueLine(trimmed) && !isSfxLine(trimmed)) {
        const words = countWords(trimmed);
        if (words > perLineLimit) {
          set.add(lineIndex);
        }
      }
    });

    return set;
  }, [paletteText, scriptText, isChinese, isDialogueLine, isSfxLine, enableDialogueReview]);

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
      const currentText = tableData
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
      if (tableData) {
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
  }, [adjustingSinglePhrase, model, reviewMode, tableData, paletteText, scriptText]);

  const renderSpanWithRisk = useCallback(
    (
      segment: string,
      localSpans: { start: number; end: number; level: RiskLevel }[],
      blankPhrases?: Set<string>,
      keyPrefix = "",
    ) => {
      if (!segment) return null;
      if (localSpans.length === 0) return <>{segment}</>;
      const sorted = [...localSpans].sort((a, b) => a.start - b.start);
      const nodes: ReactNode[] = [];
      let pos = 0;
      for (let si = 0; si < sorted.length; si++) {
        const sp = sorted[si];
        if (sp.start >= segment.length) break;
        const a = Math.max(sp.start, 0);
        const b = Math.min(sp.end, segment.length);
        if (a > pos) {
          nodes.push(<span key={`${keyPrefix}g-${pos}-${si}`}>{segment.slice(pos, a)}</span>);
        }
        if (a < b) {
          const part = segment.slice(a, b);
          const level = sp.level;
          const isBlank = blankPhrases?.has(part);
          const originalText = replacementToOriginal.get(part);
          const showTooltip = !!originalText;
          const isAdjusting = adjustingSinglePhrase === part;
          nodes.push(
            <mark
              key={`${keyPrefix}m-${a}-${b}-${si}`}
              className={`${RISK_STYLES[level]} text-foreground rounded px-0.5 ${isBlank ? "inline-block min-w-[2em]" : ""}`}
              title={showTooltip ? `原文: ${originalText}` : undefined}
            >
              {isBlank ? "\u00A0".repeat(Math.max(part.length, 2)) : part}
              {paletteEditing ? (
                <span
                  className="inline-flex w-4 h-4 ml-0.5 shrink-0 invisible pointer-events-none align-middle"
                  aria-hidden
                />
              ) : (
                <button
                  type="button"
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
              )}
            </mark>,
          );
        }
        pos = Math.max(pos, b);
      }
      if (pos < segment.length) {
        nodes.push(<span key={`${keyPrefix}g-${pos}-end`}>{segment.slice(pos)}</span>);
      }
      return <>{nodes}</>;
    },
    [replacementToOriginal, adjustingSinglePhrase, handleSingleAdjust, isAutoAdjusting, paletteEditing],
  );

  const highlightedScript = useMemo(() => {
    const text = paletteText || scriptText;
    if (!text) return null;

    const lines = text.split("\n");
    const blankSet = isAutoAdjusting ? adjustingPhrases : undefined;
    let lineBase = 0;

    return (
      <>
        {lines.map((line, lineIndex) => {
          const isOverLimit = enableDialogueReview && dialogueOverLimitLines.has(lineIndex);
          const trimmed = line.trim();
          const split =
            isOverLimit && isDialogueLine(trimmed) && !isSfxLine(trimmed)
              ? splitDialoguePrefixContent(line)
              : null;

          const lineEnd = lineBase + line.length;

          if (split) {
            const { prefix, content } = split;
            const prefixLen = prefix.length;
            // 说话人/前缀不标 AI 风险；仅超限正文可标风险
            const contentSpans = intersectSpansWithRange(displayRiskSpans, lineBase + prefixLen, lineEnd);

            const node = (
              <span key={lineIndex}>
                {renderSpanWithRisk(prefix, [], blankSet, `L${lineIndex}-p`)}
                <mark className="bg-muted-foreground/15 text-foreground/70 rounded px-0.5" title="台词字数超限（仅正文）">
                  {renderSpanWithRisk(content, contentSpans, blankSet, `L${lineIndex}-c`)}
                </mark>
                {lineIndex < lines.length - 1 && "\n"}
              </span>
            );
            lineBase = lineEnd + (lineIndex < lines.length - 1 ? 1 : 0);
            return node;
          }

          let lineSpans = intersectSpansWithRange(displayRiskSpans, lineBase, lineEnd);
          const isSfxRow = isSfxLine(trimmed);
          const isDlgRow = isDialogueLine(trimmed);
          if (isSfxRow || (isDlgRow && !(enableDialogueReview && isOverLimit))) {
            lineSpans = [];
          }
          const node = (
            <span key={lineIndex}>
              {renderSpanWithRisk(line, lineSpans, blankSet, `L${lineIndex}`)}
              {lineIndex < lines.length - 1 && "\n"}
            </span>
          );
          lineBase = lineEnd + (lineIndex < lines.length - 1 ? 1 : 0);
          return node;
        })}
      </>
    );
  }, [
    paletteText,
    scriptText,
    displayRiskSpans,
    renderSpanWithRisk,
    isAutoAdjusting,
    adjustingPhrases,
    dialogueOverLimitLines,
    enableDialogueReview,
    isDialogueLine,
    isSfxLine,
  ]);

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

    const perLineLimit = isChinese ? 35 : 20;
    const shieldCellFromAiRisk = (cellStr: string) => {
      const t = cellStr.trim();
      if (isSfxLine(t)) return true;
      if (!isDialogueLine(t)) return false;
      if (!enableDialogueReview) return true;
      return dialogueContentWordCount(cellStr, isChinese) <= perLineLimit;
    };

    // 情节审核模式：预处理每行的风险信息
    const rowRiskInfo = reviewMode === "script" ? (() => {
      const info = new Map<number, { level: RiskLevel; phrase: string; matchedText: string }>();
      const sorted = [...activeRiskPhrases].filter(p => p.length > 0).sort((a, b) => b.length - a.length);

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
          if (shieldCellFromAiRisk(cellStr)) {
            return (
              <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
                {cellStr}
              </span>
            );
          }
          // 空白单元格不铺整格风险底纹，否则 mark 的 padding 会在空白处显示成色条（如集数后空列）
          if (!cellStr.trim()) {
            return (
              <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
                {cellStr}
              </span>
            );
          }
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

      if (shieldCellFromAiRisk(cellStr)) {
        return (
          <span className="cursor-pointer hover:bg-accent/30 px-1 rounded" onClick={() => handleTableCellEdit(rowIndex, cellIndex)} title="点击编辑">
            {cellStr}
          </span>
        );
      }

      // 文字审核模式：检查单元格内的风险短语
      const sorted = [...activeRiskPhrases].filter(p => p.length > 0).sort((a, b) => b.length - a.length);
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
                  <td
                    key={cellIndex}
                    className={`text-xs px-3 py-2 align-top max-w-[300px] ${isEpisodeTitleLikeCell(String(cell ?? "")) ? "whitespace-nowrap" : ""}`}
                  >
                    {renderCell(cell, rowIndex, cellIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [
    tableData,
    activeRiskPhrases,
    activeRiskMap,
    editingCell,
    editingValue,
    replacementToOriginal,
    handleTableCellEdit,
    handleTableCellSave,
    handleTableCellCancel,
    adjustingSinglePhrase,
    handleSingleAdjust,
    isAutoAdjusting,
    reviewMode,
    enableDialogueReview,
    isChinese,
    isDialogueLine,
    isSfxLine,
  ]);

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

    const textToCheck = tableData
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
      let workingText = tableData
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

      // --- Phase 2: Dialogue trimming ---
      // Re-analyze dialogue warnings on the working text
      const dialogueLines = workingText.split("\n");
      const overLimitDialogues: string[] = [];
      const shotGroupLim = isChinese ? 35 : 20;
      const episodeMaxLim = isChinese ? 330 : 180;
      let tempShotWords = 0;
      let tempShotDialogues: string[] = [];
      let tempEpWords = 0;
      let tempEpDialogues: string[] = [];
      let tempEp = "";
      let tempShotCount = 0;

      for (const dl of dialogueLines) {
        const trimmed = dl.trim();
        const epMatch = trimmed.match(/^#\s*(\d+)/);
        if (epMatch) {
          if (tempShotDialogues.length > 0 && tempShotWords > shotGroupLim) {
            overLimitDialogues.push(...tempShotDialogues);
          }
          tempShotCount++;
          if (tempShotCount > 5) {
            tempShotWords = 0; tempShotDialogues = []; tempShotCount = 1;
          }
          const sceneMatch = trimmed.match(/^#\s*(\d+)-/);
          const newEp = sceneMatch ? sceneMatch[1] : epMatch[1];
          if (newEp !== tempEp) {
            if (tempEp && tempEpWords > episodeMaxLim) overLimitDialogues.push(...tempEpDialogues);
            tempEp = newEp; tempEpWords = 0; tempEpDialogues = [];
            tempShotWords = 0; tempShotDialogues = []; tempShotCount = 1;
          }
          continue;
        }
        if (isDialogueLine(trimmed) && !isSfxLine(trimmed)) {
          const match = trimmed.match(/^[^\s△#]{1,10}[：:]\s*(?:[\(（][^）\)]*[）\)])?(.*)$/);
          const content = match ? match[1].trim() : trimmed;
          const wc = isChinese ? (content.match(/[\u4e00-\u9fa5]/g) || []).length : content.split(/\s+/).filter(w => w.length > 0).length;
          tempShotWords += wc; tempShotDialogues.push(trimmed);
          tempEpWords += wc; tempEpDialogues.push(trimmed);
        }
      }
      if (tempShotDialogues.length > 0 && tempShotWords > shotGroupLim) overLimitDialogues.push(...tempShotDialogues);
      if (tempEp && tempEpWords > episodeMaxLim) overLimitDialogues.push(...tempEpDialogues);

      const uniqueOverLimit = [...new Set(overLimitDialogues)];
      let dialogueTrimCount = 0;

      if (uniqueOverLimit.length > 0) {
        try {
          const trimPrompt = `你是短剧台词精简专家。

## 任务
以下台词行字数超出限制，请精简对话内容，删减不重要的台词或简略对话（不改变意思）。
${isChinese ? "中文标准：4-5个镜头一起的对白≤35字，一集台词≤330字" : "English standard: 4-5 shots together ≤20 words, episode ≤180 words"}

## 待精简台词
${JSON.stringify(uniqueOverLimit.map((line, i) => ({ id: i + 1, text: line })), null, 2)}

## 输出格式
只输出 JSON 数组：[{"id":1,"replacement":"精简后的台词"}]
- 如果某行可以完全删除，replacement 设为空字符串 ""
- 保持角色名和格式不变（如"角色名：台词"）`;

          const trimRaw = await callGeminiStream(
            model,
            [{ role: "user", parts: [{ text: trimPrompt }] }],
            () => {},
            { maxOutputTokens: 4096, temperature: 0.5 },
            autoAdjustAbortRef.current?.signal,
          );

          const trimResults = parseRewriteJson(trimRaw);
          for (const [id, replacement] of trimResults.entries()) {
            const original = uniqueOverLimit[id - 1];
            if (!original) continue;
            if (replacement === "") {
              // Remove the line entirely
              workingText = workingText.split(original).map(s => s).join("");
              // Clean up double newlines
              workingText = workingText.replace(/\n{3,}/g, "\n\n");
            } else if (replacement !== original) {
              workingText = workingText.split(original).join(replacement);
            }
            dialogueTrimCount++;
          }
        } catch (trimErr: any) {
          if (!trimErr?.message?.includes("取消")) {
            console.warn("Dialogue trim failed:", trimErr);
          }
        }
      }

      if (appliedCount === 0 && dialogueTrimCount === 0) {
        toast({ title: "自动调整未生效", description: "AI 改写结果与原文过于相似，请点击「自动调整」重试，或手动编辑文本", variant: "destructive" });
        return;
      }

      setPhraseReplacements(workingReplacements);
      setPaletteText(workingText);

      // 如果是表格模式，同步更新表格数据
      if (tableData) {
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

      const parts: string[] = [];
      if (appliedCount > 0) parts.push(`${appliedCount} 处风险`);
      if (dialogueTrimCount > 0) parts.push(`${dialogueTrimCount} 处台词精简`);
      toast({
        title: "自动调整完成",
        description: `已调整 ${parts.join("、")}${pending.length > 0 ? `，仍有 ${pending.length} 处建议手动调整` : ""}`,
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
      if (tableData) {
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
  }, [paletteEditing, paletteText, scriptText, activeRiskMap, tableData]);

  /** 文本模式：点击高亮区进入编辑（有选中文本时不触发，便于复制） */
  const handlePaletteReadOnlyClick = () => {
    if (paletteEditing || isAutoAdjusting) return;
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString() ?? "" : "";
    if (sel.length > 0) return;
    if (!paletteText) setPaletteText(scriptText);
    setPaletteEditing(true);
  };

  const handlePaletteTextBlur = () => {
    const next = paletteText || scriptText;
    const merged = tableData ? next : normalizeEpisodeClapperLineBreaks(next);
    setScriptText(merged);
    if (!tableData) setPaletteText(merged);
    setPaletteEditing(false);
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
        setScriptText((prev) => normalizeEpisodeClapperLineBreaks((prev ? prev + "\n\n" : "") + text));
        setTableData(null);
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
        const rawRows = jsonData.slice(1).map(row =>
          (row as (string | number | null)[]).map(cell => cell ?? "")
        );
        const rows = normalizeTableRowsForEpisodeClapper(rawRows);

        setTableData({ headers, rows, fileName: file.name, sheetName, originalData: [headers, ...rows] });
        const textContent = [headers, ...rows].map(row => (row as (string | number | null)[]).join("\t")).join("\n");
        setScriptText(textContent);
        toast({ title: "表格已加载", description: `${file.name} - ${sheetName} (${rows.length} 行数据)` });
      } else if (["pdf", "docx", "doc"].includes(ext)) {
        const text = await parseDocument(file);
        setScriptText((prev) => normalizeEpisodeClapperLineBreaks((prev ? prev + "\n\n" : "") + text));
        setTableData(null);
        toast({ title: "文档解析完成" });
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

    const trimmed = scriptText.trim();
    const titleForTask =
      trimmed.slice(0, 48) + (trimmed.length > 48 ? "…" : "") || "合规审核";
    const taskId = addComplianceTask({
      source: "standalone",
      title: titleForTask,
      status: "running",
      reviewMode,
      segmentProgress: null,
      detail: needsSegment ? "准备分段审核…" : "审核中…",
    });
    complianceTaskIdRef.current = taskId;
    saveComplianceStandaloneRestore(taskId, {
      v: 1,
      scriptText,
      complianceReport: "",
      reviewMode,
      strictness,
      inputMode: tableData ? "table" : "text",
      tableData,
    });

    try {
      const promptGenerator = reviewMode === "script" ? SCRIPT_REVIEW_PROMPT : STANDALONE_COMPLIANCE_PROMPT;
      const prompt = promptGenerator(scriptText, strictness);

      if (!needsSegment) {
        setSegmentProgress(null);
        updateComplianceTask(taskId, { detail: "单次全文审核中…" });

        const finalText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: prompt }] }],
          (chunk) => setStreamingText(chunk),
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );

        setComplianceReport(finalText);
        setStreamingText("");
        saveComplianceStandaloneRestore(taskId, {
          v: 1,
          scriptText,
          complianceReport: finalText,
          reviewMode,
          strictness,
          inputMode: tableData ? "table" : "text",
          tableData,
        });
        updateComplianceTask(taskId, {
          status: "completed",
          detail: "审核完成",
          segmentProgress: null,
        });
        complianceTaskIdRef.current = null;
        toast({ title: reviewMode === "script" ? "情节审核完成" : "文字审核完成" });
      } else {
        // 长文本分段处理
        const segments: string[] = [];
        const chineseRatio = chineseCount / totalChars;
        const segmentSize = chineseRatio > 0.3 ? MAX_CHINESE : MAX_ENGLISH;

        const isTableMode = !!tableData;
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
          updateComplianceTask(taskId, {
            segmentProgress: { current: i + 1, total: totalSegments },
            detail: `正在审核第 ${i + 1}/${totalSegments} 段（${segments[i].length} 字）`,
          });

          const segPrompt = promptGenerator(segments[i], strictness);
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
          saveComplianceStandaloneRestore(taskId, {
            v: 1,
            scriptText,
            complianceReport: combinedReport,
            reviewMode,
            strictness,
            inputMode: tableData ? "table" : "text",
            tableData,
          });
          updateComplianceTask(taskId, {
            status: "completed",
            detail: `已完成 ${totalSegments} 段分段审核`,
            segmentProgress: null,
          });
          complianceTaskIdRef.current = null;
          toast({ title: "合规审核完成", description: `已完成 ${totalSegments} 段分段审核` });
        } else if (complianceTaskIdRef.current) {
          saveComplianceStandaloneRestore(taskId, {
            v: 1,
            scriptText,
            complianceReport: "",
            reviewMode,
            strictness,
            inputMode: tableData ? "table" : "text",
            tableData,
          });
          updateComplianceTask(taskId, {
            status: "cancelled",
            detail: "未生成有效分段报告",
            segmentProgress: null,
          });
          complianceTaskIdRef.current = null;
        }
      }
    } catch (e: any) {
      const tid = complianceTaskIdRef.current;
      if (e?.message?.includes("取消") || e?.name === "AbortError") {
        const partial = streamingText;
        const reportForSave = partial || "";
        if (partial) setComplianceReport(partial);
        if (tid) {
          saveComplianceStandaloneRestore(tid, {
            v: 1,
            scriptText,
            complianceReport: reportForSave,
            reviewMode,
            strictness,
            inputMode: tableData ? "table" : "text",
            tableData,
          });
          updateComplianceTask(tid, {
            status: "cancelled",
            detail: partial ? "已保存部分报告" : "用户已停止",
            segmentProgress: null,
          });
        }
        toast({ title: "已停止生成" });
      } else {
        const errorMsg = e?.message || "未知错误";
        if (tid) {
          updateComplianceTask(tid, {
            status: "failed",
            detail: errorMsg.length > 200 ? errorMsg.slice(0, 200) + "…" : errorMsg,
            segmentProgress: null,
          });
        }
        toast({
          title: "审核失败",
          description: errorMsg.length > 100 ? errorMsg.slice(0, 100) + "..." : errorMsg,
          variant: "destructive"
        });
        if (streamingText) {
          setComplianceReport(streamingText);
        }
      }
      complianceTaskIdRef.current = null;
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
            <BrandMark className="h-7 w-12" />
            <span className="text-lg font-semibold font-[Space_Grotesk]">Infinio</span>
          </div>
        </div>
        <TaskHistoryMenu />
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="space-y-6">
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
                      <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]">
                        {MODEL_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleModelChange(opt.value)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${opt.value === model ? "bg-primary/10 text-primary font-semibold" : "text-popover-foreground hover:text-foreground"}`}
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
                {/* 表格文件 → 表格视图；文档/文本 → 文本编辑（由上传自动决定，不可手动切换） */}
                {tableData ? (
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
                              <TableCell
                                key={cellIndex}
                                className={`text-xs py-1.5 ${isEpisodeTitleLikeCell(String(cell ?? "")) ? "whitespace-nowrap align-top" : ""}`}
                              >
                                {String(cell ?? "")}
                              </TableCell>
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
                      placeholder="粘贴剧本内容，或上传文件：表格（xlsx/xls/csv）以表格展示，文档（txt/pdf/docx）以文本编辑。"
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
                      {/* 对话审查开关 */}
                      <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                        <span className="text-xs font-medium text-muted-foreground">对话审查</span>
                        <Switch
                          checked={enableDialogueReview}
                          onCheckedChange={setEnableDialogueReview}
                          className="mx-1"
                        />
                      </div>

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

                      {/* 严格程度切换 */}
                      <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                        {(Object.keys(STRICTNESS_CONFIG) as StrictnessLevel[]).map((level) => (
                          <button
                            key={level}
                            onClick={() => setStrictness(level)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${strictness === level ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                            title={STRICTNESS_CONFIG[level].desc}
                          >
                            {STRICTNESS_CONFIG[level].label}
                          </button>
                        ))}
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
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                        <p className="text-xs mt-1 text-primary">
                          当前严格程度：{STRICTNESS_CONFIG[strictness].label} - {STRICTNESS_CONFIG[strictness].desc}
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
                        <InterleavedText
                          text={complianceReport}
                          translatedLines={getTranslation(complianceReport) ?? []}
                        />
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
        </div>

        {/* Risk Highlight Comparison - Only show if there are risks or dialogue review is enabled */}
        {(complianceReport && !isGenerating && scriptText && (riskPhrases.length > 0 || (enableDialogueReview && dialogueOverLimitLines.size > 0))) && (
          <Card id="palette-section">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                <span className="text-sm font-normal text-muted-foreground">
                  共识别 {riskPhrases.length} 处风险片段，{markedRiskPhraseCount} 处已标记
                </span>
              </CardTitle>
              <div className="flex gap-2">
                {/* 表格模式下的撤销/重做 */}
                {tableData && (
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
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    停止
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleAutoAdjust} className="gap-1.5" disabled={paletteEditing || isAutoAdjusting}>
                    <Wand2 className="h-3.5 w-3.5" />
                    自动调整
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
                {enableDialogueReview && dialogueOverLimitLines.size > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded bg-muted-foreground/15 border border-muted-foreground/30" />
                    💬 台词超限 ({dialogueOverLimitLines.size} 处)
                  </span>
                )}
              </div>
              {/* 表格模式使用高亮表格，文本模式使用高亮文本 */}
              {tableData ? (
                renderHighlightedTable()
              ) : paletteEditing ? (
                <div
                  ref={paletteScrollRef}
                  className="max-h-[600px] overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-border bg-muted/30"
                >
                  {/* 单层滚动：仅外层 overflow；grid 叠层 + 高度同步，避免 textarea 内部再出滚动条 */}
                  <div className="grid w-full grid-cols-1 grid-rows-1 min-w-0">
                    <pre
                      className="pointer-events-none col-start-1 row-start-1 m-0 min-w-0 self-start whitespace-pre-wrap break-words p-4 text-sm leading-relaxed font-sans text-foreground/90"
                      aria-hidden
                    >
                      {highlightedScript}
                    </pre>
                    <textarea
                      ref={paletteTextareaRef}
                      value={paletteText || scriptText}
                      onChange={(e) => setPaletteText(e.target.value)}
                      onBlur={handlePaletteTextBlur}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          (e.target as HTMLTextAreaElement).blur();
                        }
                      }}
                      style={{ resize: "none" }}
                      className="col-start-1 row-start-1 self-start z-10 box-border min-h-0 min-w-0 w-full resize-none overflow-hidden border-0 bg-transparent p-4 whitespace-pre-wrap break-words text-sm leading-relaxed font-sans text-transparent [caret-color:hsl(var(--foreground))] selection:bg-primary/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                  </div>
                </div>
              ) : highlightedScript ? (
                <div
                  ref={paletteScrollRef}
                  className="max-h-[600px] overflow-auto rounded-md border border-border bg-muted/30 p-4 cursor-text select-text"
                  onClick={handlePaletteReadOnlyClick}
                  role="textbox"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handlePaletteReadOnlyClick();
                    }
                  }}
                >
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans text-foreground/90 m-0">
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
