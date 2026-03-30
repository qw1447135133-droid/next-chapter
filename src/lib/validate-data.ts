import { CharacterSetting, SceneSetting, Scene } from "@/types/project";
import { normalizeCharacterName, normalizeSceneName } from "@/lib/workspace-labels";

/**
 * 验证并清理角色数据
 */
export function validateCharacters(characters: CharacterSetting[]): CharacterSetting[] {
  if (!Array.isArray(characters)) {
    console.warn("Invalid characters data: not an array");
    return [];
  }

  return characters.filter((char) => {
    if (!char || typeof char !== "object") return false;
    if (!char.id || typeof char.id !== "string") return false;
    if (typeof char.name !== "string") return false;
    return true;
  }).map((char) => ({
    ...char,
    name: normalizeCharacterName(char.name),
    description: typeof char.description === "string" ? char.description : "",
    imageUrl: typeof char.imageUrl === "string" ? char.imageUrl : undefined,
    audioUrl: typeof char.audioUrl === "string" ? char.audioUrl : undefined,
    audioFileName: typeof char.audioFileName === "string" ? char.audioFileName : undefined,
    isAIGenerated: typeof char.isAIGenerated === "boolean" ? char.isAIGenerated : false,
    source: char.source === "auto" || char.source === "manual" ? char.source : "manual",
    costumes: Array.isArray(char.costumes) ? char.costumes : undefined,
  }));
}

/**
 * 验证并清理场景设置数据
 */
export function validateSceneSettings(sceneSettings: SceneSetting[]): SceneSetting[] {
  if (!Array.isArray(sceneSettings)) {
    console.warn("Invalid sceneSettings data: not an array");
    return [];
  }

  return sceneSettings.filter((scene) => {
    if (!scene || typeof scene !== "object") return false;
    if (!scene.id || typeof scene.id !== "string") return false;
    if (typeof scene.name !== "string") return false;
    return true;
  }).map((scene) => ({
    ...scene,
    name: normalizeSceneName(scene.name),
    description: typeof scene.description === "string" ? scene.description : "",
    imageUrl: typeof scene.imageUrl === "string" ? scene.imageUrl : undefined,
    isAIGenerated: typeof scene.isAIGenerated === "boolean" ? scene.isAIGenerated : false,
    source: scene.source === "auto" || scene.source === "manual" ? scene.source : "manual",
    timeVariants: Array.isArray(scene.timeVariants) ? scene.timeVariants : undefined,
  }));
}

/**
 * 验证并清理场景数据
 */
export function validateScenes(scenes: Scene[]): Scene[] {
  if (!Array.isArray(scenes)) {
    console.warn("Invalid scenes data: not an array");
    return [];
  }

  return scenes.filter((scene) => {
    if (!scene || typeof scene !== "object") return false;
    if (!scene.id || typeof scene.id !== "string") return false;
    return true;
  }).map((scene) => ({
    ...scene,
    sceneNumber: typeof scene.sceneNumber === "number" ? scene.sceneNumber : 0,
    sceneName: typeof scene.sceneName === "string" ? normalizeSceneName(scene.sceneName) : "",
    description: typeof scene.description === "string" ? scene.description : "",
    characters: Array.isArray(scene.characters)
      ? scene.characters
          .filter((c) => typeof c === "string")
          .map((c) => normalizeCharacterName(c))
      : [],
    dialogue: typeof scene.dialogue === "string" ? scene.dialogue : "",
    cameraDirection: typeof scene.cameraDirection === "string" ? scene.cameraDirection : "",
    duration: typeof scene.duration === "number" ? scene.duration : 5,
  }));
}
