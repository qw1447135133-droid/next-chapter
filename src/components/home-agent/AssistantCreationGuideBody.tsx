import * as React from "react";
import type { CreationGuideDimensionId } from "@/lib/home-agent/creation-guide-presets";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown } from "lucide-react";
import {
  isCreationGuideAssistantMessage,
  splitCreationGuideContent,
} from "@/lib/home-agent/creation-guide-presets";
import { stripHiddenThoughtBlocks } from "./home-agent-protocol-utils";
import { splitAssistantMessageSections } from "@/lib/home-agent/assistant-message-sections";
import { cn } from "@/lib/utils";
import GuidePresetPickerModal from "./GuidePresetPickerModal";

const { memo, useCallback, useEffect, useRef, useState } = React;

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-2.5 mt-3.5 text-[19px] font-semibold text-white/92">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-3.5 text-[17px] font-semibold text-white/90">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-1.5 mt-3 text-[15px] font-semibold text-white/88">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 whitespace-pre-wrap text-white/82 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-3 list-disc space-y-1.5 pl-5.5 text-white/82">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5.5 text-white/82">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="leading-[1.8]">{children}</li>,
  hr: () => <hr className="my-3.5 border-white/[0.12]" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-[12px] border border-white/[0.1]">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <thead className="bg-white/[0.04] text-white/86">{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody className="text-white/80">{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => <tr className="border-b border-white/[0.1] last:border-b-0">{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => <th className="px-3 py-2.5 font-medium">{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td className="px-3 py-2.5 align-top">{children}</td>,
  code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
    inline ? (
      <code className="rounded bg-white/[0.1] px-1.5 py-0.5 font-mono text-[0.92em] text-white/90">{children}</code>
    ) : (
      <code className="block whitespace-pre-wrap rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-2.5 font-mono text-[12.5px] leading-[1.7] text-white/82">
        {children}
      </code>
    ),
};

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
}

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
  const sanitizedContent = stripHiddenThoughtBlocks(content);
  const [pickerDimension, setPickerDimension] = useState<CreationGuideDimensionId | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const autoOpenedIdsRef = useRef<Set<string>>(new Set());

  const interactive = Boolean(onCreationGuidePick) && isCreationGuideAssistantMessage(sanitizedContent) && !picksDisabled;
  const parts = interactive ? splitCreationGuideContent(sanitizedContent) : [{ type: "text" as const, text: sanitizedContent }];
  const sectionedMessage = !interactive ? splitAssistantMessageSections(sanitizedContent) : null;

  /** Auto-open the theme preset modal once per message when this row is the current reply (matches full-screen preset UX). */
  useEffect(() => {
    if (!autoOpenPresetPicker || !messageId || !interactive || picksDisabled) return;
    if (autoOpenedIdsRef.current.has(messageId)) return;
    autoOpenedIdsRef.current.add(messageId);
    setPickerDimension("theme");
  }, [autoOpenPresetPicker, messageId, interactive, picksDisabled]);

  useEffect(() => {
    setCollapsedSections({});
  }, [sanitizedContent]);

  const openPicker = useCallback(
    (dimension: CreationGuideDimensionId) => {
      if (!onCreationGuidePick || picksDisabled) return;
      setPickerDimension(dimension);
    },
    [onCreationGuidePick, picksDisabled],
  );

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  if (!interactive) {
    return (
      <div
        className={cn(
          "break-words text-[14px] leading-[1.82] tracking-[0.002em] sm:text-[14.5px] sm:leading-[1.86]",
          className,
        )}
      >
        {sectionedMessage && sectionedMessage.sections.length > 0 ? (
          <>
            {sectionedMessage.lead ? <AssistantMarkdown content={sectionedMessage.lead} /> : null}
            <div className="space-y-1.5">
              {sectionedMessage.sections.map((section) => {
                const collapsed = Boolean(collapsedSections[section.id]);
                return (
                  <section
                    key={section.id}
                    className="border-b border-white/[0.06] pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <button
                      type="button"
                      className="group flex w-full items-center gap-2 px-0 py-2 text-left text-white/88 transition-colors hover:text-white"
                      aria-expanded={!collapsed}
                      aria-controls={`${section.id}-body`}
                      onClick={() => toggleSection(section.id)}
                    >
                      <ChevronDown
                        className={cn(
                          "mt-[1px] h-3.5 w-3.5 shrink-0 text-white/34 transition-all duration-200 ease-out group-hover:text-white/58",
                          collapsed ? "-rotate-90" : "rotate-0",
                        )}
                      />
                      <span className="text-[14.5px] font-medium leading-6 tracking-[0.01em]">{section.heading}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {!collapsed ? (
                        <motion.div
                          id={`${section.id}-body`}
                          initial={{ opacity: 0, height: 0, y: -4 }}
                          animate={{ opacity: 1, height: "auto", y: 0 }}
                          exit={{ opacity: 0, height: 0, y: -4 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pl-[1.35rem] pr-0 pb-2 pt-0.5">
                            <AssistantMarkdown content={section.body} />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          <AssistantMarkdown content={sanitizedContent} />
        )}
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
