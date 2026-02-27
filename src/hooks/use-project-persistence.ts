import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Scene, CharacterSetting, SceneSetting, ArtStyle } from "@/types/project";

// Type-safe wrapper – the generated types may lag behind migrations
const db = supabase as any;

interface ProjectData {
  title: string;
  script: string;
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
  artStyle: ArtStyle;
  currentStep: number;
  systemPrompt: string;
}

export function useProjectPersistence() {
  const projectIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, any>>({});

  const setProjectId = (id: string | null) => {
    projectIdRef.current = id;
  };

  const getProjectId = () => projectIdRef.current;

  const createProject = useCallback(async (data: Partial<ProjectData>) => {
    const { data: row, error } = await db
      .from("projects")
      .insert({
        title: data.title || "未命名项目",
        script: data.script || "",
        scenes: (data.scenes || []) as any,
        characters: (data.characters || []) as any,
        scene_settings: (data.sceneSettings || []) as any,
        art_style: data.artStyle || "live-action",
        current_step: data.currentStep || 1,
        system_prompt: data.systemPrompt || "",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create project:", error);
      return null;
    }
    projectIdRef.current = row?.id;
    return row?.id ?? null;
  }, []);

  const saveProject = useCallback(async (data: Partial<ProjectData>) => {
    const id = projectIdRef.current;
    if (!id) return;

    // Accumulate pending changes instead of replacing
    const fieldMap: Record<string, string> = {
      title: "title",
      script: "script",
      scenes: "scenes",
      characters: "characters",
      sceneSettings: "scene_settings",
      artStyle: "art_style",
      currentStep: "current_step",
      systemPrompt: "system_prompt",
    };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && fieldMap[key]) {
        pendingRef.current[fieldMap[key]] = key === "scenes" || key === "characters" || key === "sceneSettings"
          ? (value as any)
          : value;
      }
    }

    // Debounce: flush all accumulated changes together
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const update = { ...pendingRef.current };
      pendingRef.current = {};

      if (Object.keys(update).length === 0) return;

      const { error } = await db.from("projects").update(update).eq("id", id);
      if (error) console.error("Failed to save project:", error);
    }, 500);
  }, []);

  const loadProject = useCallback(async (id: string): Promise<ProjectData | null> => {
    const { data, error } = await db
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("Failed to load project:", error);
      return null;
    }

    projectIdRef.current = id;
    return {
      title: data.title,
      script: data.script,
      scenes: (data.scenes as any) || [],
      characters: (data.characters as any) || [],
      sceneSettings: (data.scene_settings as any) || [],
      artStyle: (data.art_style as ArtStyle) || "live-action",
      currentStep: data.current_step,
      systemPrompt: data.system_prompt,
    };
  }, []);

  const listProjects = useCallback(async () => {
    const { data, error } = await db
      .from("projects")
      .select("id, title, current_step, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to list projects:", error);
      return [];
    }
    return data || [];
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await db.from("projects").delete().eq("id", id);
    if (error) console.error("Failed to delete project:", error);
    return !error;
  }, []);

  return { createProject, saveProject, loadProject, listProjects, deleteProject, setProjectId, getProjectId };
}
