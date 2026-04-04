import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const { Suspense, lazy, memo } = React;

const SETTINGS_PANEL_CLASS =
  "rounded-[28px] border border-white/10 bg-[#f4f1ea] text-slate-900 shadow-[0_28px_70px_rgba(0,0,0,0.28)]";
const MOBILE_SETTINGS_SHEET =
  "w-full border-r border-[#e7e1d7] bg-[#f4f1ea] p-0 text-slate-900 shadow-[18px_0_48px_rgba(0,0,0,0.24)] overscroll-contain sm:max-w-[440px]";
const SettingsPage = lazy(() => import("@/pages/Settings"));

export const DesktopSettingsPanel = memo(function DesktopSettingsPanel({
  open,
  onClose,
  onSaved,
  leftOffset,
  width,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  leftOffset: number;
  width: number;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: -18, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -12, scale: 0.99 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 top-4 z-50 hidden lg:block"
          style={{
            left: leftOffset - 16,
            width: `min(${width}px, calc(100vw - ${leftOffset + 32}px))`,
          }}
        >
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", SETTINGS_PANEL_CLASS)}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  正在加载设置面板…
                </div>
              }
            >
              <SettingsPage embedded onClose={onClose} onSaved={onSaved} />
            </Suspense>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
});

export const MobileSettingsSheet = memo(function MobileSettingsSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className={cn(MOBILE_SETTINGS_SHEET, "lg:hidden")}>
        <SheetHeader className="sr-only">
          <SheetTitle>设置</SheetTitle>
          <SheetDescription>在首页内完成模型、密钥、路径与外观设置。</SheetDescription>
        </SheetHeader>
        <Suspense
          fallback={
            <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-sm text-slate-500">
              正在加载设置面板…
            </div>
          }
        >
          <SettingsPage embedded onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
});
