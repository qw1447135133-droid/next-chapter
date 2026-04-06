import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComposerQuestion } from "@/lib/home-agent/types";

export interface ComposerChoicePanelProps {
  question: ComposerQuestion;
  onSelect: (value: string, label: string) => void;
  onConfirm?: () => void;
  canConfirm?: boolean;
  tone?: "light" | "dark";
}

export function ComposerChoicePanel({
  question,
  onSelect,
  onConfirm,
  canConfirm = false,
  tone = "dark",
}: ComposerChoicePanelProps) {
  const dark = tone === "dark";
  const compactChoiceMode =
    !question.multiSelect &&
    question.submissionMode !== "confirm" &&
    question.options.length <= 4 &&
    question.options.every((option) => !option.rationale && option.label.trim().length <= 18);

  return (
    <div
      data-choice-mode={compactChoiceMode ? "chip" : "card"}
      className={`w-full ${compactChoiceMode ? "max-w-[600px]" : "max-w-[488px]"} rounded-[18px] border p-2 sm:p-2.5 ${
        dark
          ? "border-white/[0.05] bg-[linear-gradient(180deg,rgba(27,28,31,0.82),rgba(20,21,24,0.93))] shadow-[0_12px_30px_rgba(0,0,0,0.15)] backdrop-blur-xl"
          : "border-slate-200/80 bg-white/96 shadow-[0_10px_20px_rgba(148,163,184,0.11)]"
      }`}
    >
      <div className={`flex items-start gap-2.5 ${compactChoiceMode ? "mb-1.5" : "mb-2"}`}>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[12px] bg-[#0f62fe]/92 text-white shadow-[0_6px_14px_rgba(15,98,254,0.2)]">
          <Sparkles className="h-2.5 w-2.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2.5">
            <div className={`text-[12.5px] font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>{question.title}</div>
            {question.totalSteps > 1 ? (
              <div
                className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${
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
            <div className={`mt-0.5 text-[11px] leading-[1.55] ${dark ? "text-slate-400" : "text-slate-600"}`}>
              {question.description}
            </div>
          ) : null}
          <div className={`mt-1 text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
            {question.multiSelect
              ? "可多选。先点选建议，再补充输入。"
              : question.submissionMode === "confirm"
                ? "先选一个方向，再确认继续。"
                : "点任一建议即可直接提交。"}
          </div>
        </div>
      </div>

      {compactChoiceMode ? (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.value, option.label)}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-left text-[12px] font-medium transition-colors ${
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
              className={`group w-full rounded-[16px] border px-3 py-2 text-left transition-colors ${
                option.selected
                  ? "border-[#2a73ff]/40 bg-[#0f62fe]/16 text-white"
                  : dark
                    ? "border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08]"
                    : "border-slate-200 bg-slate-50 hover:bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`text-[12.5px] font-medium ${
                    option.selected ? "text-white" : dark ? "text-slate-100" : "text-slate-900"
                  }`}
                >
                  {option.label}
                </div>
                {option.selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : null}
              </div>
              {option.rationale ? (
                <div
                  className={`mt-0.5 text-[10px] leading-[1.45] ${
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
        <div className="mt-2.5 flex items-center justify-between gap-2.5">
          <div className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
            {question.allowCustomInput ? "也可在底部输入框补充说明。" : "如果不需要补充输入，可以直接继续。"}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full bg-[#0f62fe] px-3.5 text-[12px] text-white shadow-[0_8px_16px_rgba(15,98,254,0.16)] hover:bg-[#1b6fff]"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            继续
          </Button>
        </div>
      ) : question.allowCustomInput ? (
        <div className={`mt-2 text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
          也可在底部输入框填写自定义答案，不必受预设选项限制。
        </div>
      ) : null}
    </div>
  );
}
