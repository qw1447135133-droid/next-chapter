import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface HomeAgentConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  meta?: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export default function HomeAgentConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认删除",
  cancelLabel = "取消",
  meta,
  pending = false,
  onOpenChange,
  onConfirm,
}: HomeAgentConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          "w-[min(92vw,420px)] gap-0 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(22,24,29,0.97),rgba(16,18,22,0.99))] p-0 text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,0.52)] backdrop-blur-2xl",
          "data-[state=open]:duration-200 data-[state=closed]:duration-150",
        )}
      >
        <AlertDialogHeader className="space-y-0 text-left">
          <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 pb-4 pt-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] border border-rose-400/15 bg-[linear-gradient(180deg,rgba(244,63,94,0.18),rgba(244,63,94,0.08))] text-rose-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.9} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
                <AlertTriangle className="h-3 w-3" strokeWidth={1.8} />
                危险操作
              </div>
              <AlertDialogTitle className="mt-3 text-[17px] font-medium leading-6 tracking-[0.01em] text-white/92">
                {title}
              </AlertDialogTitle>
              {meta ? <p className="mt-1 text-[12px] text-white/36">{meta}</p> : null}
            </div>
          </div>
          <div className="px-5 pb-5 pt-4">
            <AlertDialogDescription className="text-[13px] leading-6 text-white/54">
              {description}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-t border-white/[0.06] bg-black/10 px-5 py-4 sm:justify-end sm:space-x-2">
          <AlertDialogCancel
            disabled={pending}
            className="mt-0 h-10 rounded-full border-white/[0.08] bg-white/[0.04] px-4 text-[12px] font-medium text-white/72 hover:bg-white/[0.07] hover:text-white focus:ring-white/15 focus:ring-offset-0"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className="h-10 rounded-full border border-rose-400/18 bg-[linear-gradient(180deg,#d9485f,#be324b)] px-4 text-[12px] font-medium text-white shadow-[0_12px_32px_rgba(217,72,95,0.22)] hover:bg-[linear-gradient(180deg,#de566c,#c73a53)] focus:ring-rose-300/25 focus:ring-offset-0"
          >
            {pending ? "正在删除…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
