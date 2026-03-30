import fs from "node:fs/promises";
import path from "node:path";

function safeName(value) {
  return String(value || "")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "_")
    .slice(0, 80) || "item";
}

function normalizeCharacterName(name) {
  let normalized = String(name || "").trim();
  while (
    (normalized.startsWith("[") && normalized.endsWith("]")) ||
    (normalized.startsWith("【") && normalized.endsWith("】")) ||
    (normalized.startsWith("(") && normalized.endsWith(")")) ||
    (normalized.startsWith("（") && normalized.endsWith("）"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function splitLabelParts(label) {
  return String(label || "")
    .split(/[\/,，、\s]+/u)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function scoreLabelAgainstText(label, text) {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedLabel = String(label || "").trim().toLowerCase();
  if (!normalizedLabel) return 0;
  if (normalizedText.includes(normalizedLabel)) return normalizedLabel.length + 100;

  const parts = splitLabelParts(label);
  let score = 0;
  let matched = 0;
  for (const part of parts) {
    if (normalizedText.includes(part)) {
      score += part.length;
      matched += 1;
    }
  }
  return matched > 0 ? score + matched * 10 : 0;
}

function buildSceneContextText(scene) {
  return [
    scene?.sceneName,
    scene?.description,
    scene?.dialogue,
    scene?.cameraDirection,
  ]
    .filter(Boolean)
    .join(" ");
}

function findSceneSetting(scene, sceneSettings) {
  const sceneName = String(scene?.sceneName || "").trim();
  if (!sceneName) return null;
  return sceneSettings.find((item) => String(item?.name || "").trim() === sceneName) || null;
}

function matchSceneTimeVariant(scene, sceneSettings) {
  const matchedScene = findSceneSetting(scene, sceneSettings);
  const variants = matchedScene?.timeVariants || [];
  if (variants.length <= 1) return null;

  if (scene?.sceneTimeVariantId) {
    const explicit = variants.find((item) => item?.id === scene.sceneTimeVariantId);
    if (explicit) return explicit;
  }

  const text = buildSceneContextText(scene);
  let best = null;
  let bestScore = 0;
  for (const variant of variants) {
    const label = String(variant?.label || "").trim();
    if (!label) continue;
    const score = scoreLabelAgainstText(label, text);
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best;
}

function getPreferredCharacterCostumeLabel(character, scene) {
  const costumes = character?.costumes || [];
  if (costumes.length <= 1) return null;

  const explicitId = scene?.characterCostumes?.[character.name];
  if (explicitId) {
    const explicit = costumes.find((item) => item?.id === explicitId);
    if (explicit?.label) return explicit.label.trim();
  }

  const text = buildSceneContextText(scene);
  let bestLabel = null;
  let bestScore = 0;
  for (const costume of costumes) {
    const label = String(costume?.label || "").trim();
    if (!label) continue;
    const score = scoreLabelAgainstText(label, text);
    if (score > bestScore) {
      bestLabel = label;
      bestScore = score;
    }
  }
  return bestLabel;
}

function getSegmentCharacterDisplayNames(segmentScenes, characters) {
  const result = new Set();
  const contextText = segmentScenes.map(buildSceneContextText).join(" ");

  for (const scene of segmentScenes) {
    for (const characterName of scene?.characters || []) {
      const name = normalizeCharacterName(String(characterName || "").trim());
      if (!name) continue;
      const character = characters.find(
        (item) => normalizeCharacterName(item?.name || "") === name,
      );
      if (!character) {
        result.add(name);
        continue;
      }

      const costumes = character?.costumes || [];
      let costumeLabel = null;
      const explicitId = segmentScenes
        .map((item) => item?.characterCostumes?.[name])
        .find(Boolean);
      if (explicitId) {
        const explicit = costumes.find((item) => item?.id === explicitId);
        if (explicit?.label) costumeLabel = explicit.label.trim();
      }

      if (!costumeLabel) {
        let bestScore = 0;
        for (const costume of costumes) {
          const label = String(costume?.label || "").trim();
          if (!label) continue;
          const score = scoreLabelAgainstText(label, contextText);
          if (score > bestScore) {
            bestScore = score;
            costumeLabel = label;
          }
        }
      }

      result.add(
        costumeLabel
          ? `${normalizeCharacterName(character.name)} ${costumeLabel}`
          : normalizeCharacterName(character.name),
      );
    }
  }

  return [...result];
}

function groupScenesBySegment(scenes) {
  const map = new Map();
  for (const scene of scenes || []) {
    const key = String(scene?.segmentLabel || scene?.sceneNumber || "").trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(scene);
  }
  return [...map.entries()].map(([segmentKey, groupedScenes]) => ({
    segmentKey,
    scenes: groupedScenes,
  }));
}

function buildSegmentPrompt(segmentScenes, characters, sceneSettings) {
  const sceneLabels = segmentScenes.map((scene) => {
    const matched = findSceneSetting(scene, sceneSettings);
    const variant = matchSceneTimeVariant(scene, sceneSettings);
    const sceneName = scene?.sceneName || matched?.name || "场景";
    return variant?.label ? `${sceneName} ${variant.label}` : sceneName;
  });

  const tagLabels = [
    ...new Set([
      ...sceneLabels,
      ...getSegmentCharacterDisplayNames(segmentScenes, characters),
    ]),
  ];

  const shotLines = segmentScenes.map((scene, index) => {
    const line = `分镜${index + 1}:${scene?.description || ""}`;
    return scene?.dialogue ? `${line} 对白:${scene.dialogue}` : line;
  });

  return [
    "场景/人物标签:",
    tagLabels.map((label) => `【${label}@（对应的设定图）】`).join(""),
    ...shotLines,
    "无字幕、无水印、无背景音",
  ].join("\n");
}

async function writeTextFile(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

async function repairProject(projectsRoot, project) {
  const projectRoot = path.join(projectsRoot, project.id);
  const textsRoot = path.join(projectRoot, "texts");

  await writeTextFile(path.join(textsRoot, "script.txt"), project.script || "");

  const sceneBreakdownText = (project.scenes || [])
    .map((scene) => {
      const displayCharacters = (scene?.characters || []).map((name) => {
        const normalizedName = normalizeCharacterName(name);
        const character = (project.characters || []).find(
          (item) => normalizeCharacterName(item?.name || "") === normalizedName,
        );
        if (!character) return normalizedName;
        const costumeLabel = getPreferredCharacterCostumeLabel(character, scene);
        return costumeLabel
          ? `${normalizeCharacterName(character.name)} ${costumeLabel}`
          : normalizeCharacterName(character.name);
      });

      const variant = matchSceneTimeVariant(scene, project.sceneSettings || []);
      const sceneDisplayName = variant?.label
        ? `${scene?.sceneName || "场景"} ${variant.label}`
        : scene?.sceneName || "场景";

      return [
        `片段: ${scene?.segmentLabel || scene?.sceneNumber || ""}`,
        `场景: ${sceneDisplayName}`,
        `角色: ${displayCharacters.join("、")}`,
        `画面: ${scene?.description || ""}`,
        `对白: ${scene?.dialogue || ""}`,
        `镜头: ${scene?.cameraDirection || ""}`,
      ].join("\n");
    })
    .join("\n\n");
  await writeTextFile(path.join(textsRoot, "scene-breakdown.txt"), sceneBreakdownText);

  const characterText = (project.characters || [])
    .map((character) =>
      [
        character?.name || "",
        character?.description || "",
        `服装: ${(character?.costumes || [])
          .map((item) => item?.label || "")
          .filter(Boolean)
          .join("、")}`,
      ].join("\n"),
    )
    .join("\n\n");
  await writeTextFile(path.join(textsRoot, "characters.txt"), characterText);

  const sceneSettingText = (project.sceneSettings || [])
    .map((scene) =>
      [
        scene?.name || "",
        scene?.description || "",
        `时间变体: ${(scene?.timeVariants || [])
          .map((item) => item?.label || "")
          .filter(Boolean)
          .join("、")}`,
      ].join("\n"),
    )
    .join("\n\n");
  await writeTextFile(path.join(textsRoot, "scene-settings.txt"), sceneSettingText);

  for (const { segmentKey, scenes } of groupScenesBySegment(project.scenes || [])) {
    const prompt = buildSegmentPrompt(
      scenes,
      project.characters || [],
      project.sceneSettings || [],
    );
    await writeTextFile(
      path.join(textsRoot, "segments", `${safeName(segmentKey)}.txt`),
      prompt,
    );
  }

  await writeTextFile(
    path.join(textsRoot, "manifest.json"),
    JSON.stringify(
      {
        projectId: project.id,
        title: project.title,
        sceneCount: (project.scenes || []).length,
        characterCount: (project.characters || []).length,
        sceneSettingCount: (project.sceneSettings || []).length,
        repairedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const repoRoot = process.cwd();
  const projectsRoot = path.join(repoRoot, "files", "projects");
  const projectsIndexPath = path.join(projectsRoot, "projects.json");

  const raw = await fs.readFile(projectsIndexPath, "utf8");
  const projects = JSON.parse(raw);
  if (!Array.isArray(projects)) {
    throw new Error("projects.json 不是数组");
  }

  for (const project of projects) {
    if (!project?.id) continue;
    await repairProject(projectsRoot, project);
    console.log(`repaired text cache: ${project.id} ${project.title || ""}`.trim());
  }

  console.log(`done: repaired ${projects.length} project(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
