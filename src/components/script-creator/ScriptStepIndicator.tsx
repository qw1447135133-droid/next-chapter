import { DramaStep, DRAMA_STEP_LABELS } from "@/types/drama";
import { cn } from "@/lib/utils";

interface Props {
  steps: DramaStep[];
  currentStep: DramaStep;
  onStepClick: (step: DramaStep) => void;
}

const ScriptStepIndicator = ({ steps, currentStep, onStepClick }: Props) => {
  const currentIdx = steps.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {steps.map((step, idx) => {
        const isActive = step === currentStep;
        const isDone = idx < currentIdx;
        return (
          <button
            key={step}
            onClick={() => onStepClick(step)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              isActive && "bg-primary text-primary-foreground",
              isDone && "bg-primary/10 text-primary hover:bg-primary/20",
              !isActive && !isDone && "text-muted-foreground hover:bg-muted"
            )}
          >
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border",
              isActive && "border-primary-foreground/30 bg-primary-foreground/10",
              isDone && "border-primary/30 bg-primary/10",
              !isActive && !isDone && "border-border"
            )}>
              {isDone ? "✓" : idx + 1}
            </span>
            {DRAMA_STEP_LABELS[step]}
          </button>
        );
      })}
    </div>
  );
};

export default ScriptStepIndicator;
