import { callGemini, extractText } from "@/lib/gemini-client";

export interface JimengAgentControl {
  id: number;
  text: string;
  tag: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  className: string;
}

export interface JimengAgentObservation {
  url: string;
  title: string;
  bodyTextSnippet: string;
  controls: JimengAgentControl[];
  screenshotBase64: string;
  screenshotMimeType: string;
  matchedSignals: string[];
  targetMatched: boolean;
}

export interface JimengAgentTargets {
  model: string;
  duration: string;
}

export interface JimengAgentAction {
  action: "click_control" | "wait" | "done";
  controlId?: number;
  waitMs?: number;
  reason: string;
}

function buildObservePageScript(targets: JimengAgentTargets): string {
  return `
  (() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const likelyInteractive = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!isVisible(node)) return false;
      const role = normalize(node.getAttribute('role') || '');
      const className = normalize(node.className || '');
      const text = normalize(node.innerText);
      const cursor = window.getComputedStyle(node).cursor;
      const clickableSelector = node.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a, div, span');
      const byTag = ['button', 'label', 'li', 'a'].includes(node.tagName.toLowerCase());
      const byRole = ['button', 'tab', 'option', 'menuitem'].includes(role);
      const byCursor = cursor === 'pointer';
      const byClass = /btn|button|tab|option|menu|select|dropdown|trigger|switch/i.test(className);
      const byKeyword = /全能参考|首帧图|首尾帧|图片参考|视频生成|16:9|5s|@|Seedance/i.test(text);
      return !!clickableSelector && (byTag || byRole || byCursor || byClass || byKeyword);
    };

    const controls = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a, div, span'))
      .filter(likelyInteractive)
      .map((node, index) => ({
        id: index + 1,
        text: normalize(node.innerText),
        tag: node.tagName.toLowerCase(),
        role: normalize(node.getAttribute('role') || ''),
        ariaLabel: normalize(node.getAttribute('aria-label') || ''),
        placeholder: normalize(node.getAttribute('placeholder') || ''),
        className: normalize(node.className || ''),
      }))
      .filter((item) => item.text || item.ariaLabel || item.placeholder)
      .slice(0, 140);

    const bodyText = normalize(document.body?.innerText || '');
    const visibleTexts = controls.map((item) => item.text).filter(Boolean);
    const includesKeyword = (keywords) => keywords.some((keyword) => bodyText.includes(keyword) || visibleTexts.some((text) => text.includes(keyword)));
    const hasExactText = (value) => visibleTexts.some((text) => text === value);
    const hasAtTrigger = hasExactText('@') || visibleTexts.some((text) => text.startsWith('@'));
    const hasSeedanceModel = includesKeyword([${JSON.stringify(targets.model)}]);
    const hasFullReference = includesKeyword(['全能参考', 'Full Reference']);
    const hasReferenceContent = includesKeyword(['参考内容', 'Reference']) || hasAtTrigger;
    const has169 = includesKeyword(['16:9']);
    const hasTargetDuration = includesKeyword([${JSON.stringify(targets.duration)}]);
    const hasVideo = location.href.includes('type=video') || includesKeyword(['视频生成', '文生视频']);
    const matchedSignals = [];
    if (hasVideo) matchedSignals.push('video-entry');
    if (hasSeedanceModel) matchedSignals.push('seedance-model');
    if (hasFullReference || hasAtTrigger) matchedSignals.push('seedance-reference');
    if (hasReferenceContent) matchedSignals.push('reference-content');
    if (hasAtTrigger) matchedSignals.push('@');
    if (has169) matchedSignals.push('16:9');
    if (hasTargetDuration) matchedSignals.push(${JSON.stringify(targets.duration)});

    return {
      url: location.href,
      title: document.title,
      bodyTextSnippet: bodyText.slice(0, 1600),
      controls,
      matchedSignals,
      targetMatched: hasVideo && hasSeedanceModel && (hasFullReference || hasAtTrigger) && hasReferenceContent && has169 && hasTargetDuration,
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
  const fenceMatch = cleaned.match(/```json\s*([\s\S]*?)```/i) || cleaned.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function buildActionPrompt(observation: JimengAgentObservation, targets: JimengAgentTargets): string {
  const controlsText = observation.controls
    .map((control) => {
      const label = control.text || control.ariaLabel || control.placeholder || "(empty)";
      return `#${control.id} [${control.tag}${control.role ? ` role=${control.role}` : ""}${control.className ? ` class=${control.className}` : ""}] ${label}`;
    })
    .join("\n");

  return [
    `你是浏览器操作代理，目标是把即梦页面切换到 ${targets.model} 的“全能参考”状态。`,
    `完成标准：页面处于视频生成，模型为 ${targets.model}，参考模式是全能参考，并出现 @ 参考入口，同时可见 16:9 和 ${targets.duration}。`,
    "优先策略：",
    "1. 如果当前看到“首帧图”或“首尾帧”，先点击它展开参考模式菜单。",
    "2. 然后点击“全能参考”。",
    "3. 如果已经出现 @ 按钮且有全能参考文字，可返回 done。",
    "4. 只允许点击与目标最相关的控件，不要点击左侧导航、发现、短片、活动等无关入口。",
    `5. 如果时长不是 ${targets.duration}，请切换到 ${targets.duration}。`,
    "",
    `当前 URL: ${observation.url}`,
    `当前标题: ${observation.title}`,
    `当前命中特征: ${observation.matchedSignals.join(", ") || "无"}`,
    "",
    "可见控件列表：",
    controlsText || "(none)",
    "",
    "请只返回 JSON，不要解释：",
    '{"action":"click_control"|"wait"|"done","controlId":number,"waitMs":number,"reason":"简短中文原因"}',
  ].join("\n");
}

function rankControl(control: JimengAgentControl): number {
  const text = `${control.text} ${control.ariaLabel} ${control.placeholder}`.trim();
  let score = 0;
  if (/全能参考/.test(text)) score += 100;
  if (/首帧图|首尾帧|图片参考/.test(text)) score += 80;
  if (/视频生成/.test(text)) score += 40;
  if (/Seedance/.test(text)) score += 30;
  if (/16:9|5s/.test(text)) score += 10;
  if (control.role === "option") score += 18;
  if (control.role === "combobox") score += 16;
  if (control.role === "menuitem") score += 8;
  if (/tab|dropdown|select|menu|trigger/i.test(control.className)) score += 6;
  if (control.tag === "button") score += 4;
  return score;
}

function decideHeuristicAction(observation: JimengAgentObservation, targets: JimengAgentTargets): JimengAgentAction | null {
  const controls = [...observation.controls].sort((a, b) => rankControl(b) - rankControl(a));
  const choose = (pattern: RegExp) => controls.find((control) => pattern.test(`${control.text} ${control.ariaLabel} ${control.placeholder}`.trim()));

  const durationEscaped = targets.duration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const modelEscaped = targets.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (!observation.matchedSignals.includes(targets.model)) {
    const modelOption = choose(new RegExp(modelEscaped));
    if (modelOption) {
      return { action: "click_control", controlId: modelOption.id, reason: `切换模型到 ${targets.model}` };
    }
  }

  if (!observation.matchedSignals.includes(targets.duration)) {
    const durationOption = choose(new RegExp(`^${durationEscaped}$|${durationEscaped}`));
    if (durationOption) {
      return { action: "click_control", controlId: durationOption.id, reason: `切换时长到 ${targets.duration}` };
    }
  }

  if (!observation.matchedSignals.includes("seedance-reference")) {
    const referenceOption = choose(/全能参考/);
    if (referenceOption) {
      return { action: "click_control", controlId: referenceOption.id, reason: "优先点击全能参考选项" };
    }

    const referenceTrigger = choose(/首帧图|首尾帧|图片参考/);
    if (referenceTrigger) {
      return { action: "click_control", controlId: referenceTrigger.id, reason: "先展开参考模式切换菜单" };
    }
  }

  if (!observation.matchedSignals.includes("video-entry")) {
    const videoTrigger = choose(/视频生成/);
    if (videoTrigger) {
      return { action: "click_control", controlId: videoTrigger.id, reason: "确保处于视频生成模式" };
    }
  }

  return null;
}

export async function captureJimengAgentObservation(targets: JimengAgentTargets): Promise<JimengAgentObservation> {
  const browserView = window.electronAPI?.browserView;
  if (!browserView) {
    throw new Error("内嵌浏览器不可用");
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
  model = "gemini-3.1-pro-preview",
): Promise<JimengAgentAction> {
  if (observation.targetMatched) {
    return { action: "done", reason: "目标状态已满足" };
  }

  const heuristicAction = decideHeuristicAction(observation, targets);
  if (heuristicAction) {
    return heuristicAction;
  }

  const data = await callGemini(
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
  );

  const raw = extractText(data);
  const parsed = safeJsonParse<JimengAgentAction>(extractJsonObject(raw));
  if (!parsed?.action) {
    throw new Error(`Agent 返回无效动作: ${raw || "空响应"}`);
  }

  if (parsed.action === "click_control") {
    const valid = typeof parsed.controlId === "number" && parsed.controlId > 0 && observation.controls.some((c) => c.id === parsed.controlId);
    if (!valid) {
      return {
        action: "wait",
        waitMs: 800,
        reason: `Agent 点击目标无效，等待后重试。原始动作: ${extractJsonObject(raw)}`,
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
  if (!browserView) {
    throw new Error("内嵌浏览器不可用");
  }

  if (action.action === "done") {
    return { ok: true, message: action.reason || "Agent 判定完成" };
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

  const payload = JSON.stringify(target);
  const result = await browserView.execute<{ clicked: boolean; text: string }>({
    script: `
      (() => {
        const target = ${payload};
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const nodes = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a, div, span'))
          .filter(isVisible);
        const match = nodes.find((node) => {
          const text = normalize(node.innerText);
          const ariaLabel = normalize(node.getAttribute('aria-label') || '');
          const placeholder = normalize(node.getAttribute('placeholder') || '');
          const className = normalize(node.className || '');
          return (
            text === target.text ||
            (!!target.text && text.includes(target.text)) ||
            (!!target.ariaLabel && ariaLabel === target.ariaLabel) ||
            (!!target.placeholder && placeholder === target.placeholder) ||
            (!!target.className && className === target.className)
          );
        });
        const clickable = match instanceof HTMLElement
          ? (match.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a') || match)
          : null;
        if (!(clickable instanceof HTMLElement)) {
          return { clicked: false, text: target.text || target.ariaLabel || target.placeholder || '' };
        }
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.click();
        return { clicked: true, text: normalize(clickable.innerText) || target.text || target.ariaLabel || '' };
      })()
    `,
  });

  if (!result.ok || !result.result?.clicked) {
    return { ok: false, message: result.error || `点击失败: ${target.text || target.ariaLabel || target.placeholder}` };
  }

  return { ok: true, message: `点击 ${result.result.text || target.text || `#${target.id}`}` };
}
