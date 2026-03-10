import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2, RefreshCw, Pencil, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGemini, extractText } from "@/lib/gemini-client";
import { buildCreativePlanPrompt } from "@/lib/drama-prompts";
import type { DramaSetup } from "@/types/drama";

interface StepCreativePlanProps {
  setup: DramaSetup;
  plan: string;
  onUpdate: (plan: string) => void;
  onNext: () => void;
}

const StepCreativePlan = ({ setup, plan, onUpdate, onNext }: StepCreativePlanProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildCreativePlanPrompt(setup);
      const data = await callGemini("gemini-2.5-flash", [
        { role: "user", parts: [{ text: prompt }] },
      ], { maxOutputTokens: 8192 });
      const text = extractText(data);
      onUpdate(text);
      toast({ title: "创作方案生成完成" });
    } catch (e: any) {
      toast({ title: "生成失败", description: e?.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">创作方案</CardTitle>
          <div className="flex gap-2">
            {plan && (
              <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editing ? "预览" : "编辑"}
              </Button>
            )}
            <Button
              variant={plan ? "outline" : "default"}
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-1.5"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {plan ? "重新生成" : "AI 生成"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isGenerating && !plan ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              AI 正在构建故事骨架…
            </div>
          ) : !plan ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 生成"按钮，AI 将根据选题配置生成完整的创作方案</p>
              <p className="text-xs mt-2">包含：剧名备选、时空背景、三幕结构、节奏曲线、付费卡点、爽感矩阵</p>
            </div>
          ) : editing ? (
            <Textarea
              value={plan}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {plan}
            </pre>
          )}
        </CardContent>
      </Card>

      {plan && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认方案，进入角色开发
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepCreativePlan;
