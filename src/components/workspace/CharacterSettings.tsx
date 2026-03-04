import { useState, useRef, useEffect, useCallback } from "react";
import { CharacterSetting, SceneSetting, ArtStyle, ART_STYLE_LABELS, ImageHistoryEntry, CostumeSetting, TimeVariantSetting } from "@/types/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Upload, Sparkles, ArrowRight, User, MapPin, Loader2, ImageIcon, ChevronDown, Shirt, Square, Clock,
} from "lucide-react";
import ImageThumbnail, { prewarmThumbnail } from "./ImageThumbnail";

export type CharImageModel = "gemini-3-pro-image-preview" | "gemini-3.1-flash-image-preview" | "doubao-seedream-5-0-260128";

const CHAR_IMAGE_MODEL_OPTIONS: { value: CharImageModel; label: string }[] = [
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
];
import ImageHistoryDialog from "./ImageHistoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invoke-with-key";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendly-error";
import { ensureStorageUrl } from "@/lib/upload-base64-to-storage";
import { invokeStreamingFunction } from "@/lib/invoke-streaming";

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
  decomposeModel?: string;
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
  decomposeModel,
  isAutoDetectingAll,
  setIsAutoDetectingAll,
  isAbortingAutoDetect,
  setIsAbortingAutoDetect,
  autoDetectAbortRef,
}: CharacterSettingsProps) => {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const sceneFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [expandedCostumeCharIds, setExpandedCostumeCharIds] = useState<Set<string>>(new Set());
  const [expandedTimeVariantSceneIds, setExpandedTimeVariantSceneIds] = useState<Set<string>>(new Set());

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

  // Auto-expand time variant panel for scenes that have multiple time variants
  const prevSceneIdsRef = useRef<string>("");
  useEffect(() => {
    const currentIds = sceneSettings.map(s => s.id).join(",");
    if (currentIds === prevSceneIdsRef.current) return;
    prevSceneIdsRef.current = currentIds;
    const scenesWithTimeVariants = sceneSettings.filter(s => s.timeVariants && s.timeVariants.length > 1);
    if (scenesWithTimeVariants.length > 0) {
      setExpandedTimeVariantSceneIds(prev => {
        const next = new Set(prev);
        scenesWithTimeVariants.forEach(s => next.add(s.id));
        return next;
      });
    }
  }, [sceneSettings]);

  // Image model selector state (persisted to localStorage)
  const [charImageModel, setCharImageModelState] = useState<CharImageModel>(() => {
    try { return (localStorage.getItem("char-image-model") as CharImageModel) || "gemini-3-pro-image-preview"; } catch { return "gemini-3-pro-image-preview"; }
  });
  const setCharImageModel = (v: CharImageModel) => {
    setCharImageModelState(v);
    try { localStorage.setItem("char-image-model", v); } catch { /* ignore */ }
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
    const updated = charactersRef.current.map((c) => (c.id === id ? { ...c, ...updates } : c));
    charactersRef.current = updated; // Eagerly update ref to prevent stale reads in batched calls
    onCharactersChange(updated);
  };

  const handleUploadImage = (id: string) => fileInputRefs.current[id]?.click();
  const handleFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `characters/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("generated-images").upload(fileName, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
      updateCharacter(id, { imageUrl: urlData.publicUrl, isAIGenerated: false });
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
      // First costume: no reference image; subsequent costumes reference the first one's result
      // If the first costume fails after 3 retries, abort all remaining costumes
      setGeneratingCharImgIds((prev) => new Set(prev).add(id));
      const costumes = character.costumes!;
      // Keep a local mutable copy of costumes so sequential updates don't overwrite each other
      // (charactersRef.current only updates after React re-renders)
      let localCostumes = [...costumes.map(c => ({ ...c }))];
      try {
      let successCount = 0;
      let failCount = 0;
      let anchorImageUrl: string | undefined; // Set after first costume succeeds
      let isFirstGenerated = false; // tracks whether we've generated the anchor

      for (let cosIdx = 0; cosIdx < costumes.length; cosIdx++) {
        const cos = costumes[cosIdx];
        if (stopCostumeGenRef.current.has(id)) {
          toast({ title: "已中止", description: `${character.name} 服装图生成已中止（已完成 ${successCount} 套）` });
          break;
        }
        if (!cos.label?.trim()) continue;
        updateCharacterAsync(id, { activeCostumeId: cos.id });
        const cosTaskKey = `costume-${cos.id}`;
        addTask(cosTaskKey, "charImg");
        setGeneratingCharImgIds((prev) => new Set(prev).add(cosTaskKey));

        const isFirstCostume = !isFirstGenerated;
        let succeeded = false;

        try {
          const freshChar = charactersRef.current.find((ch) => ch.id === id);
          const freshCos = freshChar?.costumes?.find(cc => cc.id === cos.id);
          const combinedDesc = `${character.name}，${freshCos?.label || cos.label}：${freshCos?.description || cos.description || freshChar?.description || character.description}`;
          const { data, error } = await withTimeout(
            invokeFunction("generate-character", {
              name: `${character.name} - ${freshCos?.label || cos.label}`,
              description: combinedDesc,
              style: artStyle,
              model: charImageModel,
              referenceImageUrl: isFirstCostume ? undefined : anchorImageUrl,
            }),
            CHAR_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const rawUrl = data.imageUrl; // may be base64 or URL
          prewarmThumbnail(rawUrl);
          if (isFirstCostume) {
            anchorImageUrl = rawUrl;
            isFirstGenerated = true;
          }
          // Show image immediately with raw URL (may be base64)
          localCostumes = localCostumes.map(cc => {
            if (cc.id !== cos.id) return cc;
            const history = [...(cc.imageHistory || [])];
            if (cc.imageUrl) {
              history.push({ imageUrl: cc.imageUrl, description: cc.description || "", createdAt: new Date().toISOString() });
            }
            return { ...cc, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history };
          });
          updateCharacterAsync(id, { costumes: [...localCostumes] });
          successCount++;
          succeeded = true;
          toast({ title: "生成成功", description: `${character.name}「${freshCos?.label || cos.label}」服装设定图已生成（${successCount}/${costumes.length}）` });
          // Upload to storage in background, then update URL silently
          ensureStorageUrl(rawUrl, "costumes").then(finalUrl => {
            if (finalUrl !== rawUrl) {
              if (isFirstCostume) anchorImageUrl = finalUrl;
              const latest = charactersRef.current.find(ch => ch.id === id);
              const updCostumes = (latest?.costumes || []).map(cc =>
                cc.id === cos.id ? { ...cc, imageUrl: finalUrl } : cc
              );
              updateCharacterAsync(id, { costumes: updCostumes });
            }
          }).catch(() => {});
        } catch (e: any) {
          console.error(`Costume generation error for ${cos.label}:`, e);
          failCount++;
          const fe = friendlyError(e);
          toast({ title: fe.title, description: `${character.name}「${cos.label}」生成失败：${fe.description}`, variant: "destructive" });
        }

        removeTask(cosTaskKey, "charImg");
        setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(cosTaskKey); return next; });

        if (isFirstCostume && !succeeded) {
          toast({ title: "已中止", description: `${character.name} 首套服装生成失败，后续服装生成已中止`, variant: "destructive" });
          break;
        }
      }

      if (successCount > 0) {
        toast({ title: "全部服装设定图生成完成", description: `${character.name}：成功 ${successCount} 套${failCount > 0 ? `，失败 ${failCount} 套` : ""}` });
      }
      } finally {
        stopCostumeGenRef.current.delete(id);
        // Clean up ALL costume-related generating states (safety net)
        setGeneratingCharImgIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          costumes.forEach(cos => { next.delete(`costume-${cos.id}`); removeTask(`costume-${cos.id}`, "charImg"); });
          return next;
        });
      }
    } else {
      // No costumes — original single character image generation
      addTask(id, "charImg");
      setGeneratingCharImgIds((prev) => new Set(prev).add(id));
      try {
        const { data, error } = await withTimeout(
          invokeFunction("generate-character", { name: character.name, description: character.description, style: artStyle, model: charImageModel }),
          CHAR_IMAGE_TIMEOUT_MS,
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const rawUrl = data.imageUrl;
        prewarmThumbnail(rawUrl);
        const history = [...(character.imageHistory || [])];
        if (character.imageUrl) {
          history.push({ imageUrl: character.imageUrl, description: character.description || "", createdAt: new Date().toISOString() });
        }
        updateCharacterAsync(id, { imageUrl: rawUrl, isAIGenerated: true, imageHistory: history });
        toast({ title: "生成成功", description: `${character.name} 的三视图已生成` });
        ensureStorageUrl(rawUrl, "characters").then(finalUrl => {
          if (finalUrl !== rawUrl) updateCharacterAsync(id, { imageUrl: finalUrl });
        }).catch(() => {});
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
    const updated = sceneSettingsRef.current.map((s) => (s.id === id ? { ...s, ...updates } : s));
    sceneSettingsRef.current = updated; // Eagerly update ref to prevent stale reads
    onSceneSettingsChange(updated);
  };

  const handleUploadSceneImage = (id: string) => sceneFileInputRefs.current[id]?.click();
  const handleSceneFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `scenes/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("generated-images").upload(fileName, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
      updateScene(id, { imageUrl: urlData.publicUrl, isAIGenerated: false });
    } catch (err: any) {
      const fe = friendlyError(err);
      toast({ title: fe.title, description: fe.description, variant: "destructive" });
    }
  };

  const handleGenerateScene = async (id: string) => {
    if (generatingSceneImgIds.has(id)) return;
    const scene = sceneSettings.find((s) => s.id === id);
    if (!scene || !String(scene.name || "").trim()) {
      toast({ title: "请先填写场景名称", variant: "destructive" });
      return;
    }

    const hasTimeVariants = scene.timeVariants && scene.timeVariants.length > 0;

    if (hasTimeVariants) {
      // Generate all time variant images sequentially with anchor logic
      setGeneratingSceneImgIds((prev) => new Set(prev).add(id));
      const variants = scene.timeVariants!;
      let localVariants = [...variants.map(v => ({ ...v }))];
      try {
        let successCount = 0;
        let failCount = 0;
        let anchorImageUrl: string | undefined;
        let isFirstGenerated = false;

        for (let vIdx = 0; vIdx < variants.length; vIdx++) {
          const tv = variants[vIdx];
          if (stopTimeVariantGenRef.current.has(id)) {
            toast({ title: "已中止", description: `${scene.name} 时间变体生成已中止（已完成 ${successCount} 个）` });
            break;
          }
          if (!tv.label?.trim()) continue;
          updateSceneAsync(id, { activeTimeVariantId: tv.id });
          const tvTaskKey = `timevariant-${tv.id}`;
          addTask(tvTaskKey, "sceneImg");
          setGeneratingSceneImgIds((prev) => new Set(prev).add(tvTaskKey));

          const isFirstVariant = !isFirstGenerated;
          let succeeded = false;

          try {
            const freshScene = sceneSettingsRef.current.find((sc) => sc.id === id);
            const freshTv = freshScene?.timeVariants?.find(v => v.id === tv.id);
            const combinedDesc = `${scene.name}，${freshTv?.label || tv.label}：${freshTv?.description || tv.description || freshScene?.description || scene.description}`;
            const { data, error } = await withTimeout(
              invokeFunction("generate-scene", {
                name: `${scene.name} - ${freshTv?.label || tv.label}`,
                description: combinedDesc,
                style: artStyle,
                model: charImageModel,
                referenceImageUrl: isFirstVariant ? undefined : anchorImageUrl,
              }),
              SCENE_IMAGE_TIMEOUT_MS,
            );
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            const rawUrl = data.imageUrl;
            prewarmThumbnail(rawUrl);
            if (isFirstVariant) {
              anchorImageUrl = rawUrl;
              isFirstGenerated = true;
            }
            localVariants = localVariants.map(v => {
              if (v.id !== tv.id) return v;
              const history = [...(v.imageHistory || [])];
              if (v.imageUrl) {
                history.push({ imageUrl: v.imageUrl, description: v.description || "", createdAt: new Date().toISOString() });
              }
              return { ...v, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history };
            });
            updateSceneAsync(id, { timeVariants: [...localVariants] });
            successCount++;
            succeeded = true;
            toast({ title: "生成成功", description: `${scene.name}「${freshTv?.label || tv.label}」场景图已生成（${successCount}/${variants.length}）` });
            ensureStorageUrl(rawUrl, "scenes").then(finalUrl => {
              if (finalUrl !== rawUrl) {
                if (isFirstVariant) anchorImageUrl = finalUrl;
                const latest = sceneSettingsRef.current.find(sc => sc.id === id);
                const updVariants = (latest?.timeVariants || []).map(v =>
                  v.id === tv.id ? { ...v, imageUrl: finalUrl } : v
                );
                updateSceneAsync(id, { timeVariants: updVariants });
              }
            }).catch(() => {});
          } catch (e: any) {
            console.error(`Time variant generation error for ${tv.label}:`, e);
            failCount++;
            const fe = friendlyError(e);
            toast({ title: fe.title, description: `${scene.name}「${tv.label}」生成失败：${fe.description}`, variant: "destructive" });
          }

          removeTask(tvTaskKey, "sceneImg");
          setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(tvTaskKey); return next; });

          if (isFirstVariant && !succeeded) {
            toast({ title: "已中止", description: `${scene.name} 首个时间变体生成失败，后续变体已中止`, variant: "destructive" });
            break;
          }
        }

        if (successCount > 0) {
          toast({ title: "全部时间变体生成完成", description: `${scene.name}：成功 ${successCount} 个${failCount > 0 ? `，失败 ${failCount} 个` : ""}` });
        }
      } finally {
        stopTimeVariantGenRef.current.delete(id);
        setGeneratingSceneImgIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          variants.forEach(tv => { next.delete(`timevariant-${tv.id}`); removeTask(`timevariant-${tv.id}`, "sceneImg"); });
          return next;
        });
      }
    } else {
      // No time variants — original single scene image generation
      addTask(id, "sceneImg");
      setGeneratingSceneImgIds((prev) => new Set(prev).add(id));
      try {
        const { data, error } = await withTimeout(
          invokeFunction("generate-scene", { name: scene.name, description: scene.description, style: artStyle, model: charImageModel }),
          SCENE_IMAGE_TIMEOUT_MS,
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const rawUrl = data.imageUrl;
        prewarmThumbnail(rawUrl);
        const history = [...(scene.imageHistory || [])];
        if (scene.imageUrl) {
          history.push({ imageUrl: scene.imageUrl, description: scene.description || "", createdAt: new Date().toISOString() });
        }
        updateSceneAsync(id, { imageUrl: rawUrl, isAIGenerated: true, imageHistory: history });
        toast({ title: "生成成功", description: `场景「${scene.name}」已生成` });
        ensureStorageUrl(rawUrl, "scenes").then(finalUrl => {
          if (finalUrl !== rawUrl) updateSceneAsync(id, { imageUrl: finalUrl });
        }).catch(() => {});
      } catch (e: any) {
        console.error("Scene generation error:", e);
        const fe = friendlyError(e);
        toast({ title: fe.title, description: `场景「${sceneSettings.find(s => s.id === id)?.name || ""}」图像生成失败：${fe.description}`, variant: "destructive" });
      } finally {
        removeTask(id, "sceneImg");
        setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      }
    }
  };

  // --- Persistent generating state ---
  const LS_KEY = "generating-tasks";
  type TaskEntry = { id: string; type: "charDesc" | "charImg" | "sceneDesc" | "sceneImg"; startedAt: number };
  const TIMEOUT_MAP: Record<TaskEntry["type"], number> = {
    charDesc: 120_000, charImg: CHAR_IMAGE_TIMEOUT_MS, sceneDesc: 120_000, sceneImg: SCENE_IMAGE_TIMEOUT_MS,
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
  const stopCostumeGenRef = useRef<Set<string>>(new Set()); // track which character IDs should stop costume gen
  const stopTimeVariantGenRef = useRef<Set<string>>(new Set()); // track which scene IDs should stop time variant gen

  // Progress tracking for "全部生成"
  const [autoDetectProgress, setAutoDetectProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

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
        const data = await invokeStreamingFunction("generate-character-description", {
          characterName: character.name,
          script,
          costumes: character.costumes!.map(cos => cos.label || "未命名"),
          model: decomposeModel,
        });
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
        const data = await invokeStreamingFunction("generate-character-description", {
          characterName: character.name, script, model: decomposeModel,
        });
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
      const data = await invokeStreamingFunction("generate-scene-description", {
        sceneName: scene.name, script, model: decomposeModel,
      });
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

    // Calculate total tasks: per character = 1 desc + (N costume imgs OR 1 base img); per scene = 1 desc + 1 img
    const totalCharTasks = charactersRef.current.filter(c => String(c.name || "").trim()).reduce((sum, c) => {
      const hasCostumes = c.costumes && c.costumes.length > 0;
      if (hasCostumes) {
        const costumeCount = c.costumes!.filter(cos => cos.label?.trim() && !cos.imageUrl).length;
        return sum + 1 + costumeCount; // desc + costume imgs (no base img)
      }
      return sum + 2; // desc + base img
    }, 0);
    const totalSceneTasks = sceneSettingsRef.current.filter(s => String(s.name || "").trim()).reduce((sum, s) => {
      const hasTimeVariants = s.timeVariants && s.timeVariants.length > 0;
      if (hasTimeVariants) {
        const tvCount = s.timeVariants!.filter(tv => tv.label?.trim() && !tv.imageUrl).length;
        return sum + 1 + tvCount; // desc + time variant imgs (no base img)
      }
      return sum + 2; // desc + base img
    }, 0);
    const totalTasks = totalCharTasks + totalSceneTasks;
    let doneCount = 0;
    setAutoDetectProgress({ done: 0, total: totalTasks });
    const bumpDone = () => { doneCount++; setAutoDetectProgress({ done: doneCount, total: totalTasks }); };
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

      // --- Description phase ---
      let desc = "";
      let descOk = false;
      if (autoDetectAbortRef.current) return;
      await textSem.acquire();
      if (autoDetectAbortRef.current) { textSem.release(); return; }
      addTask(c.id, "charDesc");
      setGeneratingCharDescIds((prev) => new Set(prev).add(c.id));
      try {
        if (hasCostumesToDescribe) {
          const data = await invokeStreamingFunction("generate-character-description", {
            characterName: c.name, script, costumes: c.costumes!.map(cos => cos.label || "未命名"), model: decomposeModel,
          });
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
          const data = await invokeStreamingFunction("generate-character-description", {
            characterName: c.name, script, model: decomposeModel,
          });
          desc = data.description || "";
          updateCharacterAsync(c.id, { description: desc });
        }
        descOk = true;
      } catch (e) {
        console.error(`Char desc "${c.name}" failed:`, e);
      } finally {
        removeTask(c.id, "charDesc");
        setGeneratingCharDescIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
        textSem.release();
      }
      bumpDone();
      if (descOk) successCountRef.current++; else { failCountRef.current++; return; }

      const latestChar = charactersRef.current.find((ch) => ch.id === c.id);
      const hasCostumes = latestChar?.costumes && latestChar.costumes.length > 0;

      if (!hasCostumes) {
        // --- No costumes: generate single base image (三视图) ---
        let imgOk = false;
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        addTask(c.id, "charImg");
        setGeneratingCharImgIds((prev) => new Set(prev).add(c.id));
        try {
          const latest = charactersRef.current.find((ch) => ch.id === c.id);
          const { data, error } = await withTimeout(
            invokeFunction("generate-character", { name: c.name, description: latest?.description || desc, style: artStyle, model: charImageModel }),
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
          console.error(`Char img "${c.name}" failed:`, e);
        } finally {
          removeTask(c.id, "charImg");
          setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
          imageSem.release();
        }
        bumpDone();
        if (imgOk) successCountRef.current++; else failCountRef.current++;
        return; // No costumes, done with this character
      }

      // --- Has costumes: skip base image, generate all costume images directly ---
      const costumesToGen = latestChar.costumes!.filter(cos => cos.label?.trim() && !cos.imageUrl);
      // Use localCostumes pattern to prevent React re-renders from resetting ref mid-loop
      let localCostumes = [...(latestChar?.costumes || []).map(cc => ({ ...cc }))];
      // Anchor logic: prefer base image; if unavailable, first successful costume becomes anchor
      let costumeAnchorUrl: string | undefined = latestChar?.imageUrl || undefined;
      let isFirstCostumeGenerated = !!costumeAnchorUrl;
      for (const cos of costumesToGen) {
        if (autoDetectAbortRef.current) return;
        updateCharacterAsync(c.id, { activeCostumeId: cos.id });
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        const cosTaskKey = `costume-${cos.id}`;
        addTask(cosTaskKey, "charImg");
        setGeneratingCharImgIds((prev) => new Set(prev).add(cosTaskKey));
        let cosImgOk = false;
        const isFirstCostume = !isFirstCostumeGenerated;
        try {
          const freshCos = localCostumes.find(cc => cc.id === cos.id);
          const combinedDesc = `${c.name}，${freshCos?.label || cos.label}：${freshCos?.description || cos.description || latestChar?.description || desc}`;
          const { data, error } = await withTimeout(
            invokeFunction("generate-character", {
              name: `${c.name} - ${freshCos?.label || cos.label}`,
              description: combinedDesc,
              style: artStyle,
              model: charImageModel,
              referenceImageUrl: isFirstCostume ? undefined : costumeAnchorUrl,
            }),
            CHAR_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const rawUrl = data.imageUrl;
          prewarmThumbnail(rawUrl);
          // Set anchor from first successful costume if no base image
          if (isFirstCostume) {
            costumeAnchorUrl = rawUrl;
            isFirstCostumeGenerated = true;
          }
          // Update local copy to prevent stale reads in subsequent iterations
          localCostumes = localCostumes.map(cc => {
            if (cc.id !== cos.id) return cc;
            const history = [...(cc.imageHistory || [])];
            if (cc.imageUrl) {
              history.push({ imageUrl: cc.imageUrl, description: cc.description || "", createdAt: new Date().toISOString() });
            }
            return { ...cc, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history };
          });
          updateCharacterAsync(c.id, { costumes: [...localCostumes] });
          cosImgOk = true;
          // Background upload to storage, then silently update URL
          ensureStorageUrl(rawUrl, "costumes").then(finalUrl => {
            if (finalUrl !== rawUrl) {
              if (isFirstCostume) costumeAnchorUrl = finalUrl;
              const latest = charactersRef.current.find(ch => ch.id === c.id);
              const updCostumes = (latest?.costumes || []).map(cc =>
                cc.id === cos.id ? { ...cc, imageUrl: finalUrl } : cc
              );
              updateCharacterAsync(c.id, { costumes: updCostumes });
            }
          }).catch(() => {});
        } catch (e) {
          console.error(`Costume img "${c.name} - ${cos.label}" failed:`, e);
        } finally {
          removeTask(cosTaskKey, "charImg");
          setGeneratingCharImgIds((prev) => { const next = new Set(prev); next.delete(cosTaskKey); return next; });
          imageSem.release();
        }
        bumpDone();
        if (cosImgOk) successCountRef.current++; else failCountRef.current++;
        // Abort remaining costumes if first costume (anchor) failed
        if (isFirstCostume && !cosImgOk) {
          // Bump remaining costumes as done (skipped)
          const remaining = costumesToGen.slice(costumesToGen.indexOf(cos) + 1);
          remaining.forEach(() => bumpDone());
          failCountRef.current += remaining.length;
          break;
        }
      }
    };

    // Process a single scene: description → image (or time variant images)
    const processScene = async (s: SceneSetting) => {
      if (!String(s.name || "").trim()) return;

      // --- Description phase ---
      let desc = "";
      let descOk = false;
      if (autoDetectAbortRef.current) return;
      await textSem.acquire();
      if (autoDetectAbortRef.current) { textSem.release(); return; }
      addTask(s.id, "sceneDesc");
      setGeneratingDescIds((prev) => new Set(prev).add(s.id));
      try {
        const data = await invokeStreamingFunction("generate-scene-description", {
          sceneName: s.name, script, model: decomposeModel,
        });
        desc = data.description || "";
        updateSceneAsync(s.id, { description: desc });
        descOk = true;
      } catch (e) {
        console.error(`Scene desc "${s.name}" failed:`, e);
      } finally {
        removeTask(s.id, "sceneDesc");
        setGeneratingDescIds((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
        textSem.release();
      }
      bumpDone();
      if (descOk) successCountRef.current++; else { failCountRef.current++; return; }

      const latestScene = sceneSettingsRef.current.find((sc) => sc.id === s.id);
      const hasTimeVariants = latestScene?.timeVariants && latestScene.timeVariants.length > 0;

      if (!hasTimeVariants) {
        // --- No time variants: generate single base image ---
        let imgOk = false;
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        addTask(s.id, "sceneImg");
        setGeneratingSceneImgIds((prev) => new Set(prev).add(s.id));
        try {
          const latest = sceneSettingsRef.current.find((sc) => sc.id === s.id);
          const { data, error } = await withTimeout(
            invokeFunction("generate-scene", { name: s.name, description: latest?.description || desc, style: artStyle, model: charImageModel }),
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
          console.error(`Scene img "${s.name}" failed:`, e);
        } finally {
          removeTask(s.id, "sceneImg");
          setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(s.id); return next; });
          imageSem.release();
        }
        bumpDone();
        if (imgOk) successCountRef.current++; else failCountRef.current++;
        return;
      }

      // --- Has time variants: skip base image, generate all time variant images ---
      const variantsToGen = latestScene.timeVariants!.filter(tv => tv.label?.trim() && !tv.imageUrl);
      let localVariants = [...(latestScene?.timeVariants || []).map(v => ({ ...v }))];
      let tvAnchorUrl: string | undefined = latestScene?.imageUrl || undefined;
      let isFirstTvGenerated = !!tvAnchorUrl;
      for (const tv of variantsToGen) {
        if (autoDetectAbortRef.current) return;
        updateSceneAsync(s.id, { activeTimeVariantId: tv.id });
        if (autoDetectAbortRef.current) return;
        await imageSem.acquire();
        if (autoDetectAbortRef.current) { imageSem.release(); return; }
        const tvTaskKey = `timevariant-${tv.id}`;
        addTask(tvTaskKey, "sceneImg");
        setGeneratingSceneImgIds((prev) => new Set(prev).add(tvTaskKey));
        let tvImgOk = false;
        const isFirstVariant = !isFirstTvGenerated;
        try {
          const freshTv = localVariants.find(v => v.id === tv.id);
          const combinedDesc = `${s.name}，${freshTv?.label || tv.label}：${freshTv?.description || tv.description || latestScene?.description || desc}`;
          const { data, error } = await withTimeout(
            invokeFunction("generate-scene", {
              name: `${s.name} - ${freshTv?.label || tv.label}`,
              description: combinedDesc,
              style: artStyle,
              model: charImageModel,
              referenceImageUrl: isFirstVariant ? undefined : tvAnchorUrl,
            }),
            SCENE_IMAGE_TIMEOUT_MS,
          );
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const rawUrl = data.imageUrl;
          prewarmThumbnail(rawUrl);
          if (isFirstVariant) {
            tvAnchorUrl = rawUrl;
            isFirstTvGenerated = true;
          }
          localVariants = localVariants.map(v => {
            if (v.id !== tv.id) return v;
            const history = [...(v.imageHistory || [])];
            if (v.imageUrl) {
              history.push({ imageUrl: v.imageUrl, description: v.description || "", createdAt: new Date().toISOString() });
            }
            return { ...v, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history };
          });
          updateSceneAsync(s.id, { timeVariants: [...localVariants] });
          tvImgOk = true;
          ensureStorageUrl(rawUrl, "scenes").then(finalUrl => {
            if (finalUrl !== rawUrl) {
              if (isFirstVariant) tvAnchorUrl = finalUrl;
              const latest = sceneSettingsRef.current.find(sc => sc.id === s.id);
              const updVariants = (latest?.timeVariants || []).map(v =>
                v.id === tv.id ? { ...v, imageUrl: finalUrl } : v
              );
              updateSceneAsync(s.id, { timeVariants: updVariants });
            }
          }).catch(() => {});
        } catch (e) {
          console.error(`Scene time variant img "${s.name} - ${tv.label}" failed:`, e);
        } finally {
          removeTask(tvTaskKey, "sceneImg");
          setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(tvTaskKey); return next; });
          imageSem.release();
        }
        bumpDone();
        if (tvImgOk) successCountRef.current++; else failCountRef.current++;
        if (isFirstVariant && !tvImgOk) {
          const remaining = variantsToGen.slice(variantsToGen.indexOf(tv) + 1);
          remaining.forEach(() => bumpDone());
          failCountRef.current += remaining.length;
          break;
        }
      }
    };

    // Launch all tasks in parallel (concurrency controlled by semaphores)
    for (const c of charactersRef.current) {
      allTasks.push(processCharacter(c));
    }
    for (const s of sceneSettingsRef.current) {
      allTasks.push(processScene(s));
    }

    await Promise.all(allTasks);

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

      {/* Progress bar during batch generation */}
      {isAutoDetectingAll && autoDetectProgress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>生成进度</span>
            <span>{autoDetectProgress.done} / {autoDetectProgress.total}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${Math.round((autoDetectProgress.done / autoDetectProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

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
            try {
              const ext = file.name.split(".").pop() || "png";
              const fileName = `costumes/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabase.storage.from("generated-images").upload(fileName, file, { contentType: file.type, upsert: false });
              if (error) throw error;
              const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
              updateCostume(costumeId, { imageUrl: urlData.publicUrl, isAIGenerated: false });
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
              // Use base character image or first successful costume image as reference anchor
              const referenceImageUrl = c.imageUrl || (c.costumes || []).find(cos => cos.id !== costumeId && cos.imageUrl)?.imageUrl || undefined;
              const { data, error } = await withTimeout(
                invokeFunction("generate-character", { name: `${c.name} - ${costume.label}`, description: combinedDesc, style: artStyle, model: charImageModel, referenceImageUrl }),
                CHAR_IMAGE_TIMEOUT_MS,
              );
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              const rawUrl = data.imageUrl;
              prewarmThumbnail(rawUrl);
              const freshChar = charactersRef.current.find((ch) => ch.id === c.id);
              const freshCostume = freshChar?.costumes?.find(cos => cos.id === costumeId);
              const history = [...(freshCostume?.imageHistory || [])];
              if (freshCostume?.imageUrl) {
                history.push({ imageUrl: freshCostume.imageUrl, description: freshCostume.description || "", createdAt: new Date().toISOString() });
              }
              const updatedCostumes = (freshChar?.costumes || []).map(cos =>
                cos.id === costumeId ? { ...cos, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history } : cos
              );
              updateCharacterAsync(c.id, { costumes: updatedCostumes });
              toast({ title: "生成成功", description: `${c.name}「${costume.label}」服装图已生成` });
              ensureStorageUrl(rawUrl, "costumes").then(finalUrl => {
                if (finalUrl !== rawUrl) {
                  const latestChar = charactersRef.current.find(ch => ch.id === c.id);
                  const upd = (latestChar?.costumes || []).map(cos =>
                    cos.id === costumeId ? { ...cos, imageUrl: finalUrl } : cos
                  );
                  updateCharacterAsync(c.id, { costumes: upd });
                }
              }).catch(() => {});
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
                    {hasCostumes && generatingCharImgIds.has(c.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`gap-1 text-xs ${stopCostumeGenRef.current.has(c.id) ? "border-muted-foreground/40 text-muted-foreground opacity-60 cursor-not-allowed" : "border-destructive text-destructive hover:bg-destructive/10"}`}
                        disabled={stopCostumeGenRef.current.has(c.id)}
                        onClick={() => { stopCostumeGenRef.current.add(c.id); onCharactersChange([...characters]); }}
                      >
                        <Loader2 className="h-3 w-3 animate-spin" /> {stopCostumeGenRef.current.has(c.id) ? "正在中止..." : "中止生成"}
                      </Button>
                    ) : (
                      <Button size="sm" className="gap-1 text-xs" onClick={() => handleGenerateCharacter(c.id)} disabled={generatingCharImgIds.has(c.id) || !String(c.name || "").trim()}>
                        {generatingCharImgIds.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {hasCostumes ? `AI 生成全部服装图 (${costumeCount})` : "AI 生成三视图"}
                      </Button>
                    )}
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
                              <ImageThumbnail src={activeCostume.imageUrl} alt={`${c.name} ${activeCostume.label}`} className="w-full max-h-[400px] object-contain" maxDim={800} />
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
                    <ImageThumbnail src={c.imageUrl} alt={`${c.name} 人设图`} className="w-full max-h-[400px] object-contain" maxDim={800} />
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

        {sceneSettings.map((s) => {
          const hasTimeVariants = s.timeVariants && s.timeVariants.length > 0;
          const tvCount = s.timeVariants?.length || 0;
          const isTimeVariantExpanded = expandedTimeVariantSceneIds.has(s.id);

          const addTimeVariant = () => {
            const newTv: TimeVariantSetting = {
              id: crypto.randomUUID(),
              label: "",
              description: "",
              isAIGenerated: false,
            };
            updateScene(s.id, {
              timeVariants: [...(s.timeVariants || []), newTv],
              activeTimeVariantId: s.activeTimeVariantId || newTv.id,
            });
          };

          const updateTimeVariant = (tvId: string, updates: Partial<TimeVariantSetting>) => {
            const variants = (s.timeVariants || []).map((tv) =>
              tv.id === tvId ? { ...tv, ...updates } : tv
            );
            updateScene(s.id, { timeVariants: variants });
          };

          const removeTimeVariant = (tvId: string) => {
            const variants = (s.timeVariants || []).filter((tv) => tv.id !== tvId);
            const newActive = s.activeTimeVariantId === tvId
              ? (variants[0]?.id || undefined)
              : s.activeTimeVariantId;
            updateScene(s.id, { timeVariants: variants, activeTimeVariantId: newActive });
          };

          const handleUploadTimeVariantImage = (tvId: string) => {
            const key = `timevariant-${tvId}`;
            sceneFileInputRefs.current[key]?.click();
          };

          const handleTimeVariantFileChange = async (tvId: string, e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const ext = file.name.split(".").pop() || "png";
              const fileName = `scenes/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabase.storage.from("generated-images").upload(fileName, file, { contentType: file.type, upsert: false });
              if (error) throw error;
              const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
              updateTimeVariant(tvId, { imageUrl: urlData.publicUrl, isAIGenerated: false });
            } catch (err: any) {
              const fe = friendlyError(err);
              toast({ title: fe.title, description: fe.description, variant: "destructive" });
            }
          };

          const handleGenerateTimeVariantImage = async (tvId: string) => {
            const tv = (s.timeVariants || []).find((v) => v.id === tvId);
            if (!tv || !tv.label.trim()) {
              toast({ title: "请先填写时间名称", variant: "destructive" });
              return;
            }
            const tvTaskKey = `timevariant-${tvId}`;
            addTask(tvTaskKey, "sceneImg");
            setGeneratingSceneImgIds((prev) => new Set(prev).add(tvTaskKey));
            try {
              const combinedDesc = `${s.name}，${tv.label}：${tv.description || s.description}`;
              const referenceImageUrl = s.imageUrl || (s.timeVariants || []).find(v => v.id !== tvId && v.imageUrl)?.imageUrl || undefined;
              const { data, error } = await withTimeout(
                invokeFunction("generate-scene", { name: `${s.name} - ${tv.label}`, description: combinedDesc, style: artStyle, model: charImageModel, referenceImageUrl }),
                SCENE_IMAGE_TIMEOUT_MS,
              );
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              const rawUrl = data.imageUrl;
              prewarmThumbnail(rawUrl);
              const freshScene = sceneSettingsRef.current.find((sc) => sc.id === s.id);
              const freshTv = freshScene?.timeVariants?.find(v => v.id === tvId);
              const history = [...(freshTv?.imageHistory || [])];
              if (freshTv?.imageUrl) {
                history.push({ imageUrl: freshTv.imageUrl, description: freshTv.description || "", createdAt: new Date().toISOString() });
              }
              const updatedVariants = (freshScene?.timeVariants || []).map(v =>
                v.id === tvId ? { ...v, imageUrl: rawUrl, isAIGenerated: true, imageHistory: history } : v
              );
              updateSceneAsync(s.id, { timeVariants: updatedVariants });
              toast({ title: "生成成功", description: `${s.name}「${tv.label}」场景图已生成` });
              ensureStorageUrl(rawUrl, "scenes").then(finalUrl => {
                if (finalUrl !== rawUrl) {
                  const latestScene = sceneSettingsRef.current.find(sc => sc.id === s.id);
                  const upd = (latestScene?.timeVariants || []).map(v =>
                    v.id === tvId ? { ...v, imageUrl: finalUrl } : v
                  );
                  updateSceneAsync(s.id, { timeVariants: upd });
                }
              }).catch(() => {});
            } catch (e: any) {
              console.error("Time variant generation error:", e);
              const fe = friendlyError(e);
              toast({ title: fe.title, description: `时间变体图生成失败：${fe.description}`, variant: "destructive" });
            } finally {
              removeTask(tvTaskKey, "sceneImg");
              setGeneratingSceneImgIds((prev) => { const next = new Set(prev); next.delete(tvTaskKey); return next; });
            }
          };

          return (
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

                    {/* Time variant toggle button */}
                    <Button
                      variant={isTimeVariantExpanded ? "secondary" : "outline"}
                      size="sm"
                      className="shrink-0 gap-1 text-xs"
                      onClick={() => setExpandedTimeVariantSceneIds(prev => {
                        const next = new Set(prev);
                        if (isTimeVariantExpanded) next.delete(s.id); else next.add(s.id);
                        return next;
                      })}
                    >
                      <Clock className="h-3 w-3" />
                      时间
                      {tvCount > 0 && (
                        <Badge variant="secondary" className="ml-0.5 h-4 min-w-[16px] px-1 text-[10px]">
                          {tvCount}
                        </Badge>
                      )}
                    </Button>
                  </div>
                  {/* Hide base description when time variants are expanded */}
                  {!(isTimeVariantExpanded && hasTimeVariants) && (
                    <Textarea
                      value={s.description}
                      onChange={(e) => updateScene(s.id, { description: e.target.value })}
                      placeholder="场景描述（环境、氛围、光线、时间等，越详细生成效果越好）"
                      className="text-sm min-h-[60px] resize-none"
                      rows={2}
                    />
                  )}
                  <div className="flex gap-2">
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { sceneFileInputRefs.current[s.id] = el; }} onChange={(e) => handleSceneFileChange(s.id, e)} />
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => handleUploadSceneImage(s.id)}>
                      <Upload className="h-3 w-3" /> 上传场景图
                    </Button>
                    {hasTimeVariants && generatingSceneImgIds.has(s.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`gap-1 text-xs ${stopTimeVariantGenRef.current.has(s.id) ? "border-muted-foreground/40 text-muted-foreground opacity-60 cursor-not-allowed" : "border-destructive text-destructive hover:bg-destructive/10"}`}
                        disabled={stopTimeVariantGenRef.current.has(s.id)}
                        onClick={() => { stopTimeVariantGenRef.current.add(s.id); onSceneSettingsChange([...sceneSettings]); }}
                      >
                        <Loader2 className="h-3 w-3 animate-spin" /> {stopTimeVariantGenRef.current.has(s.id) ? "正在中止..." : "中止生成"}
                      </Button>
                    ) : (
                      <Button size="sm" className="gap-1 text-xs" onClick={() => handleGenerateScene(s.id)} disabled={generatingSceneImgIds.has(s.id) || !String(s.name || "").trim()}>
                        {generatingSceneImgIds.has(s.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {hasTimeVariants ? `AI 生成全部时间场景图 (${tvCount})` : "AI 生成场景图"}
                      </Button>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onSceneSettingsChange(sceneSettings.filter((sc) => sc.id !== s.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Time Variant Management Section */}
              {isTimeVariantExpanded && (
                <div className="border-t border-border/40 p-4 bg-accent/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> 时间变体
                    </span>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={addTimeVariant}>
                      <Plus className="h-3 w-3" /> 新增时间
                    </Button>
                  </div>

                  {(!s.timeVariants || s.timeVariants.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      暂无时间变体，点击"新增时间"添加不同时间段（如黄昏、夜间）
                    </p>
                  )}

                  {/* Active time variant pill selector */}
                  {hasTimeVariants && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.timeVariants!.map((tv) => (
                        <button
                          key={tv.id}
                          type="button"
                          onClick={() => updateScene(s.id, { activeTimeVariantId: tv.id })}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                            s.activeTimeVariantId === tv.id
                              ? tv.imageUrl
                                ? "bg-green-600 text-white border-green-600"
                                : "bg-primary text-primary-foreground border-primary"
                              : tv.imageUrl
                                ? "bg-green-50 text-green-700 border-green-300 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                          }`}
                        >
                          {tv.label || "未命名"}
                          {tv.imageUrl && <ImageIcon className="h-2.5 w-2.5" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Active time variant editor */}
                  {hasTimeVariants && s.activeTimeVariantId && (() => {
                    const activeTv = s.timeVariants!.find((tv) => tv.id === s.activeTimeVariantId);
                    if (!activeTv) return null;
                    return (
                      <div className="space-y-2 rounded-lg border border-border/40 bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Input
                            value={activeTv.label}
                            onChange={(e) => updateTimeVariant(activeTv.id, { label: e.target.value })}
                            placeholder="时间名称（如：黄昏、夜间、清晨）"
                            className="text-xs h-8"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeTimeVariant(activeTv.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <Textarea
                          value={activeTv.description}
                          onChange={(e) => updateTimeVariant(activeTv.id, { description: e.target.value })}
                          placeholder="该时间段的场景描述（光线、氛围、色调等）"
                          className="text-xs min-h-[50px] resize-none"
                          rows={2}
                        />
                        <div className="flex gap-2 flex-wrap">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => { sceneFileInputRefs.current[`timevariant-${activeTv.id}`] = el; }}
                            onChange={(e) => handleTimeVariantFileChange(activeTv.id, e)}
                          />
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => handleUploadTimeVariantImage(activeTv.id)}>
                            <Upload className="h-3 w-3" /> 上传场景图
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => handleGenerateTimeVariantImage(activeTv.id)}
                            disabled={generatingSceneImgIds.has(`timevariant-${activeTv.id}`) || !activeTv.label.trim()}
                          >
                            {generatingSceneImgIds.has(`timevariant-${activeTv.id}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            AI 生成场景图
                          </Button>
                        </div>
                        {activeTv.imageUrl && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground font-medium">{activeTv.isAIGenerated ? "AI 生成场景图" : "上传场景图"}</span>
                              </div>
                              <ImageHistoryDialog
                                history={activeTv.imageHistory || []}
                                label={`${s.name} - ${activeTv.label || "时间变体"}`}
                                onRestore={(entry) => {
                                  const updatedVariants = (s.timeVariants || []).map(tv => {
                                    if (tv.id !== activeTv.id) return tv;
                                    const history = [...(tv.imageHistory || [])];
                                    if (tv.imageUrl) {
                                      history.push({ imageUrl: tv.imageUrl, description: tv.description || "", createdAt: new Date().toISOString() });
                                    }
                                    return { ...tv, imageUrl: entry.imageUrl, imageHistory: history.filter(h => h.imageUrl !== entry.imageUrl) };
                                  });
                                  updateScene(s.id, { timeVariants: updatedVariants });
                                }}
                              />
                            </div>
                            <div className="rounded-lg overflow-hidden border border-border/40">
                              <ImageThumbnail src={activeTv.imageUrl} alt={`${s.name} ${activeTv.label}`} className="w-full max-h-[400px] object-contain" maxDim={800} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {s.imageUrl && !(isTimeVariantExpanded && hasTimeVariants) && (
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
                    <ImageThumbnail src={s.imageUrl} alt={`${s.name} 场景图`} className="w-full max-h-[300px] object-cover rounded-lg" maxDim={800} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>

    </div>
  );
};

export default CharacterSettings;
