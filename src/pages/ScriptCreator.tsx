import { useState, useEffect, useCallback } from "react";
import type { SetupMode } from "@/types/drama";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, PenTool, Settings, Cpu, BookOpen, Repeat2, X } from "lucide-react";
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
import ScriptCreatorAgentFlow, {
  type ExternalComposerActions,
  type ExternalComposerState,
} from "@/components/script-creator/ScriptCreatorAgentFlow";
import { consumeAgentHandoff, type AgentHandoff } from "@/lib/agent-intake";
import {
  loadStoredVideoProjectById,
  type PersistedVideoProject,
} from "@/hooks/use-local-persistence";
import {
  DECOMPOSE_MODEL_OPTIONS,
  DEFAULT_DECOMPOSE_MODEL,
  readStoredDecomposeModel,
} from "@/lib/gemini-text-models";

const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";
const MODEL_OPTIONS = DECOMPOSE_MODEL_OPTIONS;

type ScriptCreatorProps = {
  embedded?: boolean;
  onExit?: () => void;
  minimalEmbedded?: boolean;
  composerValue?: string;
  onComposerValueChange?: (value: string) => void;
  hideEmbeddedComposer?: boolean;
  onExternalComposerStateChange?: (state: ExternalComposerState | null) => void;
  onExternalComposerActionsChange?: (actions: ExternalComposerActions | null) => void;
};

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

const ALL_DRAMA_STEP_VALUES = new Set<string>([...DRAMA_STEPS, ...ADAPTATION_STEPS]);

function isDramaStepParam(s: string | null): s is DramaStep {
  return s !== null && ALL_DRAMA_STEP_VALUES.has(s);
}

function canAdvanceTo(project: DramaProject, step: DramaStep): boolean {
  switch (step) {
    case "setup":
      return true;
    case "reference-script":
      return true;
    case "creative-plan":
      return !!project.setup;
    case "structure-transform":
      return !!project.referenceScript;
    case "characters":
      return !!project.creativePlan;
    case "character-transform":
      return !!project.structureTransform;
    case "directory":
      return !!project.characters;
    case "outlines":
      return project.directory.length > 0 || !!project.directoryRaw;
    case "episodes":
      return project.directory.length > 0 || !!project.directoryRaw;
    case "compliance":
      return project.episodes.length > 0;
    case "export":
      return project.episodes.length > 0;
    default:
      return false;
  }
}

export function listDramaProjects() {
  return getDramaProjects()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      title: p.dramaTitle || "未命名剧本",
      currentStep: p.currentStep,
      mode: p.mode || "traditional",
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

function buildProjectFromAgentHandoff(handoff: AgentHandoff): DramaProject {
  if (handoff.resumeProjectId && handoff.resumeProjectType !== "video") {
    const resumed = loadProjectById(handoff.resumeProjectId);
    if (resumed) {
      return { ...resumed, mode: resumed.mode || "traditional" };
    }
  }

  const mode: DramaMode = handoff.scriptMode === "adaptation" ? "adaptation" : "traditional";
  const project = createEmptyDramaProject(mode);

  if (mode === "adaptation") {
    return {
      ...project,
      referenceScript: handoff.prompt,
    };
  }

  return project;
}

function mapVideoStepToDramaStep(step: number): DramaStep {
  if (step <= 1) return "creative-plan";
  if (step === 2) return "characters";
  if (step === 3) return "directory";
  if (step === 4) return "episodes";
  return "export";
}

function buildDramaProjectFromVideoProject(
  handoff: AgentHandoff,
  videoProject: PersistedVideoProject,
): DramaProject {
  const project = createEmptyDramaProject("traditional");
  const scenes = videoProject.scenes || [];
  const directory = scenes.map((scene, index) => ({
    number: index + 1,
    title: scene.sceneName || `Scene ${index + 1}`,
    summary: scene.description || scene.dialogue || "Recovered from a previous video project.",
    hookType: "video-shot",
    isKey: index === 0,
    isClimax: index === scenes.length - 1,
    isPaywall: false,
    outline: [scene.description, scene.dialogue, scene.cameraDirection].filter(Boolean).join("\n\n"),
  }));
  const episodes = scenes.map((scene, index) => ({
    number: index + 1,
    title: scene.sceneName || `Shot ${index + 1}`,
    content: [
      `Scene: ${scene.sceneName || `Shot ${index + 1}`}`,
      scene.description ? `Description: ${scene.description}` : "",
      scene.dialogue ? `Dialogue: ${scene.dialogue}` : "",
      scene.cameraDirection ? `Camera: ${scene.cameraDirection}` : "",
      scene.videoUrl ? `Video URL: ${scene.videoUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    wordCount: [scene.description, scene.dialogue, scene.cameraDirection].filter(Boolean).join(" ").length,
  }));
  const characters = (videoProject.characters || [])
    .map((character) => {
      const detail = [character.description, character.audioFileName].filter(Boolean).join(" / ");
      return detail ? `${character.name}: ${detail}` : character.name;
    })
    .join("\n");

  return {
    ...project,
    dramaTitle: videoProject.title || handoff.resumeProjectTitle || "",
    currentStep: mapVideoStepToDramaStep(videoProject.currentStep || 1),
    setup: {
      genres: [],
      audience: "全龄",
      tone: "燃",
      ending: "OE",
      totalEpisodes: Math.max(scenes.length, 1),
      targetMarket: "cn",
      setupMode: "creative",
      creativeInput: handoff.prompt,
    },
    creativePlan: videoProject.script || videoProject.systemPrompt || handoff.prompt,
    characters,
    directory,
    directoryRaw: directory.map((entry) => `${entry.number}. ${entry.title}\n${entry.summary}`).join("\n\n"),
    episodes,
  };
}

export default function ScriptCreator({
  embedded = false,
  onExit,
  minimalEmbedded = false,
  composerValue,
  onComposerValueChange,
  hideEmbeddedComposer = false,
  onExternalComposerStateChange,
  onExternalComposerActionsChange,
}: ScriptCreatorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get("id");
  const modeParam = searchParams.get("mode") as DramaMode | null;
  const stepFromUrl = searchParams.get("step");
  const initialAgentHandoff = !resumeId && !modeParam ? consumeAgentHandoff("script-creator") : null;
  const [agentHandoff] = useState<AgentHandoff | null>(initialAgentHandoff);

  const [project, setProject] = useState<DramaProject>(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const id = params?.get("id") ?? null;
    const stepParam = params?.get("step");
    if (id) {
      const loaded = loadProjectById(id);
      if (loaded) {
        const loadedProject = { ...loaded, mode: loaded.mode || "traditional" };
        if (stepParam && isDramaStepParam(stepParam) && canAdvanceTo(loadedProject, stepParam)) {
          return { ...loadedProject, currentStep: stepParam };
        }
        return loadedProject;
      }
    }
    if (modeParam === "traditional" || modeParam === "adaptation") {
      return createEmptyDramaProject(modeParam);
    }
    if (initialAgentHandoff) {
      return buildProjectFromAgentHandoff(initialAgentHandoff);
    }
    return createEmptyDramaProject();
  });

  const [showModeSelector, setShowModeSelector] = useState(() => {
    return !resumeId && !modeParam && !initialAgentHandoff;
  });

  const [model, setModel] = useState(() => readStoredDecomposeModel() || DEFAULT_DECOMPOSE_MODEL);
  const [setupMode, setSetupMode] = useState<SetupMode>(() => {
    if (initialAgentHandoff && initialAgentHandoff.scriptMode !== "adaptation") {
      return "creative";
    }
    return project.setup?.setupMode || "topic";
  });

  const handleModelChange = (value: string) => {
    setModel(value);
    localStorage.setItem("decompose-model", value);
  };

  const hasContent = !!(project.setup || project.referenceScript || project.creativePlan);

  useEffect(() => {
    if (!agentHandoff?.resumeProjectId || agentHandoff.resumeProjectType !== "video") return;

    let cancelled = false;
    void loadStoredVideoProjectById(agentHandoff.resumeProjectId).then((videoProject) => {
      if (cancelled || !videoProject) return;
      setShowModeSelector(false);
      setProject((prev) => {
        if (prev.setup || prev.creativePlan || prev.characters || prev.directory.length || prev.episodes.length) {
          return prev;
        }
        return buildDramaProjectFromVideoProject(agentHandoff, videoProject);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [agentHandoff]);

  useEffect(() => {
    if (!hasContent) return;
    const timer = setTimeout(() => {
      upsertDramaProject(project);
    }, 500);
    return () => clearTimeout(timer);
  }, [project, hasContent]);

  const steps = project.mode === "adaptation" ? ADAPTATION_STEPS : DRAMA_STEPS;
  const currentStepIdx = steps.indexOf(project.currentStep);

  const goToStep = (step: DramaStep) => {
    setProject((p) => ({ ...p, currentStep: step }));
  };

  useEffect(() => {
    if (!resumeId || !stepFromUrl || !isDramaStepParam(stepFromUrl)) return;
    const loaded = loadProjectById(resumeId);
    if (!loaded) return;
    setShowModeSelector(false);
    setProject((prev) => {
      if (prev.id !== resumeId) {
        const loadedProject = { ...loaded, mode: loaded.mode || "traditional" };
        if (!canAdvanceTo(loadedProject, stepFromUrl)) return loadedProject;
        return { ...loadedProject, currentStep: stepFromUrl };
      }
      if (!canAdvanceTo(prev, stepFromUrl)) return prev;
      if (prev.currentStep === stepFromUrl) return prev;
      return { ...prev, currentStep: stepFromUrl };
    });
    navigate(`/script-creator?id=${encodeURIComponent(resumeId)}`, { replace: true });
  }, [resumeId, stepFromUrl, navigate]);

  const extractTitle = useCallback((plan: string) => {
    const match = plan.match(/[《【](.+?)[》】]/);
    if (match) return match[1];
    const match2 = plan.match(/[1一][\.、\s]*\*{0,2}(.+?)\*{0,2}\s*[—:\-：]/);
    if (match2) return match2[1];
    return "";
  }, []);

  const handleModeSelect = (mode: DramaMode) => {
    const newProject = createEmptyDramaProject(mode);
    setProject(newProject);
    setShowModeSelector(false);
    navigate("/script-creator", { replace: true });
  };

  const handleSetupComplete = (setup: DramaSetup) => {
    setProject((p) => ({ ...p, setup, currentStep: "creative-plan" }));
  };

  const handleAgentSetupReady = (setup: DramaSetup) => {
    setProject((p) => ({
      ...p,
      setup,
      currentStep: p.mode === "adaptation" ? "reference-script" : "creative-plan",
    }));
  };

  const handleReferenceScriptSeed = (referenceScript: string) => {
    setProject((p) => ({ ...p, referenceScript }));
  };

  const handleReferenceScriptComplete = (
    referenceScript: string,
    setup: DramaSetup,
    referenceStructure: string,
  ) => {
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
      creativePlan: content,
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
      characters: content,
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

  const embeddedShellClass =
    "border-white/72 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(243,247,252,0.66))] shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-[30px]";

  const embeddedCardClass =
    "border-white/82 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(247,250,253,0.76))] shadow-[0_16px_42px_rgba(15,23,42,0.08)]";

  const renderWorkbenchStep = () => {
    if (showModeSelector) {
      return (
        <div className={embedded ? "mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12" : "flex flex-col items-center justify-center py-20"}>
          <h2 className="mb-2 text-xl font-semibold">选择创作模式</h2>
          <p className="mb-8 text-sm text-muted-foreground">选择更适合你的剧本生产方式</p>
          <div className="grid w-full max-w-2xl grid-cols-1 gap-5 md:grid-cols-2">
            <button
              onClick={() => handleModeSelect("traditional")}
              className={embedded ? `group flex flex-col items-center gap-4 rounded-[30px] border p-8 transition-all hover:-translate-y-1 hover:border-emerald-200 hover:bg-white ${embeddedCardClass}` : "group flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-8 transition-all hover:border-emerald-400 hover:shadow-lg dark:hover:border-emerald-500/60"}
            >
              <div className={embedded ? "flex h-14 w-14 items-center justify-center rounded-[20px] bg-emerald-500/12 text-emerald-700 transition-colors group-hover:bg-emerald-500/18" : "flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/20 dark:bg-emerald-500/15"}>
                <BookOpen className={embedded ? "h-7 w-7" : "h-7 w-7 text-emerald-600 dark:text-emerald-400"} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">传统创作</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  从零开始，选题立项、创作方案、角色开发到分集撰写。
                </p>
              </div>
            </button>
            <button
              onClick={() => handleModeSelect("adaptation")}
              className={embedded ? `group flex flex-col items-center gap-4 rounded-[30px] border p-8 transition-all hover:-translate-y-1 hover:border-sky-200 hover:bg-white ${embeddedCardClass}` : "group flex flex-col items-center gap-4 rounded-xl border-2 border-border bg-card p-8 transition-all hover:border-violet-400 hover:shadow-lg dark:hover:border-violet-500/60"}
            >
              <div className={embedded ? "flex h-14 w-14 items-center justify-center rounded-[20px] bg-sky-500/12 text-sky-700 transition-colors group-hover:bg-sky-500/18" : "flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10 transition-colors group-hover:bg-violet-500/20 dark:bg-violet-500/15"}>
                <Repeat2 className={embedded ? "h-7 w-7" : "h-7 w-7 text-violet-600 dark:text-violet-400"} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">同款创作</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  基于参考剧本，先做结构转换，再做角色转换与分集撰写。
                </p>
              </div>
            </button>
          </div>
        </div>
      );
    }

    switch (project.currentStep) {
      case "setup":
        return <StepSetup setup={project.setup} onComplete={handleSetupComplete} setupMode={setupMode} />;
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
            projectId={project.id}
            dramaTitle={project.dramaTitle}
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
  const shouldUseAgentFlow = !resumeId;

  if (embedded) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {!minimalEmbedded && (
          <div className={`mb-4 flex items-center justify-between gap-3 rounded-[30px] border px-5 py-4 ${embeddedShellClass}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/[0.05] text-slate-800">
                <PenTool className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">Agent 剧本工作台</span>
                  {!showModeSelector && (
                    <span className="rounded-full bg-slate-900/[0.06] px-2.5 py-1 text-[11px] text-slate-700">
                      {modeLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  首页就是会话上下文，Agent 会在这里持续接住后续创作。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!showModeSelector && (
                <Select value={model} onValueChange={handleModelChange}>
                  <SelectTrigger className="h-9 w-[210px] rounded-full border-white/60 bg-white/75 text-xs shadow-sm">
                    <Cpu className="mr-1 h-3.5 w-3.5 text-slate-500" />
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
              )}
              {onExit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full border border-white/60 bg-white/75 text-slate-700 hover:bg-white"
                  onClick={onExit}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {shouldUseAgentFlow ? (
            <ScriptCreatorAgentFlow
              agentHandoff={agentHandoff}
              showModeSelector={showModeSelector}
              project={project}
              setupMode={setupMode}
              steps={steps}
              currentStep={project.currentStep}
              onSetupModeChange={setSetupMode}
              onModeSelect={handleModeSelect}
              onSetupReady={handleAgentSetupReady}
              onReferenceScriptSeed={handleReferenceScriptSeed}
              goToStep={goToStep}
              canAdvanceTo={(step) => canAdvanceTo(project, step)}
              renderWorkbench={renderWorkbenchStep}
              immersive
              composerValue={composerValue}
              onComposerValueChange={onComposerValueChange}
              hideInternalComposer={hideEmbeddedComposer}
              onExternalComposerStateChange={onExternalComposerStateChange}
              onExternalComposerActionsChange={onExternalComposerActionsChange}
            />
          ) : (
            <div className={`h-full overflow-auto rounded-[34px] border p-5 ${embeddedShellClass}`}>
              {renderWorkbenchStep()}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (resumeId || modeParam) {
                navigate("/modules");
              } else if (agentHandoff) {
                navigate("/");
              } else {
                setShowModeSelector(true);
                setProject(createEmptyDramaProject());
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            <span className="font-[Space_Grotesk] font-semibold">剧本创作</span>
            {!showModeSelector && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent-foreground">
                {modeLabel}
              </span>
            )}
            {project.dramaTitle && (
              <span className="ml-1 text-sm text-muted-foreground">· {project.dramaTitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {!showModeSelector && !shouldUseAgentFlow && (
        <div className="border-b border-border/50 px-6 py-2">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto">
            {steps.map((step, idx) => {
              const isCurrent = step === project.currentStep;
              const isDone = idx < currentStepIdx;
              const isClickable = idx <= currentStepIdx || canAdvanceTo(project, step);
              return (
                <button
                  key={step}
                  onClick={() => isClickable && goToStep(step)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-all ${
                    isCurrent
                      ? "bg-primary font-medium text-primary-foreground"
                      : isDone
                        ? "cursor-pointer bg-accent/10 text-accent-foreground hover:bg-accent/20"
                        : "text-muted-foreground"
                  } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                  disabled={!isClickable}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] ${
                      isCurrent ? "bg-primary-foreground/20" : isDone ? "bg-accent/20" : "bg-muted"
                    }`}
                  >
                    {isDone ? "✓" : idx + 1}
                  </span>
                  {DRAMA_STEP_LABELS[step]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="mx-auto flex-1 w-full max-w-7xl px-6 py-6">
        {!showModeSelector && (
          <div className="mb-4 flex items-center justify-end gap-3">
            {project.currentStep === "setup" && !shouldUseAgentFlow && (
              <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
                <button
                  onClick={() => setSetupMode("topic")}
                  className={`rounded-md px-5 py-1 text-xs font-medium transition-all ${
                    setupMode === "topic"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  选题创作
                </button>
                <button
                  onClick={() => setSetupMode("creative")}
                  className={`rounded-md px-5 py-1 text-xs font-medium transition-all ${
                    setupMode === "creative"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  创意创作
                </button>
              </div>
            )}
            <Select value={model} onValueChange={handleModelChange}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <Cpu className="mr-1 h-3 w-3 text-muted-foreground" />
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

        {shouldUseAgentFlow ? (
          <ScriptCreatorAgentFlow
            agentHandoff={agentHandoff}
            showModeSelector={showModeSelector}
            project={project}
            setupMode={setupMode}
            steps={steps}
            currentStep={project.currentStep}
            onSetupModeChange={setSetupMode}
            onModeSelect={handleModeSelect}
            onSetupReady={handleAgentSetupReady}
            onReferenceScriptSeed={handleReferenceScriptSeed}
            goToStep={goToStep}
            canAdvanceTo={(step) => canAdvanceTo(project, step)}
            renderWorkbench={renderWorkbenchStep}
          />
        ) : (
          renderWorkbenchStep()
        )}
      </main>
    </div>
  );
}
