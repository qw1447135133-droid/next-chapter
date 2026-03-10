import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, PenTool, Settings, Send, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { callGemini } from "@/lib/gemini-client";

const GENRES = [
  { value: "short-drama", label: "短剧" },
  { value: "movie", label: "电影剧本" },
  { value: "commercial", label: "广告脚本" },
  { value: "documentary", label: "纪录片旁白" },
  { value: "other", label: "其他" },
];

const SCRIPT_SYSTEM_PROMPT = `你是一位专业的剧本编剧 AI。用户会提供主题、体裁和大纲信息，你需要根据这些信息创作完整的剧本。

要求：
1. 剧本格式规范，包含场景描述、角色对白、动作指示
2. 角色性格鲜明，对白自然生动
3. 情节有起承转合，节奏把控得当
4. 场景描写具有画面感，便于后续视觉化
5. 用中文输出`;

const ScriptCreator = () => {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState("short-drama");
  const [outline, setOutline] = useState("");
  const [generatedScript, setGeneratedScript] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "请输入剧本主题", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGeneratedScript("");

    const genreLabel = GENRES.find((g) => g.value === genre)?.label || genre;
    const userPrompt = `请创作一部${genreLabel}剧本。

主题：${topic.trim()}
${outline.trim() ? `\n大纲/要求：\n${outline.trim()}` : ""}

请直接输出完整剧本内容。`;

    try {
      const result = await callGemini({
        prompt: userPrompt,
        systemPrompt: SCRIPT_SYSTEM_PROMPT,
        maxTokens: 8192,
      });
      setGeneratedScript(result);
      toast({ title: "剧本生成完成" });
    } catch (e: any) {
      toast({ title: "生成失败", description: e?.message || "未知错误", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      toast({ title: "已复制到剪贴板" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "复制失败", variant: "destructive" });
    }
  };

  const handleUseInVideo = () => {
    // Store script in sessionStorage and navigate to workspace
    sessionStorage.setItem("imported-script", generatedScript);
    navigate("/workspace");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold font-[Space_Grotesk]">剧本创作</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">创作设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">剧本主题 *</Label>
                <Input
                  placeholder="例如：一个关于时间旅行的爱情故事"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">体裁</Label>
                <Select value={genre} onValueChange={setGenre} disabled={isGenerating}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">大纲 / 补充要求（可选）</Label>
              <Textarea
                placeholder="描述剧本的主要情节、角色设定、风格偏好等..."
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                rows={4}
                disabled={isGenerating}
              />
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} className="gap-2">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isGenerating ? "生成中…" : "AI 生成剧本"}
            </Button>
          </CardContent>
        </Card>

        {/* Output Section */}
        {(generatedScript || isGenerating) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">生成结果</CardTitle>
              {generatedScript && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "已复制" : "复制"}
                  </Button>
                  <Button size="sm" onClick={handleUseInVideo} className="gap-1.5">
                    <PenTool className="h-3.5 w-3.5" />
                    用于视频创作
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isGenerating && !generatedScript ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  AI 正在创作剧本…
                </div>
              ) : (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
                  {generatedScript}
                </pre>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ScriptCreator;
