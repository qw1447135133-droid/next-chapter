import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [targetMarket, setTargetMarket] = useState(setup?.targetMarket || "cn");
  const [totalEpisodes, setTotalEpisodes] = useState(setup?.totalEpisodes || 60);
  const [episodeSelect, setEpisodeSelect] = useState(
    EPISODE_COUNTS.some((e) => e.value === (setup?.totalEpisodes || 60))
      ? String(setup?.totalEpisodes || 60)
      : "-1"
  );
  const [customEpisodes, setCustomEpisodes] = useState("");
  const [audience, setAudience] = useState(setup?.audience || "全龄");
  const [tone, setTone] = useState(setup?.tone || "爽");
  const [ending, setEnding] = useState(setup?.ending || "HE");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isUploading = useRef(false);

  const handleEpisodeChange = (val: string) => {
    setEpisodeSelect(val);
    if (val !== "-1") setTotalEpisodes(Number(val));
  };

  // File upload — reuse same logic as ScriptInput
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
      toast({ title: "导入成功", description: `已导入 ${file.name}` });
    } catch (err: any) {
      console.error("Document parse error:", err);
      toast({ title: "解析失败", description: err.message || "请重试", variant: "destructive" });
    }

    isUploading.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  // AI auto-detect script setup
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
  "targetMarket": "cn|jp|west|kr|sea",  // 根据文本语言和风格判断
  "audience": "女频|男频|全龄",          // 根据内容题材判断
  "tone": "甜|虐|甜虐|爽|燃|搞笑",      // 根据叙事基调判断
  "ending": "HE|BE|OE",                // 根据内容倾向判断（如无法判断则 HE）
  "suggestedEpisodes": 60,             // 根据内容体量建议集数（40-100）
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

      // Parse JSON from result
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.targetMarket) setTargetMarket(parsed.targetMarket);
        if (parsed.audience) setAudience(parsed.audience);
        if (parsed.tone) setTone(parsed.tone);
        if (parsed.ending) setEnding(parsed.ending);
        if (parsed.suggestedEpisodes) {
          const ep = Number(parsed.suggestedEpisodes);
          const matched = EPISODE_COUNTS.find((e) => e.value === ep);
          if (matched) {
            setEpisodeSelect(String(ep));
            setTotalEpisodes(ep);
          } else {
            setEpisodeSelect("-1");
            setCustomEpisodes(String(ep));
          }
        }
        toast({
          title: "识别完成",
          description: parsed.reason || "已自动填充配置项",
        });
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
    const finalEpisodes = episodeSelect === "-1" ? (Number(customEpisodes) || 60) : totalEpisodes;
    const dramaSetup: DramaSetup = {
      genres: [],
      audience,
      tone,
      ending,
      totalEpisodes: finalEpisodes,
      targetMarket,
    };
    onComplete(script, dramaSetup);
  };

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
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              粘贴文本或上传文档（TXT / PDF / Word），AI 将基于此进行风格转换
            </Label>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
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

          <div className="flex items-center justify-between pt-2">
            <h4 className="text-sm font-medium">配置项</h4>
            <Button
              variant="outline"
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
              {isAnalyzing ? "识别中…" : "AI 识别剧本"}
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">目标市场</Label>
              <Select value={targetMarket} onValueChange={setTargetMarket}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_MARKETS.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">目标集数</Label>
              <Select value={episodeSelect} onValueChange={handleEpisodeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EPISODE_COUNTS.map((e) => (
                    <SelectItem key={e.value} value={String(e.value)} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {episodeSelect === "-1" && (
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={customEpisodes}
                  onChange={(e) => setCustomEpisodes(e.target.value)}
                  placeholder="10-200"
                  className="h-8 text-xs mt-1"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">受众</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">基调</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">结局</Label>
              <Select value={ending} onValueChange={setEnding}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENDINGS.map((e) => (
                    <SelectItem key={e.value} value={e.value} className="text-xs">
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} className="gap-2" disabled={!script.trim()}>
          确认参考剧本，进入结构转换
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StepReferenceScript;
