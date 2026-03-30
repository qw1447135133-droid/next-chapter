export type JimengNegativeStage =
  | "global"
  | "left-generate"
  | "reference-mode"
  | "model"
  | "duration"
  | "aspect-ratio";

export interface JimengNegativeExample {
  id: string;
  displayPattern: string;
  aliases: string[];
  reason: string;
  stage: JimengNegativeStage;
}

const RAW_NEGATIVE_EXAMPLES: JimengNegativeExample[] = [
  {
    id: "model-details-summary",
    displayPattern: "Seedance 2.0 15s 详细信息",
    aliases: ["Seedance 2.0 15s 详细信息", "15s 详细信息", "详细信息"],
    reason: "summary text near the toolbar, not the real model trigger",
    stage: "model",
  },
  {
    id: "history-details",
    displayPattern: "详细信息",
    aliases: ["详细信息"],
    reason: "history-card summary content, not a toolbar control",
    stage: "global",
  },
  {
    id: "history-edit-action",
    displayPattern: "重新编辑",
    aliases: ["重新编辑"],
    reason: "history-card action, not part of the active bottom composer",
    stage: "global",
  },
  {
    id: "history-regenerate-action",
    displayPattern: "再次生成",
    aliases: ["再次生成"],
    reason: "history-card action, not part of the active bottom composer",
    stage: "global",
  },
  {
    id: "view-action",
    displayPattern: "去查看",
    aliases: ["去查看"],
    reason: "side action unrelated to aligning the active workspace",
    stage: "global",
  },
  {
    id: "home-infinite-canvas-card",
    displayPattern: "Infinite Canvas",
    aliases: ["Infinite Canvas", "无限画布"],
    reason: "home-page recommendation card, forbidden distraction",
    stage: "left-generate",
  },
  {
    id: "home-agent-card",
    displayPattern: "Agent 模式",
    aliases: ["Agent 模式"],
    reason: "home-page recommendation card, forbidden distraction",
    stage: "left-generate",
  },
  {
    id: "home-image-card",
    displayPattern: "图片生成",
    aliases: ["图片生成"],
    reason: "home-page recommendation card, forbidden distraction",
    stage: "left-generate",
  },
  {
    id: "home-video-card",
    displayPattern: "视频生成",
    aliases: ["视频生成"],
    reason: "home-page recommendation card, forbidden distraction",
    stage: "left-generate",
  },
  {
    id: "mention-token-image1",
    displayPattern: "图片1",
    aliases: ["图片1"],
    reason: "mention token or history text, not a main toolbar control",
    stage: "global",
  },
  {
    id: "mention-token-image2",
    displayPattern: "图片2",
    aliases: ["图片2"],
    reason: "mention token or history text, not a main toolbar control",
    stage: "global",
  },
];

function normalizePattern(pattern: string) {
  return pattern.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeExamples(items: JimengNegativeExample[]): JimengNegativeExample[] {
  const seen = new Set<string>();
  const result: JimengNegativeExample[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({
      ...item,
      aliases: item.aliases.map(normalizePattern),
      displayPattern: item.displayPattern.trim(),
    });
  }
  return result;
}

export const JIMENG_NEGATIVE_EXAMPLES = dedupeExamples(RAW_NEGATIVE_EXAMPLES);

export function getJimengNegativeExamplesForPrompt(limit = 8): JimengNegativeExample[] {
  return JIMENG_NEGATIVE_EXAMPLES.slice(0, Math.max(1, limit));
}

export function getJimengNegativeExamplesForStage(
  stage: JimengNegativeStage,
  limit = 6,
): JimengNegativeExample[] {
  return JIMENG_NEGATIVE_EXAMPLES
    .filter((item) => item.stage === "global" || item.stage === stage)
    .slice(0, Math.max(1, limit));
}

export function classifyJimengNegativePattern(rawText: string): string | null {
  const normalized = normalizePattern(rawText);
  for (const item of JIMENG_NEGATIVE_EXAMPLES) {
    if (item.aliases.some((alias) => normalized.includes(alias))) {
      return item.id;
    }
  }
  return null;
}

export function isJimengNegativeMatch(
  rawText: string,
  stage: JimengNegativeStage = "global",
): boolean {
  const normalized = normalizePattern(rawText);
  return JIMENG_NEGATIVE_EXAMPLES.some(
    (item) =>
      (item.stage === "global" || item.stage === stage) &&
      item.aliases.some((alias) => normalized.includes(alias)),
  );
}

export function suggestJimengNegativeExample(
  rawText: string,
  stage: JimengNegativeStage = "global",
): JimengNegativeExample | null {
  const normalized = normalizePattern(rawText);
  const existingId = classifyJimengNegativePattern(rawText);
  if (existingId) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === existingId) || null;
  }

  if (/详细信息/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "history-details") || null;
  }
  if (/再次生成/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "history-regenerate-action") || null;
  }
  if (/重新编辑/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "history-edit-action") || null;
  }
  if (/去查看/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "view-action") || null;
  }
  if (/infinite canvas|无限画布/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "home-infinite-canvas-card") || null;
  }
  if (/agent 模式/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "home-agent-card") || null;
  }
  if (/图片生成/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "home-image-card") || null;
  }
  if (/视频生成/.test(normalized) && stage === "left-generate") {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "home-video-card") || null;
  }
  if (/图片1/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "mention-token-image1") || null;
  }
  if (/图片2/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "mention-token-image2") || null;
  }
  if (/seedance 2\.0/.test(normalized) && /15s|14s|13s|12s/.test(normalized) && /详细信息/.test(normalized)) {
    return JIMENG_NEGATIVE_EXAMPLES.find((item) => item.id === "model-details-summary") || null;
  }
  return null;
}

export function summarizeJimengNegativeControls(
  rawTexts: string[],
  stage: JimengNegativeStage = "global",
  limit = 6,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawText of rawTexts) {
    const match = suggestJimengNegativeExample(rawText, stage);
    if (!match) continue;
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    result.push(`${match.displayPattern} => ${match.reason}`);
    if (result.length >= limit) break;
  }
  return result;
}
