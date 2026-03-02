import { useState, useRef, useEffect, useCallback } from "react";
import { CharacterSetting, SceneSetting, ArtStyle, ART_STYLE_LABELS, ImageHistoryEntry, CostumeSetting } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Upload, Sparkles, ArrowRight, User, MapPin, Loader2, ImageIcon, ChevronDown, Shirt,
} from "lucide-react";
import ImageThumbnail from "./ImageThumbnail";

export type CharImageModel = "gemini-3-pro-image-preview" | "gemini-3.1-flash-image-preview" | "doubao-seedream-5-0-260128";

const CHAR_IMAGE_MODEL_OPTIONS: { value: CharImageModel; label: string }[] = [
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
];
import ImageHistoryDialog from "./ImageHistoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendly-error";
import { ensureStorageUrl } from "@/lib/upload-base64-to-storage";

const CHAR_IMAGE_TIMEOUT_MS = 180_000;
const SCENE_IMAGE_TIMEOUT_MS = 300_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label = "图像生成"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}超时（${ms / 1000}秒），请稍后重试`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface CharacterSettingsProps {
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
  artStyle: ArtStyle;
  onArtStyleChange: (style: ArtStyle) => void;
  onCharactersChange: (c: CharacterSetting[]) => void;
  onSceneSettingsChange: (s: SceneSetting[]) => void;
  onNext: () => void;
  script?: string;
  isAutoDetectingAll: boolean;
  setIsAutoDetectingAll: (v: boolean) => void;
  isAbortingAutoDetect: boolean;
  setIsAbortingAutoDetect: (v: boolean) => void;
  autoDetectAbortRef: React.MutableRefObject<boolean>;
}

const CharacterSettings = ({
  characters,
  sceneSettings,
  artStyle,
  onArtStyleChange,
  onCharactersChange,
  onSceneSettingsChange,
  onNext,
  script,
  isAutoDetectingAll,
  setIsAutoDetectingAll,
  isAbortingAutoDetect,
  setIsAbortingAutoDetect,
  autoDetectAbortRef,
}: CharacterSettingsProps) => {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const sceneFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [expandedCostumeCharIds, setExpandedCostumeCharIds] = useState<Set<string>>(new Set());

  // Auto-expand costume panel for characters that have multiple costumes (e.g. from script decomposition)
  const prevCharIdsRef = useRef<string>("");
  useEffect(() => {
    const currentIds = characters.map(c => c.id).join(",");
    if (currentIds === prevCharIdsRef.current) return; // only trigger on character list change
    prevCharIdsRef.current = currentIds;
    const charsWithCostumes = characters.filter(c => c.costumes && c.costumes.length > 1);
    if (charsWithCostumes.length > 0) {
      setExpandedCostumeCharIds(prev => {
        const next = new Set(prev);
        charsWithCostumes.forEach(c => next.add(c.id));
        return next;
      });
    }
  }, [characters]);

  // Image model selector state (persisted to localStorage)
  const [charImageModel, setCharImageModelState] = useState<CharImageModel>(() => {
    try { return (localStorage.getItem("char-image-model") as CharImageModel) || "gemini-3-pro-image-preview"; } catch { return "gemini-3-pro-image-preview"; }
  });
  const setCharImageModel = (v: CharImageModel) => {
    setCharImageModelState(v);
    try { localStorage.setItem("char-image-model", v); } catch {}
  };
  const [charModelOpen, setCharModelOpen] = useState(false);
  const charModelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (charModelDropdownRef.current && !charModelDropdownRef.current.contains(e.target as Node)) {
        setCharModelOpen(false);
      }
    };
    if (charModelOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [charModelOpen]);

  const currentCharModel = CHAR_IMAGE_MODEL_OPTIONS.find((o) => o.value === charImageModel)!;

  // ---- Character helpers ----
  const addCharacter = () => {
    onCharactersChange([
      ...characters,
      { id: crypto.randomUUID(), name: "", description: "", isAIGenerated: false, source: "manual" },
    ]);
  };

  const updateCharacter = (id: string, updates: Partial<CharacterSetting>) => {
    onCharactersChange(characters.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const updateCharacterAsync = (id: string, updates: Partial<CharacterSetting>) => {
    onCharactersChange(charactersRef.current.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleUploadImage = (id: string) => fileInputRefs.current[id]?.click();
  const handleFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "characters");
    try {
      const { data, error } = await supabase.functions.invoke("upload-image", { body: formData });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updateCharacter(id, { imageUrl: data.imageUrl, isAIGenerated: false });
    } catch (err: any) {
      const fe = friendlyError(err);
      toast({ title: fe.title, description: fe.description, variant: "destructive" });
    }
  };

  const handleGenerateCharacter = async (id: string) => {
    if (generatingCharImgIds.has(id)) return; // prevent duplicate calls
    const character = characters.find((c) => c.id === id);
    if (!character || !String(character.name || "").trim()) {
      toast({ title: "请先填写角色名称", variant: "destructive" });
      return;
    }

    const hasCostumes = character.costumes && character.costumes.length > 0;

    if (hasCostumes) {
      // For characters with costumes: generate images for ALL costume variants sequentially
      // This ensures visual consistency (same person, different outfits)
      setGeneratingCharImgIds((prev) => new Set(prev).add(id));
      const costumes = character.costumes!;
      let successCount = 0;
      let failCount = 0;
      let firstSuccessImageUrl: string | undefined = character.imageUrl; // Use base character image as initial anchor
      let anchorLocked = !!character.imageUrl; // If base image exists, it's already our anchor

      for (const cos of costumes) {
        if (!cos.label?.trim()) continue;
        // Auto-switch to the costume being generated
        updateCharacterAsync(id, { activeCostumeId: cos.id });
        const cosTaskKey = `costume-${cos.id}`;
        addTask(cosTaskKey, "charImg");
        setGeneratingCharImgIds((prev) => new Set(prev).add(cosTaskKey));
        try {
          const freshChar = charactersRef.current.find((ch) => ch.id === id);
          const freshCos = freshChar?.costumes?.find(cc => cc.id === cos.id);
          const combinedDesc = `${character.name}，${freshCos?.label || cos.label}：${freshCos?.description || cos.description || freshChar?.description || character.description}`;
          const { data, error } = await withTimeout(
            supabase.functions.invoke("generate-character", {
              body: {
                name: `${character.name} - ${freshCos?.label || cos.label}`,
                description: combinedDesc,
                style: artStyle,
                model: charImageModel,
                referenceImageUrl: firstSuccessImageUrl || undefined,
              },
            }),
            CHAR_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const cosUrl = await ensureStorageUrl(data.imageUrl, "costumes");
          // Lock the first successful image as the anchor for ALL subsequent costumes
          if (!anchorLocked) {
            firstSuccessImageUrl = cosUrl;
            anchorLocked = true;
          }
          // Update costume image with history
          const charNow = charactersRef.current.find((ch) => ch.id === id);
          if (charNow) {
            const updatedCostumes = (charNow.costumes || []).map(cc => {
              if (cc.id !== cos.id) return cc;
              const history = [...(cc.imageHistory || [])];
              if (cc.imageUrl) {
                history.push({ imageUrl: cc.imageUrl, description: cc.description || "", createdAt: new Date().toISOString() });
              }
              return { ...cc, imageUrl: cosUrl, isAIGenerated: true, imageHistory: history };
            });
            updateCharacterAsync(id, { costumes: updatedCostumes });
          }
          successCount++;
          toast({ title: "生成成功", description: `${character.name}「${freshCos?.label || cos.label}」服装设定图已生成（${successCount}/${costumes.length}）` });
        } catch (e: any) {
          console.error(`Costume generation error for ${cos.label}:`, e);
          failCount++;
          const fe = friendlyError(e);
          toast({ title: fe.title, description: `${character.name}「${cos.label}」生成失败：${fe.description}`, variant: "destructive" });
          // Don't update lastSuccessImageUrl on failure — next costume will still reference the last successful one
        } finally {
          removeTask(cosTaskKey, "charImg");
          setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(cosTaskKey); return next; });
        }
      }

      setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (successCount > 0) {
        toast({ title: "全部服装设定图生成完成", description: `${character.name}：成功 ${successCount} 套${failCount > 0 ? `，失败 ${failCount} 套` : ""}` });
      }
    } else {
      // No costumes — original single character image generation
      addTask(id, "charImg");
      setGeneratingCharImgIds((prev) => new Set(prev).add(id));
      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke("generate-character", {
            body: { name: character.name, description: character.description, style: artStyle, model: charImageModel },
          }),
          CHAR_IMAGE_TIMEOUT_MS,
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const imgUrl = await ensureStorageUrl(data.imageUrl, "characters");
        const history = [...(character.imageHistory || [])];
        if (character.imageUrl) {
          history.push({ imageUrl: character.imageUrl, description: character.description || "", createdAt: new Date().toISOString() });
        }
        updateCharacterAsync(id, { imageUrl: imgUrl, isAIGenerated: true, imageHistory: history });
        toast({ title: "生成成功", description: `${character.name} 的三视图已生成` });
      } catch (e: any) {
        console.error("Character generation error:", e);
        const fe = friendlyError(e);
        toast({ title: fe.title, description: `${characters.find(c => c.id === id)?.name || "角色"}图像生成失败：${fe.description}`, variant: "destructive" });
      } finally {
        removeTask(id, "charImg");
        setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
  };

  // ---- Scene helpers ----
  const addSceneSetting = () => {
    onSceneSettingsChange([
      ...sceneSettings,
      { id: crypto.randomUUID(), name: "", description: "", isAIGenerated: false, source: "manual" },
    ]);
  };

  const updateScene = (id: string, updates: Partial<SceneSetting>) => {
    onSceneSettingsChange(sceneSettings.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const sceneSettingsRef = useRef(sceneSettings);
  sceneSettingsRef.current = sceneSettings;
  const updateSceneAsync = (id: string, updates: Partial<SceneSetting>) => {
    onSceneSettingsChange(sceneSettingsRef.current.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleUploadSceneImage = (id: string) => sceneFileInputRefs.current[id]?.click();
  const handleSceneFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "scenes");
    try {
      const { data, error } = await supabase.functions.invoke("upload-image", { body: formData });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updateScene(id, { imageUrl: data.imageUrl, isAIGenerated: false });
    } catch (err: any) {
      const fe = friendlyError(err);
      toast({ title: fe.title, description: fe.description, variant: "destructive" });
    }
  };

  const handleGenerateScene = async (id: string) => {
    if (generatingSceneImgIds.has(id)) return; // prevent duplicate calls
    const scene = sceneSettings.find((s) => s.id === id);
    if (!scene || !String(scene.name || "").trim()) {
      toast({ title: "请先填写场景名称", variant: "destructive" });
      return;
    }
    addTask(id, "sceneImg");
    setGeneratingSceneImgIds((prev) => new Set(prev).add(id));
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("generate-scene", {
          body: { name: scene.name, description: scene.description, style: artStyle, model: charImageModel },
        }),
        SCENE_IMAGE_TIMEOUT_MS,
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const sceneImgUrl = await ensureStorageUrl(data.imageUrl, "scenes");
      // Save current image to history before replacing
      const history = [...(scene.imageHistory || [])];
      if (scene.imageUrl) {
        history.push({ imageUrl: scene.imageUrl, description: scene.description || "", createdAt: new Date().toISOString() });
      }
      updateSceneAsync(id, { imageUrl: sceneImgUrl, isAIGenerated: true, imageHistory: history });
      toast({ title: "生成成功", description: `场景「${scene.name}」已生成` });
    } catch (e: any) {
      console.error("Scene generation error:", e);
      const fe = friendlyError(e);
      toast({ title: fe.title, description: `场景「${sceneSettings.find(s => s.id === id)?.name || ""}」图像生成失败：${fe.description}`, variant: "destructive" });
    } finally {
      removeTask(id, "sceneImg");
      setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // --- Persistent generating state ---
  const LS_KEY = "generating-tasks";
  type TaskEntry = { id: string; type: "charDesc" | "charImg" | "sceneDesc" | "sceneImg"; startedAt: number };
  const TIMEOUT_MAP: Record<TaskEntry["type"], number> = {
    charDesc: 60_000, charImg: CHAR_IMAGE_TIMEOUT_MS, sceneDesc: 60_000, sceneImg: SCENE_IMAGE_TIMEOUT_MS,
  };

  const readTasks = useCallback((): TaskEntry[] => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
  }, []);
  const writeTasks = useCallback((tasks: TaskEntry[]) => {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks));
  }, []);
  const addTask = useCallback((id: string, type: TaskEntry["type"]) => {
    const tasks = readTasks().filter((t) => !(t.id === id && t.type === type));
    tasks.push({ id, type, startedAt: Date.now() });
    writeTasks(tasks);
  }, [readTasks, writeTasks]);
  const removeTask = useCallback((id: string, type: TaskEntry["type"]) => {
    writeTasks(readTasks().filter((t) => !(t.id === id && t.type === type)));
  }, [readTasks, writeTasks]);

  // Restore generating state from localStorage on mount
  const initSet = (type: TaskEntry["type"]): Set<string> => {
    try {
      const tasks: TaskEntry[] = JSON.parse(localStorage.getItem("generating-tasks") || "[]");
      const now = Date.now();
      const timeout = type === "charImg" ? CHAR_IMAGE_TIMEOUT_MS : type === "sceneImg" ? SCENE_IMAGE_TIMEOUT_MS : 60_000;
      return new Set(tasks.filter((t) => t.type === type && now - t.startedAt < timeout).map((t) => t.id));
    } catch { return new Set(); }
  };

  const [generatingDescIds, setGeneratingDescIds] = useState<Set<string>>(() => initSet("sceneDesc"));
  const [generatingCharDescIds, setGeneratingCharDescIds] = useState<Set<string>>(() => initSet("charDesc"));
  const [generatingCharImgIds, setGeneratingCharImgIds] = useState<Set<string>>(() => initSet("charImg"));
  const [generatingSceneImgIds, setGeneratingSceneImgIds] = useState<Set<string>>(() => initSet("sceneImg"));
  // isAutoDetectingAll, setIsAutoDetectingAll, autoDetectAbortRef are now props from Workspace

  // Clean up expired tasks periodically (safety net for long-running tasks)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const tasks = readTasks();
      const expired = tasks.filter((t) => now - t.startedAt >= TIMEOUT_MAP[t.type]);
      if (expired.length > 0) {
        writeTasks(tasks.filter((t) => now - t.startedAt < TIMEOUT_MAP[t.type]));
        expired.forEach((t) => {
          if (t.type === "charDesc") setGeneratingCharDescIds((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
          if (t.type === "charImg") setGeneratingCharImgIds((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
          if (t.type === "sceneDesc") setGeneratingDescIds((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
          if (t.type === "sceneImg") setGeneratingSceneImgIds((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [readTasks, writeTasks]);

  const handleAutoDescribeCharacter = async (id: string) => {
    const character = characters.find((c) => c.id === id);
    if (!character || !String(character.name || "").trim()) {
      toast({ title: "请先填写角色名称", variant: "destructive" });
      return;
    }
    if (!script?.trim()) {
      toast({ title: "缺少剧本内容", description: "请先在第一步输入剧本", variant: "destructive" });
      return;
    }
    const hasCostumesToDescribe = character.costumes && character.costumes.length > 0;
    addTask(id, "charDesc");
    setGeneratingCharDescIds(prev => new Set(prev).add(id));
    try {
      if (hasCostumesToDescribe) {
        // Describe each costume variant individually
        const costumeLabels = character.costumes!.map(cos => cos.label || "未命名").join("、");
        const { data, error } = await supabase.functions.invoke("generate-character-description", {
          body: {
            characterName: character.name,
            script,
            costumes: character.costumes!.map(cos => cos.label || "未命名"),
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        // Apply per-costume descriptions
        if (data.costumeDescriptions && Array.isArray(data.costumeDescriptions)) {
          const updatedCostumes = character.costumes!.map((cos, i) => ({
            ...cos,
            description: data.costumeDescriptions[i]?.description || cos.description,
          }));
          updateCharacterAsync(id, {
            description: data.description || character.description,
            costumes: updatedCostumes,
          });
        } else {
          // Fallback: just set base description
          updateCharacterAsync(id, { description: data.description || "" });
        }
        toast({ title: "识别成功", description: `已为「${character.name}」生成角色描述及 ${character.costumes!.length} 套服装描述` });
      } else {
        // No costumes — original behavior
        const { data, error } = await supabase.functions.invoke("generate-character-description", {
          body: { characterName: character.name, script },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        updateCharacterAsync(id, { description: data.description || "" });
        toast({ title: "识别成功", description: `已为「${character.name}」生成角色描述` });
      }
    } catch (e: any) {
      console.error("Auto describe character error:", e);
      const fe = friendlyError(e);
      toast({ title: fe.title, description: `「${characters.find(c => c.id === id)?.name || "角色"}」描述生成失败：${fe.description}`, variant: "destructive" });
    } finally {
      removeTask(id, "charDesc");
      setGeneratingCharDescIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleAutoDescribe = async (id: string) => {
    const scene = sceneSettings.find((s) => s.id === id);
    if (!scene || !String(scene.name || "").trim()) {
      toast({ title: "请先填写场景名称", variant: "destructive" });
      return;
    }
    if (!script?.trim()) {
      toast({ title: "缺少剧本内容", description: "请先在第一步输入剧本", variant: "destructive" });
      return;
    }
    addTask(id, "sceneDesc");
    setGeneratingDescIds(prev => new Set(prev).add(id));
    try {
      const { data, error } = await supabase.functions.invoke("generate-scene-description", {
        body: { sceneName: scene.name, script },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      updateSceneAsync(id, { description: data.description || "" });
      toast({ title: "识别成功", description: `已为「${scene.name}」生成场景描述` });
    } catch (e: any) {
      console.error("Auto describe error:", e);
      const fe = friendlyError(e);
      toast({ title: fe.title, description: `场景「${sceneSettings.find(s => s.id === id)?.name || ""}」描述生成失败：${fe.description}`, variant: "destructive" });
    } finally {
      removeTask(id, "sceneDesc");
      setGeneratingDescIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleAutoDetectAll = async () => {
    if (isAutoDetectingAll) {
      autoDetectAbortRef.current = true;
      setIsAbortingAutoDetect(true);
      return;
    }
    if (!script?.trim()) {
      toast({ title: "缺少剧本内容", description: "请先在第一步输入剧本", variant: "destructive" });
      return;
    }
    autoDetectAbortRef.current = false;
    setIsAbortingAutoDetect(false);
    setIsAutoDetectingAll(true);
    const successCountRef = { current: 0 };
    const failCountRef = { current: 0 };

    // Semaphore helper for concurrency control
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

    const textSem = createSemaphore(3);
    const imageSem = createSemaphore(2);
    const allTasks: Promise<void>[] = [];

    // Process a single character: description (with retry) → image (with retry) → costume images
    const processCharacter = async (c: CharacterSetting) => {
      if (!String(c.name || "").trim()) return;

      const hasCostumesToDescribe = c.costumes && c.costumes.length > 0;

      // --- Description phase (retry up to 2 times) ---
      let desc = "";
      let descOk = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (autoDetectAbortRef.current) return;
        await textSem.acquire();
        if (autoDetectAbortRef.current) { textSem.release(); return; }
        addTask(c.id, "charDesc");
        setGeneratingCharDescIds((prev) => new Set(prev).add(c.id));
        try {
          if (hasCostumesToDescribe) {
            // Describe character + all costumes at once
            const { data, error } = await supabase.functions.invoke("generate-character-description", {
              body: { characterName: c.name, script, costumes: c.costumes!.map(cos => cos.label || "未命名") },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            desc = data.description || "";
            if (data.costumeDescriptions && Array.isArray(data.costumeDescriptions)) {
              const updatedCostumes = c.costumes!.map((cos, i) => ({
                ...cos,
                description: data.costumeDescriptions[i]?.description || cos.description,
              }));
              updateCharacterAsync(c.id, { description: desc, costumes: updatedCostumes });
            } else {
              updateCharacterAsync(c.id, { description: desc });
            }
          } else {
            const { data, error } = await supabase.functions.invoke("generate-character-description", {
              body: { characterName: c.name, script },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            desc = data.description || "";
            updateCharacterAsync(c.id, { description: desc });
          }
          descOk = true;
        } catch (e) {
          if (attempt < 2) console.log(`Retrying char desc "${c.name}", attempt ${attempt + 2}`);
        } finally {
          removeTask(c.id, "charDesc");
          setGeneratingCharDescIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
          textSem.release();
        }
        if (descOk) break;
      }
      if (descOk) successCountRef.current++; else { failCountRef.current++; return; } // Skip image if desc failed

      // --- Image phase (retry up to 2 times) ---
      let imgOk = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        addTask(c.id, "charImg");
        setGeneratingCharImgIds((prev) => new Set(prev).add(c.id));
        try {
          const latest = charactersRef.current.find((ch) => ch.id === c.id);
          const { data, error } = await withTimeout(
            supabase.functions.invoke("generate-character", {
              body: { name: c.name, description: latest?.description || desc, style: artStyle, model: charImageModel },
            }),
            CHAR_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const charUrl = await ensureStorageUrl(data.imageUrl, "characters");
          const latestAgain = charactersRef.current.find((ch) => ch.id === c.id);
          const history = [...(latestAgain?.imageHistory || [])];
          if (latestAgain?.imageUrl) {
            history.push({ imageUrl: latestAgain.imageUrl, description: latestAgain.description || "", createdAt: new Date().toISOString() });
          }
          updateCharacterAsync(c.id, { imageUrl: charUrl, isAIGenerated: true, imageHistory: history });
          imgOk = true;
        } catch (e) {
          if (attempt < 2) console.log(`Retrying char img "${c.name}", attempt ${attempt + 2}`);
        } finally {
          removeTask(c.id, "charImg");
          setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
          imageSem.release();
        }
        if (imgOk) break;
      }
      if (imgOk) successCountRef.current++; else failCountRef.current++;

      // --- Costume image phase: generate images for each costume variant ---
      const latestChar = charactersRef.current.find((ch) => ch.id === c.id);
      const costumesToGen = latestChar?.costumes?.filter(cos => cos.label?.trim() && !cos.imageUrl) || [];
      // Use base character image as fixed anchor for consistency
      const costumeAnchorUrl = latestChar?.imageUrl || undefined;
      for (const cos of costumesToGen) {
        if (autoDetectAbortRef.current) return;
        // Auto-switch to the costume being generated
        updateCharacterAsync(c.id, { activeCostumeId: cos.id });
        let cosImgOk = false;
        for (let attempt = 0; attempt <= 2; attempt++) {
          if (autoDetectAbortRef.current) return;
          await imageSem.acquire();
          if (autoDetectAbortRef.current) { imageSem.release(); return; }
          const cosTaskKey = `costume-${cos.id}`;
          addTask(cosTaskKey, "charImg");
          setGeneratingCharImgIds((prev) => new Set(prev).add(cosTaskKey));
          try {
            const freshChar = charactersRef.current.find((ch) => ch.id === c.id);
            const freshCos = freshChar?.costumes?.find(cc => cc.id === cos.id);
            const combinedDesc = `${c.name}，${freshCos?.label || cos.label}：${freshCos?.description || cos.description || freshChar?.description || desc}`;
            const { data, error } = await withTimeout(
              supabase.functions.invoke("generate-character", {
                body: { name: `${c.name} - ${freshCos?.label || cos.label}`, description: combinedDesc, style: artStyle, model: charImageModel, referenceImageUrl: costumeAnchorUrl },
              }),
              CHAR_IMAGE_TIMEOUT_MS,
            );
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            const cosUrl = await ensureStorageUrl(data.imageUrl, "costumes");
            // Update costume image with history
            const charNow = charactersRef.current.find((ch) => ch.id === c.id);
            if (charNow) {
              const updatedCostumes = (charNow.costumes || []).map(cc => {
                if (cc.id !== cos.id) return cc;
                const history = [...(cc.imageHistory || [])];
                if (cc.imageUrl) {
                  history.push({ imageUrl: cc.imageUrl, description: cc.description || "", createdAt: new Date().toISOString() });
                }
                return { ...cc, imageUrl: cosUrl, isAIGenerated: true, imageHistory: history };
              });
              updateCharacterAsync(c.id, { costumes: updatedCostumes });
            }
            cosImgOk = true;
          } catch (e) {
            if (attempt < 2) console.log(`Retrying costume img "${c.name} - ${cos.label}", attempt ${attempt + 2}`);
          } finally {
            removeTask(cosTaskKey, "charImg");
            setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(cosTaskKey); return next; });
            imageSem.release();
          }
          if (cosImgOk) break;
        }
        if (cosImgOk) successCountRef.current++; else failCountRef.current++;
      }
    };

    // Process a single scene: description (with retry) → image (with retry)
    const processScene = async (s: SceneSetting) => {
      if (!String(s.name || "").trim()) return;

      // --- Description phase (retry up to 2 times) ---
      let desc = "";
      let descOk = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (autoDetectAbortRef.current) return;
        await textSem.acquire();
        if (autoDetectAbortRef.current) { textSem.release(); return; }
        addTask(s.id, "sceneDesc");
        setGeneratingDescIds((prev) => new Set(prev).add(s.id));
        try {
          const { data, error } = await supabase.functions.invoke("generate-scene-description", {
            body: { sceneName: s.name, script },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          desc = data.description || "";
          updateSceneAsync(s.id, { description: desc });
          descOk = true;
        } catch (e) {
          if (attempt < 2) console.log(`Retrying scene desc "${s.name}", attempt ${attempt + 2}`);
        } finally {
          removeTask(s.id, "sceneDesc");
          setGeneratingDescIds((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
          textSem.release();
        }
        if (descOk) break;
      }
      if (descOk) successCountRef.current++; else { failCountRef.current++; return; } // Skip image if desc failed

      // --- Image phase (retry up to 2 times) ---
      let imgOk = false;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        addTask(s.id, "sceneImg");
        setGeneratingSceneImgIds((prev) => new Set(prev).add(s.id));
        try {
          const latest = sceneSettingsRef.current.find((sc) => sc.id === s.id);
          const { data, error } = await withTimeout(
            supabase.functions.invoke("generate-scene", {
              body: { name: s.name, description: latest?.description || desc, style: artStyle, model: charImageModel },
            }),
            SCENE_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const scnUrl = await ensureStorageUrl(data.imageUrl, "scenes");
          const latestAgain = sceneSettingsRef.current.find((sc) => sc.id === s.id);
          const sceneHistory = [...(latestAgain?.imageHistory || [])];
          if (latestAgain?.imageUrl) {
            sceneHistory.push({ imageUrl: latestAgain.imageUrl, description: latestAgain.description || "", createdAt: new Date().toISOString() });
          }
          updateSceneAsync(s.id, { imageUrl: scnUrl, isAIGenerated: true, imageHistory: sceneHistory });
          imgOk = true;
        } catch (e) {
          if (attempt < 2) console.log(`Retrying scene img "${s.name}", attempt ${attempt + 2}`);
        } finally {
          removeTask(s.id, "sceneImg");
          setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
          imageSem.release();
        }
        if (imgOk) break;
      }
      if (imgOk) successCountRef.current++; else failCountRef.current++;
    };

    // Track failed items for review pass
    const failedCharIds = new Set<string>();
    const failedSceneIds = new Set<string>();

    const processCharacterTracked = async (c: CharacterSetting) => {
      await processCharacter(c);
      const latest = charactersRef.current.find((ch) => ch.id === c.id);
      if (latest && (!latest.description || !latest.imageUrl)) failedCharIds.add(c.id);
      // Also check costumes missing images
      if (latest?.costumes?.some(cos => cos.label?.trim() && !cos.imageUrl)) failedCharIds.add(c.id);
    };
    const processSceneTracked = async (s: SceneSetting) => {
      await processScene(s);
      const latest = sceneSettingsRef.current.find((sc) => sc.id === s.id);
      if (latest && (!latest.description || !latest.imageUrl)) failedSceneIds.add(s.id);
    };

    // Launch all tasks in parallel (concurrency controlled by semaphores)
    for (const c of charactersRef.current) {
      allTasks.push(processCharacterTracked(c));
    }
    for (const s of sceneSettingsRef.current) {
      allTasks.push(processSceneTracked(s));
    }

    await Promise.all(allTasks);

    // === REVIEW PASS: retry any items still missing description or image (with concurrency control) ===
    if (!autoDetectAbortRef.current) {
      const reviewSem = createSemaphore(2); // 限制重试并发数为2
      const reviewTasks: Promise<void>[] = [];
      
      // Re-check characters
      for (const c of charactersRef.current) {
        if (!c.description || !c.imageUrl) {
          console.log(`Review pass: retrying character "${c.name}"`);
          reviewTasks.push((async () => {
            await reviewSem.acquire();
            try {
              await processCharacter(c);
            } finally {
              reviewSem.release();
            }
          })());
        }
      }
      // Re-check scenes
      for (const s of sceneSettingsRef.current) {
        if (!s.description || !s.imageUrl) {
          console.log(`Review pass: retrying scene "${s.name}"`);
          reviewTasks.push((async () => {
            await reviewSem.acquire();
            try {
              await processScene(s);
            } finally {
              reviewSem.release();
            }
          })());
        }
      }
      if (reviewTasks.length > 0) {
        console.log(`Review pass: ${reviewTasks.length} items to retry`);
        await Promise.all(reviewTasks);
      }
    }

    setIsAutoDetectingAll(false);
    setIsAbortingAutoDetect(false);
    const aborted = autoDetectAbortRef.current;
    autoDetectAbortRef.current = false;
    toast({
      title: aborted ? "已中止" : "全部生成完成",
      description: `成功 ${successCountRef.current} 项${failCountRef.current > 0 ? `，失败 ${failCountRef.current} 项` : ""}${aborted ? "（已中止）" : ""}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* One-click auto detect all */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold font-[Space_Grotesk] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              画面风格
            </h2>
            {/* Model Selector — pill style matching StoryboardPreview */}
            <div className="relative" ref={charModelDropdownRef}>
              <button
                type="button"
                onClick={() => setCharModelOpen((v) => !v)}
                disabled={isAutoDetectingAll}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-3 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {currentCharModel.label}
                <ChevronDown className={`h-3 w-3 transition-transform ${charModelOpen ? "rotate-180" : ""}`} />
              </button>
              {charModelOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg py-1">
                  {CHAR_IMAGE_MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setCharImageModel(opt.value); setCharModelOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent ${
                        opt.value === charImageModel ? "text-primary font-semibold" : "text-popover-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleAutoDetectAll}
            variant={isAutoDetectingAll ? "destructive" : "default"}
            disabled={isAbortingAutoDetect || (!isAutoDetectingAll && (!script?.trim() || (characters.length === 0 && sceneSettings.length === 0)))}
            className="gap-1.5"
          >
            {isAutoDetectingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAutoDetectingAll ? (isAbortingAutoDetect ? "正在中止..." : "中止生成") : "全部生成"}
          </Button>
          <Button size="sm" onClick={onNext} className="gap-1">
            下一步
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Art Style Selector */}
      <div className="flex items-center gap-2">
        {([
          { label: "写实类", styles: ["live-action", "hyper-cg"] as ArtStyle[] },
          { label: "三维动画类", styles: ["3d-cartoon", "2.5d-stylized", "anime-3d"] as ArtStyle[] },
          { label: "二维动画类", styles: ["cel-animation", "retro-comic"] as ArtStyle[] },
        ]).map((group) => {
          const isActive = group.styles.includes(artStyle);
          return (
            <div key={group.label} className="relative group">
              <Button
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="text-sm"
              >
                {isActive ? `${group.label} · ${ART_STYLE_LABELS[artStyle]}` : group.label}
              </Button>
              {/* Invisible bridge area to prevent hover gap */}
              <div className="absolute left-0 top-full h-2 w-full hidden group-hover:block" />
              <div className="absolute left-0 top-full pt-2 z-50 hidden group-hover:flex flex-col gap-1 bg-popover border border-border rounded-md p-1 shadow-md min-w-max">
                {group.styles.map((key) => (
                  <Button
                    key={key}
                    variant={artStyle === key ? "default" : "ghost"}
                    size="sm"
                    className="justify-start text-sm"
                    onClick={() => onArtStyleChange(key)}
                  >
                    {ART_STYLE_LABELS[key]}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Characters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold font-[Space_Grotesk] flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            角色设定
          </h2>
          <Button variant="outline" size="sm" onClick={addCharacter} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            手动添加
          </Button>
        </div>

        {characters.length === 0 && (
          <Card className="border-dashed border-border/60">
            <CardContent className="py-8 text-center">
              <User className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">请先在第一步拆解剧本，角色将自动识别</p>
            </CardContent>
          </Card>
        )}

        {characters.map((c) => {
          const hasCostumes = c.costumes && c.costumes.length > 0;
          const costumeCount = c.costumes?.length || 0;
          const isCostumeExpanded = expandedCostumeCharIds.has(c.id);

          const addCostume = () => {
            const newCostume: CostumeSetting = {
              id: crypto.randomUUID(),
              label: "",
              description: "",
              isAIGenerated: false,
            };
            updateCharacter(c.id, {
              costumes: [...(c.costumes || []), newCostume],
              activeCostumeId: c.activeCostumeId || newCostume.id,
            });
          };

          const updateCostume = (costumeId: string, updates: Partial<CostumeSetting>) => {
            const costumes = (c.costumes || []).map((cos) =>
              cos.id === costumeId ? { ...cos, ...updates } : cos
            );
            updateCharacter(c.id, { costumes });
          };

          const removeCostume = (costumeId: string) => {
            const costumes = (c.costumes || []).filter((cos) => cos.id !== costumeId);
            const newActive = c.activeCostumeId === costumeId
              ? (costumes[0]?.id || undefined)
              : c.activeCostumeId;
            updateCharacter(c.id, { costumes, activeCostumeId: newActive });
          };

          const handleUploadCostumeImage = (costumeId: string) => {
            const key = `costume-${costumeId}`;
            fileInputRefs.current[key]?.click();
          };

          const handleCostumeFileChange = async (costumeId: string, e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append("file", file);
            formData.append("folder", "costumes");
            try {
              const { data, error } = await supabase.functions.invoke("upload-image", { body: formData });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              updateCostume(costumeId, { imageUrl: data.imageUrl, isAIGenerated: false });
            } catch (err: any) {
              const fe = friendlyError(err);
              toast({ title: fe.title, description: fe.description, variant: "destructive" });
            }
          };

          const handleGenerateCostumeImage = async (costumeId: string) => {
            const costume = (c.costumes || []).find((cos) => cos.id === costumeId);
            if (!costume || !costume.label.trim()) {
              toast({ title: "请先填写服装名称", variant: "destructive" });
              return;
            }
            const costumeTaskKey = `costume-${costumeId}`;
            addTask(costumeTaskKey, "charImg");
            setGeneratingCharImgIds((prev) => new Set(prev).add(costumeTaskKey));
            try {
              const combinedDesc = `${c.name}，${costume.label}：${costume.description || c.description}`;
              const { data, error } = await withTimeout(
                supabase.functions.invoke("generate-character", {
                  body: { name: `${c.name} - ${costume.label}`, description: combinedDesc, style: artStyle, model: charImageModel },
                }),
                CHAR_IMAGE_TIMEOUT_MS,
              );
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              const imgUrl = await ensureStorageUrl(data.imageUrl, "costumes");
              const history = [...(costume.imageHistory || [])];
              if (costume.imageUrl) {
                history.push({ imageUrl: costume.imageUrl, description: costume.description || "", createdAt: new Date().toISOString() });
              }
              updateCostume(costumeId, { imageUrl: imgUrl, isAIGenerated: true, imageHistory: history });
              toast({ title: "生成成功", description: `${c.name}「${costume.label}」服装图已生成` });
            } catch (e: any) {
              console.error("Costume generation error:", e);
              const fe = friendlyError(e);
              toast({ title: fe.title, description: `服装图生成失败：${fe.description}`, variant: "destructive" });
            } finally {
              removeTask(costumeTaskKey, "charImg");
              setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(costumeTaskKey); return next; });
            }
          };

          return (
          <Card key={c.id} className="border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <div className="flex gap-4 p-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} placeholder="角色名称" className="text-sm font-medium" />
                     
                     <Button
                       variant="outline"
                       size="sm"
                       className="shrink-0 gap-1 text-xs"
                       onClick={() => handleAutoDescribeCharacter(c.id)}
                       disabled={generatingCharDescIds.has(c.id) || !String(c.name || "").trim()}
                     >
                       {generatingCharDescIds.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                       自动识别
                     </Button>

                     {/* Costume toggle button */}
                     <Button
                       variant={isCostumeExpanded ? "secondary" : "outline"}
                       size="sm"
                       className="shrink-0 gap-1 text-xs"
                        onClick={() => setExpandedCostumeCharIds(prev => {
                          const next = new Set(prev);
                          if (isCostumeExpanded) next.delete(c.id); else next.add(c.id);
                          return next;
                        })}
                     >
                       <Shirt className="h-3 w-3" />
                       服装
                       {costumeCount > 0 && (
                         <Badge variant="secondary" className="ml-0.5 h-4 min-w-[16px] px-1 text-[10px]">
                           {costumeCount}
                         </Badge>
                       )}
                     </Button>
                   </div>
                  {/* Hide base description when costumes are expanded — description lives per-costume */}
                  {!(isCostumeExpanded && hasCostumes) && (
                    <Textarea value={c.description} onChange={(e) => updateCharacter(c.id, { description: e.target.value })} placeholder="角色描述（外貌特征、服装、年龄、气质等，越详细生成效果越好）" className="text-sm min-h-[60px] resize-none" rows={2} />
                  )}
                  <div className="flex gap-2">
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current[c.id] = el; }} onChange={(e) => handleFileChange(c.id, e)} />
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleUploadImage(c.id)}>
                      <Upload className="h-3 w-3" /> 上传人设图
                    </Button>
                    <Button size="sm" className="gap-1 text-xs" onClick={() => handleGenerateCharacter(c.id)} disabled={generatingCharImgIds.has(c.id) || !String(c.name || "").trim()}>
                      {generatingCharImgIds.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {hasCostumes ? `AI 生成全部服装图 (${costumeCount})` : "AI 生成三视图"}
                    </Button>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onCharactersChange(characters.filter((ch) => ch.id !== c.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Costume Management Section */}
              {isCostumeExpanded && (
                <div className="border-t border-border/40 p-4 bg-accent/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Shirt className="h-3.5 w-3.5" /> 服装变体
                    </span>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={addCostume}>
                      <Plus className="h-3 w-3" /> 新增服装
                    </Button>
                  </div>

                  {(!c.costumes || c.costumes.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      暂无服装变体，点击"新增服装"添加不同造型
                    </p>
                  )}

                  {/* Active costume pill selector */}
                  {hasCostumes && (
                    <div className="flex flex-wrap gap-1.5">
                      {c.costumes!.map((cos) => (
                        <button
                          key={cos.id}
                          type="button"
                          onClick={() => updateCharacter(c.id, { activeCostumeId: cos.id })}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                            c.activeCostumeId === cos.id
                              ? cos.imageUrl
                                ? "bg-green-600 text-white border-green-600"
                                : "bg-primary text-primary-foreground border-primary"
                              : cos.imageUrl
                                ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {cos.label || "未命名"}
                          {cos.imageUrl && <ImageIcon className="h-2.5 w-2.5" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active costume editor */}
                  {hasCostumes && c.activeCostumeId && (() => {
                    const activeCostume = c.costumes!.find((cos) => cos.id === c.activeCostumeId);
                    if (!activeCostume) return null;
                    return (
                      <div className="space-y-2 rounded-lg border border-border/40 bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Input
                            value={activeCostume.label}
                            onChange={(e) => updateCostume(activeCostume.id, { label: e.target.value })}
                            placeholder="服装名称（如：护士装、女仆装）"
                            className="text-xs h-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeCostume(activeCostume.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Textarea
                          value={activeCostume.description}
                          onChange={(e) => updateCostume(activeCostume.id, { description: e.target.value })}
                          placeholder="服装外观描述（颜色、款式、配饰等）"
                          className="text-xs min-h-[50px] resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[`costume-${activeCostume.id}`] = el; }}
                            onChange={(e) => handleCostumeFileChange(activeCostume.id, e)}
                          />
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => handleUploadCostumeImage(activeCostume.id)}>
                            <Upload className="h-3 w-3" /> 上传服装图
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => handleGenerateCostumeImage(activeCostume.id)}
                            disabled={generatingCharImgIds.has(`costume-${activeCostume.id}`) || !activeCostume.label.trim()}
                          >
                            {generatingCharImgIds.has(`costume-${activeCostume.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            AI 生成服装图
                          </Button>
                        </div>
                        {activeCostume.imageUrl && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-medium">{activeCostume.isAIGenerated ? "AI 生成服装设定图" : "上传服装图"}</span>
                              </div>
                              <ImageHistoryDialog
                                history={activeCostume.imageHistory || []}
                                label={`${c.name} - ${activeCostume.label || "服装"}`}
                                onRestore={(entry) => {
                                  const updatedCostumes = (c.costumes || []).map(cos => {
                                    if (cos.id !== activeCostume.id) return cos;
                                    const history = [...(cos.imageHistory || [])];
                                    if (cos.imageUrl) {
                                      history.push({ imageUrl: cos.imageUrl, description: cos.description || "", createdAt: new Date().toISOString() });
                                    }
                                    return { ...cos, imageUrl: entry.imageUrl, imageHistory: history.filter(h => h.imageUrl !== entry.imageUrl) };
                                  });
                                  updateCharacter(c.id, { costumes: updatedCostumes });
                                }}
                              />
                            </div>
                            <div className="rounded-lg overflow-hidden border border-border/40">
                              <ImageThumbnail src={activeCostume.imageUrl} alt={`${c.name} ${activeCostume.label}`} className="w-full max-h-[400px] object-contain" maxDim={1000} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {c.imageUrl && !(isCostumeExpanded && hasCostumes) && (
                <div className="border-t border-border/40 p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">{c.isAIGenerated ? "AI 生成三视图（正面·侧面·背面·特写）" : "上传人设图"}</span>
                    </div>
                    <ImageHistoryDialog
                      history={c.imageHistory || []}
                      label={c.name || "角色"}
                      onRestore={(entry) => {
                        const history = [...(c.imageHistory || [])];
                        if (c.imageUrl) {
                          history.push({ imageUrl: c.imageUrl, description: c.description || "", createdAt: new Date().toISOString() });
                        }
                        // Remove the restored entry from history
                        const filtered = history.filter((h) => h.imageUrl !== entry.imageUrl || h.createdAt !== entry.createdAt);
                        updateCharacter(c.id, { imageUrl: entry.imageUrl, imageHistory: filtered });
                      }}
                    />
                  </div>
                  <div className="rounded-lg overflow-hidden border border-border/40 bg-background">
                    <ImageThumbnail src={c.imageUrl} alt={`${c.name} 人设图`} className="w-full max-h-[400px] object-contain" maxDim={1000} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>

      {/* Scene Settings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold font-[Space_Grotesk] flex items-center gap-2">
            <MapPin className="h-5 w-5 text-accent" />
            场景设定
          </h2>
          <Button variant="outline" size="sm" onClick={addSceneSetting} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            手动添加
          </Button>
        </div>

        {sceneSettings.length === 0 && (
          <Card className="border-dashed border-border/60">
            <CardContent className="py-8 text-center">
              <MapPin className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">请先在第一步拆解剧本，场景将自动识别</p>
            </CardContent>
          </Card>
        )}

        {sceneSettings.map((s) => (
          <Card key={s.id} className="border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <div className="flex gap-4 p-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={s.name} onChange={(e) => updateScene(s.id, { name: e.target.value })} placeholder="场景名称" className="text-sm font-medium" />
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1 text-xs"
                      onClick={() => handleAutoDescribe(s.id)}
                      disabled={generatingDescIds.has(s.id) || !String(s.name || "").trim()}
                    >
                       {generatingDescIds.has(s.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                       自动识别
                    </Button>
                  </div>
                  <Textarea
                    value={s.description}
                    onChange={(e) => updateScene(s.id, { description: e.target.value })}
                    placeholder="场景描述（环境、氛围、光线、时间等，越详细生成效果越好）"
                    className="text-sm min-h-[60px] resize-none"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { sceneFileInputRefs.current[s.id] = el; }} onChange={(e) => handleSceneFileChange(s.id, e)} />
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleUploadSceneImage(s.id)}>
                      <Upload className="h-3 w-3" /> 上传场景图
                    </Button>
                    <Button size="sm" className="gap-1 text-xs" onClick={() => handleGenerateScene(s.id)} disabled={generatingSceneImgIds.has(s.id) || !String(s.name || "").trim()}>
                      {generatingSceneImgIds.has(s.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      AI 生成场景图
                    </Button>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onSceneSettingsChange(sceneSettings.filter((sc) => sc.id !== s.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {s.imageUrl && (
                <div className="border-t border-border/40 p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">{s.isAIGenerated ? "AI 生成场景概念图" : "上传场景图"}</span>
                    </div>
                    <ImageHistoryDialog
                      history={s.imageHistory || []}
                      label={s.name || "场景"}
                      onRestore={(entry) => {
                        const history = [...(s.imageHistory || [])];
                        if (s.imageUrl) {
                          history.push({ imageUrl: s.imageUrl, description: s.description || "", createdAt: new Date().toISOString() });
                        }
                        const filtered = history.filter((h) => h.imageUrl !== entry.imageUrl || h.createdAt !== entry.createdAt);
                        updateScene(s.id, { imageUrl: entry.imageUrl, imageHistory: filtered });
                      }}
                    />
                  </div>
                  <div className="rounded-lg overflow-hidden border border-border/40 bg-background">
                    <ImageThumbnail src={s.imageUrl} alt={`${s.name} 场景图`} className="w-full max-h-[300px] object-cover rounded-lg" maxDim={1000} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
};

export default CharacterSettings;
