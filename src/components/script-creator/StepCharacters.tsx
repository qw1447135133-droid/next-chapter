import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2, RefreshCw, Pencil, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGemini, extractText } from "@/lib/gemini-client";
import { buildCharactersPrompt } from "@/lib/drama-prompts";
import type { DramaSetup } from "@/types/drama";

interface StepCharactersProps {
  setup: DramaSetup;
  creativePlan: string;
  characters: string;
  onUpdate: (characters: string) => void;
  onNext: () => void;
}

const StepCharacters = ({ setup, creativePlan, characters, onUpdate, onNext }: StepCharactersProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildCharactersPrompt(setup, creativePlan);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const data = await callGemini(model, [
        { role: "user", parts: [{ text: prompt }] },
      ], { maxOutputTokens: 8192 });
      const text = extractText(data);
      onUpdate(text);
      toast({ title: "角色档案生成完成" });
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
          <CardTitle className="text-lg">角色开发</CardTitle>
          <div className="flex gap-2">
            {characters && (
              <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                {editing ? "预览" : "编辑"}
              </Button>
            )}
            <Button
              variant={characters ? "outline" : "default"}
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="gap-1.5"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {characters ? "重新生成" : "AI 生成"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isGenerating && !characters ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              AI 正在设计角色体系…
            </div>
          ) : !characters ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"AI 生成"按钮，AI 将根据创作方案生成完整角色体系</p>
              <p className="text-xs mt-2">包含：角色档案、关系图、弧光设计、四层反派体系</p>
            </div>
          ) : editing ? (
            <Textarea
              value={characters}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {characters}
            </pre>
          )}
        </CardContent>
      </Card>

      {characters && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            确认角色，进入分集目录
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepCharacters;
