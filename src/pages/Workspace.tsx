import { useState, useEffect, useCallback, useRef } from "react";
import type { DecomposeModel } from "@/components/workspace/ScriptInput";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Film, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendly-error";
import { invokeFunction } from "@/lib/invoke-with-key";
import type { CharacterSetting, SceneSetting, WorkspaceStep, ArtStyle } from "@/types/project";
import { useSmartPersistence } from "@/hooks/use-smart-persistence";
import StepIndicator from "@/components/workspace/StepIndicator";
import ScriptInput from "@/components/workspace/ScriptInput";
import CharacterSettings from "@/components/workspace/CharacterSettings";
import AnalyzeProgress, { type AnalyzePhase } from "@/components/workspace/AnalyzeProgress";

const Workspace = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get("id");

  const [currentStep, setCurrentStep] = useState<WorkspaceStep>(1);
  const [script, setScript] = useState(() => {
    try {
      const imported = sessionStorage.getItem("imported-script");
      if (imported) { sessionStorage.removeItem("imported-script"); return imported; }
    } catch { /* ignore */ }
    return "";
  });
  const [characters, setCharacters] = useState<CharacterSetting[]>([]);
  const [sceneSettings, setSceneSettings] = useState<SceneSetting[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [artStyle, setArtStyle] = useState<ArtStyle>("live-action");
  const [customArtStylePrompt, setCustomArtStylePromptState] = useState(() => {
    try { return localStorage.getItem("custom-art-style-prompt") || ""; } catch { return ""; }
  });
  const setCustomArtStylePrompt = (v: string) => {
    setCustomArtStylePromptState(v);
    try { localStorage.setItem("custom-art-style-prompt", v); } catch { /* ignore */ }
  };
  const [decomposeModel, setDecomposeModelState] = useState<DecomposeModel>(() => {
    try { return (localStorage.getItem("decompose-model") as DecomposeModel) || "gemini-3.1-pro-preview"; } catch { return "gemini-3.1-pro-preview"; }
  });
  const setDecomposeModel = (v: DecomposeModel) => {
    setDecomposeModelState(v);
    try { localStorage.setItem("decompose-model", v); } catch { /* ignore */ }
  };
  const [projectTitle, setProjectTitle] = useState("未命名项目");
  const [isLoaded, setIsLoaded] = useState(false);
  const [rawAiOutput, setRawAiOutput] = useState<string>("");
  const isRestoringRef = useRef(false);
  const [analyzePhase, setAnalyzePhase] = useState<AnalyzePhase>("idle");
  const [phase1Info, setPhase1Info] = useState("");
  const [streamingText, setStreamingText] = useState("");

  // Lifted from CharacterSettings for persistence across step switches
  const [isAutoDetectingAll, setIsAutoDetectingAll] = useState(false);
  const [isAbortingAutoDetect, setIsAbortingAutoDetect] = useState(false);
  const autoDetectAbortRef = useRef(false);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const isAnalyzingRef = useRef(false);

  const { createProject, saveProject, loadProject, setProjectId, getProjectId } = useSmartPersistence();

  // Load existing project or mark as ready for lazy creation
  useEffect(() => {
    const init = async () => {
      if (resumeId) {
        isRestoringRef.current = true;
        const data = await loadProject(resumeId);
        if (data) {
          setScript(data.script);
          setCharacters(data.characters);
          setSceneSettings(data.sceneSettings);
          setArtStyle(data.artStyle);
          setCurrentStep(data.currentStep as WorkspaceStep);
          setProjectTitle(data.title);
        } else if (resumeId) {
          console.warn("Project not found in database, starting fresh:", resumeId);
          toast({ title: "项目未找到", description: "该项目在数据库中不存在，已为您创建新工作区", variant: "destructive" });
          navigate("/workspace", { replace: true });
          return;
        }
      }
      setIsLoaded(true);
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    };
    init();
  }, [resumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureProjectExists = useCallback(async () => {
    if (getProjectId()) return;
    const newId = await createProject({ title: projectTitle });
    if (newId) {
      const url = new URL(window.location.href);
      url.searchParams.set("id", newId);
      window.history.replaceState({}, "", url.toString());
    }
  }, [createProject, getProjectId, projectTitle]);

  // Auto-save on state changes
  const autoSave = useCallback(
    async (data: Record<string, any>) => {
      if (!isLoaded || isRestoringRef.current) return;
      await ensureProjectExists();
      if (!getProjectId()) return;
      saveProject(data);
    },
    [isLoaded, saveProject, getProjectId, ensureProjectExists]
  );

  useEffect(() => { if (isLoaded) autoSave({ script }); }, [script]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ characters }); }, [characters]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ sceneSettings }); }, [sceneSettings]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ artStyle }); }, [artStyle]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ currentStep }); }, [currentStep]); // eslint-disable-line

  const handleCancelAnalyze = () => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    isAnalyzingRef.current = false;
    setIsAnalyzing(false);
    setAnalyzePhase("idle");
    toast({ title: "已中止", description: "角色分析已取消" });
  };

  const handleAnalyze = async () => {
    if (!script.trim() || isAnalyzingRef.current) return;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setAnalyzePhase("phase1");
    setPhase1Info("正在识别角色与场景...");
    setStreamingText("");

    const resetAnalyzing = () => {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
      analyzeAbortRef.current = null;
      setStreamingText("");
    };
    
    try {
      const controller = new AbortController();
      analyzeAbortRef.current = controller;

      // Extract characters & scenes
      const { data: extractData, error: extractError } = await invokeFunction("extract-characters-scenes", { script, model: decomposeModel }, {
        onStreamText: (text) => setStreamingText(text),
      });
      setStreamingText("");
      if (extractError) {
        setAnalyzePhase("phase1-failed");
        setPhase1Info("识别失败");
        throw extractError;
      }

      const aiCharacters: Array<{ name: string; description: string }> = extractData.characters || [];
      const aiSceneSettings: Array<{ name: string; description: string }> = extractData.sceneSettings || [];

      const autoCharacters: CharacterSetting[] = aiCharacters.map((aiChar) => ({
        id: crypto.randomUUID(),
        name: aiChar.name,
        description: aiChar?.description || "",
        isAIGenerated: false,
        source: "auto" as const,
      }));
      setCharacters(autoCharacters);

      if (aiSceneSettings.length > 0) {
        setSceneSettings(aiSceneSettings.map((s) => ({
          id: crypto.randomUUID(),
          name: s.name,
          description: s.description || "",
          isAIGenerated: false,
          source: "auto" as const,
        })));
      }

      setAnalyzePhase("done");
      setPhase1Info(`识别 ${autoCharacters.length} 个角色，${aiSceneSettings.length} 个场景`);

      const firstLine = script.trim().split("\n")[0].slice(0, 30);
      if (firstLine) { setProjectTitle(firstLine); autoSave({ title: firstLine }); }

      // Save raw output
      setRawAiOutput(JSON.stringify(extractData, null, 2));

      toast({ title: "分析完成", description: `识别 ${autoCharacters.length} 个角色，${aiSceneSettings.length} 个场景` });
      resetAnalyzing();
        
    } catch (e: any) {
      if (e?.name === "AbortError" || e?.message?.includes("aborted")) {
        setAnalyzePhase("idle");
        resetAnalyzing();
        return;
      }
      if (e?.name === "TimeoutError" || e?.message?.includes("timed out") || e?.message?.includes("timeout")) {
        setAnalyzePhase("phase1-failed");
        setPhase1Info("请求超时");
        toast({ title: "请求超时", description: "角色分析耗时过长，请尝试缩短剧本或重新分析", variant: "destructive", duration: 8000 });
        resetAnalyzing();
        return;
      }
      console.error("Character analysis error:", e);
      const fe = friendlyError(e);
      setAnalyzePhase("phase1-failed");
      setPhase1Info(fe.description);
      toast({ title: fe.title, description: `角色分析失败：${fe.description}`, variant: "destructive", duration: 8000 });
      resetAnalyzing();
    }
  };

  const canAdvanceToStep = (step: WorkspaceStep): boolean => {
    if (step <= 1) return true;
    if (step >= 2 && characters.length === 0) return false;
    return true;
  };

  const safeGoToStep = (step: WorkspaceStep) => {
    if (canAdvanceToStep(step)) setCurrentStep(step);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <ScriptInput
              script={script}
              onScriptChange={setScript}
              onAnalyze={handleAnalyze}
              onCancelAnalyze={handleCancelAnalyze}
              isAnalyzing={isAnalyzing}
              decomposeModel={decomposeModel}
              onDecomposeModelChange={setDecomposeModel}
            />
            {analyzePhase !== "idle" && (
              <AnalyzeProgress
                phase={analyzePhase}
                phase1Info={phase1Info}
                phase2Info={""}
                phase2RetryCount={0}
                phase2MaxRetries={0}
                onRetryPhase2={() => {}}
                isRetryingPhase2={false}
                streamingText={streamingText}
              />
            )}
            {rawAiOutput && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
                  查看 AI 原始输出
                </summary>
                <pre className="mt-2 p-4 rounded-lg bg-muted/50 border border-border/60 text-xs text-foreground/80 overflow-auto max-h-[400px] whitespace-pre-wrap break-words font-mono">
                  {rawAiOutput}
                </pre>
              </details>
            )}
            {characters.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={() => safeGoToStep(2)}>
                  下一步：角色与场景设置
                </Button>
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <CharacterSettings
            characters={characters}
            sceneSettings={sceneSettings}
            artStyle={artStyle}
            customArtStylePrompt={customArtStylePrompt}
            onArtStyleChange={setArtStyle}
            onCustomArtStylePromptChange={setCustomArtStylePrompt}
            onCharactersChange={setCharacters}
            onSceneSettingsChange={setSceneSettings}
            onNext={() => {}}
            script={script}
            decomposeModel={decomposeModel}
            isAutoDetectingAll={isAutoDetectingAll}
            setIsAutoDetectingAll={setIsAutoDetectingAll}
            isAbortingAutoDetect={isAbortingAutoDetect}
            setIsAbortingAutoDetect={setIsAbortingAutoDetect}
            autoDetectAbortRef={autoDetectAbortRef}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            <span className="font-semibold font-[Space_Grotesk]">{projectTitle}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="px-6 py-3 border-b border-border/30 flex items-center justify-between gap-4">
        <StepIndicator
          currentStep={currentStep}
          onStepClick={safeGoToStep}
          disabledSteps={[]}
          canAdvanceTo={canAdvanceToStep}
        />
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">{renderStep()}</main>
    </div>
  );
};

export default Workspace;