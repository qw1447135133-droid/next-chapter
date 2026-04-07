import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  if (!question) return null;

  return (
    <DialogPrimitive.Root open modal={false}>
      <DialogPrimitive.Content
        className={cn(
          "absolute bottom-[calc(100%+6px)] left-0 z-[60] w-[min(96vw,540px)] overflow-visible border-0 bg-transparent p-0 shadow-none outline-none",
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogPrimitive.Title className="sr-only">{question.title}</DialogPrimitive.Title>
        {question.description ? (
          <DialogPrimitive.Description className="sr-only">{question.description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">请选择一项以继续。</DialogPrimitive.Description>
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
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
