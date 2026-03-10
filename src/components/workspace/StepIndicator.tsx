import { cn } from "@/lib/utils";
import { STEP_LABELS, type WorkspaceStep } from "@/types/project";
import { Check, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface StepIndicatorProps {
  currentStep: WorkspaceStep;
  onStepClick: (step: WorkspaceStep) => void;
  disabledSteps?: WorkspaceStep[];
  lockedSteps?: WorkspaceStep[];
}

const StepIndicator = ({ currentStep, onStepClick, disabledSteps = [], lockedSteps = [] }: StepIndicatorProps) => {
  const steps = Object.entries(STEP_LABELS) as [string, string][];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map(([stepStr, label], i) => {
        const step = Number(stepStr) as WorkspaceStep;
        const isActive = step === currentStep;
        const isDone = step < currentStep;
        const isDisabled = disabledSteps.includes(step);
        const isLocked = !isDisabled && lockedSteps.includes(step);

        return (
          <button
            key={step}
            onClick={() => {
              if (isDisabled) {
                toast({ title: "参考图功能已关闭", variant: "destructive" });
                return;
              }
              onStepClick(step);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              (isDisabled || isLocked) && "opacity-40 cursor-not-allowed",
              !isDisabled && !isLocked && isActive && "bg-primary text-primary-foreground",
              !isDisabled && !isLocked && isDone && "bg-primary/10 text-primary",
              !isDisabled && !isLocked && !isActive && !isDone && "text-muted-foreground hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                (isDisabled || isLocked) && "bg-muted",
                !isDisabled && !isLocked && isActive && "bg-primary-foreground/20",
                !isDisabled && !isLocked && isDone && "bg-primary/20",
                !isDisabled && !isLocked && !isActive && !isDone && "bg-muted"
              )}
            >
              {isLocked ? <Lock className="h-3 w-3" /> : !isDisabled && isDone ? <Check className="h-3 w-3" /> : step}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default StepIndicator;
