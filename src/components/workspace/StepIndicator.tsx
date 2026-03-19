import { cn } from "@/lib/utils";
import { STEP_LABELS, type WorkspaceStep } from "@/types/project";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: WorkspaceStep;
  onStepClick: (step: WorkspaceStep) => void;
  disabledSteps?: WorkspaceStep[];
  canAdvanceTo: (step: WorkspaceStep) => boolean;
}

const StepIndicator = ({ currentStep, onStepClick, disabledSteps = [], canAdvanceTo }: StepIndicatorProps) => {
  const steps = Object.entries(STEP_LABELS) as [string, string][];
  const currentIdx = steps.findIndex(([s]) => Number(s) === currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map(([stepStr, label], idx) => {
        const step = Number(stepStr) as WorkspaceStep;
        const isActive = step === currentStep;
        const isDone = idx < currentIdx;
        const isDisabled = disabledSteps.includes(step);
        const isClickable = !isDisabled && (idx <= currentIdx || canAdvanceTo(step));

        return (
          <button
            key={step}
            onClick={() => isClickable && onStepClick(step)}
            disabled={!isClickable}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              isDisabled && "opacity-40 cursor-not-allowed",
              !isDisabled && isActive && "bg-primary text-primary-foreground",
              !isDisabled && isDone && isClickable && "bg-primary/10 text-primary cursor-pointer hover:bg-primary/15",
              !isDisabled && !isActive && !isDone && isClickable && "text-muted-foreground hover:bg-muted cursor-pointer",
              !isDisabled && !isClickable && "text-muted-foreground/40 cursor-default"
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                isDisabled && "bg-muted",
                !isDisabled && isActive && "bg-primary-foreground/20",
                !isDisabled && isDone && isClickable && "bg-primary/20",
                !isDisabled && !isActive && !isDone && "bg-muted"
              )}
            >
              {!isDisabled && isDone ? <Check className="h-3 w-3" /> : step}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default StepIndicator;
