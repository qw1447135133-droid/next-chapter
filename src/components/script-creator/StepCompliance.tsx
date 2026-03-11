import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, RefreshCw, Pencil, Eye, Square, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";
import { buildCompliancePrompt } from "@/lib/drama-prompts";
import type { DramaSetup, EpisodeScript } from "@/types/drama";
import { useTranslation, InterleavedText, TranslateToggle, TranslationProgress, isNonChineseText } from "./TranslateButton";

interface StepComplianceProps {
  setup: DramaSetup;
  creativePlan: string;
  characters: string;
  episodes: EpisodeScript[];
  complianceReport: string;
  onUpdate: (report: string) => void;
  onNext: () => void;
}

const StepCompliance = ({ setup, creativePlan, characters, episodes, complianceReport, onUpdate, onNext }: StepComplianceProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [editing, setEditing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { isTranslating, showTranslation, translate, stopTranslation, clearTranslation, getTranslation, hasTranslation, progress: transProgress, canResume: transCanResume, resumeTranslation } = useTranslation();
  const nonChinese = isNonChineseText(complianceReport);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStreamingText("");
    abortRef.current = new AbortController();
    try {
      const prompt = buildCompliancePrompt(setup, creativePlan, characters, episodes);
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        (chunk) => setStreamingText(chunk),
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );
      onUpdate(finalText);
      setStreamingText("");
      toast({ title: "合规审核完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        const partial = streamingText;
        if (partial) onUpdate(partial);
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

  // Parse risk counts from report
  const redLineCount = (complianceReport.match(/⛔/g) || []).length;
  const highRiskCount = (complianceReport.match(/⚠️/g) || []).length;
  const infoCount = (complianceReport.match(/ℹ️/g) || []).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            合规审核
            {complianceReport && !isGenerating && (
              <span className="text-sm font-normal text-muted-foreground">
                ⛔{redLineCount} · ⚠️{highRiskCount} · ℹ️{infoCount}
              </span>
            )}
          </CardTitle>
          <div className="flex gap-2">
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
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {complianceReport ? "重新审核" : "开始审核"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isTranslating && <TranslationProgress progress={transProgress} />}
          {!displayText ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>点击"开始审核"按钮，AI 将对全部已完成的剧本内容进行合规检查</p>
              <p className="text-xs mt-2">检查维度：红线检测、高风险内容、正能量校验、广告植入合规</p>
            </div>
          ) : editing && !isGenerating ? (
            <Textarea
              value={complianceReport}
              onChange={(e) => onUpdate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
          ) : showTranslation && !isGenerating && hasTranslation(complianceReport) ? (
            <div className="max-h-[600px] overflow-auto">
              <InterleavedText text={complianceReport} translatedLines={getTranslation(complianceReport)!} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
              {displayText}
              {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
            </pre>
          )}
        </CardContent>
      </Card>

      {complianceReport && !isGenerating && (
        <div className="flex justify-end">
          <Button onClick={onNext} className="gap-2">
            前往导出
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StepCompliance;
