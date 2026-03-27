import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Chrome,
  Play,
  Pause,
  RotateCcw,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Settings,
  Bot,
  Webhook,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import type { CharacterSetting, Scene, SceneSetting } from "@/types/project";
import { matchSceneTimeVariant } from "@/lib/workspace-labels";
import { compressImage } from "@/lib/image-compress";
import {
  captureJimengAgentObservation,
  decideJimengAgentAction,
  executeJimengAgentAction,
} from "@/lib/jimeng-browser-agent";

interface MultimodalAgentPanelProps {
  scenes: Scene[];
  characters: CharacterSetting[];
  sceneSettings: SceneSetting[];
}

interface JimengPageState {
  url: string;
  title: string;
  hasLoginButton: boolean;
  hasAgreementDialog: boolean;
  isLoggedIn: boolean;
  isVideoMode: boolean;
  hasSeedanceReference: boolean;
  hasVideoGenerateEntry: boolean;
  hasReferenceContentEntry: boolean;
  hasAspectRatio16x9: boolean;
  hasTargetDuration: boolean;
  targetMatched: boolean;
  matchedSignals: string[];
}

const JIMENG_HOME_URL = "https://jimeng.jianying.com/ai-tool/home";
const JIMENG_VIDEO_REFERENCE_URL = `${JIMENG_HOME_URL}?type=video&workspace=0`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const REVERSE_MODEL_OPTIONS = ["Seedance 2.0", "Seedance 2.0 Fast"] as const;
const REVERSE_DURATION_OPTIONS = ["4s", "5s", "6s", "7s", "8s", "9s", "10s", "11s", "12s", "13s", "14s", "15s"] as const;
const INSPECT_JIMENG_PAGE_SCRIPT = `
  (() => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const textOf = (node) => normalize(node instanceof HTMLElement ? node.innerText : node?.textContent || '');
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const bodyText = normalize(document.body?.innerText || '');
    const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], span, div, p'))
      .filter(isVisible)
      .map(textOf)
      .filter(Boolean);

    const includesKeyword = (keywords) => keywords.some((keyword) => bodyText.includes(keyword) || visibleTexts.some((text) => text.includes(keyword)));
    const hasExactText = (value) => visibleTexts.some((text) => text === value);
    const matchedSignals = [];

    const hasVideoGenerateEntry = includesKeyword(['视频生成', '文生视频']);
    const hasSeedanceReference = includesKeyword(['Seedance 2.0']) && includesKeyword(['全能参考', 'Full Reference']);
    const hasReferenceContentEntry = includesKeyword(['参考内容', '@ 图片1', '@图片1']);
    const hasAspectRatio16x9 = includesKeyword(['16:9']);
    const hasDuration5s = visibleTexts.some((text) => text === '5s' || text.includes(' 5s') || text.endsWith('5s'));
    const hasAtReferenceTrigger = hasExactText('@') || visibleTexts.some((text) => text.startsWith('@'));
    const resolvedSeedanceReference = hasSeedanceReference || (includesKeyword(['Seedance 2.0']) && hasAtReferenceTrigger);
    const resolvedReferenceContentEntry = hasReferenceContentEntry || hasAtReferenceTrigger || includesKeyword(['Reference']);
    const hasSeedanceModel = includesKeyword(['Seedance 2.0']);
    const hasFullReferenceLabel = includesKeyword(['全能参考', 'Full Reference']);
    const effectiveSeedanceReference = resolvedSeedanceReference || (hasSeedanceModel && hasFullReferenceLabel);
    const effectiveReferenceContentEntry = resolvedReferenceContentEntry || hasFullReferenceLabel;
    const targetMatched =
      (location.href.includes('type=video') || hasVideoGenerateEntry) &&
      hasSeedanceModel &&
      hasAspectRatio16x9 &&
      hasDuration5s &&
      effectiveReferenceContentEntry &&
      effectiveSeedanceReference;

    if (hasVideoGenerateEntry) matchedSignals.push('video-entry');
    if (hasSeedanceModel) matchedSignals.push('seedance-model');
    if (effectiveSeedanceReference) matchedSignals.push('seedance-reference');
    if (effectiveReferenceContentEntry) matchedSignals.push('reference-content');
    if (hasAtReferenceTrigger) matchedSignals.push('@');
    if (hasAspectRatio16x9) matchedSignals.push('16:9');
    if (hasDuration5s) matchedSignals.push('5s');

    return {
      url: location.href,
      title: document.title,
      hasLoginButton: !!document.querySelector('[class*="login-button"]'),
      hasAgreementDialog: !!document.querySelector('[class*="agree-button"], [class*="disagree-button"]'),
      isLoggedIn: !document.querySelector('[class*="login-button"]'),
      isVideoMode: location.href.includes('type=video') || hasVideoGenerateEntry,
      hasSeedanceReference: effectiveSeedanceReference,
      hasVideoGenerateEntry,
      hasReferenceContentEntry: effectiveReferenceContentEntry,
      hasAspectRatio16x9,
      hasDuration5s,
      targetMatched,
      matchedSignals,
    };
  })()
`;

const ALIGN_SEEDANCE_REFERENCE_SCRIPT = `
  (async () => {
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const collectNodes = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, span, div'));
    const clickTarget = (keywords, exact = false) => {
      const nodes = collectNodes();
      const candidates = nodes.filter((node) => {
        if (!isVisible(node)) return false;
        const text = normalize(node.innerText);
        return keywords.some((keyword) => exact ? text === keyword : text.includes(keyword));
      });
      for (const node of candidates) {
        const clickable = node.closest('button, [role="button"], [role="tab"], [role="option"]') || node;
        if (clickable instanceof HTMLElement) {
          clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          clickable.click();
          return normalize(clickable.innerText || node.innerText);
        }
      }
      return '';
    };

    const clicks = [];
    const videoEntry = clickTarget(['视频生成', '文生视频']);
    if (videoEntry) clicks.push('video:' + videoEntry);

    const referenceModeTrigger = clickTarget(['首尾帧', '首帧图', '图片参考']);
    if (referenceModeTrigger) {
      clicks.push('reference-mode:' + referenceModeTrigger);
      await wait(300);
    }

    const fullReference = clickTarget(['全能参考', 'Full Reference']);
    if (fullReference) {
      clicks.push('reference:' + fullReference);
      await wait(300);
    }

    const fallbackFullReference = !fullReference ? clickTarget(['全能参考', 'Full Reference', '全能']) : '';
    if (fallbackFullReference) {
      clicks.push('reference-fallback:' + fallbackFullReference);
      await wait(300);
    }

    if (!fullReference && !fallbackFullReference) {
      const atTrigger = clickTarget(['@'], true);
      if (atTrigger) clicks.push('reference-trigger:' + atTrigger);
    }

    const aspectRatio = clickTarget(['16:9']);
    if (aspectRatio) clicks.push('ratio:' + aspectRatio);

    const duration = clickTarget(['5s']);
    if (duration) clicks.push('duration:' + duration);

    const visibleTexts = collectNodes()
      .filter(isVisible)
      .map((node) => normalize(node.innerText))
      .filter(Boolean)
      .slice(0, 120);

    return { clicks, visibleTexts };
  })()
`;

const FORCE_SWITCH_FULL_REFERENCE_SCRIPT = `
  (async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const humanPause = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);
    const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const collect = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a, div, span'))
      .filter(isVisible);
    const clickByText = (patterns, options = {}) => {
      const { exact = false, role = '' } = options;
      const nodes = collect();
      const found = nodes.find((node) => {
        const text = normalize(node.innerText);
        const nodeRole = normalize(node.getAttribute('role') || '');
        if (role && nodeRole !== role) return false;
        return patterns.some((pattern) => exact ? text === pattern : (text === pattern || text.includes(pattern)));
      });
      const clickable = found instanceof HTMLElement
        ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a') || found)
        : null;
      if (!(clickable instanceof HTMLElement)) return '';
      clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      clickable.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      clickable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      clickable.click();
      return normalize(clickable.innerText);
    };

    const actions = [];
    const currentMode = clickByText(['首尾帧', '首帧图', '图片参考'], { role: 'combobox' }) || clickByText(['首尾帧', '首帧图', '图片参考']);
    if (currentMode) {
      actions.push('open-mode:' + currentMode);
      await humanPause(450, 850);
    }

    const fullReference = clickByText(['全能参考'], { role: 'option', exact: true }) || clickByText(['全能参考', 'Full Reference']);
    if (fullReference) {
      actions.push('select-full-reference:' + fullReference);
      await humanPause(550, 950);
    }

    const atTrigger = clickByText(['@']);
    if (atTrigger) {
      actions.push('at-trigger:' + atTrigger);
      await humanPause(350, 700);
    }

    const bodyText = normalize(document.body?.innerText || '');
    const success =
      bodyText.includes('全能参考') &&
      (bodyText.includes('参考内容') || bodyText.includes('@')) &&
      bodyText.includes('16:9') &&
      bodyText.includes('5s');

    return { actions, success, bodyTextSnippet: bodyText.slice(0, 1200) };
  })()
`;

export function buildSafeInspectJimengPageScript(targetDuration: string): string {
  return `
    (() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const textOf = (node) => normalize(node instanceof HTMLElement ? node.innerText : node?.textContent || '');
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const bodyText = normalize(document.body?.innerText || '');
      const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="combobox"], span, div, p'))
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean);
      const includesKeyword = (keywords) => keywords.some((keyword) => bodyText.includes(keyword) || visibleTexts.some((text) => text.includes(keyword)));
      const hasExactText = (value) => visibleTexts.some((text) => text === value);
      const matchedSignals = [];

      const hasVideoGenerateEntry = location.href.includes('type=video') || includesKeyword(['视频生成', '文生视频']);
      const hasSeedanceModel = includesKeyword(['Seedance 2.0']);
      const hasFullReference = includesKeyword(['全能参考', 'Full Reference']);
      const hasAtReferenceTrigger = hasExactText('@') || visibleTexts.some((text) => text.startsWith('@'));
      const hasReferenceContentEntry = includesKeyword(['参考内容', '@ 图片1', '@图片1', 'Reference']) || hasAtReferenceTrigger;
      const hasAspectRatio16x9 = includesKeyword(['16:9']);
      const hasTargetDuration = visibleTexts.some((text) => text === ${JSON.stringify(targetDuration)} || text.includes(${JSON.stringify(targetDuration)}));
      const effectiveSeedanceReference = hasFullReference || (hasSeedanceModel && hasAtReferenceTrigger);
      const targetMatched =
        hasVideoGenerateEntry &&
        hasSeedanceModel &&
        hasReferenceContentEntry &&
        hasAspectRatio16x9 &&
        hasTargetDuration &&
        effectiveSeedanceReference;

      if (hasVideoGenerateEntry) matchedSignals.push('video-entry');
      if (hasSeedanceModel) matchedSignals.push('seedance-model');
      if (effectiveSeedanceReference) matchedSignals.push('seedance-reference');
      if (hasReferenceContentEntry) matchedSignals.push('reference-content');
      if (hasAtReferenceTrigger) matchedSignals.push('@');
      if (hasAspectRatio16x9) matchedSignals.push('16:9');
      if (hasTargetDuration) matchedSignals.push(${JSON.stringify(targetDuration)});

      return {
        url: location.href,
        title: document.title,
        hasLoginButton: !!document.querySelector('[class*="login-button"]'),
        hasAgreementDialog: !!document.querySelector('[class*="agree-button"], [class*="disagree-button"]'),
        isLoggedIn: !document.querySelector('[class*="login-button"]'),
        isVideoMode: hasVideoGenerateEntry,
        hasSeedanceReference: effectiveSeedanceReference,
        hasVideoGenerateEntry,
        hasReferenceContentEntry,
        hasAspectRatio16x9,
        hasTargetDuration,
        targetMatched,
        matchedSignals,
      };
    })()
  `;
}

export function buildSafeAlignSeedanceReferenceScript(targetDuration: string): string {
  return `
    (async () => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const collectNodes = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, span, div'));
      const clickTarget = (keywords, exact = false) => {
        const nodes = collectNodes();
        const candidates = nodes.filter((node) => {
          if (!isVisible(node)) return false;
          const text = normalize(node.innerText);
          return keywords.some((keyword) => exact ? text === keyword : text.includes(keyword));
        });
        for (const node of candidates) {
          const clickable = node.closest('button, [role="button"], [role="tab"], [role="option"]') || node;
          if (clickable instanceof HTMLElement) {
            clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
            clickable.click();
            return normalize(clickable.innerText || node.innerText);
          }
        }
        return '';
      };

      const clicks = [];
      const videoEntry = clickTarget(['视频生成', '文生视频']);
      if (videoEntry) clicks.push('video:' + videoEntry);

      const referenceModeTrigger = clickTarget(['首尾帧', '首帧图', '图片参考']);
      if (referenceModeTrigger) {
        clicks.push('reference-mode:' + referenceModeTrigger);
        await wait(300);
      }

      const fullReference = clickTarget(['全能参考', 'Full Reference']);
      if (fullReference) {
        clicks.push('reference:' + fullReference);
        await wait(300);
      }

      if (!fullReference) {
        const atTrigger = clickTarget(['@'], true);
        if (atTrigger) clicks.push('reference-trigger:' + atTrigger);
      }

      const aspectRatio = clickTarget(['16:9']);
      if (aspectRatio) clicks.push('ratio:' + aspectRatio);

      const duration = clickTarget([${JSON.stringify(targetDuration)}]);
      if (duration) clicks.push('duration:' + duration);

      const visibleTexts = collectNodes()
        .filter(isVisible)
        .map((node) => normalize(node.innerText))
        .filter(Boolean)
        .slice(0, 120);

      return { clicks, visibleTexts };
    })()
  `;
}

export function buildSafeForceSwitchFullReferenceScript(targetDuration: string): string {
  return `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const humanPause = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const collect = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a, div, span'))
        .filter(isVisible);
      const clickByText = (patterns, options = {}) => {
        const { exact = false, role = '' } = options;
        const found = collect().find((node) => {
          const text = normalize(node.innerText);
          const nodeRole = normalize(node.getAttribute('role') || '');
          if (role && nodeRole !== role) return false;
          return patterns.some((pattern) => exact ? text === pattern : (text === pattern || text.includes(pattern)));
        });
        const clickable = found instanceof HTMLElement
          ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], label, li, a') || found)
          : null;
        if (!(clickable instanceof HTMLElement)) return '';
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        clickable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        clickable.click();
        return normalize(clickable.innerText);
      };

      const actions = [];
      const currentMode = clickByText(['首尾帧', '首帧图', '图片参考'], { role: 'combobox' }) || clickByText(['首尾帧', '首帧图', '图片参考']);
      if (currentMode) {
        actions.push('open-mode:' + currentMode);
        await humanPause(450, 850);
      }

      const fullReference = clickByText(['全能参考'], { role: 'option', exact: true }) || clickByText(['全能参考', 'Full Reference']);
      if (fullReference) {
        actions.push('select-full-reference:' + fullReference);
        await humanPause(550, 950);
      }

      const atTrigger = clickByText(['@']);
      if (atTrigger) {
        actions.push('at-trigger:' + atTrigger);
        await humanPause(350, 700);
      }

      const aspectRatio = clickByText(['16:9']);
      if (aspectRatio) {
        actions.push('ratio:' + aspectRatio);
        await humanPause(350, 700);
      }

      const duration = clickByText([${JSON.stringify(targetDuration)}]);
      if (duration) {
        actions.push('duration:' + duration);
        await humanPause(350, 700);
      }

      const bodyText = normalize(document.body?.innerText || '');
      const success =
        bodyText.includes('全能参考') &&
        (bodyText.includes('参考内容') || bodyText.includes('@')) &&
        bodyText.includes('16:9') &&
        bodyText.includes(${JSON.stringify(targetDuration)});

      return { actions, success, bodyTextSnippet: bodyText.slice(0, 1200) };
    })()
  `;
}

function buildForceApplySettingsScript(targetModel: string, targetDuration: string): string {
  return `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const humanPause = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const normalizeModelText = (text) => {
        const normalized = normalize(text);
        if (/^Seedance 2\\.0 Fast\\b/i.test(normalized)) return 'Seedance 2.0 Fast';
        if (/^Seedance 2\\.0\\b/i.test(normalized)) return 'Seedance 2.0';
        return normalized;
      };
      const normalizeDurationText = (text) => {
        const normalized = normalize(text);
        const match = normalized.match(/\\b(\\d+s)\\b/i);
        return match ? match[1] : normalized;
      };
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const matchesModel = (text, targetModel) => {
        if (targetModel === 'Seedance 2.0') {
          return /^Seedance 2\\.0(?!\\s*Fast)\\b/.test(text);
        }
        if (targetModel === 'Seedance 2.0 Fast') {
          return /^Seedance 2\\.0 Fast\\b/.test(text);
        }
        return text.includes(targetModel);
      };
      const collect = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a, div, span'))
        .filter(isVisible);
      const getVisibleComboboxes = () => collect()
        .filter((node) => normalize(node.getAttribute('role') || '') === 'combobox')
        .map((node) => ({
          node,
          text: normalize(node.innerText),
          rect: node.getBoundingClientRect(),
        }))
        .filter((item) => item.rect.width > 0 && item.rect.height > 0);
      const clickByText = (patterns, options = {}) => {
        const { exact = false, role = '' } = options;
        const found = collect().find((node) => {
          const text = normalize(node.innerText);
          const nodeRole = normalize(node.getAttribute('role') || '');
          if (role && nodeRole !== role) return false;
          return patterns.some((pattern) => exact ? text === pattern : (text === pattern || text.includes(pattern)));
        });
        const clickable = found instanceof HTMLElement
          ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a') || found)
          : null;
        if (!(clickable instanceof HTMLElement)) return '';
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        clickable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        clickable.click();
        return normalize(clickable.innerText);
      };
      const clickByPredicate = (predicate) => {
        const found = collect().find((node) => predicate(node, normalize(node.innerText), normalize(node.getAttribute('role') || '')));
        const clickable = found instanceof HTMLElement
          ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a') || found)
          : null;
        if (!(clickable instanceof HTMLElement)) return '';
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.click();
        return normalize(clickable.innerText);
      };
      const clickBestCombobox = (kind) => {
        const combos = getVisibleComboboxes();
        const filtered = combos.filter((item) => {
          if (kind === 'model') return /Seedance 2.0/.test(item.text);
          if (kind === 'duration') return /^\\d+s$/.test(item.text);
          return false;
        }).sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
        const picked = filtered[0];
        if (!picked || !(picked.node instanceof HTMLElement)) return '';
        picked.node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        picked.node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        picked.node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        picked.node.click();
        return picked.text;
      };

      const actions = [];

      const getCurrentSelections = () => {
        const combos = collect()
          .filter((node) => normalize(node.getAttribute('role') || '') === 'combobox')
          .map((node) => normalize(node.innerText));
        const rawModel = combos.find((text) => text.includes('Seedance 2.0')) || '';
        const rawDuration = combos.find((text) => /^\\d+s$/.test(text) || /\\b\\d+s\\b/.test(text)) || '';
        return {
          currentModel: normalizeModelText(rawModel),
          currentDuration: normalizeDurationText(rawDuration),
        };
      };

      const selectDuration = async (label) => {
        const durationOpened = clickByPredicate((node, text, role) =>
          role === 'combobox' && /^\\d+s$/.test(text)
        ) || clickBestCombobox('duration');
        if (durationOpened) {
          actions.push('open-duration:' + durationOpened);
          await humanPause(450, 800);
        }
        const durationSelected = clickByPredicate((node, text, role) =>
          role === 'option' && text.includes(${JSON.stringify(targetDuration)})
        ) || clickByText([${JSON.stringify(targetDuration)}]);
        if (durationSelected) {
          actions.push(label + ':' + durationSelected);
          await humanPause(500, 900);
        }
      };

      const selectModel = async (label) => {
        const modelOpened = clickByPredicate((node, text, role) =>
          role === 'combobox' && /Seedance 2.0/.test(text)
        ) || clickBestCombobox('model');
        if (modelOpened) {
          actions.push('open-model:' + modelOpened);
          await humanPause(450, 800);
        }
        const modelSelected = clickByPredicate((node, text, role) =>
          role === 'option' && matchesModel(text, ${JSON.stringify(targetModel)})
        ) || clickByText([${JSON.stringify(targetModel)}]);
        if (modelSelected) {
          actions.push(label + ':' + modelSelected);
          await humanPause(650, 1100);
        }
      };

      let selections = getCurrentSelections();
      for (let round = 1; round <= 3; round += 1) {
        if (selections.currentDuration !== ${JSON.stringify(targetDuration)}) {
          await selectDuration('select-duration-' + round);
        }
        if (selections.currentModel !== ${JSON.stringify(targetModel)}) {
          await selectModel('select-model-' + round);
        }

        selections = getCurrentSelections();
        actions.push('after-round-' + round + ':model=' + (selections.currentModel || 'none') + ',duration=' + (selections.currentDuration || 'none'));

        const bodyAfterRound = normalize(document.body?.innerText || '');
        if (bodyAfterRound.includes('已为您匹配至最佳模型') && selections.currentModel !== ${JSON.stringify(targetModel)}) {
          actions.push('model-fallback-detected-' + round);
          await humanPause(800, 1400);
          await selectModel('reselect-model-' + round);
          selections = getCurrentSelections();
          actions.push('after-reselect-' + round + ':model=' + (selections.currentModel || 'none') + ',duration=' + (selections.currentDuration || 'none'));
        }

        if (selections.currentModel === ${JSON.stringify(targetModel)} && selections.currentDuration === ${JSON.stringify(targetDuration)}) {
          break;
        }
      }

      return {
        actions,
        currentModel: selections.currentModel,
        currentDuration: selections.currentDuration,
        targetModel: ${JSON.stringify(targetModel)},
        targetDuration: ${JSON.stringify(targetDuration)},
        success: selections.currentModel === ${JSON.stringify(targetModel)} && selections.currentDuration === ${JSON.stringify(targetDuration)},
      };
    })()
  `;
}

function buildTargetVerificationScript(targetModel: string, targetDuration: string): string {
  return `
    (() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const combos = Array.from(document.querySelectorAll('[role="combobox"]'))
        .map((node) => normalize(node instanceof HTMLElement ? node.innerText : ''))
        .filter(Boolean);
      const rawModel = combos.find((text) => text.includes('Seedance 2.0')) || '';
      const rawDuration = combos.find((text) => /^\\d+s$/.test(text) || /\\b\\d+s\\b/.test(text)) || '';
      const currentModel = normalizeModelText(rawModel);
      const currentDuration = normalizeDurationText(rawDuration);
      const bodyText = normalize(document.body?.innerText || '');
      return {
        currentModel,
        currentDuration,
        targetModel: ${JSON.stringify(targetModel)},
        targetDuration: ${JSON.stringify(targetDuration)},
        hasTargetModel: currentModel === ${JSON.stringify(targetModel)},
        hasTargetDuration: currentDuration === ${JSON.stringify(targetDuration)},
        hasFallbackToast: bodyText.includes('已为您匹配至最佳模型'),
      };
    })()
  `;
}

export function buildTargetVerificationScriptV2(targetModel: string, targetDuration: string): string {
  return `
    (() => {
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const normalizeModelText = (text) => {
        const normalized = normalize(text);
        if (/^Seedance 2\\.0 Fast\\b/i.test(normalized)) return 'Seedance 2.0 Fast';
        if (/^Seedance 2\\.0\\b/i.test(normalized)) return 'Seedance 2.0';
        return normalized;
      };
      const normalizeDurationText = (text) => {
        const normalized = normalize(text);
        const match = normalized.match(/\\b(\\d+s)\\b/i);
        return match ? match[1] : normalized;
      };
      const combos = Array.from(document.querySelectorAll('[role="combobox"]'))
        .map((node) => normalize(node instanceof HTMLElement ? node.innerText : ''))
        .filter(Boolean);
      const rawModel = combos.find((text) => text.includes('Seedance 2.0')) || '';
      const rawDuration = combos.find((text) => /^\\d+s$/.test(text) || /\\b\\d+s\\b/.test(text)) || '';
      const currentModel = normalizeModelText(rawModel);
      const currentDuration = normalizeDurationText(rawDuration);
      const bodyText = normalize(document.body?.innerText || '');
      return {
        currentModel,
        currentDuration,
        targetModel: ${JSON.stringify(targetModel)},
        targetDuration: ${JSON.stringify(targetDuration)},
        hasTargetModel: currentModel === ${JSON.stringify(targetModel)},
        hasTargetDuration: currentDuration === ${JSON.stringify(targetDuration)},
        hasFallbackToast: bodyText.includes('已为您匹配至最佳模型'),
      };
    })()
  `;
}

export function buildForceApplySettingsScriptV2(targetModel: string, targetDuration: string): string {
  return `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const humanPause = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const normalizeModelText = (text) => {
        const normalized = normalize(text);
        if (/^Seedance 2\\.0 Fast\\b/i.test(normalized)) return 'Seedance 2.0 Fast';
        if (/^Seedance 2\\.0\\b/i.test(normalized)) return 'Seedance 2.0';
        return normalized;
      };
      const normalizeDurationText = (text) => {
        const normalized = normalize(text);
        const match = normalized.match(/\\b(\\d+s)\\b/i);
        return match ? match[1] : normalized;
      };
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const collect = () => Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a, div, span'))
        .filter(isVisible);
      const matchesModel = (text) => normalizeModelText(text) === ${JSON.stringify(targetModel)};
      const clickByText = (patterns, options = {}) => {
        const { exact = false, role = '' } = options;
        const found = collect().find((node) => {
          const text = normalize(node.innerText);
          const nodeRole = normalize(node.getAttribute('role') || '');
          if (role && nodeRole !== role) return false;
          return patterns.some((pattern) => exact ? text === pattern : text === pattern || text.includes(pattern));
        });
        const clickable = found instanceof HTMLElement
          ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a') || found)
          : null;
        if (!(clickable instanceof HTMLElement)) return '';
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.click();
        return normalize(clickable.innerText);
      };
      const clickByPredicate = (predicate) => {
        const found = collect().find((node) => predicate(node, normalize(node.innerText), normalize(node.getAttribute('role') || '')));
        const clickable = found instanceof HTMLElement
          ? (found.closest('button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="combobox"], label, li, a') || found)
          : null;
        if (!(clickable instanceof HTMLElement)) return '';
        clickable.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        clickable.click();
        return normalize(clickable.innerText);
      };
      const getCurrentSelections = () => {
        const combos = collect()
          .filter((node) => normalize(node.getAttribute('role') || '') === 'combobox')
          .map((node) => normalize(node.innerText));
        const rawModel = combos.find((text) => text.includes('Seedance 2.0')) || '';
        const rawDuration = combos.find((text) => /^\\d+s$/.test(text) || /\\b\\d+s\\b/.test(text)) || '';
        return {
          currentModel: normalizeModelText(rawModel),
          currentDuration: normalizeDurationText(rawDuration),
        };
      };
      const selectDuration = async (label) => {
        const durationOpened = clickByPredicate((node, text, role) => role === 'combobox' && /\\b\\d+s\\b/.test(text));
        if (durationOpened) {
          await humanPause(350, 700);
        }
        const durationSelected = clickByPredicate((node, text, role) => role === 'option' && text.includes(${JSON.stringify(targetDuration)}))
          || clickByText([${JSON.stringify(targetDuration)}]);
        if (durationSelected) {
          actions.push(label + ':' + durationSelected);
          await humanPause(450, 900);
        }
      };
      const selectModel = async (label) => {
        const modelOpened = clickByPredicate((node, text, role) => role === 'combobox' && /Seedance 2.0/.test(text));
        if (modelOpened) {
          await humanPause(350, 700);
        }
        const modelSelected = clickByPredicate((node, text, role) => role === 'option' && matchesModel(text))
          || clickByText([${JSON.stringify(targetModel)}]);
        if (modelSelected) {
          actions.push(label + ':' + modelSelected);
          await humanPause(450, 900);
        }
      };

      const actions = [];
      let selections = getCurrentSelections();
      for (let round = 1; round <= 4; round += 1) {
        if (selections.currentDuration !== ${JSON.stringify(targetDuration)}) {
          await selectDuration('select-duration-' + round);
        }
        if (selections.currentModel !== ${JSON.stringify(targetModel)}) {
          await selectModel('select-model-' + round);
        }
        selections = getCurrentSelections();
        actions.push('after-round-' + round + ':model=' + (selections.currentModel || 'none') + ',duration=' + (selections.currentDuration || 'none'));
        if (selections.currentModel === ${JSON.stringify(targetModel)} && selections.currentDuration === ${JSON.stringify(targetDuration)}) {
          break;
        }
      }
      return {
        actions,
        currentModel: selections.currentModel,
        currentDuration: selections.currentDuration,
        targetModel: ${JSON.stringify(targetModel)},
        targetDuration: ${JSON.stringify(targetDuration)},
        success: selections.currentModel === ${JSON.stringify(targetModel)} && selections.currentDuration === ${JSON.stringify(targetDuration)},
      };
    })()
  `;
}

export function buildPromptFillScript(
  promptText: string,
  refs: Array<{ dataUrl: string; fileName: string }>,
): string {
  return `
    (async () => {
      const promptText = ${JSON.stringify(promptText)};
      const refs = ${JSON.stringify(refs)};
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const textboxes = Array.from(document.querySelectorAll('[role="textbox"], .ProseMirror, [contenteditable="true"], textarea'))
        .filter(isVisible);
      const textbox = textboxes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (!(textbox instanceof HTMLElement)) {
        return { ok: false, message: '未找到提示词输入框' };
      }

      const section = textbox.closest('.section-generator-N3XwXD') || document;
      const fileInput = section.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
      if (!(fileInput instanceof HTMLInputElement)) {
        return { ok: false, message: '未找到参考素材上传输入框' };
      }

      const dataUrlToFile = (dataUrl, fileName) => {
        const [meta, base64] = dataUrl.split(',');
        const mimeMatch = meta.match(/data:([^;]+);base64/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const binary = atob(base64 || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new File([bytes], fileName, { type: mime });
      };

      if (refs.length > 0) {
        const dt = new DataTransfer();
        for (const ref of refs) {
          dt.items.add(dataUrlToFile(ref.dataUrl, ref.fileName));
        }
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(1200);
      }

      if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
        textbox.focus();
        textbox.value = promptText;
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText, inputType: 'insertText' }));
        textbox.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        textbox.focus();
        textbox.innerHTML = '';
        textbox.textContent = promptText;
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText, inputType: 'insertText' }));
        textbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(400);

      return {
        ok: true,
        uploaded: refs.length,
        filled: true,
        promptLength: promptText.length,
        message: '已填入整段提示词并上传参考图（未提交）',
      };
    })()
  `;
}

const MultimodalAgentPanel = ({ scenes, characters, sceneSettings }: MultimodalAgentPanelProps) => {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'initializing' | 'browsing' | 'operating' | 'generating' | 'completed' | 'error'>('idle');
  const [currentAction, setCurrentAction] = useState<string>('等待开始...');
  const [progress, setProgress] = useState<number>(0);
  const [showBrowser, setShowBrowser] = useState<boolean>(true);
  const [browserLocked, setBrowserLocked] = useState<boolean>(false);
  const [reverseModel, setReverseModel] = useState<(typeof REVERSE_MODEL_OPTIONS)[number]>("Seedance 2.0 Fast");
  const [reverseDuration, setReverseDuration] = useState<(typeof REVERSE_DURATION_OPTIONS)[number]>("5s");
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [browserUrl, setBrowserUrl] = useState<string>('https://jimeng.jianying.com/ai-tool/home');
  const [browserState, setBrowserState] = useState<{ visible: boolean; url?: string; title?: string; loading: boolean; error?: string }>({
    visible: false,
    loading: false,
  });

  const logRef = useRef<HTMLDivElement>(null);
  const browserContainerRef = useRef<HTMLDivElement>(null);
  const browserPlaceholderRef = useRef<HTMLDivElement>(null);
  const agentActiveRef = useRef<boolean>(false);

  // 滚动到日志底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [operationLog]);

  // 添加日志消息
  const addLogMessage = (message: string) => {
    setOperationLog(prev => [...prev, message]);
  };

  const buildSceneReferences = useCallback((scene: Scene) => {
    const refs: Array<{ kind: "character" | "scene"; label: string; url: string }> = [];
    for (const name of scene.characters) {
      const character = characters.find((item) => item.name === name);
      if (!character) continue;
      let imageUrl = character.imageUrl;
      const costumeId = scene.characterCostumes?.[name] || character.activeCostumeId;
      if (costumeId && character.costumes?.length) {
        const costume = character.costumes.find((item) => item.id === costumeId);
        if (costume?.imageUrl) imageUrl = costume.imageUrl;
      }
      if (imageUrl) refs.push({ kind: "character", label: name, url: imageUrl });
    }

    const matchedScene = sceneSettings.find((item) => item.name === scene.sceneName);
    if (matchedScene) {
      let imageUrl = matchedScene.imageUrl;
      const variantId =
        scene.sceneTimeVariantId ||
        matchSceneTimeVariant(scene, sceneSettings)?.id ||
        matchedScene.activeTimeVariantId;
      if (variantId && matchedScene.timeVariants?.length) {
        const variant = matchedScene.timeVariants.find((item) => item.id === variantId);
        if (variant?.imageUrl) imageUrl = variant.imageUrl;
      }
      if (imageUrl) refs.push({ kind: "scene", label: scene.sceneName || "场景", url: imageUrl });
    }

    return refs.slice(0, 12);
  }, [characters, sceneSettings]);

  const buildScenePromptPayload = useCallback((scene: Scene) => {
    const refs = buildSceneReferences(scene);
    const refMentions = refs.map((ref, index) =>
      ref.kind === "character"
        ? `${ref.label}参考@图片${index + 1}`
        : `场景${ref.label}参考@图片${index + 1}`,
    );
    const parts = [
      `${scene.segmentLabel || scene.sceneNumber}`.trim(),
      refMentions.length ? `参考素材：${refMentions.join("，")}` : "",
      scene.sceneName ? `场景：${scene.sceneName}` : "",
      scene.characters.length ? `出场角色：${scene.characters.join("、")}` : "",
      `画面：${scene.description}`,
      scene.dialogue ? `对白：${scene.dialogue}` : "",
      scene.cameraDirection ? `要求：${scene.cameraDirection}` : "",
    ].filter(Boolean);

    return {
      prompt: parts.join("\n"),
      refs,
    };
  }, [buildSceneReferences]);

  const buildCombinedPromptPayload = useCallback((allScenes: Scene[]) => {
    const refs = [
      ...new Map(
        allScenes
          .flatMap((scene) => buildSceneReferences(scene))
          .map((ref) => [`${ref.kind}:${ref.label}:${ref.url}`, ref]),
      ).values(),
    ].slice(0, 12);
    const refMentions = refs.map((ref, index) =>
      ref.kind === "character"
        ? `${ref.label}参考@图片${index + 1}`
        : `场景${ref.label}参考@图片${index + 1}`,
    );
    const sceneNames = [
      ...new Set(
        allScenes.map((scene) => scene.sceneName?.trim()).filter(Boolean),
      ),
    ];
    const characterNames = [
      ...new Set(
        allScenes
          .flatMap((scene) => scene.characters || [])
          .map((name) => String(name || "").trim())
          .filter(Boolean),
      ),
    ];
    const shotLines = allScenes.map((scene, index) => {
      const parts = [
        `分镜${index + 1}`,
        scene.description || "",
        scene.dialogue ? `对白：${scene.dialogue}` : "",
        scene.cameraDirection ? `要求：${scene.cameraDirection}` : "",
      ].filter(Boolean);
      return parts.join("｜");
    });

    const parts = [
      refMentions.length ? `参考素材：${refMentions.join("；")}` : "",
      sceneNames.length ? `场景：${sceneNames.join("、")}` : "",
      characterNames.length ? `角色：${characterNames.join("、")}` : "",
      "完整提示词：",
      ...shotLines,
    ].filter(Boolean);

    return {
      prompt: parts.join("\n"),
      refs,
    };
  }, [buildSceneReferences]);

  useEffect(() => {
    const api = window.electronAPI?.browserView;
    if (!api) return;
    return api.onStateChange((state) => {
      setBrowserState(state);
      if (state.url) {
        setBrowserUrl(state.url);
      }
    });
  }, []);

  const rafRef = useRef<number | null>(null);

  const syncBrowserBounds = useCallback(async () => {
    const placeholder = browserPlaceholderRef.current;
    const container = browserContainerRef.current;
    const api = window.electronAPI?.browserView;
    if (!placeholder || !container || !api || !showBrowser) return;

    // Use the placeholder's rect — it's in normal flow so its position reflects
    // where the browser area actually is in the viewport right now.
    const rect = placeholder.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Sync the fixed overlay div to exactly cover the placeholder
    container.style.left = `${Math.round(rect.left)}px`;
    container.style.top = `${Math.round(rect.top)}px`;
    container.style.width = `${Math.round(rect.width)}px`;
    container.style.height = `${Math.round(rect.height)}px`;

    // Clip to viewport so BrowserView never extends outside the window
    const clippedLeft = Math.max(0, rect.left);
    const clippedTop = Math.max(0, rect.top);
    const clippedRight = Math.min(window.innerWidth, rect.right);
    const clippedBottom = Math.min(window.innerHeight, rect.bottom);
    const clippedWidth = Math.max(0, clippedRight - clippedLeft);
    const clippedHeight = Math.max(0, clippedBottom - clippedTop);

    if (clippedWidth <= 0 || clippedHeight <= 0) {
      await api.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    await api.setBounds({
      x: Math.round(clippedLeft),
      y: Math.round(clippedTop),
      width: Math.round(clippedWidth),
      height: Math.round(clippedHeight),
    });
  }, [showBrowser]);

  const syncBrowserBoundsThrottled = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      void syncBrowserBounds();
    });
  }, [syncBrowserBounds]);

  useEffect(() => {
    const placeholder = browserPlaceholderRef.current;
    if (!placeholder) return;
    const observer = new ResizeObserver(syncBrowserBoundsThrottled);
    observer.observe(placeholder);
    window.addEventListener("resize", syncBrowserBoundsThrottled);
    window.addEventListener("scroll", syncBrowserBoundsThrottled, true);
    // Interval sync to keep BrowserView anchored (prevents floating window drift)
    const intervalId = window.setInterval(syncBrowserBoundsThrottled, 200);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBrowserBoundsThrottled);
      window.removeEventListener("scroll", syncBrowserBoundsThrottled, true);
      window.clearInterval(intervalId);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [syncBrowserBoundsThrottled]);

  useEffect(() => {
    const api = window.electronAPI?.browserView;
    if (!api || !showBrowser) return;

    let cancelled = false;
    const ensureVisible = async () => {
      // Skip re-init while agent is actively controlling the browser
      if (agentActiveRef.current) return;
      try {
        await syncBrowserBounds();
        const currentState = await api.getState();
        const shouldNavigate = !currentState.url || currentState.url !== browserUrl;
        await api.create(shouldNavigate ? { url: browserUrl } : {});
        await syncBrowserBounds();
        await api.show();
        if (!cancelled) {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 内嵌浏览器已准备就绪`);
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : String(error);
          addLogMessage(`[${new Date().toLocaleTimeString()}] 内嵌浏览器初始化失败: ${msg}`);
        }
      }
    };

    void ensureVisible();
    return () => {
      cancelled = true;
    };
  }, [browserUrl, showBrowser, syncBrowserBounds]);

  useEffect(() => {
    const api = window.electronAPI?.browserView;
    return () => {
      void api?.close();
    };
  }, []);

  const executeInBrowserView = useCallback(async <T,>(script: string): Promise<T | null> => {
    const api = window.electronAPI?.browserView;
    if (!api) throw new Error('内嵌浏览器不可用');
    const result = await api.execute<T>({ script });
    if (!result.ok) throw new Error(result.error || '脚本执行失败');
    return result.result ?? null;
  }, []);

  const pushScenePromptToBrowser = useCallback(async (scene: Scene) => {
    const payload = buildScenePromptPayload(scene);
    const script = `
      (async () => {
        const promptText = ${JSON.stringify(payload.prompt)};
        const refs = ${JSON.stringify(payload.refs)};
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const textbox = Array.from(document.querySelectorAll('[role="textbox"], .ProseMirror'))
          .filter(isVisible)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (!(textbox instanceof HTMLElement)) {
          return { ok: false, message: '未找到提示词输入框' };
        }

        const section = textbox.closest('.section-generator-N3XwXD') || document;
        const fileInput =
          section.querySelector('input[type="file"]') ||
          document.querySelector('input[type="file"]');

        if (!(fileInput instanceof HTMLInputElement)) {
          return { ok: false, message: '未找到参考素材上传输入框' };
        }

        const toFile = async (url, index) => {
          let blob;
          if (String(url).startsWith('data:')) {
            const resp = await fetch(url);
            blob = await resp.blob();
          } else {
            const resp = await fetch(url, { mode: 'cors' });
            blob = await resp.blob();
          }
          const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          return new File([blob], 'reference-' + (index + 1) + '.' + ext, { type: blob.type || 'image/png' });
        };

        if (refs.length > 0) {
          const dt = new DataTransfer();
          for (let i = 0; i < refs.length; i += 1) {
            const file = await toFile(refs[i].url, i);
            dt.items.add(file);
          }
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(1200);
        }

        textbox.focus();
        textbox.innerHTML = '';
        textbox.textContent = promptText;
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText, inputType: 'insertText' }));
        textbox.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(400);

        const submit = Array.from(document.querySelectorAll('button'))
          .filter(isVisible)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
          .find((button) => /submit-button|send|generate/i.test(button.className) && !(button instanceof HTMLButtonElement && button.disabled));

        if (!(submit instanceof HTMLElement)) {
          return { ok: true, uploaded: refs.length, message: '已写入提示词与参考图，但未找到可点击的提交按钮' };
        }

        submit.click();
        return { ok: true, uploaded: refs.length, submitted: true, message: '已提交当前分镜' };
      })()
    `;

    return await executeInBrowserView<{ ok: boolean; uploaded?: number; submitted?: boolean; message: string }>(script);
  }, [buildScenePromptPayload, executeInBrowserView]);

  const prepareCombinedPromptInBrowser = useCallback(async () => {
    const payload = buildCombinedPromptPayload(scenes);
    const refs = await Promise.all(
      payload.refs.map(async (ref, index) => {
        try {
          const dataUrl = await compressImage(ref.url, 400 * 1024, { maxDim: 1024 });
          return {
            ...ref,
            dataUrl,
            fileName: `reference-${index + 1}.jpg`,
          };
        } catch {
          return null;
        }
      }),
    ).then((items) => items.filter(Boolean) as Array<{ kind: "character" | "scene"; label: string; url: string; dataUrl: string; fileName: string }>);

    const promptTarget = await executeInBrowserView<{
      ok: boolean;
      fileInputIndex: number;
    }>(`
      (() => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const textboxes = Array.from(document.querySelectorAll('[role="textbox"], .ProseMirror, [contenteditable="true"], textarea'))
          .filter(isVisible);
        const textbox = textboxes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (!(textbox instanceof HTMLElement)) {
          return { ok: false, fileInputIndex: 0 };
        }
        const section = textbox.closest('.section-generator-N3XwXD') || document;
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
        const targetInput = section.querySelector('input[type="file"]') || fileInputs[0] || null;
        const fileInputIndex = targetInput ? Math.max(0, fileInputs.findIndex((item) => item === targetInput)) : 0;
        return { ok: true, fileInputIndex };
      })()
    `);

    if (!promptTarget?.ok) {
      throw new Error("未找到可用的提示词区域");
    }

    if (refs.length > 0) {
      const uploadResult = await window.electronAPI?.browserView?.setFileInputFiles({
        selector: 'input[type="file"]',
        index: promptTarget.fileInputIndex,
        files: refs.map((ref) => ({
          fileName: ref.fileName,
          dataUrl: ref.dataUrl,
        })),
      });
      if (!uploadResult?.ok) {
        throw new Error(uploadResult?.error || "参考图上传失败");
      }
    }

    const script = buildPromptFillScript(
      payload.prompt,
      [],
    );

    return await executeInBrowserView<{ ok: boolean; uploaded?: number; filled?: boolean; promptLength?: number; message: string }>(script);
  }, [buildCombinedPromptPayload, executeInBrowserView, scenes]);

  const inspectPage = useCallback(async (): Promise<JimengPageState> => {
    const data = await executeInBrowserView<JimengPageState>(`
      (() => {
        const bodyText = document.body?.innerText || '';
        const hasLoginButton = !!document.querySelector('[class*="login-button"]');
        const hasAgreementDialog = !!document.querySelector('[class*="agree-button"], [class*="disagree-button"]');
        return {
          url: location.href,
          title: document.title,
          hasLoginButton,
          hasAgreementDialog,
          isLoggedIn: !hasLoginButton,
          isVideoMode: location.href.includes('type=video'),
          hasSeedanceReference: bodyText.includes('Seedance 2.0') && (bodyText.includes('Full Reference') || bodyText.includes('全能参考')),
        };
      })()
    `);
    if (!data) throw new Error('页面状态检测失败');
    return data;
  }, [executeInBrowserView]);

  const inspectPrecisePage = useCallback(async (): Promise<JimengPageState> => {
    const data = await executeInBrowserView<JimengPageState>(buildSafeInspectJimengPageScript(reverseDuration));
    if (!data) throw new Error("页面状态检测失败");
    const dynamic = await executeInBrowserView<{
      currentModel: string;
      currentDuration: string;
      targetModel: string;
      targetDuration: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
      hasFallbackToast: boolean;
    }>(
      buildTargetVerificationScriptV2(reverseModel, reverseDuration),
    );
    return {
      ...data,
      matchedSignals: [
        ...data.matchedSignals.filter((signal, index, arr) => arr.indexOf(signal) === index),
        ...(dynamic?.currentModel ? [dynamic.currentModel] : []),
        ...(dynamic?.currentDuration ? [dynamic.currentDuration] : []),
        ...(dynamic?.hasFallbackToast ? ["model-fallback-toast"] : []),
      ],
      targetMatched:
        data.hasVideoGenerateEntry &&
        data.hasSeedanceReference &&
        data.hasReferenceContentEntry &&
        data.hasAspectRatio16x9 &&
        !!dynamic?.hasTargetModel &&
        !!dynamic?.hasTargetDuration,
    };
  }, [executeInBrowserView, reverseDuration, reverseModel]);

  const inspectTargetSelections = useCallback(async () => {
    const data = await executeInBrowserView<{
      currentModel: string;
      currentDuration: string;
      targetModel: string;
      targetDuration: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
      hasFallbackToast: boolean;
    }>(buildTargetVerificationScriptV2(reverseModel, reverseDuration));
    if (!data) {
      throw new Error("目标参数检测失败");
    }
    return data;
  }, [executeInBrowserView, reverseDuration, reverseModel]);

  const calibrateTargetSettings = useCallback(async () => {
    let latest = await inspectTargetSelections();
    addLogMessage(
      `[${new Date().toLocaleTimeString()}] 当前参数: 模型=${latest.currentModel || "无"} / 时长=${latest.currentDuration || "无"}`,
    );

    for (let round = 1; round <= 3; round += 1) {
      if (latest.hasTargetModel && latest.hasTargetDuration) {
        return latest;
      }

      const result = await executeInBrowserView<{
        actions: string[];
        currentModel: string;
        currentDuration: string;
        targetModel: string;
        targetDuration: string;
        success: boolean;
      }>(buildForceApplySettingsScriptV2(reverseModel, reverseDuration));

      if (result?.actions?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 参数校准 ${round}: ${result.actions.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 参数校准 ${round}: 未找到可操作的模型/时长控件`);
      }

      latest = await inspectTargetSelections();
      addLogMessage(
        `[${new Date().toLocaleTimeString()}] 参数校准后 ${round}: 模型=${latest.currentModel || "无"} / 时长=${latest.currentDuration || "无"}${latest.hasFallbackToast ? " / 检测到最佳模型提示" : ""}`,
      );
    }

    return latest;
  }, [executeInBrowserView, inspectTargetSelections, reverseDuration, reverseModel]);

  const alignToSeedanceReferenceWithAgent = useCallback(async (): Promise<JimengPageState> => {
    for (let step = 1; step <= 6; step += 1) {
      const observation = await captureJimengAgentObservation({
        model: reverseModel,
        duration: reverseDuration,
      });
      addLogMessage(
        `[${new Date().toLocaleTimeString()}] Agent 观察 ${step}: ${observation.matchedSignals.join(", ") || "无特征"}`,
      );

      if (observation.targetMatched) {
        return await inspectPrecisePage();
      }

      const action = await decideJimengAgentAction(
        observation,
        { model: reverseModel, duration: reverseDuration },
      );
      addLogMessage(
        `[${new Date().toLocaleTimeString()}] Agent 决策 ${step}: ${action.action}${action.controlId ? ` #${action.controlId}` : ""} - ${action.reason}`,
      );

      const exec = await executeJimengAgentAction(action, observation.controls);
      addLogMessage(`[${new Date().toLocaleTimeString()}] Agent 执行 ${step}: ${exec.message}`);
      await sleep(action.action === "wait" ? Math.max(300, Math.min(action.waitMs || 800, 3000)) : 900);

      const latest = await inspectPrecisePage();
      if (latest.targetMatched) {
        return latest;
      }
    }

    return inspectPrecisePage();
  }, [inspectPrecisePage, reverseDuration, reverseModel]);

  const forceSwitchToFullReference = useCallback(async (): Promise<JimengPageState> => {
    for (let step = 1; step <= 3; step += 1) {
      const result = await executeInBrowserView<{
        actions: string[];
        success: boolean;
        bodyTextSnippet: string;
      }>(buildSafeForceSwitchFullReferenceScript(reverseDuration));

      if (result?.actions?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 强制切换 ${step}: ${result.actions.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 强制切换 ${step}: 未找到参考模式切换控件`);
      }

      await sleep(900);
      const state = await inspectPrecisePage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 强制切换后特征: ${state.matchedSignals.join(", ") || "无"}`);
      if (state.targetMatched || result?.success) {
        return state;
      }
    }

    return inspectPrecisePage();
  }, [executeInBrowserView, inspectPrecisePage]);

  const alignToSeedanceReference = useCallback(async (): Promise<JimengPageState> => {
    let latestState = await inspectPrecisePage();
    if (latestState.targetMatched) return latestState;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const action = await executeInBrowserView<{ clicks: string[]; visibleTexts?: string[] }>(buildSafeAlignSeedanceReferenceScript(reverseDuration));
      if (action?.clicks?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 第 ${attempt} 次校准点击: ${action.clicks.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 第 ${attempt} 次校准未找到新的可点击目标`);
      }
      if (action?.visibleTexts?.length) {
        const hints = action.visibleTexts.filter((text) =>
          /全能参考|首帧图|首尾帧|Seedance|16:9|5s|@/.test(text),
        );
        if (hints.length) {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 当前候选控件: ${hints.slice(0, 12).join(" / ")}`);
        }
      }

      await sleep(1200);
      latestState = await inspectPrecisePage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 当前命中特征: ${latestState.matchedSignals.join(", ") || "无"}`);
      if (latestState.targetMatched) {
        return latestState;
      }
    }

    return latestState;
  }, [executeInBrowserView, inspectPrecisePage]);

  const startAgent = async () => {
    agentActiveRef.current = true;
    setAgentStatus('initializing');
    setProgress(0);
    setOperationLog([]);
    addLogMessage(`[${new Date().toLocaleTimeString()}] 开始即梦逆向模式...`);

    try {
      const api = window.electronAPI?.browserView;
      if (!api) throw new Error('请在 Electron 应用中使用逆向模式');

      await syncBrowserBounds();
      await api.create({ url: JIMENG_HOME_URL });
      await api.show();
      await syncBrowserBounds();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 内嵌浏览器已启动`);

      await sleep(3000);

      setProgress(25);
      setAgentStatus('browsing');
      setCurrentAction('检查登录状态');
      const initialPageState = await inspectPage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 页面标题: ${initialPageState.title}`);

      if (!initialPageState.isLoggedIn) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 未检测到登录状态，正在自动点击登录入口...`);
        toast({
          title: '需要登录',
          description: '请在内嵌浏览器中扫码登录，系统将自动等待登录完成。',
          variant: 'destructive',
        });

        // 自动点击登录按钮
        const loginClicked = await executeInBrowserView<{ clicked: boolean }>(`
          (() => {
            const btn = document.querySelector('[class*="login-button"]');
            if (btn instanceof HTMLElement) { btn.click(); return { clicked: true }; }
            return { clicked: false };
          })()
        `);
        if (loginClicked?.clicked) {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 登录入口已点击，等待登录弹窗...`);
          await sleep(2000);
          // 仅在同时出现"同意"和"不同意"两个按钮时才认为是协议弹窗，避免误关二维码
          const agreed = await executeInBrowserView<{ clicked: boolean; found: boolean }>(`
            (() => {
              const agreeBtn = document.querySelector('[class*="agree-button"]');
              const disagreeBtn = document.querySelector('[class*="disagree-button"]');
              if (agreeBtn instanceof HTMLElement && disagreeBtn instanceof HTMLElement) {
                agreeBtn.click();
                return { clicked: true, found: true };
              }
              return { clicked: false, found: false };
            })()
          `);
          if (agreed?.found) {
            addLogMessage(`[${new Date().toLocaleTimeString()}] 已同意协议弹窗`);
            await sleep(1000);
          } else {
            addLogMessage(`[${new Date().toLocaleTimeString()}] 未检测到协议弹窗，等待二维码...`);
          }
        } else {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 未找到登录按钮，请手动点击内嵌浏览器中的登录入口`);
        }

        setProgress(45);
        setCurrentAction('等待扫码登录');
        addLogMessage(`[${new Date().toLocaleTimeString()}] 正在等待用户在内嵌浏览器中完成扫码登录...`);

        // 轮询等待登录完成（5分钟超时）
        const loginDeadline = Date.now() + 5 * 60 * 1000;
        let lastBucket = -1;
        while (Date.now() < loginDeadline) {
          const state = await inspectPage();
          if (state.isLoggedIn) break;
          const elapsed = Math.floor((Date.now() - (loginDeadline - 5 * 60 * 1000)) / 1000);
          const bucket = Math.floor(elapsed / 10);
          if (bucket !== lastBucket) {
            lastBucket = bucket;
            addLogMessage(`[${new Date().toLocaleTimeString()}] 等待登录中... ${elapsed}s`);
          }
          await sleep(2000);
          if (Date.now() >= loginDeadline) throw new Error('登录超时，请重试');
        }

        addLogMessage(`[${new Date().toLocaleTimeString()}] 登录成功`);
        toast({
          title: '登录完成',
          description: '正在跳转到 Seedance 2.0 视频生成页面...',
          className: 'bg-emerald-50 border-emerald-200',
        });
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 已检测到登录状态，直接跳转视频生成页`);
      }

      setBrowserLocked(true);
      await window.electronAPI?.browserView?.setIgnoreMouseEvents(true);
      await api.show();
      await syncBrowserBounds();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 自动化控制已锁定浏览器交互，鼠标不会再干预操作`);

      setProgress(70);
      setAgentStatus('operating');
      setCurrentAction('跳转 Seedance 2.0 全能参考');

      // 导航到视频生成页
      await api.navigate(JIMENG_VIDEO_REFERENCE_URL);
      await sleep(4000);

      // 点击「全能参考」tab（按文本内容查找，避免依赖不稳定的 class 名）
      const tabClicked = await executeInBrowserView<{ clicked: boolean; text: string }>(`
        (() => {
          const keywords = ['全能参考', 'Full Reference'];
          const all = Array.from(document.querySelectorAll('button, [role="tab"], div[class*="tab"], span'));
          for (const kw of keywords) {
            const el = all.find(n => n instanceof HTMLElement && n.innerText?.trim() === kw && n.getBoundingClientRect().width > 0);
            if (el instanceof HTMLElement) { el.click(); return { clicked: true, text: el.innerText.trim() }; }
          }
          // 宽松匹配：包含关键词
          for (const kw of keywords) {
            const el = all.find(n => n instanceof HTMLElement && n.innerText?.includes(kw) && n.getBoundingClientRect().width > 0);
            if (el instanceof HTMLElement) { el.click(); return { clicked: true, text: el.innerText.trim() }; }
          }
          return { clicked: false, text: '' };
        })()
      `);
      if (tabClicked?.clicked) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 已点击全能参考 tab: ${tabClicked.text}`);
        await sleep(2000);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 未找到全能参考 tab，页面可能已在正确位置`);
      }

      addLogMessage(`[${new Date().toLocaleTimeString()}] 执行强制模式切换...`);
      let finalState = await forceSwitchToFullReference();

      addLogMessage(`[${new Date().toLocaleTimeString()}] 应用目标参数: 模型 ${reverseModel} / 时长 ${reverseDuration}`);
      const calibratedSettings = await calibrateTargetSettings();
      if (!calibratedSettings.hasTargetModel || !calibratedSettings.hasTargetDuration) {
        throw new Error(
          `目标参数未校准成功：目标模型=${reverseModel}，目标时长=${reverseDuration}；当前模型=${calibratedSettings.currentModel || "无"}，当前时长=${calibratedSettings.currentDuration || "无"}`,
        );
      }
      await sleep(800);
      finalState = await inspectPrecisePage();

      addLogMessage(`[${new Date().toLocaleTimeString()}] 启动内置 Agent 对齐全能参考...`);
      if (!finalState.targetMatched) {
        finalState = await alignToSeedanceReferenceWithAgent();
      }
      if (!finalState.targetMatched) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] Agent 未完全命中，回退到规则兜底...`);
        finalState = await alignToSeedanceReference();
      }

      setBrowserUrl(finalState.url || JIMENG_VIDEO_REFERENCE_URL);
      if (!finalState.targetMatched) {
        throw new Error(`未能精确定位到 Seedance 2.0 全能参考，当前命中特征: ${finalState.matchedSignals.join(", ") || "无"}`);
      }
      addLogMessage(`[${new Date().toLocaleTimeString()}] 已到达 Seedance 2.0 全能参考视频生成页`);

      setProgress(82);
      setCurrentAction('上传参考图并填入整段提示词');
      addLogMessage(`[${new Date().toLocaleTimeString()}] 开始上传角色/场景参考图并填写整段提示词`);
      const fillResult = await prepareCombinedPromptInBrowser();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 整段提示词填写结果: ${fillResult?.message || "执行完成"}`);
      setProgress(100);
      setAgentStatus('completed');
      setCurrentAction('Reverse-mode prompt ready');
      addLogMessage(`[${new Date().toLocaleTimeString()}] Reverse-mode automation completed. Prompt and reference images are ready for manual review.`);

      toast({
        title: 'Reverse Prompt Ready',
        description: 'The page is calibrated, reference images are uploaded, and the full prompt has been filled in without submitting.',
        className: 'bg-emerald-50 border-emerald-200',
      });
      return;
      setCurrentAction('写入分镜提示词与参考图');
      for (let index = 0; index < scenes.length; index += 1) {
        const scene = scenes[index];
        addLogMessage(`[${new Date().toLocaleTimeString()}] 开始提交分镜 ${scene.segmentLabel || scene.sceneNumber}/${scenes.length}`);
        const result = await pushScenePromptToBrowser(scene);
        addLogMessage(
          `[${new Date().toLocaleTimeString()}] 分镜 ${scene.segmentLabel || scene.sceneNumber}: ${result?.message || "执行完成"}`,
        );
        setProgress(Math.min(98, 82 + Math.round(((index + 1) / Math.max(1, scenes.length)) * 16)));
        await sleep(1800);
      }

      setProgress(100);
      setAgentStatus('completed');
      setCurrentAction('Reverse-mode bootstrap ready');
      addLogMessage(`[${new Date().toLocaleTimeString()}] Reverse-mode bootstrap completed. The page is ready for follow-up automation.`);

      toast({
        title: 'Reverse Bootstrap Ready',
        description: 'Login check finished and the app is now on the Seedance 2.0 full-reference video page.',
        className: 'bg-emerald-50 border-emerald-200',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAgentStatus('error');
      setCurrentAction('Error');
      addLogMessage(`[${new Date().toLocaleTimeString()}] Error: ${message}`);
      toast({
        title: 'Bootstrap Failed',
        description: `Reverse-mode bootstrap failed: ${message}`,
        variant: 'destructive',
      });
    } finally {
      agentActiveRef.current = false;
      setBrowserLocked(false);
      await window.electronAPI?.browserView?.setIgnoreMouseEvents(false);
      if (showBrowser) {
        await window.electronAPI?.browserView?.show();
        await syncBrowserBounds();
      }
    }
  };

  const stopAgent = () => {
    void window.electronAPI?.browserView?.setIgnoreMouseEvents(false);
    void window.electronAPI?.browserView?.show();
    setBrowserLocked(false);
    setAgentStatus('idle');
    setCurrentAction('等待开始...');
    toast({
      title: "操作已停止",
      description: "AI代理已停止执行"
    });
  };

  // 重置代理
  const resetAgent = () => {
    void window.electronAPI?.browserView?.setIgnoreMouseEvents(false);
    void window.electronAPI?.browserView?.close();
    setBrowserLocked(false);
    setBrowserPreviewDataUrl("");
    setAgentStatus('idle');
    setProgress(0);
    setCurrentAction('等待开始...');
    setBrowserUrl(JIMENG_HOME_URL);
    setOperationLog([]);
    toast({
      title: "已重置",
      description: "代理状态已重置"
    });
  };

  // 状态显示配置
  const statusConfig = {
    idle: { label: '就绪', color: 'text-gray-600', bg: 'bg-gray-100' },
    initializing: { label: '初始化', color: 'text-blue-600', bg: 'bg-blue-100' },
    browsing: { label: '浏览中', color: 'text-purple-600', bg: 'bg-purple-100' },
    operating: { label: '操作中', color: 'text-indigo-600', bg: 'bg-indigo-100' },
    generating: { label: '生成中', color: 'text-orange-600', bg: 'bg-orange-100' },
    completed: { label: '已完成', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    error: { label: '错误', color: 'text-red-600', bg: 'bg-red-100' }
  };

  const currentStatus = statusConfig[agentStatus];

  return (
    <div className="space-y-4">
      {/* 代理状态栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-600" />
            <span className="font-medium">多模态AI代理</span>
          </div>
          <Badge className={`${currentStatus.bg} ${currentStatus.color} text-xs`}>
            {currentStatus.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{currentAction}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const next = !showBrowser;
              setShowBrowser(next);
              if (next) {
                await window.electronAPI?.browserView?.show();
                await syncBrowserBounds();
              } else {
                await window.electronAPI?.browserView?.hide();
              }
            }}
            className="text-xs gap-1"
          >
            {showBrowser ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showBrowser ? "隐藏" : "显示"}浏览器
          </Button>
          <div className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            应用内实时模式
          </div>
        </div>
      </div>

      {/* 浏览器窗口 */}
      {showBrowser && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Chrome className="h-4 w-4" />
              内置浏览器 - 即梦视频生成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-muted">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <Input
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  className="h-7 text-xs border-0 focus-visible:ring-0 bg-white ml-2"
                  placeholder="输入网址..."
                  disabled={agentStatus !== 'idle'}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs ml-2"
                  onClick={async () => {
                    await window.electronAPI?.browserView?.navigate(browserUrl);
                    await syncBrowserBounds();
                  }}
                >
                  跳转
                </Button>
              </div>
              {/* Placeholder that reserves layout space — the actual BrowserView is fixed-positioned */}
              <div ref={browserPlaceholderRef} className="h-[70vh] min-h-[520px]" />
              {/* Fixed overlay: anchored to viewport so page scroll doesn't move the BrowserView */}
              <div
                ref={browserContainerRef}
                className="fixed bg-transparent overflow-hidden"
                style={{ zIndex: 10 }}
              >
                {browserLocked && (
                  <div className="absolute inset-x-0 top-0 z-10 pointer-events-none">
                    <div className="mx-3 mt-3 inline-flex rounded bg-amber-500/90 px-2 py-1 text-xs text-black select-none">
                      自动化控制中：仅锁定内置浏览器交互
                    </div>
                  </div>
                )}
                {!browserState.visible && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                    <div className="text-center">
                      <Chrome className="h-12 w-12 text-gray-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 mb-1">
                        {agentStatus === 'idle' ? 'AI代理已准备就绪' : currentAction}
                      </p>
                      <p className="text-xs text-gray-500">
                        内嵌浏览器将在此区域实时展示操作过程
                      </p>
                    </div>
                  </div>
                )}
                {browserState.loading && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    页面加载中...
                  </div>
                )}
                {!browserLocked && browserState.visible && (
                  <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-10">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    实时内嵌浏览器
                  </div>
                )}
                {browserState.error && (
                  <div className="absolute bottom-2 left-2 right-2 bg-red-600/90 text-white text-xs px-2 py-1 rounded z-10">
                    {browserState.error}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 控制面板 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            代理配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">目标网站</Label>
              <Input
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="https://jiemeng.baidu.com"
                className="text-sm"
                disabled={agentStatus !== 'idle'}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">浏览器显示</Label>
              <div className="flex items-center gap-2 pt-1 text-sm text-foreground">
                <Webhook className="h-4 w-4" />
                应用内实时浏览
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">目标模型</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs" disabled={agentStatus !== 'idle'}>
                    <span>{reverseModel}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  {REVERSE_MODEL_OPTIONS.map((option) => (
                    <button
                      key={option}
                      className={`w-full rounded-sm px-3 py-1.5 text-left text-xs transition-colors ${
                        reverseModel === option ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                      }`}
                      onClick={() => setReverseModel(option)}
                    >
                      {option}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">目标时长</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs" disabled={agentStatus !== 'idle'}>
                    <span>{reverseDuration}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="start">
                  {REVERSE_DURATION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      className={`w-full rounded-sm px-3 py-1.5 text-left text-xs transition-colors ${
                        reverseDuration === option ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                      }`}
                      onClick={() => setReverseDuration(option)}
                    >
                      {option}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">执行摘要</Label>
            <div className="text-xs bg-secondary/30 p-3 rounded">
              <p>待处理分镜: {scenes.length}</p>
              <p>目标参数: {reverseModel} / {reverseDuration}</p>
              <p>预计执行时间: {Math.ceil(scenes.length * 15 / 60)}分钟</p>
              <p className="mt-1 text-muted-foreground">真实操作包括: 页面导航、元素识别、表单填写、按钮点击、等待响应等</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {agentStatus === 'idle' ? (
              <Button onClick={startAgent} className="gap-1.5">
                <Play className="h-3.5 w-3.5" />
                开始真实操作
              </Button>
            ) : agentStatus === 'completed' ? (
              <Button className="gap-1.5" variant="default">
                <CheckCircle className="h-3.5 w-3.5" />
                任务已完成
              </Button>
            ) : agentStatus === 'error' ? (
              <Button onClick={resetAgent} variant="secondary" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                重新开始
              </Button>
            ) : (
              <Button onClick={stopAgent} variant="destructive" className="gap-1.5">
                <Pause className="h-3.5 w-3.5" />
                停止操作
              </Button>
            )}

            <Button
              variant="outline"
              onClick={resetAgent}
              className="gap-1.5"
              disabled={agentStatus === 'idle'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 进度指示器 */}
      {(agentStatus !== 'idle' && agentStatus !== 'completed') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className={`h-4 w-4 ${agentStatus === 'generating' ? 'animate-spin' : ''}`} />
              执行进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress}%</span>
                <span>{currentAction}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作日志 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            详细操作日志
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted p-3 max-h-60 overflow-y-auto" ref={logRef}>
            {operationLog.length > 0 ? (
              <div className="space-y-1 text-xs font-mono">
                {operationLog.map((log, i) => (
                  <div
                    key={i}
                    className={`py-0.5 border-b border-muted-foreground/20 last:border-0 ${
                      log.includes('错误') || log.includes('[错误]') ? 'text-red-600' :
                      log.includes('完成') ? 'text-emerald-600' :
                      log.includes('开始') || log.includes('等待') ? 'text-blue-600' :
                      log.includes('AI代理') ? 'text-indigo-600' :
                      'text-foreground/80'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-8">
                <Bot className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p>AI代理日志将在此显示</p>
                <p className="mt-1">开始操作后将显示详细的浏览器操作步骤</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 技术说明 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            技术实现说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-2">
            <p><strong>真实浏览器操作:</strong> AI代理通过自动化控制器操作真实的浏览器实例</p>
            <p><strong>操作流程:</strong> 页面导航 → 元素识别 → 信息填充 → 交互操作 → 结果验证</p>
            <p><strong>智能元素定位:</strong> 使用多重选择器策略确保能找到正确的页面元素</p>
            <p><strong>安全措施:</strong> 所有操作都在隔离的浏览器环境中执行</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MultimodalAgentPanel;
