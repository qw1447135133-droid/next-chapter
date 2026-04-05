import * as React from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import type { HomeAgentTextModelGroup } from "@/lib/home-agent/text-models";
import { cn } from "@/lib/utils";

const { memo, useEffect, useMemo, useRef, useState } = React;

type PopupPosition = {
  provider: React.CSSProperties;
  models: React.CSSProperties;
};

const POPUP_GAP = 12;
const PROVIDER_PANEL_WIDTH = 236;
const MODEL_PANEL_WIDTH = 336;
const VIEWPORT_MARGIN = 16;

export interface HomeTextModelPickerProps {
  activeTheme: boolean;
  selectedKey: string;
  selectedLabel: string;
  groups: HomeAgentTextModelGroup[];
  onSelect: (key: string) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildPopupPosition(anchorRect: DOMRect | null): PopupPosition {
  if (!anchorRect || typeof window === "undefined") {
    return {
      provider: { left: VIEWPORT_MARGIN, bottom: VIEWPORT_MARGIN },
      models: { left: VIEWPORT_MARGIN + PROVIDER_PANEL_WIDTH + 8, bottom: VIEWPORT_MARGIN },
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const providerLeft = clamp(
    anchorRect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - PROVIDER_PANEL_WIDTH - VIEWPORT_MARGIN),
  );
  const providerTop = clamp(
    anchorRect.top - POPUP_GAP - 260,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportHeight - 260 - VIEWPORT_MARGIN),
  );

  let modelsLeft = providerLeft + PROVIDER_PANEL_WIDTH + 8;
  if (modelsLeft + MODEL_PANEL_WIDTH + VIEWPORT_MARGIN > viewportWidth) {
    modelsLeft = providerLeft - MODEL_PANEL_WIDTH - 8;
  }
  modelsLeft = clamp(
    modelsLeft,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - MODEL_PANEL_WIDTH - VIEWPORT_MARGIN),
  );

  const modelsTop = clamp(
    providerTop,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportHeight - 320 - VIEWPORT_MARGIN),
  );

  return {
    provider: {
      left: providerLeft,
      top: providerTop,
    },
    models: {
      left: modelsLeft,
      top: modelsTop,
    },
  };
}

export const HomeTextModelPicker = memo(function HomeTextModelPicker({
  activeTheme,
  selectedKey,
  selectedLabel,
  groups,
  onSelect,
}: HomeTextModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<HomeAgentTextModelGroup["provider"] | null>(null);
  const [positions, setPositions] = useState<PopupPosition>(() => buildPopupPosition(null));
  const shellRef = useRef<HTMLDivElement | null>(null);
  const providerPanelRef = useRef<HTMLDivElement | null>(null);
  const modelsPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.options.some((option) => option.key === selectedKey)) ?? groups[0] ?? null,
    [groups, selectedKey],
  );
  const activeGroup = useMemo(
    () => groups.find((group) => group.provider === activeProvider) ?? selectedGroup,
    [activeProvider, groups, selectedGroup],
  );

  const selectedSummary = useMemo(() => {
    if (!selectedGroup) return selectedLabel;
    const option = selectedGroup.options.find((item) => item.key === selectedKey);
    return option ? `${selectedGroup.supplierLabel} / ${option.shortLabel}` : selectedLabel;
  }, [selectedGroup, selectedKey, selectedLabel]);

  useEffect(() => {
    if (!open || !selectedGroup) return;
    setActiveProvider((current) => current ?? selectedGroup.provider);
  }, [open, selectedGroup]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchorRect = shellRef.current?.getBoundingClientRect() ?? null;
      setPositions(buildPopupPosition(anchorRect));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        shellRef.current?.contains(target) ||
        providerPanelRef.current?.contains(target) ||
        modelsPanelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={shellRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-9 max-w-[min(44vw,220px)] items-center gap-2 rounded-full border px-3 text-[12px] transition sm:h-10",
          activeTheme
            ? "border-white/[0.06] bg-white/[0.05] text-white/82 hover:bg-white/[0.08]"
            : "border-black/10 bg-black/[0.04] text-slate-800 hover:bg-black/[0.06]",
        )}
      >
        <span className="truncate">{selectedSummary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div
                ref={providerPanelRef}
                className={cn(
                  "fixed z-[70] w-[236px] overflow-hidden rounded-[26px] border p-2 shadow-[0_22px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
                  activeTheme
                    ? "border-white/[0.06] bg-[#1b1c20]/96 text-white"
                    : "border-[#d7cfbf] bg-[#fbf7ef]/97 text-slate-950",
                )}
                style={positions.provider}
              >
                <div className={cn("px-2 pb-2 pt-1", activeTheme ? "text-white/44" : "text-slate-500")}>
                  <div className="text-[10px] uppercase tracking-[0.2em]">供应商</div>
                  <div className={cn("mt-1 text-[18px] font-medium tracking-[-0.04em]", activeTheme ? "text-white/90" : "text-slate-950")}>
                    选择模型系列
                  </div>
                </div>
                <div className="space-y-1">
                  {groups.map((group) => {
                    const selected = group.provider === activeGroup?.provider;
                    const currentOption = group.options.find((option) => option.key === selectedKey) ?? group.options[0];
                    return (
                      <button
                        key={group.provider}
                        type="button"
                        aria-label={`${group.supplierLabel} / ${group.familyLabel}`}
                        onMouseEnter={() => setActiveProvider(group.provider)}
                        onFocus={() => setActiveProvider(group.provider)}
                        onClick={() => setActiveProvider(group.provider)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[18px] px-3 py-2.5 text-left transition",
                          activeTheme
                            ? selected
                              ? "bg-white/[0.08]"
                              : "hover:bg-white/[0.05]"
                            : selected
                              ? "bg-black/[0.05]"
                              : "hover:bg-black/[0.035]",
                        )}
                      >
                        <div className="min-w-0">
                          <div className={cn("text-[14px] font-medium", activeTheme ? "text-white/92" : "text-slate-950")}>
                            {group.familyLabel}
                          </div>
                          <div className={cn("mt-0.5 text-[11px]", activeTheme ? "text-white/46" : "text-slate-600")}>
                            {group.supplierLabel}
                            {currentOption ? ` / ${currentOption.shortLabel}` : ""}
                          </div>
                        </div>
                        <ChevronRight className={cn("h-4 w-4 shrink-0", activeTheme ? "text-white/34" : "text-slate-400")} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeGroup ? (
                <div
                  ref={modelsPanelRef}
                  className={cn(
                    "fixed z-[71] w-[336px] overflow-hidden rounded-[26px] border p-2 shadow-[0_22px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
                    activeTheme
                      ? "border-white/[0.06] bg-[#1b1c20]/98 text-white"
                      : "border-[#d7cfbf] bg-[#fbf7ef]/98 text-slate-950",
                  )}
                  style={positions.models}
                >
                  <div className={cn("px-2 pb-2 pt-1", activeTheme ? "text-white/44" : "text-slate-500")}>
                    <div className="text-[10px] uppercase tracking-[0.2em]">{activeGroup.supplierLabel}</div>
                    <div className={cn("mt-1 text-[20px] font-medium tracking-[-0.04em]", activeTheme ? "text-white/90" : "text-slate-950")}>
                      {activeGroup.familyLabel}
                    </div>
                  </div>
                  <div className="max-h-[320px] space-y-1 overflow-y-auto pr-0.5">
                    {activeGroup.options.map((option) => {
                      const selected = option.key === selectedKey;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-label={option.shortLabel}
                          onClick={() => {
                            onSelect(option.key);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 rounded-[18px] px-3 py-2.5 text-left transition",
                            activeTheme
                              ? selected
                                ? "bg-white/[0.08]"
                                : "hover:bg-white/[0.05]"
                              : selected
                                ? "bg-black/[0.05]"
                                : "hover:bg-black/[0.035]",
                          )}
                        >
                          <div className="min-w-0">
                            <div className={cn("text-[15px] font-medium leading-5", activeTheme ? "text-white/92" : "text-slate-950")}>
                              {option.shortLabel}
                            </div>
                            <div className={cn("mt-1 text-[11.5px] leading-[1.55]", activeTheme ? "text-white/52" : "text-slate-600")}>
                              {option.description}
                            </div>
                          </div>
                          <div className="pt-1">
                            {selected ? (
                              <div
                                className={cn(
                                  "flex h-6 w-6 items-center justify-center rounded-full",
                                  activeTheme ? "bg-[#9cc2ff] text-slate-950" : "bg-slate-900 text-white",
                                )}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  "h-6 w-6 rounded-full border",
                                  activeTheme ? "border-white/[0.12]" : "border-black/12",
                                )}
                              />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>,
            document.body,
          )
        : null}
    </div>
  );
});
