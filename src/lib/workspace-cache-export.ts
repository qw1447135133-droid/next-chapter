import {
  getProjectRootPath,
  getProjectsFilePath,
  readJsonFile,
} from "@/lib/file-cache";
import { persistThumbnailToProjectCache } from "@/lib/upload-base64-to-storage";
import {
  findSceneSetting,
  getPreferredCharacterCostumeLabel,
  getSegmentCharacterDisplayNames,
  matchSceneTimeVariant,
  normalizeCharacterName,
} from "@/lib/workspace-labels";
import type { CharacterSetting, Scene, SceneSetting } from "@/types/project";

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // 🛡️ 使用分块处理避免大文本导致内存溢出
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function writeBase64File(filePath: string, base64: string) {
  const writer = window.electronAPI?.jimeng?.writeFile;
  if (!writer) return false;
  const result = await writer(filePath, base64);
  return !!result.ok;
}

async function writeTextFile(filePath: string, text: string) {
  const writer = window.electronAPI?.storage?.writeText;
  if (writer) {
    const result = await writer(filePath, text);
    return !!result.ok;
  }
  return writeBase64File(filePath, encodeUtf8Base64(text));
}

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) {
      const parts = url.split(",", 2);
      return parts[1] || null;
    }
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();

    // 🛡️ 使用分块处理避免大图像导致内存溢出
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
    return btoa(binary);
  } catch {
    return null;
  }
}

function safeName(value: string): string {
  return value.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 80) || "item";
}

function isLocalFilePath(source: string): boolean {
  return !!source &&
    !source.startsWith("data:") &&
    !source.startsWith("http://") &&
    !source.startsWith("https://") &&
    !source.startsWith("blob:");
}

function groupScenesBySegment(scenes: Scene[]): Array<{ segmentKey: string; scenes: Scene[] }> {
  const segmentMap = new Map<string, Scene[]>();
  for (const scene of scenes) {
    const key = String(scene.segmentLabel || scene.sceneNumber).trim();
    if (!segmentMap.has(key)) segmentMap.set(key, []);
    segmentMap.get(key)?.push(scene);
  }
  return [...segmentMap.entries()].map(([segmentKey, groupedScenes]) => ({
    segmentKey,
    scenes: groupedScenes,
  }));
}

function buildSegmentPrompt(
  groupedScenes: Scene[],
  characters: CharacterSetting[],
  sceneSettings: SceneSetting[],
): string {
  const sceneLabels = groupedScenes.map((scene) => {
    const matched = findSceneSetting(scene, sceneSettings);
    const variant = matchSceneTimeVariant(scene, sceneSettings);
    const sceneName = scene.sceneName || matched?.name || "场景";
    return variant?.label ? `${sceneName} ${variant.label}` : sceneName;
  });

  const tagLabels = [
    ...new Set([
      ...sceneLabels,
      ...getSegmentCharacterDisplayNames(groupedScenes, characters),
    ]),
  ];

  const shotLines = groupedScenes.map((scene, index) => {
    const line = `分镜${index + 1}:${scene.description || ""}`;
    return scene.dialogue ? `${line} 对白:${scene.dialogue}` : line;
  });

  return [
    "场景/人物标签:",
    tagLabels.map((label) => `【${label}@（对应的设定图）】`).join(""),
    ...shotLines,
    "无字幕、无水印、无背景音",
  ].join("\n");
}

export async function exportWorkspaceCache(params: {
  projectId: string;
  title: string;
  script: string;
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
}) {
  const projectRoot = await getProjectRootPath(params.projectId);
  if (!projectRoot) return false;

  await exportWorkspaceTextCache(params);

  for (const character of params.characters) {
    if (character.imageUrl) {
      if (!isLocalFilePath(character.imageUrl)) {
        const base64 = await fetchAsBase64(character.imageUrl);
        if (base64) {
          await writeBase64File(
            `${projectRoot}/images/characters/${safeName(character.name)}.jpg`,
            base64,
          );
        }
        await persistThumbnailToProjectCache(character.imageUrl, params.projectId);
      }
    }

    for (const costume of character.costumes || []) {
      if (!costume.imageUrl) continue;
      if (!isLocalFilePath(costume.imageUrl)) {
        const base64 = await fetchAsBase64(costume.imageUrl);
        if (base64) {
          await writeBase64File(
            `${projectRoot}/images/characters/${safeName(character.name)}/${safeName(costume.label || "costume")}.jpg`,
            base64,
          );
        }
        await persistThumbnailToProjectCache(costume.imageUrl, params.projectId);
      }
    }
  }

  for (const scene of params.sceneSettings) {
    if (scene.imageUrl) {
      if (!isLocalFilePath(scene.imageUrl)) {
        const base64 = await fetchAsBase64(scene.imageUrl);
        if (base64) {
          await writeBase64File(
            `${projectRoot}/images/scenes/${safeName(scene.name)}.jpg`,
            base64,
          );
        }
        await persistThumbnailToProjectCache(scene.imageUrl, params.projectId);
      }
    }

    for (const variant of scene.timeVariants || []) {
      if (!variant.imageUrl) continue;
      if (!isLocalFilePath(variant.imageUrl)) {
        const base64 = await fetchAsBase64(variant.imageUrl);
        if (base64) {
          await writeBase64File(
            `${projectRoot}/images/scenes/${safeName(scene.name)}/${safeName(variant.label || "variant")}.jpg`,
            base64,
          );
        }
        await persistThumbnailToProjectCache(variant.imageUrl, params.projectId);
      }
    }
  }

  for (const scene of params.scenes) {
    const segmentName = safeName(scene.segmentLabel || String(scene.sceneNumber));

    if (scene.storyboardUrl && !isLocalFilePath(scene.storyboardUrl)) {
      const storyboardBase64 = await fetchAsBase64(scene.storyboardUrl);
      if (storyboardBase64) {
        await writeBase64File(
          `${projectRoot}/images/storyboards/${segmentName}.jpg`,
          storyboardBase64,
        );
      }
      await persistThumbnailToProjectCache(scene.storyboardUrl, params.projectId);
    }

    if (scene.videoUrl && !isLocalFilePath(scene.videoUrl)) {
      const videoBase64 = await fetchAsBase64(scene.videoUrl);
      if (videoBase64) {
        await writeBase64File(
          `${projectRoot}/videos/${segmentName}.mp4`,
          videoBase64,
        );
      }
    }
  }

  await writeTextFile(
    `${projectRoot}/texts/manifest.json`,
    JSON.stringify(
      {
        projectId: params.projectId,
        title: params.title,
        sceneCount: params.scenes.length,
        characterCount: params.characters.length,
        sceneSettingCount: params.sceneSettings.length,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return true;
}

async function exportWorkspaceTextCache(params: {
  projectId: string;
  title: string;
  script: string;
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
}) {
  const projectRoot = await getProjectRootPath(params.projectId);
  if (!projectRoot) return false;

  await writeTextFile(`${projectRoot}/texts/script.txt`, params.script || "");

  const sceneBreakdownText = params.scenes
    .map((scene) => {
      const displayCharacters = (scene.characters || []).map((name) => {
        const normalizedName = normalizeCharacterName(name);
        const character = params.characters.find(
          (item) => normalizeCharacterName(item.name) === normalizedName,
        );
        if (!character) return normalizedName;
        const costumeLabel = getPreferredCharacterCostumeLabel(character, scene);
        return costumeLabel
          ? `${normalizeCharacterName(character.name)} ${costumeLabel}`
          : normalizeCharacterName(character.name);
      });

      const variant = matchSceneTimeVariant(scene, params.sceneSettings);
      const sceneDisplayName = variant?.label
        ? `${scene.sceneName || "场景"} ${variant.label}`
        : scene.sceneName || "场景";

      return [
        `片段: ${scene.segmentLabel || scene.sceneNumber}`,
        `场景: ${sceneDisplayName}`,
        `角色: ${displayCharacters.join("、")}`,
        `画面: ${scene.description || ""}`,
        `对白: ${scene.dialogue || ""}`,
        `镜头: ${scene.cameraDirection || ""}`,
      ].join("\n");
    })
    .join("\n\n");
  await writeTextFile(`${projectRoot}/texts/scene-breakdown.txt`, sceneBreakdownText);

  const characterText = params.characters
    .map((character) =>
      [
        character.name,
        character.description || "",
        `服装: ${(character.costumes || [])
          .map((item) => item.label || "")
          .filter(Boolean)
          .join("、")}`,
      ].join("\n"),
    )
    .join("\n\n");
  await writeTextFile(`${projectRoot}/texts/characters.txt`, characterText);

  const sceneSettingText = params.sceneSettings
    .map((scene) =>
      [
        scene.name,
        scene.description || "",
        `时间变体: ${(scene.timeVariants || [])
          .map((item) => item.label || "")
          .filter(Boolean)
          .join("、")}`,
      ].join("\n"),
    )
    .join("\n\n");
  await writeTextFile(`${projectRoot}/texts/scene-settings.txt`, sceneSettingText);

  for (const { segmentKey, scenes } of groupScenesBySegment(params.scenes)) {
    const prompt = buildSegmentPrompt(scenes, params.characters, params.sceneSettings);
    await writeTextFile(
      `${projectRoot}/texts/segments/${safeName(segmentKey)}.txt`,
      prompt,
    );
  }

  await writeTextFile(
    `${projectRoot}/texts/manifest.json`,
    JSON.stringify(
      {
        projectId: params.projectId,
        title: params.title,
        sceneCount: params.scenes.length,
        characterCount: params.characters.length,
        sceneSettingCount: params.sceneSettings.length,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return true;
}

interface IndexedProjectRecord {
  id: string;
  title: string;
  script: string;
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
}

export async function repairWorkspaceTextCachesFromIndex(): Promise<number> {
  const projectsPath = await getProjectsFilePath();
  if (!projectsPath) return 0;

  const projects = await readJsonFile<IndexedProjectRecord[]>(projectsPath);
  if (!projects?.length) return 0;

  let repaired = 0;
  for (const project of projects) {
    await exportWorkspaceTextCache({
      projectId: project.id,
      title: project.title,
      script: project.script,
      scenes: project.scenes || [],
      characters: project.characters || [],
      sceneSettings: project.sceneSettings || [],
    });
    repaired += 1;
  }

  return repaired;
}
