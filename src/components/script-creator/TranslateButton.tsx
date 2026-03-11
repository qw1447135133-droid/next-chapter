import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";

interface TranslateButtonProps {
  text: string;
  disabled?: boolean;
}

/**
 * Shared translation button for non-Chinese scripts.
 * Stores translated lines in state. Renders interleaved original + translated view.
 */
export function useTranslation() {
  const [translatedMap, setTranslatedMap] = useState<Map<string, string[]>>(new Map());
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const translate = async (text: string) => {
    if (!text.trim()) return;

    // If already translated this exact text, just toggle
    if (translatedMap.has(text)) {
      setShowTranslation((v) => !v);
      return;
    }

    setIsTranslating(true);
    setShowTranslation(true);
    abortRef.current = new AbortController();

    try {
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const prompt = `你是一位专业的翻译。请将以下外语文本逐行翻译为中文。
规则：
1. 保持原文的行结构，每一行对应翻译一行
2. 空行保持为空行
3. 只输出翻译结果，不要添加任何解释
4. 保留标题标记（如 ## # 等）
5. 保留特殊符号（如 🔥 ⚡ 💰 ⛔ ⚠️ ℹ️ 等）

原文：
${text}`;

      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );

      const translatedLines = finalText.split("\n");
      setTranslatedMap((prev) => new Map(prev).set(text, translatedLines));
      toast({ title: "翻译完成" });
    } catch (e: any) {
      if (e?.message?.includes("取消")) {
        toast({ title: "已停止翻译" });
      } else {
        toast({ title: "翻译失败", description: e?.message, variant: "destructive" });
      }
      setShowTranslation(false);
    } finally {
      setIsTranslating(false);
      abortRef.current = null;
    }
  };

  const clearTranslation = () => {
    setShowTranslation(false);
    setTranslatedMap(new Map());
  };

  return {
    isTranslating,
    showTranslation,
    translate,
    clearTranslation,
    translatedMap,
  };
}

/** Render interleaved original + translated lines */
export function InterleavedText({
  text,
  translatedLines,
}: {
  text: string;
  translatedLines: string[];
}) {
  const originalLines = text.split("\n");

  return (
    <div className="space-y-0">
      {originalLines.map((line, i) => (
        <div key={i}>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 m-0">
            {line || "\u00A0"}
          </pre>
          {translatedLines[i] !== undefined && translatedLines[i].trim() !== "" && (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-muted-foreground m-0 bg-muted/50 px-2 rounded-sm">
              {translatedLines[i]}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

/** Translation toggle button */
export function TranslateToggle({
  isNonChinese,
  isTranslating,
  showTranslation,
  onTranslate,
  onClear,
  disabled,
}: {
  isNonChinese: boolean;
  isTranslating: boolean;
  showTranslation: boolean;
  onTranslate: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  if (!isNonChinese) return null;

  return isTranslating ? (
    <Button variant="outline" size="sm" disabled className="gap-1.5">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      翻译中…
    </Button>
  ) : showTranslation ? (
    <Button variant="outline" size="sm" onClick={onClear} className="gap-1.5">
      <X className="h-3.5 w-3.5" />
      关闭翻译
    </Button>
  ) : (
    <Button
      variant="outline"
      size="sm"
      onClick={onTranslate}
      disabled={disabled}
      className="gap-1.5"
    >
      <Languages className="h-3.5 w-3.5" />
      翻译
    </Button>
  );
}

/** Detect if text is primarily non-Chinese */
export function isNonChineseText(text: string): boolean {
  if (!text || text.length < 20) return false;
  const sample = text.slice(0, 500);
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const ratio = chineseChars / sample.length;
  return ratio < 0.15;
}
