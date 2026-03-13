import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Film, ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DramaProject,
  DramaStep,
  DRAMA_STEPS,
  DRAMA_STEP_LABELS,
  createEmptyDramaProject,
} from "@/types/drama";
import StepSetup from "@/components/script-creator/StepSetup";
import StepCreativePlan from "@/components/script-creator/StepCreativePlan";
import ScriptStepIndicator from "@/components/script-creator/ScriptStepIndicator";

export type SetupMode = "topic" | "creative";

const ScriptCreator = () => {
  const navigate = useNavigate();
  const [project, setProject] = useState<DramaProject>(createEmptyDramaProject("traditional"));
  const [setupMode, setSetupMode] = useState<SetupMode>("topic");
  const [creativeInput, setCreativeInput] = useState("");
  const [creativeFile, setCreativeFile] = useState<string>("");

  const steps = DRAMA_STEPS;
  const currentStep = project.currentStep;

  const goToStep = (step: DramaStep) => {
    setProject((p) => ({ ...p, currentStep: step }));
  };

  const updateProject = useCallback((partial: Partial<DramaProject>) => {
    setProject((p) => ({ ...p, ...partial, updatedAt: new Date().toISOString() }));
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case "setup":
        return (
          <StepSetup
            project={project}
            onUpdate={updateProject}
            onNext={() => goToStep("creative-plan")}
            setupMode={setupMode}
            onSetupModeChange={setSetupMode}
            creativeInput={creativeInput}
            onCreativeInputChange={setCreativeInput}
            creativeFile={creativeFile}
            onCreativeFileChange={setCreativeFile}
          />
        );
      case "creative-plan":
        return (
          <StepCreativePlan
            project={project}
            onUpdate={updateProject}
            setupMode={setupMode}
            creativeInput={creativeInput}
            creativeFile={creativeFile}
            onNext={() => goToStep("characters")}
            onBack={() => goToStep("setup")}
          />
        );
      default:
        return (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>该步骤正在建设中…</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold font-[Space_Grotesk]">剧本创作</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4 mr-1" />
          设置
        </Button>
      </header>

      {/* Step Indicator */}
      <div className="px-6 py-3 border-b border-border/30">
        <ScriptStepIndicator steps={steps} currentStep={currentStep} onStepClick={goToStep} />
      </div>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          {renderStep()}
        </motion.div>
      </main>
    </div>
  );
};

export default ScriptCreator;
