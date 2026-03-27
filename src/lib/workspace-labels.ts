import type {
  CharacterSetting,
  Scene,
  SceneSetting,
  TimeVariantSetting,
} from "@/types/project";

function splitLabelParts(label: string): string[] {
  return label
    .split(/[\/,，、·\s]+/u)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function scoreLabelAgainstText(label: string, text: string): number {
  const normalizedText = text.toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedLabel) return 0;

  if (normalizedText.includes(normalizedLabel)) {
    return normalizedLabel.length + 100;
  }

  const parts = splitLabelParts(label);
  let componentScore = 0;
  let matchedParts = 0;
  for (const part of parts) {
    if (normalizedText.includes(part)) {
      componentScore += part.length;
      matchedParts++;
    }
  }

  return matchedParts > 0 ? componentScore + matchedParts * 10 : 0;
}

export function buildSceneContextText(scene: Scene): string {
  return [
    scene.sceneName,
    scene.description,
    scene.dialogue,
    scene.cameraDirection,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSegmentContextText(segmentScenes: Scene[]): string {
  return segmentScenes.map(buildSceneContextText).filter(Boolean).join(" ");
}

export function findSceneSetting(
  scene: Scene,
  sceneSettings: SceneSetting[],
): SceneSetting | null {
  const baseSceneName = scene.sceneName?.trim();
  if (!baseSceneName) return null;
  return (
    sceneSettings.find((item) => item.name?.trim() === baseSceneName) || null
  );
}

export function matchCharacterCostume(
  character: CharacterSetting,
  scene: Scene,
): string | null {
  return matchCharacterCostumeForText(
    character,
    buildSceneContextText(scene),
    scene.characterCostumes?.[character.name],
  );
}

export function matchCharacterCostumeForText(
  character: CharacterSetting,
  text: string,
  explicitCostumeId?: string,
): string | null {
  if (!character.costumes || character.costumes.length <= 1) return null;

  if (explicitCostumeId) {
    const assigned = character.costumes.find((item) => item.id === explicitCostumeId);
    if (assigned?.label?.trim()) return assigned.label.trim();
  }

  let bestLabel: string | null = null;
  let bestScore = 0;
  for (const costume of character.costumes) {
    const label = costume.label?.trim();
    if (!label) continue;
    const score = scoreLabelAgainstText(label, text);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  return bestLabel;
}

export function matchCharacterCostumeForSegment(
  character: CharacterSetting,
  segmentScenes: Scene[],
): string | null {
  const explicitCostumeId = segmentScenes
    .map((scene) => scene.characterCostumes?.[character.name])
    .find(Boolean);
  return matchCharacterCostumeForText(
    character,
    buildSegmentContextText(segmentScenes),
    explicitCostumeId,
  );
}

export function getPreferredCharacterCostumeLabel(
  character: CharacterSetting,
  scene: Scene,
): string | null {
  const matchedLabel = matchCharacterCostume(character, scene);
  if (matchedLabel) return matchedLabel;

  const activeCostumeId = character.activeCostumeId;
  if (!activeCostumeId || !character.costumes?.length) return null;

  const activeCostume = character.costumes.find(
    (item) => item.id === activeCostumeId,
  );
  return activeCostume?.label?.trim() || null;
}

export function getPreferredCharacterCostumeLabelForSegment(
  character: CharacterSetting,
  segmentScenes: Scene[],
): string | null {
  const matchedLabel = matchCharacterCostumeForSegment(character, segmentScenes);
  if (matchedLabel) return matchedLabel;

  const activeCostumeId = character.activeCostumeId;
  if (!activeCostumeId || !character.costumes?.length) return null;

  const activeCostume = character.costumes.find(
    (item) => item.id === activeCostumeId,
  );
  return activeCostume?.label?.trim() || null;
}

export function getCharacterDisplayName(
  characterName: string,
  scene: Scene,
  characters: CharacterSetting[],
): string {
  const character = characters.find((item) => item.name === characterName);
  if (!character) return characterName;

  const costumeLabel = getPreferredCharacterCostumeLabel(character, scene);
  return costumeLabel ? `${characterName} ${costumeLabel}` : characterName;
}

export function getSegmentCharacterDisplayNames(
  segmentScenes: Scene[],
  characters: CharacterSetting[],
): string[] {
  const names = new Set<string>();

  for (const scene of segmentScenes) {
    for (const rawName of scene.characters || []) {
      const characterName = String(rawName || "").trim();
      if (!characterName) continue;

      const character = characters.find((item) => item.name === characterName);
      if (!character) {
        names.add(characterName);
        continue;
      }

      const costumeLabel = getPreferredCharacterCostumeLabelForSegment(
        character,
        segmentScenes,
      );
      names.add(costumeLabel ? `${characterName} ${costumeLabel}` : characterName);
    }
  }

  return [...names];
}

export function matchSceneTimeVariant(
  scene: Scene,
  sceneSettings: SceneSetting[],
): TimeVariantSetting | null {
  return matchSceneTimeVariantForText(
    findSceneSetting(scene, sceneSettings),
    buildSceneContextText(scene),
    scene.sceneTimeVariantId,
  );
}

export function matchSceneTimeVariantForText(
  matchedScene: SceneSetting | null,
  text: string,
  explicitTimeVariantId?: string,
): TimeVariantSetting | null {
  if (!matchedScene?.timeVariants || matchedScene.timeVariants.length <= 1) {
    return null;
  }

  if (explicitTimeVariantId) {
    const assigned = matchedScene.timeVariants.find(
      (item) => item.id === explicitTimeVariantId,
    );
    if (assigned) return assigned;
  }

  let bestVariant: TimeVariantSetting | null = null;
  let bestScore = 0;

  for (const variant of matchedScene.timeVariants) {
    const label = variant.label?.trim();
    if (!label) continue;
    const score = scoreLabelAgainstText(label, text);
    if (score > bestScore) {
      bestScore = score;
      bestVariant = variant;
    }
  }

  return bestVariant;
}

export function matchSceneTimeVariantForSegment(
  segmentScenes: Scene[],
  sceneSettings: SceneSetting[],
): TimeVariantSetting | null {
  const firstScene = segmentScenes[0];
  if (!firstScene) return null;
  const matchedScene = findSceneSetting(firstScene, sceneSettings);
  const explicitTimeVariantId = segmentScenes
    .map((scene) => scene.sceneTimeVariantId)
    .find(Boolean);

  return matchSceneTimeVariantForText(
    matchedScene,
    buildSegmentContextText(segmentScenes),
    explicitTimeVariantId,
  );
}

export function getSceneDisplayName(
  scene: Scene,
  sceneSettings: SceneSetting[],
): string {
  const baseSceneName = scene.sceneName?.trim() || "";
  if (!baseSceneName) return "";

  const variant = matchSceneTimeVariant(scene, sceneSettings);
  if (!variant?.label?.trim()) return baseSceneName;

  const variantLabel = variant.label.trim();
  if (baseSceneName.includes(variantLabel)) return baseSceneName;
  return `${baseSceneName} ${variantLabel}`;
}

export function getSegmentSceneDisplayName(
  segmentScenes: Scene[],
  sceneSettings: SceneSetting[],
): string {
  const baseSceneName =
    segmentScenes.map((scene) => scene.sceneName?.trim()).find(Boolean) || "";
  if (!baseSceneName) return "";

  const variant = matchSceneTimeVariantForSegment(segmentScenes, sceneSettings);
  if (!variant?.label?.trim()) return baseSceneName;

  const variantLabel = variant.label.trim();
  if (baseSceneName.includes(variantLabel)) return baseSceneName;
  return `${baseSceneName} ${variantLabel}`;
}
