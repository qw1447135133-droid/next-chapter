import { toast } from "@/hooks/use-toast";
import { friendlyError } from "./friendly-error";

let installed = false;

/**
 * Installs global handlers for uncaught errors and unhandled promise rejections,
 * showing user-friendly toast notifications.
 */
export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  // Suppress known non-actionable errors
  const ignore = (msg: string) => {
    const lower = msg.toLowerCase();
    return (
      lower.includes("resizeobserver") ||
      lower.includes("dialogtitle") ||
      lower.includes("aria-describedby") ||
      lower.includes("missing `description`") ||
      lower.includes("loading chunk") ||
      lower.includes("dynamically imported module")
    );
  };

  window.addEventListener("error", (event) => {
    const msg = event.message || "";
    if (ignore(msg)) return;
    console.error("[GlobalErrorHandler]", event.error || msg);
    const friendly = friendlyError(event.error || msg);
    toast({ title: friendly.title, description: friendly.description, variant: "destructive", duration: 6000 });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason instanceof Error ? event.reason.message : String(event.reason || "");
    if (ignore(msg)) return;
    console.error("[GlobalErrorHandler] Unhandled rejection:", event.reason);
    const friendly = friendlyError(event.reason);
    toast({ title: friendly.title, description: friendly.description, variant: "destructive", duration: 6000 });
  });
}
