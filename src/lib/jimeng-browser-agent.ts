import { callGemini, extractText } from "@/lib/gemini-client";

import {
  classifyJimengNegativePattern,
  getJimengNegativeExamplesForStage,
} from "@/lib/jimeng-agent-negative-memory";
import { JIMENG_AUTOMATION_SKILL_PROMPT } from "@/lib/jimeng-agent-skill";

export interface JimengAgentControl {
  id: number;
  text: string;
  tag: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JimengAgentObservation {
  url: string;
  title: string;
  bodyTextSnippet: string;
  controls: JimengAgentControl[];
  controlGroups?: {
    leftNav: string[];
    toolbar: string[];
    homeCards: string[];
    historyCards: string[];
    popupOptions: string[];
  };
  screenshotBase64: string;
  screenshotMimeType: string;
  matchedSignals: string[];
  targetMatched: boolean;
}

export interface JimengAgentTargets {
  model: string;
  duration: string;
  aspectRatio?: string;
}

export interface JimengAgentAction {
  action: "click_control" | "wait" | "done";
  controlId?: number;
  waitMs?: number;
  reason: string;
}

type JimengAgentStage =
  | "left-generate"
  | "video-toolbar"
  | "reference-mode"
  | "model"
  | "duration"
  | "aspect-ratio"
  | "done";

function buildObservePageScript(targets: JimengAgentTargets): string {
  return `
  (() => {
    const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const keywords = /全能参考|首帧图|首尾帧|智能多帧|图片参考|视频生成|文生视频|16:9|@|Seedance|生成/i;

    const likelyInteractive = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!isVisible(node)) return false;
      const role = normalize(node.getAttribute("role") || "");
      const className = normalize(node.className || "");
      const text = normalize(node.innerText);
      const cursor = window.getComputedStyle(node).cursor;
      const rect = node.getBoundingClientRect();
      const byTag = ["button", "label", "li", "a"].includes(node.tagName.toLowerCase());
      const byRole = ["button", "tab", "option", "menuitem", "combobox"].includes(role);
      const byCursor = cursor === "pointer";
      const byClass = /btn|button|tab|option|menu|select|dropdown|trigger|switch/i.test(className);
      const byKeyword = keywords.test(text);
      const hugePlainContainer =
        !byTag &&
        !byRole &&
        node.tagName.toLowerCase() !== "button" &&
        rect.width > 260 &&
        rect.height > 28 &&
        text.length > 24;
      const wideRibbonContainer =
        !byTag &&
        !byRole &&
        node.tagName.toLowerCase() !== "button" &&
        rect.width > 240 &&
        rect.height <= 24 &&
        text.length > 18;
      if (hugePlainContainer || wideRibbonContainer) return false;
      return byTag || byRole || byCursor || byClass || byKeyword;
    };

    const controls = Array.from(
      document.querySelectorAll(
        "button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='combobox'], label, li, a, div, span",
      ),
    )
      .filter(likelyInteractive)
      .map((node, index) => {
        const rect = node.getBoundingClientRect();
        return {
          id: index + 1,
          text: normalize(node.innerText),
          tag: node.tagName.toLowerCase(),
          role: normalize(node.getAttribute("role") || ""),
          ariaLabel: normalize(node.getAttribute("aria-label") || ""),
          placeholder: normalize(node.getAttribute("placeholder") || ""),
          className: normalize(node.className || ""),
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.text || item.ariaLabel || item.placeholder)
      .filter((item) => {
        const plainContainer =
          !item.role &&
          !["button", "label", "li", "a"].includes(item.tag) &&
          item.width > 260 &&
          item.height > 28 &&
          item.text.length > 24;
        const ribbonContainer =
          !item.role &&
          !["button", "label", "li", "a"].includes(item.tag) &&
          item.width > 240 &&
          item.height <= 24 &&
          item.text.length > 18;
        return !plainContainer && !ribbonContainer;
      })
      .slice(0, 180);

    // ── Region filter: only keep left-nav, toolbar area, and popup menus ──
    // This avoids noise from reference-content thumbnails, history cards, etc.
    const toolbarKeywordRe = /Seedance|全能参考|首尾帧|首帧图|视频生成|文生视频|\\d+s|16:9|9:16|4:3|3:2/;
    const toolbarSeeds = controls.filter((c) => toolbarKeywordRe.test(c.text));
    const tbMinY = toolbarSeeds.length > 0 ? Math.min(...toolbarSeeds.map((c) => c.y)) - 60 : 0;
    const tbMaxY = toolbarSeeds.length > 0 ? Math.max(...toolbarSeeds.map((c) => c.y + c.height)) + 280 : window.innerHeight;
    const focusedControls = controls.filter(
      (c) =>
        c.x < 160 || // left navigation strip
        (c.y >= tbMinY && c.y + c.height <= tbMaxY + 80) || // toolbar region (dynamic)
        c.role === "option" || c.role === "menuitem", // popup menus always included
    );

    const bodyText = normalize(document.body?.innerText || "");
    const controlTexts = focusedControls.map((item) => item.text).filter(Boolean);
    const includesKeyword = (keywords) =>
      keywords.some((keyword) => bodyText.includes(keyword) || controlTexts.some((text) => text.includes(keyword)));
    const hasExactText = (value) => controlTexts.some((text) => text === value);
    const hasAtTrigger = hasExactText("@") || controlTexts.some((text) => text.startsWith("@"));
    const promptEditors = Array.from(
      document.querySelectorAll("textarea, input[type='text'], [role='textbox'], [contenteditable='true']"),
    ).filter((node) => {
      if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width >= 240 && rect.height >= 40;
    });
    const comboboxTexts = focusedControls
      .filter((item) => item.role === "combobox")
      .map((item) => item.text)
      .filter(Boolean);
    const currentModel =
      comboboxTexts.find((text) => /Seedance 2\\.0 Fast\\b/i.test(text)) ||
      comboboxTexts.find((text) => /Seedance 2\\.0\\b/i.test(text)) ||
      "";
    const currentDuration =
      comboboxTexts.find((text) => /\\b\\d+s\\b/i.test(text)) ||
      focusedControls.find((item) => /^(\\d+s)$/.test(item.text))?.text ||
      "";
    const currentAspectRatio =
      comboboxTexts.find((text) => /\\b(16:9|9:16|1:1|21:9|3:2|2:3|4:3)\\b/.test(text)) ||
      focusedControls.find((item) => /^(16:9|9:16|1:1|21:9|3:2|2:3|4:3)$/.test(item.text))?.text ||
      "";
    const currentReference =
      comboboxTexts.find(
        (text) =>
          /首尾帧|首帧图|智能多帧|图片参考|全能参考|Full Reference/.test(text) &&
          ["全能参考", "Full Reference", "首尾帧", "首帧图", "智能多帧", "图片参考"].filter(
            (keyword) => text.includes(keyword),
          ).length === 1,
      ) || "";
    const normalizedCurrentDuration = normalize(currentDuration.match(/\\b\\d+s\\b/i)?.[0] || currentDuration);
    const normalizedCurrentAspectRatio = normalize(
      currentAspectRatio.match(/\\b(16:9|9:16|1:1|21:9|3:2|2:3|4:3)\\b/)?.[0] || currentAspectRatio,
    );
    const hasSeedanceModel = normalize(currentModel) === ${JSON.stringify(targets.model)};
    const hasFullReference = /全能参考|Full Reference/.test(currentReference);
    const hasReferenceContent = includesKeyword(["参考内容", "Reference"]) || hasAtTrigger;
    const hasAspectRatio = normalizedCurrentAspectRatio === ${JSON.stringify(targets.aspectRatio || "16:9")};
    const hasTargetDuration = normalizedCurrentDuration === ${JSON.stringify(targets.duration)};
    const hasLeftGenerateEntry = focusedControls.some(
      (item) => item.x < 160 && /^生成$/.test(item.text),
    );
    const hasBottomVideoEntry = focusedControls.some(
      (item) => /视频生成|文生视频/.test(item.text) && item.y > 420 && item.width <= 220,
    );
    const hasGeneratorToolbar =
      !!currentModel ||
      !!currentDuration ||
      !!currentAspectRatio ||
      !!currentReference ||
      hasAtTrigger ||
      promptEditors.length > 0;
    const hasVideo =
      (location.href.includes("type=video") || hasSeedanceModel) &&
      hasGeneratorToolbar;
    const matchedSignals = [];
    if (hasLeftGenerateEntry) matchedSignals.push("left-generate-entry");
    if (hasBottomVideoEntry) matchedSignals.push("video-toolbar-entry");
    if (hasVideo) matchedSignals.push("video-entry");
    if (hasSeedanceModel) matchedSignals.push("seedance-model");
    if (hasFullReference) matchedSignals.push("seedance-reference");
    if (hasReferenceContent) matchedSignals.push("reference-content");
    if (hasAtTrigger) matchedSignals.push("@");
    if (hasAspectRatio) matchedSignals.push(${JSON.stringify(targets.aspectRatio || "16:9")});
    if (hasTargetDuration) matchedSignals.push(${JSON.stringify(targets.duration)});

    const summary = (items) => items.slice(0, 12).map((item) => item.text).filter(Boolean);
    const leftNavControls = focusedControls.filter((item) => item.x < 140 && item.y > 80);
    const toolbarControls = focusedControls.filter((item) => item.y > 480 || /Seedance|全能参考|首尾帧|\\d+s|16:9|9:16|1:1|21:9|3:2|2:3|4:3/.test(item.text));
    const homeCardControls = focusedControls.filter((item) => /无限画布|Agent 模式|图片生成|视频生成|数字人|配音生成/.test(item.text) && item.y < 520);
    const historyCardControls = focusedControls.filter((item) => /详细信息|重新编辑|再次生成|图片1|图片2|音频1|音频2/.test(item.text) && item.y < 560);
    const popupOptionControls = focusedControls.filter((item) => item.role === "option" || item.role === "menuitem");

    return {
      url: location.href,
      title: document.title,
      bodyTextSnippet: bodyText.slice(0, 1800),
      controls: focusedControls,
      controlGroups: {
        leftNav: summary(leftNavControls),
        toolbar: summary(toolbarControls),
        homeCards: summary(homeCardControls),
        historyCards: summary(historyCardControls),
        popupOptions: summary(popupOptionControls),
      },
      matchedSignals,
      currentReference,
      targetMatched: hasVideo && hasSeedanceModel && hasFullReference && hasAspectRatio && hasTargetDuration,
    };
  })()
`;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenceMatch =
    cleaned.match(/```json\s*([\s\S]*?)```/i) || cleaned.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

export function buildActionPrompt(observation: JimengAgentObservation, targets: JimengAgentTargets): string {
  const stage = inferJimengAgentStage(observation, targets);
  const inToolbarRegion = createToolbarRegionPredicate(observation.controls);
  const stageCandidates = buildStageCandidateSummary(stage, observation.controls, targets, inToolbarRegion);
  const stageNegativeExamples = getJimengNegativeExamplesForStage(stage);
  const controlsText = observation.controls
    .map((control) => {
      const label = control.text || control.ariaLabel || control.placeholder || "(empty)";
      return `#${control.id} (${control.x},${control.y},${control.width}x${control.height}) [${control.tag}${control.role ? ` role=${control.role}` : ""}] ${label}`;
    })
    .join("\n");

  return [
    JIMENG_AUTOMATION_SKILL_PROMPT,
    `最终目标：左侧已进入“生成”，底部工作栏处于“视频生成”，参考模式是“全能参考”，模型是 ${targets.model}，比例是 ${targets.aspectRatio || "16:9"}，时长是 ${targets.duration}。`,
    `固定流程优先级：1 左侧生成 -> 2 底部视频生成 -> 3 全能参考 -> 4 模型 -> 5 ${targets.aspectRatio || "16:9"} -> 6 ${targets.duration}。`,
    `当前 URL: ${observation.url}`,
    `当前标题: ${observation.title}`,
    `当前命中特征: ${observation.matchedSignals.join(", ") || "无"}`,
    `当前阶段: ${stage}`,
    `页面正文摘要: ${observation.bodyTextSnippet || "无"}`,
    `当前阶段操作约束: ${describeStageGuidance(stage, targets)}`,
    `当前阶段允许的次级动作: ${describeStageFallbackGuidance(stage)}`,
    `当前阶段 few-shot: ${describeStageExamples(stage, targets)}`,
    `当前阶段优先候选: ${stageCandidates.preferred.join(" | ") || "无"}`,
    `当前阶段禁点候选: ${stageCandidates.forbidden.join(" | ") || "无"}`,
    `历史失败负样本: ${stageNegativeExamples.map((item) => `${item.displayPattern} => ${item.reason}`).join(" | ") || "无"}`,
    `区域摘要 - 左侧导航: ${observation.controlGroups?.leftNav?.join(" | ") || "无"}`,
    `区域摘要 - 工作栏: ${observation.controlGroups?.toolbar?.join(" | ") || "无"}`,
    `区域摘要 - 首页卡片: ${observation.controlGroups?.homeCards?.join(" | ") || "无"}`,
    `区域摘要 - 历史卡片: ${observation.controlGroups?.historyCards?.join(" | ") || "无"}`,
    `区域摘要 - 弹层选项: ${observation.controlGroups?.popupOptions?.join(" | ") || "无"}`,
    "",
    "可见控件：",
    controlsText || "(none)",
    "",
    "请只返回 JSON：",
    '{"action":"click_control"|"wait"|"done","controlId":number,"waitMs":number,"reason":"简短中文原因"}',
  ].join("\\n");
}

function inferJimengAgentStage(
  observation: JimengAgentObservation,
  targets: JimengAgentTargets,
): JimengAgentStage {
  if (!observation.matchedSignals.includes("video-entry")) {
    if (observation.matchedSignals.includes("video-toolbar-entry")) return "video-toolbar";
    return "left-generate";
  }
  if (!observation.matchedSignals.includes("seedance-reference")) return "reference-mode";
  if (!observation.matchedSignals.includes("seedance-model")) return "model";
  if (!observation.matchedSignals.includes(targets.duration)) return "duration";
  if (!observation.matchedSignals.includes(targets.aspectRatio || "16:9")) return "aspect-ratio";
  return "done";
}

function describeStageGuidance(stage: JimengAgentStage, targets: JimengAgentTargets): string {
  switch (stage) {
    case "left-generate":
      return "只允许点击左侧生成入口，禁止点击首页推荐卡片、历史记录卡片、详情摘要。";
    case "video-toolbar":
      return "只允许进入底部视频生成工作栏，禁止点击页面正文、推荐区和筛选栏。";
    case "reference-mode":
      return "只允许处理参考模式控件，优先 combobox 或按钮，禁止点击首尾帧纯文本和历史记录摘要。";
    case "model":
      return `只允许处理模型控件和模型弹层选项，目标模型是 ${targets.model}。禁止点击包含详细信息/图片/音频的摘要块。`;
    case "duration":
      return `只允许处理时长控件和时长弹层选项，目标时长是 ${targets.duration}。`;
    case "aspect-ratio":
      return `只允许处理比例按钮或比例弹层选项，目标比例是 ${targets.aspectRatio || "16:9"}。`;
    case "done":
      return "目标状态已满足，优先返回 done，不要额外点击。";
  }
}

function describeStageFallbackGuidance(stage: JimengAgentStage): string {
  switch (stage) {
    case "left-generate":
      return "只允许 wait 或继续尝试左侧生成入口，不允许跳去首页卡片或历史记录。";
    case "video-toolbar":
      return "只允许 wait 或继续尝试底部视频生成入口，不允许点击正文或右上角筛选栏。";
    case "reference-mode":
      return "只允许 wait、重新展开参考模式，或点击参考模式弹层选项。";
    case "model":
      return "只允许 wait、重新展开模型下拉，或点击模型弹层选项。";
    case "duration":
      return "只允许 wait、重新展开时长下拉，或点击时长弹层选项。";
    case "aspect-ratio":
      return "只允许 wait、重试比例按钮，或点击比例弹层选项。";
    case "done":
      return "没有次级动作，应该返回 done。";
  }
}

function describeStageExamples(stage: JimengAgentStage, targets: JimengAgentTargets): string {
  switch (stage) {
    case "left-generate":
      return "如果首页大编辑器已经可见，但左侧仍未命中生成，只能点左侧生成入口，不要点首页推荐卡片。";
    case "video-toolbar":
      return "如果左侧已在生成页，但还没命中视频生成，只能进入底部视频生成工作栏，不要点上方结果卡片。";
    case "reference-mode":
      return "如果当前值显示首尾帧而目标是全能参考，优先展开参考模式控件并选择全能参考，不要点首尾帧纯文本。";
    case "model":
      return `如果当前模型显示为 Seedance 2.0 Fast 而目标是 ${targets.model}，只能展开模型控件并选择正确模型；禁止点击 Seedance 2.0 / 15s / 详细信息 之类摘要文本。`;
    case "duration":
      return `如果工作栏显示的时长不是 ${targets.duration}，先点击当前时长 combobox（如 5s/10s/15s）展开下拉，再点击 ${targets.duration} 选项；不要跳去点比例或模型摘要。`;
    case "aspect-ratio":
      return `如果工作栏按钮已经显示 ${targets.aspectRatio || "16:9"}，视为该阶段已完成；否则只允许点比例按钮或比例弹层选项。`;
    case "done":
      return "所有目标均命中时直接返回 done。";
  }
}

function createToolbarRegionPredicate(
  controls: JimengAgentControl[],
): (control: JimengAgentControl) => boolean {
  const toolbarSeed = controls.filter((control) =>
    /视频生成|文生视频|Seedance|首尾帧|首帧图|全能参考|16:9|9:16|1:1|21:9|3:2|2:3|4:3|\d+s/.test(controlText(control)),
  );
  const toolbarBounds =
    toolbarSeed.length > 0
      ? {
          minX: Math.min(...toolbarSeed.map((control) => control.x)) - 40,
          maxX: Math.max(...toolbarSeed.map((control) => control.x + control.width)) + 80,
          minY: Math.min(...toolbarSeed.map((control) => control.y)) - 40,
          maxY: Math.max(...toolbarSeed.map((control) => control.y + control.height)) + 220,
        }
      : null;
  return (control: JimengAgentControl) =>
    !toolbarBounds ||
    (control.x >= toolbarBounds.minX &&
      control.x + control.width <= toolbarBounds.maxX &&
      control.y >= toolbarBounds.minY &&
      control.y + control.height <= toolbarBounds.maxY);
}

function controlText(control: JimengAgentControl): string {
  return `${control.text} ${control.ariaLabel} ${control.placeholder}`.trim();
}

function countReferenceModeKeywords(text: string): number {
  return ["全能参考", "Full Reference", "首尾帧", "首帧图", "智能多帧", "图片参考"].filter(
    (keyword) => text.includes(keyword),
  ).length;
}

function isBundledReferenceCluster(control: JimengAgentControl): boolean {
  const text = controlText(control);
  return countReferenceModeKeywords(text) >= 2;
}

function isExactReferenceOption(
  control: JimengAgentControl,
  pattern: RegExp,
): boolean {
  const text = controlText(control);
  return (
    pattern.test(text) &&
    !isBundledReferenceCluster(control) &&
    text.length <= 16
  );
}

function rankControl(control: JimengAgentControl, targets: JimengAgentTargets): number {
  const text = controlText(control);
  let score = 0;
  if (/^生成$/.test(text) && control.x < 160) score += 200;
  if (/视频生成|文生视频/.test(text) && control.y > 500) score += 180;
  if (/全能参考|Full Reference/.test(text)) score += 160;
  if (/首尾帧|首帧图|智能多帧|图片参考/.test(text)) score += 120;
  if (new RegExp(targets.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) score += 110;
  if (new RegExp((targets.aspectRatio || "16:9").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) score += 90;
  if (new RegExp(targets.duration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) score += 80;
  if (control.role === "option") score += 25;
  if (control.role === "combobox") score += 18;
  if (control.role === "menuitem") score += 12;
  if (/button|tab|dropdown|select|menu|trigger/i.test(control.className)) score += 8;
  return score;
}

function chooseBest(
  controls: JimengAgentControl[],
  predicate: (control: JimengAgentControl) => boolean,
  targets: JimengAgentTargets,
  excludeControlIds: number[] = [],
): JimengAgentControl | null {
  return (
    [...controls]
      .filter((control) => !excludeControlIds.includes(control.id))
      .filter(predicate)
      .sort((a, b) => rankControl(b, targets) - rankControl(a, targets))[0] || null
  );
}

function isControlAllowedForStage(
  stage: JimengAgentStage,
  control: JimengAgentControl,
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
): boolean {
  const text = controlText(control);
  switch (stage) {
    case "left-generate":
      return /^生成$/.test(control.text) && control.x < 160;
    case "video-toolbar":
      return /视频生成|文生视频/.test(text) && inToolbarRegion(control);
    case "reference-mode":
      return (
        (/全能参考|Full Reference|首尾帧|首帧图|智能多帧|图片参考/.test(text) &&
          !isSummaryLikeControl(control) &&
          inToolbarRegion(control)) ||
        control.role === "option" ||
        control.role === "menuitem"
      );
    case "model":
      return (
        (/Seedance 2\.0/.test(text) &&
          !isSummaryLikeControl(control) &&
          inToolbarRegion(control)) ||
        control.role === "option" ||
        control.role === "menuitem"
      );
    case "duration":
      return (
        (/^\d+s$/.test(control.text) &&
          !isSummaryLikeControl(control) &&
          inToolbarRegion(control)) ||
        control.role === "option" ||
        control.role === "menuitem"
      );
    case "aspect-ratio":
      return (
        (/^(16:9|9:16|1:1|21:9|3:2|2:3|4:3)$/.test(control.text) &&
          !isSummaryLikeControl(control) &&
          inToolbarRegion(control)) ||
        control.role === "option" ||
        control.role === "menuitem"
      );
    case "done":
      return false;
  }
}

function buildStageCandidateSummary(
  stage: JimengAgentStage,
  controls: JimengAgentControl[],
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
): { preferred: string[]; forbidden: string[] } {
  const format = (control: JimengAgentControl) =>
    `#${control.id}:${control.text || control.ariaLabel || control.placeholder || "(empty)"}`;
  const preferred = controls
    .filter((control) => isControlAllowedForStage(stage, control, targets, inToolbarRegion))
    .sort((a, b) => rankControl(b, targets) - rankControl(a, targets))
    .slice(0, 8)
    .map(format);
  const forbidden = controls
    .filter((control) => !isControlAllowedForStage(stage, control, targets, inToolbarRegion))
    .filter((control) => {
      const text = controlText(control);
      return (
        isSummaryLikeControl(control) ||
        /无限画布|Agent 模式|图片生成|视频生成|数字人|配音生成|详细信息|重新编辑|再次生成|去查看/.test(text)
      );
    })
    .slice(0, 8)
    .map(format);
  return { preferred, forbidden };
}

function isDropdownLikeControl(control: JimengAgentControl): boolean {
  return (
    control.role === "combobox" ||
    control.tag === "button" ||
    /button|dropdown|select|trigger|menu/i.test(control.className)
  );
}

function isSummaryLikeControl(control: JimengAgentControl): boolean {
  const text = controlText(control);
  return (
    !!classifyJimengNegativePattern(text) ||
    isBundledReferenceCluster(control) ||
    /详细信息|场景|画面|音频|图片\d|图片1|图片2|出场角色|风格|提示/.test(text) ||
    text.length > 24 ||
    control.width > 200
  );
}

function findModelTrigger(
  controls: JimengAgentControl[],
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
  excludeControlIds: number[] = [],
): JimengAgentControl | null {
  const matchesModelTrigger = (control: JimengAgentControl) =>
    /Seedance 2\.0(?: Fast)?/.test(controlText(control)) &&
    !isSummaryLikeControl(control) &&
    control.width <= 180 &&
    inToolbarRegion(control);

  return (
    chooseBest(
      controls,
      (control) => matchesModelTrigger(control) && isDropdownLikeControl(control),
      targets,
      excludeControlIds,
    ) ||
    chooseBest(controls, matchesModelTrigger, targets, excludeControlIds)
  );
}

function findAspectRatioTrigger(
  controls: JimengAgentControl[],
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
  excludeControlIds: number[] = [],
): JimengAgentControl | null {
  const ratioPattern = new RegExp(`^${(targets.aspectRatio || "16:9").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

  // Phase 1: target ratio directly visible (button or open dropdown option)
  const targetOption =
    chooseBest(
      controls,
      (c) =>
        ratioPattern.test(c.text) &&
        !isSummaryLikeControl(c) &&
        inToolbarRegion(c) &&
        (isDropdownLikeControl(c) || c.tag === "button" || c.role === "option"),
      targets,
      excludeControlIds,
    ) ||
    chooseBest(
      controls,
      (c) => ratioPattern.test(c.text) && !isSummaryLikeControl(c) && inToolbarRegion(c),
      targets,
      excludeControlIds,
    );
  if (targetOption) return targetOption;

  // Phase 2: any aspect ratio control showing current (non-target) value → switch or open
  return chooseBest(
    controls,
    (c) =>
      /^(16:9|9:16|3:2|2:3|1:1|21:9|4:3)$/.test(c.text) &&
      !isSummaryLikeControl(c) &&
      c.width <= 120 &&
      inToolbarRegion(c),
    targets,
    excludeControlIds,
  );
}

function findDurationTrigger(
  controls: JimengAgentControl[],
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
  excludeControlIds: number[] = [],
): JimengAgentControl | null {
  const targetPattern = new RegExp(`^${targets.duration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

  // Phase 1: target duration option directly visible (dropdown already open)
  const targetOption =
    chooseBest(
      controls,
      (c) =>
        targetPattern.test(c.text) &&
        !isSummaryLikeControl(c) &&
        (c.width <= 120 || c.role === "option" || c.role === "menuitem") &&
        inToolbarRegion(c) &&
        isDropdownLikeControl(c),
      targets,
      excludeControlIds,
    ) ||
    chooseBest(
      controls,
      (c) =>
        targetPattern.test(c.text) &&
        !isSummaryLikeControl(c) &&
        (c.width <= 120 || c.role === "option" || c.role === "menuitem") &&
        inToolbarRegion(c),
      targets,
      excludeControlIds,
    );
  if (targetOption) return targetOption;

  // Phase 2: any duration combobox trigger showing current (non-target) value → open dropdown
  return (
    chooseBest(
      controls,
      (c) =>
        /^\d+s$/i.test(c.text) &&
        !isSummaryLikeControl(c) &&
        c.width <= 120 &&
        inToolbarRegion(c) &&
        isDropdownLikeControl(c),
      targets,
      excludeControlIds,
    ) ||
    chooseBest(
      controls,
      (c) =>
        /^\d+s$/i.test(c.text) &&
        !isSummaryLikeControl(c) &&
        c.width <= 120 &&
        inToolbarRegion(c),
      targets,
      excludeControlIds,
    )
  );
}

function findReferenceTrigger(
  controls: JimengAgentControl[],
  targets: JimengAgentTargets,
  inToolbarRegion: (control: JimengAgentControl) => boolean,
  excludeControlIds: number[] = [],
): JimengAgentControl | null {
  const matchesReferenceText = (control: JimengAgentControl) =>
    /首尾帧|首帧图|智能多帧|图片参考/.test(controlText(control)) &&
    !isBundledReferenceCluster(control) &&
    control.width <= 160 &&
    inToolbarRegion(control);

  return (
    chooseBest(
      controls,
      (control) => matchesReferenceText(control) && isDropdownLikeControl(control),
      targets,
      excludeControlIds,
    ) ||
    chooseBest(controls, matchesReferenceText, targets, excludeControlIds)
  );
}

export function decideHeuristicAction(
  observation: JimengAgentObservation,
  targets: JimengAgentTargets,
  excludeControlIds: number[] = [],
): JimengAgentAction | null {
  const controls = observation.controls;
  const inToolbarRegion = createToolbarRegionPredicate(controls);
  const stage = inferJimengAgentStage(observation, targets);

  if (stage === "left-generate") {
    const leftGenerate = chooseBest(
      controls,
      (control) => /^生成$/.test(control.text) && control.x < 160,
      targets,
      excludeControlIds,
    );
    if (leftGenerate) {
      return { action: "click_control", controlId: leftGenerate.id, reason: "先点击左侧生成入口" };
    }
  }

  if (stage === "video-toolbar" || !observation.matchedSignals.includes("video-entry")) {
    const bottomVideo = chooseBest(
      controls,
      (control) =>
        /视频生成|文生视频/.test(controlText(control)) &&
        control.y > 500 &&
        control.width <= 160 &&
        inToolbarRegion(control),
      targets,
      excludeControlIds,
    );
    if (bottomVideo) {
      return { action: "click_control", controlId: bottomVideo.id, reason: "进入底部视频生成工作栏" };
    }
  }

  if (!observation.matchedSignals.includes("seedance-reference")) {
    const fullReference = chooseBest(
      controls,
      (control) =>
        isExactReferenceOption(control, /^(全能参考|Full Reference)$/) &&
        (
          control.role === "option" ||
          control.role === "menuitem" ||
          inToolbarRegion(control)
        ),
      targets,
      excludeControlIds,
    );
    if (fullReference) {
      return { action: "click_control", controlId: fullReference.id, reason: "切换到全能参考" };
    }

    const referenceTrigger = findReferenceTrigger(
      controls,
      targets,
      inToolbarRegion,
      excludeControlIds,
    );
    if (referenceTrigger) {
      return { action: "click_control", controlId: referenceTrigger.id, reason: "先展开参考模式下拉" };
    }
  }

  if (!observation.matchedSignals.includes("seedance-model")) {
    const modelControl = findModelTrigger(
      controls,
      targets,
      inToolbarRegion,
      excludeControlIds,
    );
    if (modelControl) {
      return { action: "click_control", controlId: modelControl.id, reason: `切换模型到 ${targets.model}` };
    }
  }

  if (!observation.matchedSignals.includes(targets.aspectRatio || "16:9")) {
    const ratioControl = findAspectRatioTrigger(
      controls,
      targets,
      inToolbarRegion,
      excludeControlIds,
    );
    if (ratioControl) {
      return { action: "click_control", controlId: ratioControl.id, reason: `切换比例到 ${targets.aspectRatio || "16:9"}` };
    }
  }

  if (!observation.matchedSignals.includes(targets.duration)) {
    const durationControl = findDurationTrigger(
      controls,
      targets,
      inToolbarRegion,
      excludeControlIds,
    );
    if (durationControl) {
      return { action: "click_control", controlId: durationControl.id, reason: `鍒囨崲鏃堕暱鍒?${targets.duration}` };
    }
  }

  return null;
}

export async function captureJimengAgentObservation(targets: JimengAgentTargets): Promise<JimengAgentObservation> {
  const browserView = window.electronAPI?.browserView;
  if (!browserView) throw new Error("内嵌浏览器不可用");

  // Wait for page to be sufficiently loaded (not still loading / blank)
  const pageReadyScript = `
    (() => {
      const state = document.readyState;
      const hasContent = document.body && document.body.innerText.length > 100;
      return { ready: state === "complete" || state === "interactive", hasContent, state };
    })()
  `;
  for (let i = 0; i < 8; i++) {
    const check = await browserView.execute<{ ready: boolean; hasContent: boolean; state: string }>({ script: pageReadyScript });
    if (check.ok && check.result?.ready && check.result?.hasContent) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const [meta, capture] = await Promise.all([
    browserView.execute<{
      url: string;
      title: string;
      bodyTextSnippet: string;
      controls: JimengAgentControl[];
      matchedSignals: string[];
      targetMatched: boolean;
    }>({ script: buildObservePageScript(targets) }),
    browserView.capture(),
  ]);

  if (!meta.ok || !meta.result) {
    throw new Error(meta.error || "页面观察失败");
  }
  if (!capture.ok || !capture.base64 || !capture.mimeType) {
    throw new Error(capture.error || "页面截图失败");
  }

  return {
    ...meta.result,
    screenshotBase64: capture.base64,
    screenshotMimeType: capture.mimeType,
  };
}

export async function decideJimengAgentAction(
  observation: JimengAgentObservation,
  targets: JimengAgentTargets,
  model = "gemini-3-flash-preview",
  excludeControlIds: number[] = [],
): Promise<JimengAgentAction> {
  if (observation.targetMatched) {
    return { action: "done", reason: "目标状态已满足" };
  }

  const heuristicAction = decideHeuristicAction(
    observation,
    targets,
    excludeControlIds,
  );
  if (heuristicAction) {
    return heuristicAction;
  }

  const llmResult = await Promise.race([
    callGemini(
      model,
      [
        {
          role: "user",
          parts: [
            { text: buildActionPrompt(observation, targets) },
            {
              inlineData: {
                mimeType: observation.screenshotMimeType,
                data: observation.screenshotBase64,
              },
            },
          ],
        },
      ],
      { responseMimeType: "application/json" },
    ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);

  if (!llmResult) {
    const heuristicAction = decideHeuristicAction(
      observation,
      targets,
      excludeControlIds,
    );
    if (heuristicAction) {
      return {
        ...heuristicAction,
        reason: `${heuristicAction.reason}（LLM 决策超时，已切换规则兜底）`,
      };
    }
    return {
      action: "wait",
      waitMs: 600,
      reason: "LLM 决策超时，等待后重试",
    };
  }

  const raw = extractText(llmResult);
  const parsed = safeJsonParse<JimengAgentAction>(extractJsonObject(raw));
  if (!parsed?.action) {
    const heuristicAction = decideHeuristicAction(
      observation,
      targets,
      excludeControlIds,
    );
    if (heuristicAction) {
      return {
        ...heuristicAction,
        reason: `${heuristicAction.reason}（LLM 响应无效，已切换规则兜底）`,
      };
    }
    throw new Error(`Agent response invalid: ${raw || "empty"}`);
  }

  if (parsed.action === "click_control") {
    const stage = inferJimengAgentStage(observation, targets);
    const inToolbarRegion = createToolbarRegionPredicate(observation.controls);
    const valid =
      typeof parsed.controlId === "number" &&
      parsed.controlId > 0 &&
      observation.controls.some((control) => control.id === parsed.controlId);
    if (!valid) {
      const heuristicAction = decideHeuristicAction(
        observation,
        targets,
        excludeControlIds,
      );
      if (heuristicAction) {
        return {
          ...heuristicAction,
          reason: `${heuristicAction.reason}（LLM 选中的控件无效，已切换规则兜底）`,
        };
      }
      return {
        action: "wait",
        waitMs: 800,
        reason: `Agent selected an invalid control: ${extractJsonObject(raw)}`
      };
    }
    const selectedControl = observation.controls.find((control) => control.id === parsed.controlId);
    if (
      selectedControl &&
      !isControlAllowedForStage(stage, selectedControl, targets, inToolbarRegion)
    ) {
      const heuristicAction = decideHeuristicAction(
        observation,
        targets,
        excludeControlIds,
      );
      if (heuristicAction) {
        return {
          ...heuristicAction,
          reason: `${heuristicAction.reason}（LLM 选择了不符合当前阶段的控件，已切换规则兜底）`,
        };
      }
      return {
        action: "wait",
        waitMs: 800,
        reason: `Agent selected a control outside the current stage: ${extractJsonObject(raw)}`,
      };
    }
  }

  if (parsed.action === "wait") {
    return {
      action: "wait",
      waitMs: Math.max(300, Math.min(parsed.waitMs || 800, 3000)),
      reason: parsed.reason || "等待页面更新",
    };
  }

  return parsed;
}

export async function executeJimengAgentAction(
  action: JimengAgentAction,
  controls: JimengAgentControl[],
): Promise<{ ok: boolean; message: string }> {
  const browserView = window.electronAPI?.browserView;
  if (!browserView) throw new Error("内嵌浏览器不可用");

  if (action.action === "done") {
    return { ok: true, message: action.reason || "Agent 判定已完成" };
  }

  if (action.action === "wait") {
    const waitMs = Math.max(300, Math.min(action.waitMs || 800, 3000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return { ok: true, message: `等待 ${waitMs}ms` };
  }

  const target = controls.find((control) => control.id === action.controlId);
  if (!target) {
    return { ok: false, message: `未找到控件 #${action.controlId}` };
  }

  const centerX = Math.max(1, Math.round(target.x + target.width / 2));
  const centerY = Math.max(1, Math.round(target.y + target.height / 2));
  const coordinateClick = await browserView.sendInputEvents([
    { type: "mouseMove", x: centerX, y: centerY },
    { type: "mouseDown", x: centerX, y: centerY, button: "left", clickCount: 1 },
    { type: "mouseUp", x: centerX, y: centerY, button: "left", clickCount: 1 },
  ]);

  if (coordinateClick.ok) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      ok: true,
      message: `已按坐标点击 ${target.text || target.ariaLabel || target.placeholder || `#${target.id}`}`,
    };
  }

  const payload = JSON.stringify(target);
  const result = await browserView.execute<{ clicked: boolean; text: string }>({
    script: `
      (() => {
        const target = ${payload};
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const clickableOf = (node) => {
          if (!(node instanceof HTMLElement)) return null;
          return node.closest("button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='combobox'], label, li, a") || node;
        };
        const hasExpandedMenu = () =>
          !!document.querySelector("[role='option'], [role='menuitem']");
        const fireClick = (node) => {
          const clickable = clickableOf(node);
          if (!(clickable instanceof HTMLElement)) return { clicked: false, text: "" };
          clickable.scrollIntoView({ block: "nearest", inline: "nearest" });
          clickable.focus?.();
          clickable.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          clickable.click();
          const role = normalize(clickable.getAttribute("role") || "");
          // Don't fire "open menu" events when the clickable is already a menu option
          const isMenuOption = role === "option" || role === "menuitem";
          const wantsOpen =
            !isMenuOption &&
            (role === "combobox" ||
            role === "button" ||
            /首尾帧|首帧图|全能参考|智能多帧|图片参考|\d+s|16:9|9:16|1:1|21:9|3:2|2:3|4:3|Seedance/.test(
              normalize(clickable.innerText),
            ));
          if (wantsOpen && !hasExpandedMenu()) {
            clickable.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            clickable.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
          }
          if (wantsOpen && !hasExpandedMenu()) {
            clickable.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
            clickable.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
          }
          if (wantsOpen && !hasExpandedMenu()) {
            clickable.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
            clickable.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
          }
          return { clicked: true, text: normalize(clickable.innerText) || target.text || target.ariaLabel || "" };
        };

        const centerX = Math.max(0, Math.min(window.innerWidth - 1, Math.round(target.x + target.width / 2)));
        const centerY = Math.max(0, Math.min(window.innerHeight - 1, Math.round(target.y + target.height / 2)));
        const pointNode = document.elementFromPoint(centerX, centerY);
        const pointClick = fireClick(pointNode);
        if (pointClick.clicked) {
          return pointClick;
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='combobox'], label, li, a, div, span",
          ),
        ).filter(isVisible);
        const match = nodes.find((node) => {
          const text = normalize(node.innerText);
          const ariaLabel = normalize(node.getAttribute("aria-label") || "");
          const placeholder = normalize(node.getAttribute("placeholder") || "");
          const className = normalize(node.className || "");
          const rect = node.getBoundingClientRect();
          return (
            Math.abs(Math.round(rect.left) - target.x) <= 24 &&
            Math.abs(Math.round(rect.top) - target.y) <= 24 &&
            (
              text === target.text ||
              (!!target.text && text.includes(target.text)) ||
              (!!target.ariaLabel && ariaLabel === target.ariaLabel) ||
              (!!target.placeholder && placeholder === target.placeholder) ||
              (!!target.className && className === target.className)
            )
          );
        });
        const fallbackClick = fireClick(match);
        if (!fallbackClick.clicked) {
          return { clicked: false, text: target.text || target.ariaLabel || target.placeholder || "" };
        }
        return fallbackClick;
      })()
    `,
  });

  if (!result.ok || !result.result?.clicked) {
    return {
      ok: false,
      message:
        result.error ||
        `点击失败: ${target.text || target.ariaLabel || target.placeholder || `#${target.id}`}`,
    };
  }

  return {
    ok: true,
    message: `已通过 DOM 兜底点击 ${result.result.text || target.text || `#${target.id}`}`,
  };
}
