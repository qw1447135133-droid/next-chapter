import { AnimatePresence, motion } from "framer-motion";
import type { ComposerQuestion } from "@/lib/home-agent/types";
import { ComposerChoicePanel } from "./composer-choice-panel";

interface ComposerChoicePopoverProps {
  question: ComposerQuestion | null;
  onSelect: (value: string, label: string) => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
  tone?: "light" | "dark";
}

/** Inline popover variant; home composer uses `ComposerChoiceModal` instead. */
export default function ComposerChoicePopover({
  question,
  onSelect,
  onConfirm,
  canConfirm = false,
  tone = "dark",
}: ComposerChoicePopoverProps) {
  return (
    <AnimatePresence>
      {question ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 bottom-[calc(100%+6px)] z-20"
        >
          <div className="flex justify-start">
            <ComposerChoicePanel
              question={question}
              onSelect={onSelect}
              onConfirm={onConfirm}
              canConfirm={canConfirm}
              tone={tone}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
