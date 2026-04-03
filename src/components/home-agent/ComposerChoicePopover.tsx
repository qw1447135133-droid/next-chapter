import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComposerQuestion } from "@/lib/home-agent/types";

interface ComposerChoicePopoverProps {
  question: ComposerQuestion | null;
  onSelect: (value: string, label: string) => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
  tone?: "light" | "dark";
}

export default function ComposerChoicePopover({
  question,
  onSelect,
  onConfirm,
  canConfirm = false,
  tone = "dark",
}: ComposerChoicePopoverProps) {
  const dark = tone === "dark";
  const compactChoiceMode =
    !!question &&
    !question.multiSelect &&
    question.submissionMode !== "confirm" &&
    question.options.length <= 4 &&
    question.options.every((option) => !option.rationale && option.label.trim().length <= 18);

  return (
    <AnimatePresence>
      {question ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 bottom-[calc(100%+10px)] z-20"
        >
          <div className="flex justify-start">
            <div
              data-choice-mode={compactChoiceMode ? "chip" : "card"}
              className={`w-full ${compactChoiceMode ? "max-w-[700px]" : "max-w-[560px]"} rounded-[22px] border p-2.5 sm:p-3 ${
                dark
                  ? "border-white/[0.06] bg-[linear-gradient(180deg,rgba(27,28,31,0.86),rgba(20,21,24,0.94))] shadow-[0_16px_42px_rgba(0,0,0,0.18)] backdrop-blur-xl"
                  : "border-slate-200/80 bg-white/96 shadow-[0_14px_30px_rgba(148,163,184,0.14)]"
              }`}
            >
              <div className={`flex items-start gap-3 ${compactChoiceMode ? "mb-2" : "mb-2.5"}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[14px] bg-[#0f62fe]/92 text-white shadow-[0_8px_18px_rgba(15,98,254,0.22)]">
                  <Sparkles className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-[13px] font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>
                      {question.title}
                    </div>
                    {question.totalSteps > 1 ? (
                      <div
                        className={`rounded-full px-2 py-1 text-[10px] ${
                          dark
                            ? "border border-white/[0.08] bg-white/[0.05] text-slate-400"
                            : "border border-slate-200 bg-slate-100 text-slate-500"
                        }`}
                      >
                        第 {question.stepIndex + 1} / {question.totalSteps} 步
                      </div>
                    ) : null}
                  </div>
                  {question.description ? (
                    <div className={`mt-1 text-[11.5px] leading-5 ${dark ? "text-slate-400" : "text-slate-600"}`}>
                      {question.description}
                    </div>
                  ) : null}
                  <div className={`mt-1.5 text-[10.5px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
                    {question.multiSelect
                      ? "可多选。先点选建议，再补充输入。"
                      : question.submissionMode === "confirm"
                        ? "先选一个方向，再确认继续。"
                        : "点任一建议即可直接提交。"}
                  </div>
                </div>
              </div>

              {compactChoiceMode ? (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelect(option.value, option.label)}
                      className={`inline-flex min-h-10 items-center rounded-full border px-3.5 py-2 text-left text-[12.5px] font-medium transition-colors ${
                        option.selected
                          ? "border-[#2a73ff] bg-[#0f62fe]/18 text-white shadow-[0_8px_16px_rgba(15,98,254,0.12)]"
                          : dark
                            ? "border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]"
                            : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-white"
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelect(option.value, option.label)}
                      className={`group w-full rounded-[18px] border px-3.5 py-2.5 text-left transition-colors ${
                        option.selected
                          ? "border-[#2a73ff]/40 bg-[#0f62fe]/16 text-white"
                          : dark
                            ? "border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08]"
                            : "border-slate-200 bg-slate-50 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={`text-[13px] font-medium ${
                            option.selected ? "text-white" : dark ? "text-slate-100" : "text-slate-900"
                          }`}
                        >
                          {option.label}
                        </div>
                        {option.selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                      </div>
                      {option.rationale ? (
                        <div
                          className={`mt-1 text-[10.5px] leading-4.5 ${
                            option.selected ? "text-white/78" : dark ? "text-slate-500" : "text-slate-500"
                          }`}
                        >
                          {option.rationale}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}

              {(question.submissionMode === "confirm" || question.multiSelect) && onConfirm ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className={`text-[10.5px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
                    {question.allowCustomInput ? "也可以直接在下方输入补充说明。" : "如果不需要补充输入，可以直接继续。"}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-[#0f62fe] px-4 text-white shadow-[0_8px_16px_rgba(15,98,254,0.18)] hover:bg-[#1b6fff]"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                  >
                    继续
                  </Button>
                </div>
              ) : question.allowCustomInput ? (
                <div className={`mt-2.5 text-[10.5px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
                  也可以直接在下方输入自定义答案，不必受预设选项限制。
                </div>
              ) : null}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
