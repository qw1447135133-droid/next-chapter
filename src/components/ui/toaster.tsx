import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, duration: durationProp, ...props }) {
        const isDestructive = props.variant === "destructive";
        const duration =
          durationProp !== undefined
            ? durationProp
            : isDestructive
              ? Number.POSITIVE_INFINITY
              : 5000;

        return (
          <Toast
            key={id}
            {...props}
            duration={duration}
            className={cn(props.className, !isDestructive && "cursor-pointer select-none")}
            onClick={(e) => {
              if (isDestructive) return;
              if ((e.target as HTMLElement).closest("button")) return;
              dismiss(id);
            }}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            {isDestructive ? <ToastClose /> : null}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
