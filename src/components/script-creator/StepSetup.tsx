import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Sparkles, Globe, Upload, FileText, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { GENRES, AUDIENCES, TONES, ENDINGS, EPISODE_COUNTS, TARGET_MARKETS, type DramaSetup, type SetupMode } from "@/types/drama";

interface StepSetupProps {
  setup: DramaSetup | null;
  onComplete: (setup: DramaSetup) => void;
  setupMode: SetupMode;
}

const StepSetup = ({ setup, onComplete, setupMode }: StepSetupProps) => {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(setup?.genres || []);
  const [audience, setAudience] = useState(setup?.audience || "女频");
  const [tone, setTone] = useState(setup?.tone || "甜虐");
  const [ending, setEnding] = useState(setup?.ending || "HE");
  const [totalEpisodes, setTotalEpisodes] = useState(setup?.totalEpisodes || 60);
  const [customEpisodes, setCustomEpisodes] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [customTopic, setCustomTopic] = useState(setup?.customTopic || "");
  const [targetMarket, setTargetMarket] = useState(setup?.targetMarket || "cn");
  const [creativeInput, setCreativeInput] = useState(setup?.creativeInput || "");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= 2) {
        toast({ title: "最多选择2个题材", variant: "destructive" });
        return prev;
      }
      return [...prev, genre];
    });
  };

  const handleEpisodeCountChange = (val: string) => {
    const num = Number(val);
    if (num === -1) {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      setTotalEpisodes(num);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setUploadedFileName(file.name);
    try {
      const text = await file.text();
      setCreativeInput((prev) => (prev ? prev + "\n\n---\n\n" + text : text));
      toast({ title: "文档已导入" });
    } catch (err: any) {
      toast({ title: "文档解析失败", description: err?.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (setupMode === "topic" && selectedGenres.length === 0) {
      toast({ title: "请至少选择一个题材", variant: "destructive" });
      return;
    }
    if (setupMode === "creative" && !creativeInput.trim()) {
      toast({ title: "请输入创意内容", variant: "destructive" });
      return;
    }
    const finalEpisodes = isCustom ? (parseInt(customEpisodes) || 60) : totalEpisodes;
    if (finalEpisodes < 10 || finalEpisodes > 200) {
      toast({ title: "集数需在 10-200 之间", variant: "destructive" });
      return;
    }
    onComplete({
      genres: setupMode === "topic" ? selectedGenres : [],
      audience,
      tone,
      ending,
      totalEpisodes: finalEpisodes,
      targetMarket,
      customTopic: customTopic.trim() || undefined,
      setupMode,
      creativeInput: setupMode === "creative" ? creativeInput.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
          <button
            onClick={() => setSetupMode("topic")}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
              setupMode === "topic"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            选题创作
          </button>
          <button
            onClick={() => setSetupMode("creative")}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
              setupMode === "creative"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            创意创作
          </button>
        </div>
      </div>

      {setupMode === "topic" ? (
        <>
          {/* 题材选择 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                题材选择（最多2个）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => toggleGenre(g.value)}
                    className={`p-3 rounded-lg border text-left transition-all text-sm ${
                      selectedGenres.includes(g.value)
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium">{g.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{g.desc}</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {g.audience}
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* 创意创作 */
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              输入你的创意
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="描述你的创意想法、故事灵感、世界观设定、核心冲突等...&#10;&#10;例如：一个现代女白领意外穿越到古代成为将军府庶女，凭借现代知识在古代商场和后宅斗争中逆袭的故事。女主聪慧但低调，善于利用信息差..."
              value={creativeInput}
              onChange={(e) => setCreativeInput(e.target.value)}
              rows={8}
              className="text-sm"
            />
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                {isParsing ? "解析中..." : "上传文档"}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  <FileText className="h-3 w-3" />
                  {uploadedFileName}
                  <button
                    onClick={() => setUploadedFileName("")}
                    className="hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              支持粘贴文本或上传 .txt / .md / .doc / .docx 文档，AI 将根据你的创意自动生成完整的创作方案
            </p>
          </CardContent>
        </Card>
      )}

      {/* 目标市场 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            目标市场
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TARGET_MARKETS.map((m) => (
              <button
                key={m.value}
                onClick={() => setTargetMarket(m.value)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  targetMarket === m.value
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 配置项 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">创作配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm mb-1.5 block">目标受众</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">故事基调</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">结局类型</Label>
              <Select value={ending} onValueChange={setEnding}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENDINGS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">总集数</Label>
              {isCustom ? (
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={customEpisodes}
                    onChange={(e) => setCustomEpisodes(e.target.value)}
                    placeholder="10-200"
                    className="flex-1"
                  />
                  <Button variant="ghost" size="sm" className="shrink-0 text-xs h-10" onClick={() => setIsCustom(false)}>
                    预设
                  </Button>
                </div>
              ) : (
                <Select value={String(totalEpisodes)} onValueChange={handleEpisodeCountChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EPISODE_COUNTS.map((e) => (
                      <SelectItem key={e.value} value={String(e.value)}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          {setupMode === "topic" && (
            <div>
              <Label className="text-sm mb-1.5 block">补充描述（可选）</Label>
              <Textarea
                placeholder="描述你想要的故事方向、主角设定、特殊要求等..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 提交 */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={setupMode === "topic" ? selectedGenres.length === 0 : !creativeInput.trim()}
          className="gap-2"
        >
          确认方向，进入创作方案
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default StepSetup;
