import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, PenTool, Settings, Cpu, BookOpen, Repeat2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  type DramaProject,
  type DramaStep,
  type DramaSetup,
  type DramaMode,
  type EpisodeEntry,
  type EpisodeScript,
  DRAMA_STEPS,
  ADAPTATION_STEPS,
  DRAMA_STEP_LABELS,
  createEmptyDramaProject,
} from "@/types/drama";
import StepSetup from "@/components/script-creator/StepSetup";
import StepCreativePlan from "@/components/script-creator/StepCreativePlan";
import StepCharacters from "@/components/script-creator/StepCharacters";
import StepDirectory from "@/components/script-creator/StepDirectory";
import StepOutlines from "@/components/script-creator/StepOutlines";
import StepEpisode from "@/components/script-creator/StepEpisode";
import StepExport from "@/components/script-creator/StepExport";
import StepCompliance from "@/components/script-creator/StepCompliance";
import StepReferenceScript from "@/components/script-creator/StepReferenceScript";
import StepStructureTransform from "@/components/script-creator/StepStructureTransform";
import StepCharacterTransform from "@/components/script-creator/StepCharacterTransform";

const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";

const MODEL_OPTIONS = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "gemini-3-pro-preview-thinking", label: "Gemini 3 Pro (Thinking)" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
];

function getDramaProjects(): DramaProject[] {
  try {
    const raw = localStorage.getItem(DRAMA_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDramaProjects(projects: DramaProject[]): void {
  localStorage.setItem(DRAMA_PROJECTS_KEY, JSON.stringify(projects));
}

function loadProjectById(id: string | null): DramaProject | null {
  if (!id) return null;
  const projects = getDramaProjects();
  return projects.find((p) => p.id === id) || null;
}

function upsertDramaProject(project: DramaProject): void {
  const projects = getDramaProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  const updated = { ...project, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    projects[idx] = updated;
  } else {
    projects.unshift(updated);
  }
  saveDramaProjects(projects);
}

export function listDramaProjects() {
  return getDramaProjects()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      title: p.dramaTitle || "未命名剧本",
      currentStep: p.currentStep,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      type: "drama" as const,
    }));
}

export function deleteDramaProject(id: string): boolean {
  const projects = getDramaProjects();
  const filtered = projects.filter((p) => p.id !== id);
  saveDramaProjects(filtered);
  return true;
}

const ScriptCreator = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get("id");

  const [project, setProject] = useState<DramaProject>(() => {
    if (resumeId) {
      const loaded = loadProjectById(resumeId);
      if (loaded) return { ...loaded, mode: loaded.mode || "traditional" };
    }
    // Without ?id=, always start fresh with mode selector
    return createEmptyDramaProject();
  });

  // Show mode selector when entering without ?id= (fresh start)
  const [showModeSelector, setShowModeSelector] = useState(() => {
    return !resumeId;
  });

  const [model, setModel] = useState(() => localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview");

  const handleModelChange = (value: string) => {
    setModel(value);
    localStorage.setItem("decompose-model", value);
  };

  // Only persist projects that have actual content (not empty/mode-selector state)
  const hasContent = !!(project.setup || project.referenceScript || project.creativePlan);

  useEffect(() => {
    if (!hasContent) return; // Don't save empty projects
    const timer = setTimeout(() => {
      upsertDramaProject(project);
    }, 500);
    return () => clearTimeout(timer);
  }, [project]);

  const steps = project.mode === "adaptation" ? ADAPTATION_STEPS : DRAMA_STEPS;
  const currentStepIdx = steps.indexOf(project.currentStep);

  const goToStep = (step: DramaStep) => {
    setProject((p) => ({ ...p, currentStep: step }));
  };

  const extractTitle = useCallback((plan: string) => {
    const match = plan.match(/[《](.+?)[》]/);
    if (match) return match[1];
    const match2 = plan.match(/[1１一][\.\、]\s*\*{0,2}(.+?)\*{0,2}\s*[——\-:：]/);
    if (match2) return match2[1];
    return "";
  }, []);

  const handleModeSelect = (mode: DramaMode) => {
    const newProj = createEmptyDramaProject(mode);
    setProject(newProj);
    setShowModeSelector(false);
    navigate("/script-creator", { replace: true });
  };

  const handleSetupComplete = (setup: DramaSetup) => {
    setProject((p) => ({ ...p, setup, currentStep: "creative-plan" }));
  };

  const handleReferenceScriptComplete = (referenceScript: string, setup: DramaSetup, referenceStructure: string) => {
    setProject((p) => ({
      ...p,
      referenceScript,
      referenceStructure,
      setup,
      currentStep: "structure-transform",
    }));
  };

  const handlePlanUpdate = (plan: string) => {
    const title = extractTitle(plan) || project.dramaTitle;
    setProject((p) => ({
      ...p,
      creativePlan: plan,
      dramaTitle: title,
      characters: "",
      directory: [],
      directoryRaw: "",
      episodes: [],
    }));
  };

  const handleStructureTransformUpdate = (content: string) => {
    const title = extractTitle(content) || project.dramaTitle;
    setProject((p) => ({
      ...p,
      structureTransform: content,
      creativePlan: content, // Also set as creativePlan for downstream steps
      dramaTitle: title,
      characterTransform: "",
      characters: "",
      directory: [],
      directoryRaw: "",
      episodes: [],
    }));
  };

  const handleFrameworkStyleChange = (style: string) => {
    setProject((p) => ({ ...p, frameworkStyle: style }));
  };

  const handleCharacterTransformUpdate = (content: string) => {
    setProject((p) => ({
      ...p,
      characterTransform: content,
      characters: content, // Also set as characters for downstream steps
    }));
  };

  const handleCharactersUpdate = (characters: string) => {
    setProject((p) => ({ ...p, characters }));
  };

  const handleDirectoryUpdate = (directory: EpisodeEntry[], raw: string) => {
    setProject((p) => ({ ...p, directory, directoryRaw: raw }));
  };

  const handleEpisodesUpdate = (episodes: EpisodeScript[]) => {
    setProject((p) => ({ ...p, episodes }));
  };

  const handleComplianceUpdate = (complianceReport: string) => {
    setProject((p) => ({ ...p, complianceReport }));
  };

  const handleNewProject = () => {
    if (confirm("确定要新建项目吗？")) {
      setShowModeSelector(true);
    }
  };

  const renderStep = () => {
    // Mode selector
    if (showModeSelector) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <h2 className="text-xl font-semibold mb-2">选择创作模式</h2>
          <p className="text-muted-foreground text-sm mb-8">选择适合你的创作方式开始</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
            <button
              onClick={() => handleModeSelect("traditional")}
              className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary transition-all hover:shadow-lg bg-card"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <BookOpen className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">传统创作</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  从零开始，选题立项 → 创作方案 → 角色开发 → 分集撰写
                </p>
              </div>
            </button>
            <button
              onClick={() => handleModeSelect("adaptation")}
              className="group flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-border hover:border-primary transition-all hover:shadow-lg bg-card"
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Repeat2 className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">同款创作</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  基于参考剧本，结构转换 → 角色转换 → 分集撰写
                </p>
              </div>
            </button>
          </div>
        </div>
      );
    }

    switch (project.currentStep) {
      case "setup":
        return <StepSetup setup={project.setup} onComplete={handleSetupComplete} />;
      case "reference-script":
        return (
          <StepReferenceScript
            referenceScript={project.referenceScript || ""}
            setup={project.setup}
            onComplete={handleReferenceScriptComplete}
          />
        );
      case "creative-plan":
        return project.setup ? (
          <StepCreativePlan
            setup={project.setup}
            plan={project.creativePlan}
            onUpdate={handlePlanUpdate}
            onNext={() => goToStep("characters")}
          />
        ) : null;
      case "structure-transform":
        return project.setup ? (
          <StepStructureTransform
            setup={project.setup}
            referenceScript={project.referenceScript || ""}
            referenceStructure={project.referenceStructure || ""}
            frameworkStyle={project.frameworkStyle || ""}
            structureTransform={project.structureTransform || ""}
            onStyleChange={handleFrameworkStyleChange}
            onUpdate={handleStructureTransformUpdate}
            onNext={() => goToStep("character-transform")}
          />
        ) : null;
      case "characters":
        return project.setup ? (
          <StepCharacters
            setup={project.setup}
            creativePlan={project.creativePlan}
            characters={project.characters}
            onUpdate={handleCharactersUpdate}
            onNext={() => goToStep("directory")}
          />
        ) : null;
      case "character-transform":
        return project.setup ? (
          <StepCharacterTransform
            setup={project.setup}
            referenceScript={project.referenceScript || ""}
            frameworkStyle={project.frameworkStyle || ""}
            structureTransform={project.structureTransform || ""}
            characterTransform={project.characterTransform || ""}
            onUpdate={handleCharacterTransformUpdate}
            onNext={() => goToStep("directory")}
          />
        ) : null;
      case "directory":
        return project.setup ? (
          <StepDirectory
            setup={project.setup}
            creativePlan={project.creativePlan}
            characters={project.characters}
            directory={project.directory}
            directoryRaw={project.directoryRaw}
            onUpdate={handleDirectoryUpdate}
            onNext={() => goToStep("outlines")}
          />
        ) : null;
      case "outlines":
        return project.setup ? (
          <StepOutlines
            setup={project.setup}
            creativePlan={project.creativePlan}
            characters={project.characters}
            directory={project.directory}
            directoryRaw={project.directoryRaw}
            onUpdate={handleDirectoryUpdate}
            onNext={() => goToStep("episodes")}
          />
        ) : null;
      case "episodes":
        return project.setup ? (
          <StepEpisode
            setup={project.setup}
            characters={project.characters}
            directory={project.directory}
            episodes={project.episodes}
            onUpdate={handleEpisodesUpdate}
            onNext={() => goToStep("compliance")}
          />
        ) : null;
      case "compliance":
        return project.setup ? (
          <StepCompliance
            setup={project.setup}
            creativePlan={project.creativePlan}
            characters={project.characters}
            episodes={project.episodes}
            complianceReport={project.complianceReport || ""}
            onUpdate={handleComplianceUpdate}
            onNext={() => goToStep("export")}
          />
        ) : null;
      case "export":
        return project.setup ? (
          <StepExport
            setup={project.setup}
            dramaTitle={project.dramaTitle}
            creativePlan={project.creativePlan}
            characters={project.characters}
            episodes={project.episodes}
          />
        ) : null;
      default:
        return null;
    }
  };

  const modeLabel = project.mode === "adaptation" ? "同款创作" : "传统创作";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            <span className="font-semibold font-[Space_Grotesk]">剧本创作</span>
            {!showModeSelector && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground">
                {modeLabel}
              </span>
            )}
            {project.dramaTitle && (
              <span className="text-sm text-muted-foreground ml-1">— {project.dramaTitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewProject} className="text-xs">
            新建项目
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Step indicator - only show when not in mode selector */}
      {!showModeSelector && (
        <div className="border-b border-border/50 px-6 py-2">
          <div className="flex items-center gap-1 max-w-7xl mx-auto overflow-x-auto">
            {steps.map((step, idx) => {
              const isCurrent = step === project.currentStep;
              const isDone = idx < currentStepIdx;
              const isClickable = idx <= currentStepIdx || (idx === currentStepIdx + 1 && canAdvanceTo(project, step));
              return (
                <button
                  key={step}
                  onClick={() => isClickable && goToStep(step)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                    isCurrent
                      ? "bg-primary text-primary-foreground font-medium"
                      : isDone
                      ? "bg-accent/10 text-accent-foreground cursor-pointer hover:bg-accent/20"
                      : "text-muted-foreground"
                  } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                  disabled={!isClickable}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                    isCurrent ? "bg-primary-foreground/20" : isDone ? "bg-accent/20" : "bg-muted"
                  }`}>
                    {isDone ? "✓" : idx + 1}
                  </span>
                  {DRAMA_STEP_LABELS[step]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {/* Model selector toolbar - hide during mode selection */}
        {!showModeSelector && (
          <div className="flex items-center justify-end mb-4">
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <Cpu className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {renderStep()}
      </main>
    </div>
  );
};

function canAdvanceTo(project: DramaProject, step: DramaStep): boolean {
  switch (step) {
    case "setup": return true;
    case "reference-script": return true;
    case "creative-plan": return !!project.setup;
    case "structure-transform": return !!project.referenceScript;
    case "characters": return !!project.creativePlan;
    case "character-transform": return !!project.structureTransform;
    case "directory": return !!project.characters;
    case "outlines": return project.directory.length > 0 || !!project.directoryRaw;
    case "episodes": return project.directory.length > 0 || !!project.directoryRaw;
    case "compliance": return project.episodes.length > 0;
    case "export": return project.episodes.length > 0;
    default: return false;
  }
}

export default ScriptCreator;
