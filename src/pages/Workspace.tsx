import { useState, useEffect, useCallback, useRef } from "react";
import type { DecomposeModel } from "@/components/workspace/ScriptInput";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Film, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendly-error";
import { compressImage } from "@/lib/image-compress";
import { invokeFunction } from "@/lib/invoke-with-key";
import type { Scene, CharacterSetting, SceneSetting, WorkspaceStep, ArtStyle, VideoModel, CostumeSetting } from "@/types/project";
import { VIDEO_MODEL_API_MAP } from "@/types/project";
import { useSmartPersistence } from "@/hooks/use-smart-persistence";
import StepIndicator from "@/components/workspace/StepIndicator";
import ScriptInput from "@/components/workspace/ScriptInput";
import SceneList from "@/components/workspace/SceneList";
import CharacterSettings from "@/components/workspace/CharacterSettings";
import StoryboardPreview from "@/components/workspace/StoryboardPreview";
import VideoGeneration from "@/components/workspace/VideoGeneration";
import VideoPreview from "@/components/workspace/VideoPreview";

// Helper for concurrency control
const createSemaphore = (max: number) => {
  let current = 0;
  const queue: (() => void)[] = [];
  return {
    acquire: () => new Promise<void>((resolve) => {
      if (current < max) { current++; resolve(); }
      else queue.push(() => { current++; resolve(); });
    }),
    release: () => { current--; if (queue.length > 0) queue.shift()!(); },
  };
};

/**
 * Read a streaming response (with heartbeat newlines) chunk-by-chunk.
 * Resolves as soon as the last non-empty line contains valid JSON,
 * without waiting for the stream to fully close.
 */
const Workspace = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get("id");

  const [currentStep, setCurrentStep] = useState<WorkspaceStep>(1);
  const [script, setScript] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const scenesRef = useRef<Scene[]>([]);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  const [characters, setCharacters] = useState<CharacterSetting[]>([]);
  const [sceneSettings, setSceneSettings] = useState<SceneSetting[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [artStyle, setArtStyle] = useState<ArtStyle>("live-action");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [decomposeModel, setDecomposeModelState] = useState<DecomposeModel>(() => {
    try { return (localStorage.getItem("decompose-model") as DecomposeModel) || "gemini-3.1-pro-preview"; } catch { return "gemini-3.1-pro-preview"; }
  });
  const setDecomposeModel = (v: DecomposeModel) => {
    setDecomposeModelState(v);
    try { localStorage.setItem("decompose-model", v); } catch { /* ignore */ }
  };
  // Persistent storyboard generating state
  const SB_TASK_LS_KEY = "generating-storyboard-tasks";
  const SB_TIMEOUT_MS = 240_000;
  const [generatingScenes, setGeneratingScenes] = useState<Set<string>>(() => {
    try {
      const tasks: { id: string; startedAt: number }[] = JSON.parse(localStorage.getItem(SB_TASK_LS_KEY) || "[]");
      const now = Date.now();
      return new Set(tasks.filter((t) => now - t.startedAt < SB_TIMEOUT_MS).map((t) => t.id));
    } catch { return new Set(); }
  });
  const addSbTask = useCallback((id: string) => {
    try {
      const tasks: { id: string; startedAt: number }[] = JSON.parse(localStorage.getItem(SB_TASK_LS_KEY) || "[]");
      const filtered = tasks.filter((t) => t.id !== id);
      filtered.push({ id, startedAt: Date.now() });
      localStorage.setItem(SB_TASK_LS_KEY, JSON.stringify(filtered));
    } catch { /* ignore */ }
  }, []);
  const removeSbTask = useCallback((id: string) => {
    try {
      const tasks: { id: string; startedAt: number }[] = JSON.parse(localStorage.getItem(SB_TASK_LS_KEY) || "[]");
      localStorage.setItem(SB_TASK_LS_KEY, JSON.stringify(tasks.filter((t) => t.id !== id)));
    } catch { /* ignore */ }
  }, []);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isAbortingVideo, setIsAbortingVideo] = useState(false);
  const stopVideoGenRef = useRef(false);
  const [isGeneratingAllStoryboards, setIsGeneratingAllStoryboards] = useState(false);
  const [isAbortingStoryboards, setIsAbortingStoryboards] = useState(false);
  const stopStoryboardGenRef = useRef(false);
  // Lifted from CharacterSettings for persistence across step switches
  const [isAutoDetectingAll, setIsAutoDetectingAll] = useState(false);
  const [isAbortingAutoDetect, setIsAbortingAutoDetect] = useState(false);
  const autoDetectAbortRef = useRef(false);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const [skipStoryboard, setSkipStoryboard] = useState(false);
  const [videoModel, setVideoModelState] = useState<VideoModel>(() => {
    try { return (localStorage.getItem("workspace-video-model") as VideoModel) || "seedance-1.5-pro"; } catch { return "seedance-1.5-pro"; }
  });
  const setVideoModel = (m: VideoModel) => {
    setVideoModelState(m);
    try { localStorage.setItem("workspace-video-model", m); } catch { /* ignore */ }
  };
  const [projectTitle, setProjectTitle] = useState("未命名项目");
  const [isLoaded, setIsLoaded] = useState(false);
  const [rawAiOutput, setRawAiOutput] = useState<string>("");
  const isRestoringRef = useRef(false);

  const { createProject, saveProject, loadProject, setProjectId, getProjectId } = useSmartPersistence();

  // Load existing project or mark as ready for lazy creation
  useEffect(() => {
    const init = async () => {
      if (resumeId) {
        isRestoringRef.current = true;
        const data = await loadProject(resumeId);
        if (data) {
          setScript(data.script);
          // Clean up stale video/storyboard statuses before setting scenes
          const cleanedScenes = (data.scenes || []).map((s: Scene) => {
            const isStuck = s.videoStatus === "preparing" || s.videoStatus === "queued" || s.videoStatus === "processing";
            if (isStuck && s.videoTaskId) {
              // Has taskId — will resume polling below
              return s;
            }
            if (isStuck && !s.videoTaskId) {
              // No taskId — was in "preparing" phase before API returned, clear status
              return { ...s, videoStatus: undefined };
            }
            return s;
          });
          setScenes(cleanedScenes);
          setCharacters(data.characters);
          setSceneSettings(data.sceneSettings);
          setArtStyle(data.artStyle);
          setCurrentStep(data.currentStep as WorkspaceStep);
          setSystemPrompt(data.systemPrompt || "");
          setProjectTitle(data.title);

          // Resume polling for scenes that have an active video task
          cleanedScenes.forEach((s: Scene) => {
            if (s.videoTaskId && (s.videoStatus === "queued" || s.videoStatus === "processing")) {
              pollVideoTask(s.id, s.videoTaskId, undefined);
            }
          });
        } else if (resumeId) {
          // Project not found in database — redirect to fresh workspace
          console.warn("Project not found in database, starting fresh:", resumeId);
          toast({ title: "项目未找到", description: "该项目在数据库中不存在，已为您创建新工作区", variant: "destructive" });
          navigate("/workspace", { replace: true });
          return;
        }
      }
      // For new projects, don't create DB row until first meaningful save
      setIsLoaded(true);
      // Allow one render cycle for restored state to settle before enabling auto-save
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    };
    init();
  }, [resumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up expired storyboard tasks periodically
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const tasks: { id: string; startedAt: number }[] = JSON.parse(localStorage.getItem(SB_TASK_LS_KEY) || "[]");
        const now = Date.now();
        const expired = tasks.filter((t) => now - t.startedAt >= SB_TIMEOUT_MS);
        if (expired.length > 0) {
          localStorage.setItem(SB_TASK_LS_KEY, JSON.stringify(tasks.filter((t) => now - t.startedAt < SB_TIMEOUT_MS)));
          expired.forEach((t) => {
            setGeneratingScenes((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
          });
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const ensureProjectExists = useCallback(async () => {
    if (getProjectId()) return;
    const newId = await createProject({ title: projectTitle });
    // Update URL so navigating away and back preserves the project
    if (newId) {
      const url = new URL(window.location.href);
      url.searchParams.set("id", newId);
      window.history.replaceState({}, "", url.toString());
    }
  }, [createProject, getProjectId, projectTitle]);

  // Auto-save on state changes (after initial load, skip during restoration)
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
  useEffect(() => { if (isLoaded) autoSave({ scenes }); }, [scenes]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ characters }); }, [characters]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ sceneSettings }); }, [sceneSettings]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ artStyle }); }, [artStyle]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ currentStep }); }, [currentStep]); // eslint-disable-line
  useEffect(() => { if (isLoaded) autoSave({ systemPrompt }); }, [systemPrompt]); // eslint-disable-line

  const handleCancelAnalyze = () => {
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setIsAnalyzing(false);
    toast({ title: "已中止", description: "剧本分析已取消" });
  };

  const handleAnalyze = async () => {
    if (!script.trim()) return;
    setIsAnalyzing(true);
    
    try {
        const controller = new AbortController();
        analyzeAbortRef.current = controller;

        // ========== Phase 1: Extract characters & scenes ==========
        toast({ title: "阶段 1/2", description: "正在识别角色与场景..." });
        
        const { data: extractData, error: extractError } = await invokeFunction("extract-characters-scenes", { script, model: decomposeModel });
        if (extractError) throw extractError;

        // Process characters from phase 1
        const aiCharacters: Array<{ name: string; description: string; costumes?: Array<{ label: string; description: string }> }> = extractData.characters || [];
        const aiSceneSettings: Array<{ name: string; description: string }> = extractData.sceneSettings || [];

        const autoCharacters: CharacterSetting[] = aiCharacters.map((aiChar) => {
          const costumes: CostumeSetting[] | undefined = aiChar?.costumes && aiChar.costumes.length > 0
            ? aiChar.costumes.map((cos) => ({
                id: crypto.randomUUID(),
                label: cos.label || "",
                description: cos.description || "",
                isAIGenerated: false,
              }))
            : undefined;
          return {
            id: crypto.randomUUID(),
            name: aiChar.name,
            description: aiChar?.description || "",
            isAIGenerated: false,
            source: "auto" as const,
            costumes,
            activeCostumeId: costumes?.[0]?.id,
          };
        });
        setCharacters(autoCharacters);

        if (aiSceneSettings.length > 0) {
          const autoScenes: SceneSetting[] = aiSceneSettings.map((s) => ({
            id: crypto.randomUUID(),
            name: s.name,
            description: s.description || "",
            isAIGenerated: false,
            source: "auto" as const,
          }));
          setSceneSettings(autoScenes);
        }

        toast({ title: "阶段 1/2 完成", description: `识别 ${autoCharacters.length} 个角色，${aiSceneSettings.length} 个场景` });

        // ========== Phase 2: Script decomposition (streaming) ==========
        toast({ title: "阶段 2/2", description: "正在拆解分镜与时长分配..." });

        const { data: decomposeData, error: decomposeError } = await invokeFunction("script-decompose", { script, systemPrompt, model: decomposeModel });
        if (decomposeError) throw decomposeError;

        let parsed: any = decomposeData;
        if (!parsed) {
          throw new Error("无法解析返回的数据");
        }

        const rawScenes = Array.isArray(parsed) ? parsed : (parsed?.scenes || []);

        // Store raw AI output for display
        setRawAiOutput(JSON.stringify(parsed, null, 2));

        const parsedScenes: Scene[] = rawScenes.map((s: any, i: number) => ({
          id: crypto.randomUUID(),
          sceneNumber: s.sceneNumber ?? i + 1,
          segmentLabel: s.segmentLabel ?? "",
          sceneName: s.sceneName ?? "",
          description: s.description ?? "",
          characters: s.characters ?? [],
          dialogue: s.dialogue ?? "",
          cameraDirection: s.cameraDirection ?? "",
          duration: s.duration ?? 5,
        }));

        // Check for empty result
        if (parsedScenes.length === 0) {
          toast({ title: "警告", description: "未能从剧本中识别出任何分镜，请检查剧本内容", variant: "destructive" });
          setIsAnalyzing(false);
          return;
        }

        setScenes(parsedScenes);

        // Merge any characters found in scenes but not in phase 1
        const existingNames = new Set(autoCharacters.map(c => c.name));
        const allCharNames = new Set<string>();
        parsedScenes.forEach((s) => s.characters.forEach((name) => allCharNames.add(name)));
        const missingChars: CharacterSetting[] = Array.from(allCharNames)
          .filter(name => !existingNames.has(name))
          .map(name => ({
            id: crypto.randomUUID(),
            name,
            description: "",
            isAIGenerated: false,
            source: "auto" as const,
          }));
        if (missingChars.length > 0) {
          setCharacters(prev => [...prev, ...missingChars]);
        }

        // If phase 1 didn't extract scene settings, derive from scenes
        if (aiSceneSettings.length === 0) {
          const sceneNameSet = new Set<string>();
          parsedScenes.forEach((s) => {
            if (s.sceneName && s.sceneName.trim()) sceneNameSet.add(s.sceneName.trim());
          });
          const autoScenes: SceneSetting[] = Array.from(sceneNameSet).map((name) => ({
            id: crypto.randomUUID(),
            name,
            description: "",
            isAIGenerated: false,
            source: "auto" as const,
          }));
          setSceneSettings(autoScenes);
        }

        // Update project title from first line of script
        const firstLine = script.trim().split("\n")[0].slice(0, 30);
        if (firstLine) {
          setProjectTitle(firstLine);
          autoSave({ title: firstLine });
        }

        toast({ title: "拆解完成", description: `成功拆解为 ${parsedScenes.length} 个分镜，识别 ${autoCharacters.length + missingChars.length} 个角色` });
        
        setIsAnalyzing(false);
        return;
        
      } catch (e: any) {
        // Ignore abort errors (user cancelled)
        if (e?.name === "AbortError" || e?.message?.includes("aborted")) {
          setIsAnalyzing(false);
          return;
        }
        
        console.error("Script decompose error:", e);
        const fe = friendlyError(e);
        toast({
          title: fe.title,
          description: `剧本拆解失败：${fe.description}`,
          variant: "destructive",
          duration: 8000,
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

  const handleGenerateSceneStoryboard = async (sceneId: string, aspectRatio: string = "16:9", model: string = "gemini-3-pro-image-preview") => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    addSbTask(sceneId);
    setGeneratingScenes((prev) => new Set(prev).add(sceneId));
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const charDescs = characters
        .filter((c) => scene.characters.includes(c.name))
        .map((c) => ({ name: c.name, description: c.description }));

      // Compress reference images client-side to reduce edge function payload & processing time
      // For each character, check if the scene specifies a costume; if so, use costume image
      const characterImages = await Promise.all(
        characters
          .filter((c) => scene.characters.includes(c.name) && (c.imageUrl || (c.costumes && c.costumes.some(cos => cos.imageUrl))))
          .map(async (c) => {
            let imageUrl = c.imageUrl;
            // Check scene-level costume assignment first
            const costumeId = scene.characterCostumes?.[c.name];
            if (costumeId && c.costumes) {
              const costume = c.costumes.find(cos => cos.id === costumeId);
              if (costume?.imageUrl) imageUrl = costume.imageUrl;
            } else if (c.costumes && c.costumes.length > 1) {
              // Auto-match: find the best costume variant based on scene text
              const sceneText = `${scene.description} ${scene.dialogue}`.toLowerCase();
              // Score each costume: check how many label components match the scene text
              // For labels like "18岁·护士服", split on "·" and check each part
              let bestCostume: typeof c.costumes[0] | null = null;
              let bestScore = 0;
              for (const cos of c.costumes) {
                if (!cos.label || !cos.imageUrl) continue;
                const label = cos.label.toLowerCase();
                // Check full label match first (highest priority)
                if (sceneText.includes(label)) {
                  const score = label.length + 100; // full match bonus
                  if (score > bestScore) { bestScore = score; bestCostume = cos; }
                  continue;
                }
                // Split on "·" or "·" (full-width/half-width dot) and score by component matches
                const parts = label.split(/[·・]/).map(p => p.trim()).filter(Boolean);
                let componentScore = 0;
                let matchedParts = 0;
                for (const part of parts) {
                  if (part && sceneText.includes(part)) {
                    componentScore += part.length;
                    matchedParts++;
                  }
                }
                // Only consider if at least one part matches; prefer more parts matched
                if (matchedParts > 0) {
                  const score = componentScore + matchedParts * 10;
                  if (score > bestScore) { bestScore = score; bestCostume = cos; }
                }
              }
              if (bestCostume) imageUrl = bestCostume.imageUrl;
            }
            if (!imageUrl) return null;
            return {
              name: c.name,
              // Higher quality for character refs (1536px, 1.2MB) to preserve facial details
              imageUrl: await compressImage(imageUrl, 1200 * 1024, { maxDim: 1536 }),
            };
          })
      ).then(results => results.filter(Boolean) as { name: string; imageUrl: string }[]);

      const sceneSetting = sceneSettings.find((ss) => ss.name === scene.sceneName?.trim());
      const sceneImageUrl = sceneSetting?.imageUrl
        ? await compressImage(sceneSetting.imageUrl, 800 * 1024)
        : undefined;

      // Gather neighboring scenes in the same scene group for spatial continuity
      const sameSceneGroup = scenes.filter((s) => s.sceneName?.trim() === scene.sceneName?.trim());
      const sceneIdx = sameSceneGroup.findIndex((s) => s.id === sceneId);
      const prevScene = sceneIdx > 0 ? sameSceneGroup[sceneIdx - 1] : undefined;
      const nextScene = sceneIdx < sameSceneGroup.length - 1 ? sameSceneGroup[sceneIdx + 1] : undefined;

      // Compress previous storyboard for continuity reference
      const prevStoryboardUrl = prevScene?.storyboardUrl
        ? await compressImage(prevScene.storyboardUrl, 800 * 1024)
        : undefined;

      const neighborContext = {
        prevDescription: prevScene?.description || "",
        prevDialogue: prevScene?.dialogue || "",
        prevCamera: prevScene?.cameraDirection || "",
        prevCharacters: prevScene?.characters || [],
        nextDescription: nextScene?.description || "",
        nextDialogue: nextScene?.dialogue || "",
        totalShotsInScene: sameSceneGroup.length,
        currentShotIndex: sceneIdx + 1,
      };

      const abortController = new AbortController();
      timeoutId = setTimeout(() => abortController.abort(), 300_000);

      // Use local invokeFunction for storyboard generation
      const { data, error: sbError } = await invokeFunction("generate-storyboard", {
        description: scene.description,
        characters: scene.characters,
        characterDescriptions: charDescs,
        characterImages,
        sceneImageUrl,
        prevStoryboardUrl,
        cameraDirection: scene.cameraDirection || "",
        sceneName: scene.sceneName || "",
        sceneDescription: sceneSetting?.description || "",
        dialogue: scene.dialogue || "",
        style: artStyle,
        mode: "single",
        aspectRatio,
        model,
        scriptExcerpt: script?.slice(0, 2000) || "",
        neighborContext,
      });
      clearTimeout(timeoutId);

      if (sbError) throw sbError;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error)));
      if (!data?.imageUrl) throw new Error("API 返回数据中缺少 imageUrl");

      setScenes((prev) =>
        prev.map((s) => {
          if (s.id !== sceneId) return s;
          const history = [...(s.storyboardHistory || [])];
          if (s.storyboardUrl) history.push(s.storyboardUrl);
          return { ...s, storyboardUrl: data.imageUrl, storyboardHistory: history };
        })
      );
      toast({ title: "生成完成", description: `分镜 #${scene.sceneNumber} 分镜图已生成` });
    } catch (e: any) {
      clearTimeout(timeoutId!);
      console.error("Storyboard generation error:", e);
      if (!isGeneratingAllStoryboards) {
        const fe = friendlyError(e);
        toast({ title: fe.title, description: `分镜图生成失败：${fe.description}`, variant: "destructive" });
      }
      throw e; // Re-throw for batch retry logic
    } finally {
      removeSbTask(sceneId);
      setGeneratingScenes((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const handleGenerateAllStoryboards = async (aspectRatio: string = "16:9", model: string = "gemini-3-pro-image-preview") => {
    stopStoryboardGenRef.current = false;
    setIsAbortingStoryboards(false);
    setIsGeneratingAllStoryboards(true);

    // Group scenes by sceneName for strict sequential generation within same scene
    const sceneGroups = new Map<string, typeof scenes>();
    for (const scene of scenes) {
      const key = (scene.sceneName || "").trim() || `__solo_${scene.id}`;
      if (!sceneGroups.has(key)) sceneGroups.set(key, []);
      sceneGroups.get(key)!.push(scene);
    }

    // Semaphore for max 3 concurrent generations ACROSS groups
    let running = 0;
    const queue: (() => void)[] = [];
    const acquire = () => new Promise<void>((resolve) => {
      if (running < 3) { running++; resolve(); }
      else queue.push(() => { running++; resolve(); });
    });
    const release = () => { running--; if (queue.length > 0) queue.shift()!(); };

    const successCountRef = { current: 0 };
    const failCountRef = { current: 0 };
    const failedSceneIds = new Set<string>();

    // Process one scene group STRICTLY sequentially (same scene → shots in order, no jumping)
    const processGroup = async (groupScenes: typeof scenes) => {
      for (const scene of groupScenes) {
        if (stopStoryboardGenRef.current) return;
        // Acquire semaphore but NEVER skip ahead — wait here until slot available
        await acquire();
        if (stopStoryboardGenRef.current) { release(); return; }

        let succeeded = false;
        try {
          await handleGenerateSceneStoryboard(scene.id, aspectRatio, model);
          succeeded = true;
        } catch {
          // No retry — fail immediately
        }
        if (succeeded) successCountRef.current++; else { failCountRef.current++; failedSceneIds.add(scene.id); }
        // MUST release AFTER this shot finishes before next shot in the SAME group proceeds
        release();
      }
    };

    // Launch all scene groups in parallel (cross-group concurrency via semaphore)
    const groupTasks = Array.from(sceneGroups.values()).map((group) => processGroup(group));
    await Promise.all(groupTasks);

    // Review pass removed — no automatic retries

    const aborted = stopStoryboardGenRef.current;
    setIsGeneratingAllStoryboards(false);
    setIsAbortingStoryboards(false);
    toast({
      title: aborted ? "已中止" : "全部分镜图生成完成",
      description: `成功 ${successCountRef.current} 张${failCountRef.current > 0 ? `，失败 ${failCountRef.current} 张` : ""}${aborted ? "（已中止）" : ""}`,
    });
  };

  const handleStopAllStoryboards = () => {
    stopStoryboardGenRef.current = true;
    setIsAbortingStoryboards(true);
  };

  const generateVideoForScene = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    // Mark scene as preparing immediately (shows spinner during prompt enhancement)
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, videoStatus: "preparing" } : s))
    );

    // Strip bracket notation [角色名] → 角色名 for cleaner video prompts
    const cleanBrackets = (text: string) => text.replace(/\[([^\]]+)\]/g, "$1");

    const hasRefImage = !skipStoryboard && !!scene.storyboardUrl;

    // Gather context: prev/next scene descriptions for continuity
    const sceneIdx = scenes.findIndex((s) => s.id === sceneId);
    const prevScene = sceneIdx > 0 ? scenes[sceneIdx - 1] : null;
    const nextScene = sceneIdx < scenes.length - 1 ? scenes[sceneIdx + 1] : null;

    // --- Step 1: Enhance prompt via AI ---
    let enhancedDescription = cleanBrackets(scene.description);
    const maxDuration = videoModel === "vidu-q3" ? 16 : 15;
    // If user manually set duration, use that; otherwise use AI recommendation
    const isManual = scene.isManualDuration && scene.recommendedDuration;
    let recommendedDuration: number = isManual ? scene.recommendedDuration! : Math.max(4, Math.min(maxDuration, scene.duration || 5));
    try {
      const { data: enhanceData, error: enhanceError } = await invokeFunction("enhance-video-prompt", {
        description: cleanBrackets(scene.description),
        sceneName: scene.sceneName?.trim(),
        characters: scene.characters.map((c) => String(c || "")).filter(Boolean),
        dialogue: scene.dialogue ? cleanBrackets(scene.dialogue) : undefined,
        prevDescription: prevScene ? cleanBrackets(prevScene.description) : undefined,
        nextDescription: nextScene ? cleanBrackets(nextScene.description) : undefined,
        hasRefImage,
      });
      if (!enhanceError && enhanceData?.enhanced) {
        enhancedDescription = enhanceData.enhanced;
        if (!isManual && enhanceData.duration) {
          recommendedDuration = enhanceData.duration;
        }
        console.log(`Enhanced prompt for scene #${scene.sceneNumber} (duration: ${recommendedDuration}s, manual: ${!!isManual}):`, enhancedDescription.substring(0, 200));
      }
    } catch (err) {
      console.warn("Prompt enhancement failed, using original:", err);
    }

    // --- Step 2: Assemble final prompt ---
    const promptParts: string[] = [];

    if (hasRefImage) {
      const sceneName = scene.sceneName?.trim();
      if (sceneName) promptParts.push(`场景：${sceneName}`);
      const charNames = scene.characters.map((c) => String(c || "")).filter(Boolean);
      if (charNames.length > 0) promptParts.push(`人物：${charNames.join("、")}`);
    } else {
      const sceneName = scene.sceneName?.trim();
      if (sceneName) {
        const matchedSetting = sceneSettings.find((ss) => ss.name === sceneName);
        const settingDesc = matchedSetting?.description ? `${matchedSetting.description}的` : "";
        promptParts.push(`在场景${settingDesc}「${sceneName}」中`);
      }
      const charDescs = scene.characters
        .map((charName) => {
          const charSetting = characters.find((c) => c.name === charName);
          if (charSetting?.description) return `${charName}（${charSetting.description}）`;
          return String(charName || "");
        });
      if (charDescs.length > 0) promptParts.push(`人物：${charDescs.join("、")}`);
    }

    // Use AI-enhanced description instead of raw description
    promptParts.push(enhancedDescription);

    const prompt = promptParts.join("\n");

    try {
      // Submit task — prefer image-to-video if storyboard exists
      const body: Record<string, unknown> = {
        action: "create",
        prompt,
        model: VIDEO_MODEL_API_MAP[videoModel],
        duration: recommendedDuration,
        aspectRatio: (() => { try { return localStorage.getItem("storyboard-aspect-ratio") || "16:9"; } catch { return "16:9"; } })(),
      };
      if (scene.storyboardUrl) {
        // Compress image to under 10MB before sending
        const { compressImage } = await import("@/lib/image-compress");
        body.imageUrl = await compressImage(scene.storyboardUrl);
      }

      const { data, error } = await invokeFunction("generate-video", body);
      if (error) throw error;

      const taskId = data.task_id;
      const provider = data.provider; // "vidu" or "seedance"
      if (!taskId) throw new Error("未返回 task_id");

      // Mark scene as generating, store recommended duration
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, videoTaskId: taskId, videoStatus: "queued", recommendedDuration } : s))
      );

      toast({ title: "已提交", description: `分镜 #${scene.sceneNumber} 视频生成任务已提交` });

      // Start polling
      pollVideoTask(sceneId, taskId, provider);
    } catch (e: any) {
      console.error("Video generation error:", e);
      setScenes((prev) =>
        prev.map((s) => (s.id === sceneId ? { ...s, videoStatus: "failed", videoTaskId: undefined } : s))
      );
      const fe = friendlyError(e);
      toast({ title: fe.title, description: `视频生成失败：${fe.description}`, variant: "destructive" });
    }
  };

  const pollVideoTask = async (sceneId: string, taskId: string, provider?: string) => {
    const maxAttempts = 120; // 10 min max
    let attempts = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    const poll = async () => {
      attempts++;
      try {
        const { data, error } = await invokeFunction("generate-video", { action: "status", taskId, provider });
        if (error) throw error;
        consecutiveErrors = 0; // reset on success

        const status = data?.status;

        if (status === "completed" || status === "succeeded") {
          const videoUrl = data?.video_url || data?.output?.video_url || data?.result?.url || data?.url;
          setScenes((prev) =>
            prev.map((s) => {
              if (s.id !== sceneId) return s;
              const history = [...(s.videoHistory || [])];
              if (s.videoUrl && !history.some((h) => h.videoUrl === s.videoUrl)) {
                history.push({ videoUrl: s.videoUrl, createdAt: new Date().toISOString() });
              }
              return { ...s, videoUrl, videoStatus: "completed", videoTaskId: undefined, videoHistory: history };
            })
          );
          toast({ title: "视频生成完成", description: `分镜视频已就绪` });
          return;
        }

        if (status === "failed" || status === "error") {
          setScenes((prev) =>
            prev.map((s) =>
              s.id === sceneId ? { ...s, videoStatus: "failed", videoTaskId: undefined } : s
            )
          );
          const errMsg = typeof data?.error === 'string' ? data.error : (data?.error?.message || "任务失败");
          const fe = friendlyError(errMsg);
          toast({ title: fe.title, description: `视频生成失败：${fe.description}`, variant: "destructive" });
          return;
        }

        setScenes((prev) =>
          prev.map((s) => (s.id === sceneId ? { ...s, videoStatus: status || "processing" } : s))
        );

        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          setScenes((prev) =>
            prev.map((s) => s.id === sceneId ? { ...s, videoStatus: "failed", videoTaskId: undefined } : s)
          );
          toast({ title: "⏳ 视频生成超时", description: "视频生成时间过长，请稍后刷新页面查看。", variant: "destructive" });
        }
      } catch (e: any) {
        console.error("Poll error:", e);
        const errMsg = e?.message || String(e);
        // Terminal errors that won't recover with retries
        const isTerminal = /task_not_exist|not.?found|invalid.*task|forbidden|unauthorized|4[0-9]{2}/i.test(errMsg);
        if (isTerminal) {
          setScenes((prev) =>
            prev.map((s) => s.id === sceneId ? { ...s, videoStatus: "failed", videoTaskId: undefined } : s)
          );
          const fe = friendlyError(errMsg);
          toast({ title: fe.title, description: `视频生成失败：${fe.description}`, variant: "destructive" });
          return;
        }
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          setScenes((prev) =>
            prev.map((s) => s.id === sceneId ? { ...s, videoStatus: "failed", videoTaskId: undefined } : s)
          );
          toast({ title: "网络连接失败", description: "连续多次无法连接视频服务器，请检查网络后重试。", variant: "destructive" });
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        }
      }
    };

    setTimeout(poll, 5000);
  };

  const handleGenerateVideos = async () => {
    stopVideoGenRef.current = false;
    setIsAbortingVideo(false);
    setIsGeneratingVideo(true);

    const successCountRef = { current: 0 };
    const failCountRef = { current: 0 };

    // Group scenes by sceneName for strict sequential generation within same scene
    const sceneGroups = new Map<string, typeof scenes>();
    for (const scene of scenes) {
      const key = (scene.sceneName || "").trim() || `__solo_${scene.id}`;
      if (!sceneGroups.has(key)) sceneGroups.set(key, []);
      sceneGroups.get(key)!.push(scene);
    }

    // Semaphore for max 3 concurrent video submissions ACROSS groups
    let running = 0;
    const queue: (() => void)[] = [];
    const acquire = () => new Promise<void>((resolve) => {
      if (running < 3) { running++; resolve(); }
      else queue.push(() => { running++; resolve(); });
    });
    const release = () => { running--; if (queue.length > 0) queue.shift()!(); };

    const failedVideoIds = new Set<string>();

    // Process one scene group STRICTLY sequentially (same scene → shots in order)
    const processGroup = async (groupScenes: typeof scenes) => {
      for (const scene of groupScenes) {
        if (stopVideoGenRef.current) return;
        await acquire();
        if (stopVideoGenRef.current) { release(); return; }

        let succeeded = false;
        try {
          await generateVideoForScene(scene.id);
          succeeded = true;
        } catch {
          // No retry — fail immediately
        }
        if (succeeded) successCountRef.current++; else { failCountRef.current++; failedVideoIds.add(scene.id); }
        release();
      }
    };

    // Launch all scene groups in parallel (cross-group concurrency via semaphore)
    const groupTasks = Array.from(sceneGroups.values()).map((group) => processGroup(group));
    await Promise.all(groupTasks);

    // Review pass removed — no automatic retries

    const aborted = stopVideoGenRef.current;
    setIsGeneratingVideo(false);
    setIsAbortingVideo(false);
    toast({
      title: aborted ? "已中止" : "全部视频生成完成",
      description: `已提交 ${successCountRef.current} 个${failCountRef.current > 0 ? `，失败 ${failCountRef.current} 个` : ""}${aborted ? "（已中止，已提交的任务仍会继续）" : ""}`,
    });
  };

  const handleStopVideos = () => {
    stopVideoGenRef.current = true;
    setIsAbortingVideo(true);
  };

  const handleRegenerateVideo = async (sceneId: string) => {
    await generateVideoForScene(sceneId);
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
            {scenes.length > 0 && (
              <SceneList scenes={scenes} onScenesChange={setScenes} onNext={() => setCurrentStep(2)} characters={characters} />
            )}
          </div>
        );
      case 2:
        return (
          <CharacterSettings
            characters={characters}
            sceneSettings={sceneSettings}
            artStyle={artStyle}
            onArtStyleChange={setArtStyle}
            onCharactersChange={setCharacters}
            onSceneSettingsChange={setSceneSettings}
            onNext={() => setCurrentStep(skipStoryboard ? 4 : 3)}
            script={script}
            decomposeModel={decomposeModel}
            isAutoDetectingAll={isAutoDetectingAll}
            setIsAutoDetectingAll={setIsAutoDetectingAll}
            isAbortingAutoDetect={isAbortingAutoDetect}
            setIsAbortingAutoDetect={setIsAbortingAutoDetect}
            autoDetectAbortRef={autoDetectAbortRef}
          />
        );
      case 3:
        return (
          <StoryboardPreview
            scenes={scenes}
            characters={characters}
            onGenerateScene={handleGenerateSceneStoryboard}
            onGenerateAll={handleGenerateAllStoryboards}
            onStopAll={handleStopAllStoryboards}
            onScenesChange={setScenes}
            generatingScenes={generatingScenes}
            isGeneratingAll={isGeneratingAllStoryboards}
            isAborting={isAbortingStoryboards}
            onNext={() => setCurrentStep(4)}
          />
        );
      case 4:
        return (
          <VideoGeneration
            scenes={scenes}
            videoModel={videoModel}
            onVideoModelChange={setVideoModel}
            onGenerateAll={handleGenerateVideos}
            onStopAll={handleStopVideos}
            onRegenerateScene={handleRegenerateVideo}
            isGenerating={isGeneratingVideo}
            isAborting={isAbortingVideo}
            onNext={() => setCurrentStep(5)}
            onScenesChange={setScenes}
            useImg2Video={!skipStoryboard}
          />
        );
      case 5:
        return <VideoPreview scenes={scenes} />;
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
        <StepIndicator currentStep={currentStep} onStepClick={setCurrentStep} disabledSteps={skipStoryboard ? [3] : []} />
        <div className="flex items-center gap-2 shrink-0">
          <Switch id="skip-storyboard" checked={!skipStoryboard} onCheckedChange={(v) => setSkipStoryboard(!v)} />
          <Label htmlFor="skip-storyboard" className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
            {skipStoryboard ? "文生视频" : "图生视频"}
          </Label>
        </div>
      </div>

      <main className={`flex-1 ${currentStep === 3 || currentStep === 4 ? "max-w-7xl" : "max-w-4xl"} mx-auto w-full p-6`}>{renderStep()}</main>
    </div>
  );
};

export default Workspace;
