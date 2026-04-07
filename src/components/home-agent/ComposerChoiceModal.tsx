import { useId } from "react";
import { ComposerChoicePanel } from "./composer-choice-panel";
import type { ComposerQuestion } from "@/lib/home-agent/types";
import { cn } from "@/lib/utils";

interface ComposerChoiceModalProps {
  question: ComposerQuestion | null;
  onSelect: (value: string, label: string) => void;
  onConfirm?: () => void;
  onBack?: () => void;
  canConfirm?: boolean;
  tone?: "light" | "dark";
}

/**
 * Composer-anchored, non-blocking choice window for structured AskUserQuestion.
 * The panel is positioned directly above the composer so they stay visually connected.
 */
export default function ComposerChoiceModal({
  question,
  onSelect,
  onConfirm,
  onBack,
  canConfirm = false,
  tone = "dark",
}: ComposerChoiceModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  if (!question) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "pointer-events-auto absolute bottom-[calc(100%+6px)] left-0 z-[60] w-[min(96vw,540px)] overflow-visible border-0 bg-transparent p-0 shadow-none outline-none",
      )}
    >
      <div id={titleId} className="sr-only">{question.title}</div>
      {question.description ? (
        <div id={descriptionId} className="sr-only">{question.description}</div>
      ) : (
        <div id={descriptionId} className="sr-only">请选择一项以继续。</div>
      )}
      <div className="origin-bottom-left">
        <ComposerChoicePanel
          question={question}
          onSelect={onSelect}
          onConfirm={onConfirm}
          onBack={onBack}
          canConfirm={canConfirm}
          tone={tone}
        />
      </div>
    </div>
  );
}
