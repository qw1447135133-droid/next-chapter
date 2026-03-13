import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SetupMode } from "@/pages/ScriptCreator";
import type { DramaProject } from "@/types/drama";
import { buildCreativePlanPrompt } from "@/lib/drama-prompts";
import { callGeminiStream, extractText } from "@/lib/gemini-client";
import { getApiConfig } from "@/pages/Settings";
import { toast } from "@/hooks/use-toast";

interface Props {
  project: DramaProject;
  onUpdate: (partial: Partial<DramaProject>) => void;
  setupMode: SetupMode;
  creativeInput: string;
  creativeFile: string;
  onNext: () => void;
  onBack: () => void;
}

function buildCreativeModePlanPrompt(
  creativeInput: string,
  creativeFile: string,
  targetMarket: string,
  totalEpisodes: number
) {
  const inputText = [creativeInput, creativeFile].filter(Boolean).join("\n\n---\n\n");
  return `你是一位专业的微短剧编剧，精通短视频平台的爆款短剧创作方法论。

## 用户创意输入
${inputText}

## 基础设定
- 目标市场：${targetMarket}
- 总集数：${totalEpisodes}集

## 你的任务
根据用户提供的创意灵感，生成完整的创作方案。你需要先从创意中推断出最合适的题材类型、目标受众、故事基调和结局类型，然后生成以下内容：

1. **题材与基调推断**：从创意中分析最合适的题材组合、受众、基调、结局类型
2. **剧名备选**（3个），每个附一句话说明
3. **时空背景**：时代、地点、社会环境、阶层关系
4. **一句话故事线** + **核心冲突**
5. **三幕结构拆解**：
   - 第一幕（建置）：集数范围、核心事件、人物关系建立
   - 第二幕（对抗）：集数范围、冲突升级、转折点
   - 第三幕（高潮/结局）：集数范围、终极对决、结局处理
6. **全剧节奏波形描述**：标注高潮点、低谷点位置
7. **付费卡点规划**：具体集数 + 卡点类型 + 悬念设计
8. **爽感矩阵**：规划全剧各类爽点分布和配比
9. **结局设计**：主线结局 + 感情线结局 + 伏笔回收

用 Markdown 格式输出，清晰分区。`;
}

const StepCreativePlan = ({
  project,
  onUpdate,
  setupMode,
  creativeInput,
  creativeFile,
  onNext,
  onBack,
}: Props) => {
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");

  const plan = project.creativePlan;

  const handleGenerate = async () => {
    setGenerating(true);
    setStreamText("");
    try {
      const config = getApiConfig();
      const prompt =
        setupMode === "creative"
          ? buildCreativeModePlanPrompt(
              creativeInput,
              creativeFile,
              project.setup?.targetMarket || "cn",
              project.setup?.totalEpisodes || 60
            )
          : buildCreativePlanPrompt(project.setup!);

      let accumulated = "";
      await callGeminiStream(
        prompt,
        (chunk) => {
          accumulated += chunk;
          setStreamText(accumulated);
        },
        undefined,
      );
      onUpdate({ creativePlan: accumulated });
      setStreamText("");
    } catch (err: any) {
      toast({ title: "生成失败", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const displayText = generating ? streamText : plan;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-[Space_Grotesk]">创作方案</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {setupMode === "creative"
              ? "基于你的创意灵感，AI 将生成完整的创作方案"
              : "基于选题配置，AI 将生成完整的创作方案"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回
          </Button>
          <Button onClick={handleGenerate} disabled={generating} size="sm">
            {generating ? "生成中…" : plan ? "重新生成" : "生成创作方案"}
          </Button>
        </div>
      </div>

      {displayText ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <Textarea
            value={displayText}
            readOnly={generating}
            onChange={(e) => onUpdate({ creativePlan: e.target.value })}
            className="min-h-[500px] resize-y text-sm leading-relaxed border-none p-0 focus-visible:ring-0"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-16 text-center text-muted-foreground">
          <p>点击"生成创作方案"开始</p>
        </div>
      )}

      {plan && !generating && (
        <div className="flex justify-end">
          <Button onClick={onNext} size="lg" className="px-8">
            下一步：角色开发
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepCreativePlan;
