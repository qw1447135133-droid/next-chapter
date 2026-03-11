import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRight, FileText, Upload, Sparkles, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { callGeminiStream } from "@/lib/gemini-client";
import { TARGET_MARKETS, EPISODE_COUNTS, AUDIENCES, TONES, ENDINGS } from "@/types/drama";
import type { DramaSetup } from "@/types/drama";

interface StepReferenceScriptProps {
  referenceScript: string;
  setup: DramaSetup | null;
  onComplete: (referenceScript: string, setup: DramaSetup) => void;
}

const ACCEPTED_TYPES = ".txt,.pdf,.doc,.docx";

const StepReferenceScript = ({ referenceScript, setup, onComplete }: StepReferenceScriptProps) => {
  const [script, setScript] = useState(referenceScript || "");
  const [targetMarket, setTargetMarket] = useState(setup?.targetMarket || "");
  const [totalEpisodes, setTotalEpisodes] = useState<number | null>(setup?.totalEpisodes || null);
  const [audience, setAudience] = useState(setup?.audience || "");
  const [tone, setTone] = useState(setup?.tone || "");
  const [ending, setEnding] = useState(setup?.ending || "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isUploading = useRef(false);

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
      toast({ title: "导入成功", description: `已导入 ${file.name}` });
    } catch (err: any) {
      console.error("Document parse error:", err);
      toast({ title: "解析失败", description: err.message || "请重试", variant: "destructive" });
    }

    isUploading.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  // AI auto-detect
  const handleAnalyze = async () => {
    if (!script.trim() || script.trim().length < 50) {
      toast({ title: "剧本内容过短，无法识别", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    try {
      const prompt = `你是一位专业的短剧编辑。请分析以下剧本/故事文本，识别其基本属性。

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

      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const result = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 512 },
      );

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.targetMarket) setTargetMarket(parsed.targetMarket);
        if (parsed.audience) setAudience(parsed.audience);
        if (parsed.tone) setTone(parsed.tone);
        if (parsed.ending) setEnding(parsed.ending);
        if (parsed.suggestedEpisodes) setTotalEpisodes(Number(parsed.suggestedEpisodes));
        setAnalyzed(true);
        toast({ title: "识别完成", description: parsed.reason || "已自动填充配置项" });
      } else {
        toast({ title: "识别失败", description: "无法解析 AI 返回结果", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "识别失败", description: e?.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

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
      toast({ title: "请先点击"AI 识别剧本"识别配置项", variant: "destructive" });
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
    onComplete(script, dramaSetup);
  };

  const findLabel = (list: readonly { value: string; label: string }[], val: string) =>
    list.find((i) => i.value === val)?.label || "";

  const episodeLabel = totalEpisodes
    ? (EPISODE_COUNTS.find((e) => e.value === totalEpisodes)?.label || `${totalEpisodes}集`)
    : "";

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
            >
              <Upload className="h-3.5 w-3.5" />
              上传文档
            </Button>
            <Button
              variant={analyzed ? "outline" : "default"}
              size="sm"
              className="gap-1.5"
              onClick={handleAnalyze}
              disabled={!script.trim() || isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isAnalyzing ? "识别中…" : analyzed ? "重新识别" : "AI 识别剧本"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              粘贴文本或上传文档（TXT / PDF / Word），点击"AI 识别剧本"自动分析配置
            </Label>
            <Textarea
              value={script}
              onChange={(e) => { setScript(e.target.value); setAnalyzed(false); }}
              placeholder="在此粘贴参考剧本原文……&#10;&#10;可以是完整剧本、小说节选、故事大纲等任何叙事文本"
              rows={16}
              className="font-mono text-sm"
            />
            {script && (
              <p className="text-xs text-muted-foreground mt-1">
                共 {script.length} 字
              </p>
            )}
          </div>

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
        <Button onClick={handleSubmit} className="gap-2" disabled={!script.trim() || !analyzed}>
          确认参考剧本，进入结构转换
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StepReferenceScript;
