import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, PenTool, Settings, Cpu } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  type DramaProject,
  type DramaStep,
  type DramaSetup,
  type EpisodeEntry,
  type EpisodeScript,
  DRAMA_STEPS,
  DRAMA_STEP_LABELS,
  createEmptyDramaProject,
} from "@/types/drama";
import StepSetup from "@/components/script-creator/StepSetup";
import StepCreativePlan from "@/components/script-creator/StepCreativePlan";
import StepCharacters from "@/components/script-creator/StepCharacters";
import StepDirectory from "@/components/script-creator/StepDirectory";
import StepEpisode from "@/components/script-creator/StepEpisode";
import StepExport from "@/components/script-creator/StepExport";
import StepCompliance from "@/components/script-creator/StepCompliance";

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
      if (loaded) return loaded;
    }
    // Try loading last active project
    const projects = getDramaProjects();
    if (projects.length > 0) return projects[0];
    return createEmptyDramaProject();
  });

  const [model, setModel] = useState(() => localStorage.getItem("decompose-model") || "gemini-3.1-pro-preview");

  const handleModelChange = (value: string) => {
    setModel(value);
    localStorage.setItem("decompose-model", value);
  };

  // Persist to localStorage list on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      upsertDramaProject(project);
    }, 500);
    return () => clearTimeout(timer);
  }, [project]);

  const currentStepIdx = DRAMA_STEPS.indexOf(project.currentStep);

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

  const handleSetupComplete = (setup: DramaSetup) => {
    setProject((p) => ({ ...p, setup, currentStep: "creative-plan" }));
  };

  const handlePlanUpdate = (plan: string) => {
    const title = extractTitle(plan) || project.dramaTitle;
    setProject((p) => ({ ...p, creativePlan: plan, dramaTitle: title }));
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

  const handleNewProject = () => {
    if (confirm("确定要新建项目吗？")) {
      const newProj = createEmptyDramaProject();
      setProject(newProj);
      navigate("/script-creator", { replace: true });
    }
  };

  const renderStep = () => {
    switch (project.currentStep) {
      case "setup":
        return <StepSetup setup={project.setup} onComplete={handleSetupComplete} />;
      case "creative-plan":
        return project.setup ? (
          <StepCreativePlan
            setup={project.setup}
            plan={project.creativePlan}
            onUpdate={handlePlanUpdate}
            onNext={() => goToStep("characters")}
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
      case "directory":
        return project.setup ? (
          <StepDirectory
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

      {/* Step indicator */}
      <div className="border-b border-border/50 px-6 py-2">
        <div className="flex items-center gap-1 max-w-7xl mx-auto overflow-x-auto">
          {DRAMA_STEPS.map((step, idx) => {
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

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {/* Model selector toolbar */}
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
        {renderStep()}
      </main>
    </div>
  );
};

function canAdvanceTo(project: DramaProject, step: DramaStep): boolean {
  switch (step) {
    case "setup": return true;
    case "creative-plan": return !!project.setup;
    case "characters": return !!project.creativePlan;
    case "directory": return !!project.characters;
    case "episodes": return project.directory.length > 0 || !!project.directoryRaw;
    case "export": return project.episodes.length > 0;
    default: return false;
  }
}

export default ScriptCreator;
