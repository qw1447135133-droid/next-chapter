import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Languages, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { callGeminiStream } from "@/lib/gemini-client";

const TRANSLATION_CACHE_KEY = "storyforge_translation_cache";
const MAX_CACHE_ENTRIES = 30;

/** Simple hash for cache key */
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

/** Read cache from localStorage */
function readCache(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(TRANSLATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Write cache to localStorage, evicting old entries */
function writeCache(cache: Record<string, string[]>) {
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES) {
    // Remove oldest entries (first inserted)
    const toRemove = keys.slice(0, keys.length - MAX_CACHE_ENTRIES);
    for (const k of toRemove) delete cache[k];
  }
  try {
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full, clear and retry
    localStorage.removeItem(TRANSLATION_CACHE_KEY);
  }
}

/**
 * Shared translation hook with localStorage caching.
 */
export function useTranslation() {
  const [translatedMap, setTranslatedMap] = useState<Map<string, string[]>>(() => {
    // Pre-load from localStorage cache
    return new Map();
  });
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const translate = async (text: string) => {
    if (!text.trim()) return;

    const key = hashText(text);

    // Check in-memory first
    if (translatedMap.has(key)) {
      setShowTranslation((v) => !v);
      return;
    }

    // Check localStorage cache
    const cache = readCache();
    if (cache[key]) {
      const cached = cache[key];
      setTranslatedMap((prev) => new Map(prev).set(key, cached));
      setShowTranslation(true);
      toast({ title: "翻译已加载（缓存）" });
      return;
    }

    setIsTranslating(true);
    setShowTranslation(true);
    abortRef.current = new AbortController();

    try {
      const model = localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview";
      const originalLines = text.split("\n");

      // Build numbered lines for strict 1:1 alignment
      const numberedText = originalLines
        .map((line, i) => `[${i + 1}] ${line}`)
        .join("\n");

      const prompt = `你是一位专业的翻译。请将以下外语文本逐行翻译为中文。

## 严格规则
1. 原文共 ${originalLines.length} 行，你必须输出恰好 ${originalLines.length} 行翻译
2. 每行格式为 [行号] 翻译内容，例如 [1] 这是翻译
3. 空行也要保留，输出 [行号]（后面留空）
4. 保留 Markdown 标记（## # ** 等）
5. 保留特殊符号（🔥 ⚡ 💰 ⛔ ⚠️ ℹ️ 等）
6. 只输出翻译行，不要输出任何解释或额外文字

## 原文（${originalLines.length} 行）
${numberedText}`;

      const finalText = await callGeminiStream(
        model,
        [{ role: "user", parts: [{ text: prompt }] }],
        () => {},
        { maxOutputTokens: 8192 },
        abortRef.current.signal,
      );

      // Parse numbered output back to array, aligned to original line count
      const resultLines = new Array<string>(originalLines.length).fill("");
      const outputLines = finalText.split("\n");

      for (const line of outputLines) {
        const match = line.match(/^\[(\d+)\]\s?(.*)/);
        if (match) {
          const idx = parseInt(match[1]) - 1;
          if (idx >= 0 && idx < originalLines.length) {
            resultLines[idx] = match[2] || "";
          }
        }
      }

      // Save to in-memory and localStorage
      setTranslatedMap((prev) => new Map(prev).set(key, resultLines));
      const updatedCache = readCache();
      updatedCache[key] = resultLines;
      writeCache(updatedCache);

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
  };

  /** Get translated lines for a text (by hash) */
  const getTranslation = (text: string): string[] | undefined => {
    return translatedMap.get(hashText(text));
  };

  /** Check if translation exists for text */
  const hasTranslation = (text: string): boolean => {
    return translatedMap.has(hashText(text));
  };

  return {
    isTranslating,
    showTranslation,
    translate,
    clearTranslation,
    getTranslation,
    hasTranslation,
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
    <div>
      {originalLines.map((line, i) => (
        <div key={i}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 py-0.5">
            {line || "\u00A0"}
          </div>
          {translatedLines[i] !== undefined && translatedLines[i].trim() !== "" && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-sm mb-1">
              {translatedLines[i]}
            </div>
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
