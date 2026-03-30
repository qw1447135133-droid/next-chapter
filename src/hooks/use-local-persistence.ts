import { useCallback, useRef } from "react";
import type {
  Scene,
  CharacterSetting,
  SceneSetting,
  ArtStyle,
} from "@/types/project";
import { getProjectsFilePath, readJsonFile, writeJsonFile } from "@/lib/file-cache";

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

const STORAGE_KEY = "storyforge_projects";
const CURRENT_PROJECT_KEY = "storyforge_current_project";

interface StoredProject extends ProjectData {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function getProjectsFromLocalStorage(): StoredProject[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveProjectsToLocalStorage(projects: StoredProject[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

async function getProjects(): Promise<StoredProject[]> {
  const filePath = await getProjectsFilePath();
  if (filePath) {
    const fromFile = await readJsonFile<StoredProject[]>(filePath);
    if (fromFile) return fromFile;
  }
  return getProjectsFromLocalStorage();
}

async function saveProjects(projects: StoredProject[]): Promise<boolean> {
  const filePath = await getProjectsFilePath();
  if (filePath) {
    const ok = await writeJsonFile(filePath, projects);
    if (ok) return true;
  }
  return saveProjectsToLocalStorage(projects);
}

export function useProjectPersistence() {
  const projectIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<ProjectData>>({});

  const setProjectId = (id: string | null) => {
    projectIdRef.current = id;
    if (id) {
      localStorage.setItem(CURRENT_PROJECT_KEY, id);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
  };

  const getProjectId = () => projectIdRef.current;

  const createProject = useCallback(async (data: Partial<ProjectData>) => {
    const projects = await getProjects();
    const now = new Date().toISOString();
    const newProject: StoredProject = {
      id: generateId(),
      title: data.title || "未命名项目",
      script: data.script || "",
      scenes: data.scenes || [],
      characters: data.characters || [],
      sceneSettings: data.sceneSettings || [],
      artStyle: data.artStyle || "live-action",
      currentStep: data.currentStep || 1,
      systemPrompt: data.systemPrompt || "",
      createdAt: now,
      updatedAt: now,
    };
    projects.unshift(newProject);
    await saveProjects(projects);
    setProjectId(newProject.id);
    return newProject.id;
  }, []);

  const saveProject = useCallback(async (data: Partial<ProjectData>) => {
    const id = projectIdRef.current;
    if (!id) return;
    Object.assign(pendingRef.current, data);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const projects = await getProjects();
      const index = projects.findIndex((p) => p.id === id);
      if (index === -1) return;
      const update = { ...pendingRef.current };
      pendingRef.current = {};
      Object.assign(projects[index], update, {
        updatedAt: new Date().toISOString(),
      });
      await saveProjects(projects);
    }, 500);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const projects = await getProjects();
    const project = projects.find((p) => p.id === id);
    if (!project) return null;
    setProjectId(id);
    return {
      title: project.title,
      script: project.script,
      scenes: project.scenes,
      characters: project.characters,
      sceneSettings: project.sceneSettings,
      artStyle: project.artStyle,
      currentStep: project.currentStep,
      systemPrompt: project.systemPrompt,
    };
  }, []);

  const listProjects = useCallback(async () => {
    const projects = await getProjects();
    return projects
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        title: p.title,
        current_step: p.currentStep,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      }));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const projects = await getProjects();
    const filtered = projects.filter((p) => p.id !== id);
    await saveProjects(filtered);
    if (projectIdRef.current === id) {
      setProjectId(null);
    }
    return true;
  }, []);

  useCallback(async () => {
    const lastId = localStorage.getItem(CURRENT_PROJECT_KEY);
    if (!lastId) return;
    const projects = await getProjects();
    if (projects.some((p) => p.id === lastId)) {
      projectIdRef.current = lastId;
    }
  }, []);

  return {
    createProject,
    saveProject,
    loadProject,
    listProjects,
    deleteProject,
    setProjectId,
    getProjectId,
  };
}
