import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComposerQuestion } from "@/lib/home-agent/types";
import { GENRES } from "@/types/drama";

export interface ComposerChoicePanelProps {
  question: ComposerQuestion;
  onSelect: (value: string, label: string) => void;
  onConfirm?: () => void;
  onBack?: () => void;
  canConfirm?: boolean;
  tone?: "light" | "dark";
}

/** Two-level genre picker: left column = categories, right panel = genres in selected category */
function GenreCategoryPicker({
  question,
  onSelect,
  dark,
}: {
  question: ComposerQuestion;
  onSelect: (value: string, label: string) => void;
  dark: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelListRef = useRef<HTMLDivElement | null>(null);
  const [rootTop, setRootTop] = useState(0);
  const [listHeight, setListHeight] = useState(0);
  const [parentHeight, setParentHeight] = useState(0);
  const [panelContentHeight, setPanelContentHeight] = useState(0);
  const selectedValues = useMemo(
    () => new Set(question.options.filter((o) => o.selected).map((o) => o.value)),
    [question.options],
  );

  const allowedValues = useMemo(
    () => new Set(question.options.map((o) => o.value)),
    [question.options],
  );

  const groupedGenres = useMemo(() => {
    const groups = new Map<string, Array<(typeof GENRES)[number]>>();
    for (const genre of GENRES) {
      if (!allowedValues.has(genre.value)) continue;
      const list = groups.get(genre.category) ?? [];
      list.push(genre);
      groups.set(genre.category, list);
    }
    return Array.from(groups.entries());
  }, [allowedValues]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const activeGenres = useMemo(
    () => groupedGenres.find(([cat]) => cat === activeCategory)?.[1] ?? [],
    [groupedGenres, activeCategory],
  );
  useEffect(() => {
    const rootNode = rootRef.current;
    const listNode = listRef.current;
    if (!rootNode || !listNode) return;

    const measure = () => {
      setRootTop(rootNode.offsetTop);
      setListHeight(listNode.offsetHeight);
      setParentHeight(rootNode.parentElement?.offsetHeight ?? 0);
      setPanelContentHeight(panelListRef.current?.scrollHeight ?? 0);
    };
    measure();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(rootNode);
      observer.observe(listNode);
      if (panelListRef.current) observer.observe(panelListRef.current);
      if (rootNode.parentElement) observer.observe(rootNode.parentElement);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeGenres.length]);

  const genrePanelMaxHeight = parentHeight > 0 ? parentHeight : rootTop + listHeight || 260;
  const genrePanelChromeHeight = 4;
  const genrePanelListMaxHeight = Math.max(180, genrePanelMaxHeight - genrePanelChromeHeight);
  const genrePanelListHeight =
    panelContentHeight > 0
      ? Math.min(panelContentHeight, genrePanelListMaxHeight)
      : undefined;
  const genrePanelHeight =
    genrePanelListHeight !== undefined
      ? Math.min(genrePanelListHeight + genrePanelChromeHeight, genrePanelMaxHeight)
      : undefined;
  const genrePanelTop = -rootTop;

  return (
    <div ref={rootRef} data-testid="genre-picker-root" className="relative">
      {/* Level 1: category list — same width as the panel */}
      <div ref={listRef} data-testid="genre-primary-list" className="flex flex-col gap-1.5">
        {groupedGenres.map(([category]) => {
          const isActive = activeCategory === category;
          const selectedInCategory = groupedGenres
            .find(([c]) => c === category)?.[1]
            .filter((g) => selectedValues.has(g.value)).length ?? 0;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(isActive ? null : category)}
              className={`flex min-h-[46px] w-full items-center justify-between rounded-[16px] border px-3.5 py-2.5 text-left transition-colors ${
                isActive
                  ? dark
                    ? "border-white/[0.14] bg-white/[0.1]"
                    : "border-slate-300 bg-slate-100"
                  : dark
                    ? "border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08]"
                    : "border-slate-200 bg-slate-50 hover:bg-white"
              }`}
            >
              <span className={`text-[13px] font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>
                {category}
              </span>
              {selectedInCategory > 0 && (
                <span className="ml-2 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#0f62fe] px-1 text-[9px] font-medium text-white">
                  {selectedInCategory}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Level 2: genre panel — floats to the right of the main panel */}
      {activeCategory !== null && (
        <div
          data-testid="genre-secondary-panel"
          className={`absolute left-[calc(100%+8px)] z-10 w-[224px] overflow-hidden rounded-[13px] border px-1 pb-1 pt-0 ${
            dark
              ? "border-white/[0.05] bg-[linear-gradient(180deg,rgba(25,26,29,0.92),rgba(21,22,25,0.95))] shadow-[0_8px_18px_rgba(0,0,0,0.16)] backdrop-blur-md"
              : "border-slate-200/85 bg-white/98 shadow-[0_6px_16px_rgba(148,163,184,0.12)]"
          }`}
          style={{
            top: `${genrePanelTop}px`,
            height: genrePanelHeight ? `${genrePanelHeight}px` : undefined,
            maxHeight: `${genrePanelMaxHeight}px`,
          }}
        >
          <div
            ref={panelListRef}
            data-testid="genre-secondary-list"
            className="flex flex-col gap-1.5 overflow-y-auto scrollbar-none"
            style={{
              height: genrePanelListHeight ? `${genrePanelListHeight}px` : undefined,
              maxHeight: `${genrePanelListMaxHeight}px`,
            }}
          >
            {activeGenres.map((genre) => {
              const isSelected = selectedValues.has(genre.value);
              return (
                <button
                  key={genre.value}
                  type="button"
                  onClick={() => onSelect(genre.value, genre.label)}
                  className={`w-full shrink-0 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-[#2a73ff]/34 bg-[#0f62fe]/14"
                      : dark
                        ? "border-white/[0.04] bg-white/[0.025] hover:bg-white/[0.055]"
                        : "border-slate-200/90 bg-slate-50/90 hover:bg-white"
                  } min-h-[66px]`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span
                      className={`line-clamp-1 text-[11.5px] font-medium leading-tight ${isSelected ? "text-white" : dark ? "text-slate-100" : "text-slate-900"}`}
                    >
                      {genre.label}
                    </span>
                    {isSelected && <Check className="mt-0.5 h-3 w-3 shrink-0 text-white" />}
                  </div>
                  <div
                    className={`mt-0.5 line-clamp-2 text-[9.5px] leading-[1.3] ${isSelected ? "text-white/62" : dark ? "text-slate-500" : "text-slate-500"}`}
                  >
                    {genre.desc}
                    <span className={`ml-1 ${isSelected ? "text-white/42" : dark ? "text-slate-600" : "text-slate-400"}`}>
                      受众：{genre.audience}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ComposerChoicePanel({
  question,
  onSelect,
  onConfirm,
  onBack,
  canConfirm = false,
  tone = "dark",
}: ComposerChoicePanelProps) {
  const dark = tone === "dark";
  const [collapsed, setCollapsed] = useState(false);
  const isGenreQuestion = question.answerKey === "题材选择";
  const autoCompactChoiceMode =
    !isGenreQuestion &&
    !question.multiSelect &&
    question.submissionMode !== "confirm" &&
    question.options.length <= 4 &&
    question.options.every((option) => !option.rationale && option.label.trim().length <= 18);
  const compactChoiceMode =
    question.presentation === "chip"
      ? true
      : question.presentation === "card"
        ? false
        : autoCompactChoiceMode;
  const helperCopy = question.multiSelect
    ? "可多选。先点选建议，再补充输入。"
    : question.submissionMode === "confirm"
      ? question.options.length === 1
        ? "确认后直接执行。"
        : "先选一个方向，再确认继续。"
      : "点任一建议即可直接提交。";
  const bottomHint =
    question.submissionMode === "confirm" || question.multiSelect
      ? question.allowCustomInput
        ? "也可在底部输入框补充说明。"
        : "如果不需要补充输入，可以直接继续。"
      : question.allowCustomInput
        ? "也可在底部输入框填写自定义答案，不必受预设选项限制。"
        : null;
  const isSingleActionCard =
    !compactChoiceMode &&
    !question.multiSelect &&
    question.submissionMode === "confirm" &&
    question.options.length === 1;
  const useRelaxedCardListHeight = !compactChoiceMode && question.options.length <= 2;
  const useRelaxedPanelSpacing = !compactChoiceMode && question.options.length <= 2;

  useEffect(() => {
    setCollapsed(false);
  }, [question.id]);

  return (
    <div
      data-choice-mode={compactChoiceMode ? "chip" : "card"}
      className={`w-full max-w-[488px] rounded-[18px] border p-2 sm:p-2.5 ${
        dark
          ? "border-white/[0.05] bg-[linear-gradient(180deg,rgba(27,28,31,0.82),rgba(20,21,24,0.93))] shadow-[0_12px_30px_rgba(0,0,0,0.15)] backdrop-blur-xl"
          : "border-slate-200/80 bg-white/96 shadow-[0_10px_20px_rgba(148,163,184,0.11)]"
      } transition-[border-color,background-color,box-shadow] duration-150 ${
        collapsed ? "" : isGenreQuestion ? "" : "max-h-[min(64vh,760px)] overflow-y-auto scrollbar-none"
      }`}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className={`flex w-full items-center justify-between rounded-[14px] border px-3 py-2.5 text-left transition-colors ${
            dark
              ? "border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.07]"
              : "border-slate-200 bg-slate-50 hover:bg-white"
          }`}
          aria-label={`展开选择窗：${question.title}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[12px] bg-[#0f62fe]/92 text-white shadow-[0_6px_14px_rgba(15,98,254,0.2)]">
              <Sparkles className="h-2.5 w-2.5" />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-[12.5px] font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>
                {question.title}
              </span>
              {question.totalSteps > 1 ? (
                <span className={`mt-0.5 block text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>
                  第 {question.stepIndex + 1} / {question.totalSteps} 步
                </span>
              ) : null}
            </span>
          </span>
          <span className="ml-3 inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
            展开
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
      ) : (
        <>
      <div className="mb-2 flex items-start gap-2.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[12px] transition-colors ${
              dark ? "text-slate-400 hover:bg-white/[0.08] hover:text-slate-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
            aria-label="返回上一步"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[12px] bg-[#0f62fe]/92 text-white shadow-[0_6px_14px_rgba(15,98,254,0.2)]">
            <Sparkles className="h-2.5 w-2.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2.5">
            <div className={`min-h-[18px] text-[12.5px] font-medium ${dark ? "text-slate-100" : "text-slate-900"}`}>
              {question.title}
            </div>
            {question.totalSteps > 1 ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <div
                  className={`rounded-full px-1.5 py-0.5 text-[9.5px] ${
                    dark
                      ? "border border-white/[0.08] bg-white/[0.05] text-slate-400"
                      : "border border-slate-200 bg-slate-100 text-slate-500"
                  }`}
                >
                  第 {question.stepIndex + 1} / {question.totalSteps} 步
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
                    dark ? "text-slate-500 hover:bg-white/[0.08] hover:text-slate-300" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                  aria-label="收起选择窗"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                  dark ? "text-slate-500 hover:bg-white/[0.08] hover:text-slate-300" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
                aria-label="收起选择窗"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="mt-0.5">
            <div
              className={`${useRelaxedPanelSpacing ? "min-h-[18px]" : "min-h-[34px]"} text-[11px] leading-[1.55] ${dark ? "text-slate-400" : "text-slate-600"}`}
            >
              {question.description ?? ""}
            </div>
            <div
              className={`mt-1 ${useRelaxedPanelSpacing ? "min-h-[12px]" : "min-h-[15px]"} text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}
            >
              {helperCopy}
            </div>
          </div>
        </div>
      </div>

      {isGenreQuestion ? (
        <GenreCategoryPicker question={question} onSelect={onSelect} dark={dark} />
      ) : compactChoiceMode ? (
        <div className="flex min-h-[44px] flex-wrap gap-1.5">
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
        <div
          className={
            isSingleActionCard || useRelaxedCardListHeight
              ? "space-y-1.5"
              : "min-h-[156px] space-y-1.5"
          }
        >
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

      <div
        className={
          isSingleActionCard || useRelaxedPanelSpacing ? "mt-1.5" : "mt-2 min-h-[42px]"
        }
      >
        {(question.submissionMode === "confirm" || question.multiSelect) && onConfirm ? (
          <div className="flex items-center justify-between gap-2.5">
            <div className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>{bottomHint}</div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full bg-[#0f62fe] px-3.5 text-[12px] text-white shadow-[0_8px_16px_rgba(15,98,254,0.16)] hover:bg-[#1b6fff]"
              onClick={onConfirm}
              disabled={!canConfirm}
            >
              {question.options.length === 1 && !question.multiSelect ? "确认执行" : "继续"}
            </Button>
          </div>
        ) : bottomHint ? (
          <div className={`pt-1 text-[10px] ${dark ? "text-slate-500" : "text-slate-500"}`}>{bottomHint}</div>
        ) : null}
      </div>
        </>
      )}
    </div>
  );
}
