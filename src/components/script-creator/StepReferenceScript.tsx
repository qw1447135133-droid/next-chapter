import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, FileText, Upload, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { callGemini, callGeminiStream, extractText } from "@/lib/gemini-client";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TARGET_MARKETS, EPISODE_COUNTS, AUDIENCES, TONES, ENDINGS } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";

interface StepReferenceScriptProps {
  referenceScript: string;
  setup: DramaSetup | null;
  onComplete: (referenceScript: string, setup: DramaSetup, referenceStructure: string) => void;
}

const ACCEPTED_TYPES = ".txt,.pdf,.doc,.docx";

/** Detect if text is primarily logographic (Chinese/Japanese/Korean) */
function isLogographicText(text: string): boolean {
  const sample = text.slice(0, 2000);
  const cjkChars = (sample.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  return cjkChars / sample.length > 0.15;
}

function getChunkSize(text: string): number {
  return isLogographicText(text) ? 10000 : 25000;
}

/** Animated progress with creep — matches DecomposeProgress logic */
function useAnimatedProgress(ceilPercent: number, floorPercent: number, hasProcessing: boolean) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const lastTimeRef = useRef(performance.now());
  const prevCeilRef = useRef(ceilPercent);

  const ceilDropped = ceilPercent < prevCeilRef.current;
  useEffect(() => {
    prevCeilRef.current = ceilPercent;
  }, [ceilPercent]);

  useEffect(() => {
    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setDisplay(prev => {
        const hardCap = Math.max(0, ceilPercent - 0.1);

        if (!hasProcessing && !ceilDropped) {
          if (prev > floorPercent) {
            const diff = prev - floorPercent;
            const rollSpeed = Math.max(1, diff * 0.08) * 12;
            return Math.max(prev - rollSpeed * dt, floorPercent);
          }
          return floorPercent;
        }

        if (prev > hardCap) {
          const diff = prev - hardCap;
          const rollSpeed = Math.max(1, diff * 0.08) * 12;
          return Math.max(prev - rollSpeed * dt, hardCap);
        }

        const base = Math.max(prev, floorPercent);
        const gap = hardCap - base;
        if (gap <= 0) return hardCap;

        const chunkRange = ceilPercent - floorPercent;
        const baseSpeed = chunkRange > 0 ? chunkRange / 75 : 0.2;
        const ratio = gap / (chunkRange || 1);
        const speed = baseSpeed * Math.max(0.05, ratio);
        const next = base + speed * dt;
        return Math.min(next, hardCap);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [ceilPercent, floorPercent, hasProcessing, ceilDropped]);

  useEffect(() => {
    setDisplay(prev => Math.max(prev, floorPercent));
  }, [floorPercent]);

  return Math.round(display * 10) / 10;
}

/** Split script into chunks for structure extraction */
function splitIntoChunks(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxSize) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a paragraph boundary
    let splitIdx = remaining.lastIndexOf("\n\n", maxSize);
    if (splitIdx < maxSize * 0.5) splitIdx = remaining.lastIndexOf("\n", maxSize);
    if (splitIdx < maxSize * 0.5) splitIdx = maxSize;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}

const StepReferenceScript = ({ referenceScript, setup, onComplete }: StepReferenceScriptProps) => {
  const [script, setScript] = useState(referenceScript || "");
  const [targetMarket, setTargetMarket] = useState(setup?.targetMarket || "");
  const [totalEpisodes, setTotalEpisodes] = useState<number | null>(setup?.totalEpisodes || null);
  const [audience, setAudience] = useState(setup?.audience || "");
  const [tone, setTone] = useState(setup?.tone || "");
  const [ending, setEnding] = useState(setup?.ending || "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [extractedStructure, setExtractedStructure] = useState("");
  // Progress state
  const [progress, setProgress] = useState({ done: 0, total: 0, processing: false, phase: "" });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isUploading = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isUploading.current) return;
    isUploading.current = true;

    const name = file.name.toLowerCase();
    if (![".txt", ".pdf", ".doc", ".docx"].some((ext) => name.endsWith(ext))) {
      toast({ title: "不支持的格式", description: "请上传 TXT、PDF 或 Word 文档", variant: "destructive" });
      isUploading.current = false;
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "文件过大", description: "文件大小不能超过 10MB", variant: "destructive" });
      isUploading.current = false;
      return;
    }

    if (name.endsWith(".txt")) {
      try {
        const text = await file.text();
        setScript(text);
        setAnalyzed(false);
        setExtractedStructure("");
        toast({ title: "导入成功", description: `已导入 ${file.name}` });
      } catch {
        toast({ title: "读取失败", variant: "destructive" });
      }
      isUploading.current = false;
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    toast({ title: "正在解析文档...", description: "PDF/Word 解析可能需要几秒钟" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data, error } = await supabase.functions.invoke("parse-document", { body: formData });
      if (error) throw error;
      if (data?.error) throw new Error(data.error || "解析失败");
      setScript(data.text);
      setAnalyzed(false);
      setExtractedStructure("");
      toast({ title: "导入成功", description: `已导入 ${file.name}` });
    } catch (err: any) {
      console.error("Document parse error:", err);
      toast({ title: "解析失败", description: err.message || "请重试", variant: "destructive" });
    }

    isUploading.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  // AI auto-detect + structure extraction
  const handleAnalyze = async () => {
    if (!script.trim() || script.trim().length < 50) {
      toast({ title: "剧本内容过短，无法识别", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setExtractedStructure("");
    abortRef.current = new AbortController();
    const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";

    try {
      // Phase 1: Config detection
      setProgress({ done: 0, total: 1, processing: true, phase: "识别配置项…" });

      const configPrompt = `你是一位专业的短剧编辑。请分析以下剧本/故事文本，识别其基本属性。

## 剧本文本（前3000字）
${script.slice(0, 3000)}

## 请以 JSON 格式输出以下字段：
{
  "targetMarket": "cn|jp|west|kr|sea",
  "audience": "女频|男频|全龄",
  "tone": "甜|虐|甜虐|爽|燃|搞笑",
  "ending": "HE|BE|OE",
  "suggestedEpisodes": 60,
  "reason": "简短说明判断依据"
}

**只输出 JSON，不要输出其他任何内容。**`;

      const configData = await callGemini(
        model,
        [{ role: "user", parts: [{ text: configPrompt }] }],
        { maxOutputTokens: 2048 },
      );
      const configResult = extractText(configData);
      const jsonMatch = configResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.targetMarket) setTargetMarket(parsed.targetMarket);
        if (parsed.audience) setAudience(parsed.audience);
        if (parsed.tone) setTone(parsed.tone);
        if (parsed.ending) setEnding(parsed.ending);
        if (parsed.suggestedEpisodes) setTotalEpisodes(Number(parsed.suggestedEpisodes));
      }

      // Phase 2: Structure extraction in chunks
      const chunkSize = getChunkSize(script);
      const chunks = splitIntoChunks(script, chunkSize);
      const totalSteps = chunks.length;
      const structureParts: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        if (abortRef.current?.signal.aborted) break;

        setProgress({
          current: i + 1,
          total: totalSteps,
          phase: `提取结构 ${i + 1}/${totalSteps}…`,
        });

        const isFirst = i === 0;
        const isLast = i === chunks.length - 1;
        const chunkPrompt = `你是一位专业的剧本分析师。请提炼以下剧本片段的叙事结构。

${isFirst ? "" : `## 前文结构概要
以下是前面片段已提取的结构，请衔接：
${structureParts.join("\n\n").slice(-2000)}
---
`}
## 剧本片段（第 ${i + 1}/${totalSteps} 段）
${chunks[i]}

## 提取要求
请提炼出以下内容：
1. **情节骨架**：按叙事顺序列出关键情节点（每个情节点一行，格式：序号. 情节描述）
2. **核心冲突**：本段出现的主要矛盾冲突
3. **人物关系变化**：本段中人物关系的关键变动
4. **转折点/高潮**：如有重要转折或高潮点请标注
5. **悬念/伏笔**：未解决的悬念或埋下的伏笔
${isLast ? "\n6. **结局走向**：故事的最终走向和结局" : ""}

用 Markdown 格式输出，简洁精炼，每个要点不超过2句话。`;

        const chunkText = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: chunkPrompt }] }],
          () => {},
          { maxOutputTokens: 4096 },
          abortRef.current.signal,
        );

        structureParts.push(`### 第 ${i + 1} 段结构\n${chunkText}`);
      }

      if (abortRef.current?.signal.aborted) {
        toast({ title: "已停止识别" });
        setIsAnalyzing(false);
        return;
      }

      // Phase 3: Merge structure if multiple chunks
      let finalStructure: string;
      if (structureParts.length === 1) {
        finalStructure = structureParts[0].replace(/^###.*\n/, "");
      } else {
        setProgress({ current: totalSteps, total: totalSteps, phase: "合并结构…" });

        const mergePrompt = `你是一位专业的剧本分析师。以下是一部长剧本分段提取的叙事结构，请将它们合并为一份完整、连贯的结构分析报告。

${structureParts.join("\n\n---\n\n")}

## 合并要求
请输出一份完整的结构报告，包含：
1. **故事主线概要**（200字以内）
2. **完整情节骨架**（按叙事顺序，编号列出所有关键情节点）
3. **核心矛盾冲突**（主线冲突 + 副线冲突）
4. **人物关系网**（列出主要人物及其关系）
5. **三幕结构拆解**（起承转合的集数范围和核心事件）
6. **转折点与高潮标注**
7. **悬念/伏笔清单**
8. **结局走向**

用 Markdown 格式输出，清晰分区。`;

        finalStructure = await callGeminiStream(
          model,
          [{ role: "user", parts: [{ text: mergePrompt }] }],
          () => {},
          { maxOutputTokens: 8192 },
          abortRef.current.signal,
        );
      }

      setExtractedStructure(finalStructure);
      setAnalyzed(true);
      setProgress({ current: 0, total: 0, phase: "" });
      toast({ title: "识别完成", description: "已提取剧本结构和配置项" });
    } catch (e: any) {
      if (e?.message?.includes("取消") || e?.name === "AbortError") {
        toast({ title: "已停止识别" });
      } else {
        toast({ title: "识别失败", description: e?.message, variant: "destructive" });
      }
    } finally {
      setIsAnalyzing(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => abortRef.current?.abort();

  const handleSubmit = () => {
    if (!script.trim()) {
      toast({ title: "请输入参考剧本", variant: "destructive" });
      return;
    }
    if (script.trim().length < 100) {
      toast({ title: "参考剧本内容过短，请输入更完整的剧本", variant: "destructive" });
      return;
    }
    if (!analyzed) {
      toast({ title: '请先点击「AI 识别剧本」识别配置项', variant: "destructive" });
      return;
    }
    const dramaSetup: DramaSetup = {
      genres: [],
      audience: audience || "全龄",
      tone: tone || "爽",
      ending: ending || "HE",
      totalEpisodes: totalEpisodes || 60,
      targetMarket: targetMarket || "cn",
    };
    onComplete(script, dramaSetup, extractedStructure);
  };

  const findLabel = (list: readonly { value: string; label: string }[], val: string) =>
    list.find((i) => i.value === val)?.label || "";

  const episodeLabel = totalEpisodes
    ? (EPISODE_COUNTS.find((e) => e.value === totalEpisodes)?.label || `${totalEpisodes}集`)
    : "";

  const progressPct = progress.total > 0
    ? parseFloat(((progress.current / (progress.total + 1)) * 100).toFixed(1))
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            参考剧本
          </CardTitle>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={isAnalyzing}
            >
              <Upload className="h-3.5 w-3.5" />
              上传文档
            </Button>
            {isAnalyzing ? (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={handleStop}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                停止识别
              </Button>
            ) : (
              <Button
                variant={analyzed ? "outline" : "default"}
                size="sm"
                className="gap-1.5"
                onClick={handleAnalyze}
                disabled={!script.trim()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {analyzed ? "重新识别" : "AI 识别剧本"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              粘贴文本或上传文档（TXT / PDF / Word），点击"AI 识别剧本"自动分析配置并提取结构
            </Label>
            <Textarea
              value={script}
              onChange={(e) => { setScript(e.target.value); setAnalyzed(false); setExtractedStructure(""); }}
              placeholder="在此粘贴参考剧本原文……&#10;&#10;可以是完整剧本、小说节选、故事大纲等任何叙事文本"
              rows={16}
              className="font-mono text-sm"
              disabled={isAnalyzing}
            />
            {script && (
              <p className="text-xs text-muted-foreground mt-1">
                共 {script.length} 字
                {script.length > getChunkSize(script) && (
                  <span className="ml-2">
                    （将分 {splitIntoChunks(script, getChunkSize(script)).length} 段识别）
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {isAnalyzing && progress.total > 0 && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{progress.phase}</span>
                <span className="font-mono text-muted-foreground">{progressPct.toFixed(1)}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}

          {/* Extracted structure preview */}
          {extractedStructure && !isAnalyzing && (
            <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">📋 已提取结构（将用于结构转换）</p>
              <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans text-foreground/80 max-h-[200px] overflow-auto">
                {extractedStructure.slice(0, 1000)}
                {extractedStructure.length > 1000 && "…"}
              </pre>
            </div>
          )}

          {/* Read-only config display */}
          <div>
            <h4 className="text-sm font-medium mb-3">配置项（AI 自动识别）</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">目标市场</Label>
                <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
                  {findLabel(TARGET_MARKETS, targetMarket) || <span className="text-muted-foreground/50">待识别</span>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">目标集数</Label>
                <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
                  {episodeLabel || <span className="text-muted-foreground/50">待识别</span>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">受众</Label>
                <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
                  {findLabel(AUDIENCES, audience) || <span className="text-muted-foreground/50">待识别</span>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">基调</Label>
                <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
                  {findLabel(TONES, tone) || <span className="text-muted-foreground/50">待识别</span>}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">结局</Label>
                <div className="h-8 px-3 flex items-center rounded-md border bg-muted/40 text-sm">
                  {findLabel(ENDINGS, ending) || <span className="text-muted-foreground/50">待识别</span>}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} className="gap-2" disabled={!script.trim() || !analyzed || isAnalyzing}>
          确认参考剧本，进入结构转换
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StepReferenceScript;
