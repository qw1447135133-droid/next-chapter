import * as React from "react";
import type { CreationGuideDimensionId } from "@/lib/home-agent/creation-guide-presets";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  isCreationGuideAssistantMessage,
  splitCreationGuideContent,
} from "@/lib/home-agent/creation-guide-presets";
import { cn } from "@/lib/utils";
import GuidePresetPickerModal from "./GuidePresetPickerModal";

const { memo, useCallback, useEffect, useRef, useState } = React;

export interface AssistantCreationGuideBodyProps {
  content: string;
  /** Stable id so a “创作起点” message can auto-open the preset modal once. */
  messageId?: string;
  /** Only true for the latest assistant bubble when not streaming (avoids popups when scrolling history). */
  autoOpenPresetPicker?: boolean;
  /** When false, chips open the picker; plain text only if handler missing. */
  onCreationGuidePick?: (dimension: CreationGuideDimensionId, value: string, label: string) => void;
  picksDisabled?: boolean;
  className?: string;
}

export const AssistantCreationGuideBody = memo(function AssistantCreationGuideBody({
  content,
  messageId,
  autoOpenPresetPicker,
  onCreationGuidePick,
  picksDisabled,
  className,
}: AssistantCreationGuideBodyProps) {
  const [pickerDimension, setPickerDimension] = useState<CreationGuideDimensionId | null>(null);
  const autoOpenedIdsRef = useRef<Set<string>>(new Set());

  const interactive = Boolean(onCreationGuidePick) && isCreationGuideAssistantMessage(content) && !picksDisabled;
  const parts = interactive ? splitCreationGuideContent(content) : [{ type: "text" as const, text: content }];

  /** Auto-open the theme preset modal once per message when this row is the current reply (matches full-screen preset UX). */
  useEffect(() => {
    if (!autoOpenPresetPicker || !messageId || !interactive || picksDisabled) return;
    if (autoOpenedIdsRef.current.has(messageId)) return;
    autoOpenedIdsRef.current.add(messageId);
    setPickerDimension("theme");
  }, [autoOpenPresetPicker, messageId, interactive, picksDisabled]);

  const openPicker = useCallback(
    (dimension: CreationGuideDimensionId) => {
      if (!onCreationGuidePick || picksDisabled) return;
      setPickerDimension(dimension);
    },
    [onCreationGuidePick, picksDisabled],
  );

  if (!interactive) {
    return (
      <div
        className={cn(
          "break-words text-[14px] leading-[1.82] tracking-[0.002em] sm:text-[14.5px] sm:leading-[1.86]",
          className,
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mb-2.5 mt-3.5 text-[19px] font-semibold text-white/92">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-2 mt-3.5 text-[17px] font-semibold text-white/90">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-white/88">{children}</h3>,
            p: ({ children }) => <p className="mb-3 whitespace-pre-wrap text-white/82 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5.5 text-white/82">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5.5 text-white/82">{children}</ol>,
            li: ({ children }) => <li className="leading-[1.8]">{children}</li>,
            hr: () => <hr className="my-3.5 border-white/[0.12]" />,
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto rounded-[12px] border border-white/[0.1]">
                <table className="w-full border-collapse text-left text-[13px]">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-white/[0.04] text-white/86">{children}</thead>,
            tbody: ({ children }) => <tbody className="text-white/80">{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-white/[0.1] last:border-b-0">{children}</tr>,
            th: ({ children }) => <th className="px-3 py-2.5 font-medium">{children}</th>,
            td: ({ children }) => <td className="px-3 py-2.5 align-top">{children}</td>,
            code: ({ inline, children }) =>
              inline ? (
                <code className="rounded bg-white/[0.1] px-1.5 py-0.5 font-mono text-[0.92em] text-white/90">{children}</code>
              ) : (
                <code className="block whitespace-pre-wrap rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-2.5 font-mono text-[12.5px] leading-[1.7] text-white/82">
                  {children}
                </code>
              ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "break-words text-[14px] leading-[1.82] tracking-[0.002em] sm:text-[14.5px] sm:leading-[1.86]",
          className,
        )}
      >
        {parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <span key={index} className="whitespace-pre-wrap">
                {part.text}
              </span>
            );
          }
          return (
            <button
              key={index}
              type="button"
              className="mx-0.5 inline align-baseline text-white/88 underline decoration-[#38bdf8]/55 decoration-1 underline-offset-4 transition hover:text-[#7dd3fc] hover:decoration-[#7dd3fc]/80"
              onClick={() => openPicker(part.dimension)}
            >
              {part.label}
            </button>
          );
        })}
      </div>
      <GuidePresetPickerModal
        dimension={pickerDimension}
        onClose={() => setPickerDimension(null)}
        onPick={(dimension, value, label) => {
          onCreationGuidePick?.(dimension, value, label);
        }}
      />
    </>
  );
});
