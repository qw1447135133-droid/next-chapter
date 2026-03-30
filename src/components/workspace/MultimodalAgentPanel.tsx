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
import {
  matchSceneTimeVariant,
  normalizeCharacterName,
  normalizeSceneName,
} from "@/lib/workspace-labels";
import { compressImage } from "@/lib/image-compress";
import {
  buildDismissInterferingOverlaysScript,
  buildEnterVideoGenerationModeScript,
  buildFillPromptScript,
  buildLocatePromptAreaScript,
  buildReadPromptValueScript,
  buildReadToolbarStateScript,
  buildSetDurationScript,
  buildSetFullReferenceScript,
  buildSetModelScript,
  buildSubmitCurrentPromptStrictScript,
  buildTypePromptScript,
} from "@/lib/reverse-browserview-scripts";
import {
  captureJimengAgentObservation,
  decideJimengAgentAction,
  executeJimengAgentAction,
} from "@/lib/jimeng-browser-agent";

// Legacy compatibility host for reverse-mode script tests.
// Reverse-mode UI execution now lives exclusively in ReverseBrowserViewPanel.
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

    const hasVideoGenerateEntry = includesKeyword(['瑙嗛鐢熸垚', '鏂囩敓瑙嗛']);
    const hasSeedanceReference = includesKeyword(['Seedance 2.0']) && includesKeyword(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
    const hasReferenceContentEntry = includesKeyword(['鍙傝€冨唴瀹?, '@ 鍥剧墖1', '@鍥剧墖1']);
    const hasAspectRatio16x9 = includesKeyword(['16:9']);
    const hasDuration5s = visibleTexts.some((text) => text === '5s' || text.includes(' 5s') || text.endsWith('5s'));
    const hasAtReferenceTrigger = hasExactText('@') || visibleTexts.some((text) => text.startsWith('@'));
    const resolvedSeedanceReference = hasSeedanceReference || (includesKeyword(['Seedance 2.0']) && hasAtReferenceTrigger);
    const resolvedReferenceContentEntry = hasReferenceContentEntry || hasAtReferenceTrigger || includesKeyword(['Reference']);
    const hasSeedanceModel = includesKeyword(['Seedance 2.0']);
    const hasFullReferenceLabel = includesKeyword(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
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
    const videoEntry = clickTarget(['瑙嗛鐢熸垚', '鏂囩敓瑙嗛']);
    if (videoEntry) clicks.push('video:' + videoEntry);

    const referenceModeTrigger = clickTarget(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?]);
    if (referenceModeTrigger) {
      clicks.push('reference-mode:' + referenceModeTrigger);
      await wait(300);
    }

    const fullReference = clickTarget(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
    if (fullReference) {
      clicks.push('reference:' + fullReference);
      await wait(300);
    }

    const fallbackFullReference = !fullReference ? clickTarget(['鍏ㄨ兘鍙傝€?, 'Full Reference', '鍏ㄨ兘']) : '';
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
    const currentMode = clickByText(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?], { role: 'combobox' }) || clickByText(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?]);
    if (currentMode) {
      actions.push('open-mode:' + currentMode);
      await humanPause(450, 850);
    }

    const fullReference = clickByText(['鍏ㄨ兘鍙傝€?], { role: 'option', exact: true }) || clickByText(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
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
      bodyText.includes('鍏ㄨ兘鍙傝€?) &&
      (bodyText.includes('鍙傝€冨唴瀹?) || bodyText.includes('@')) &&
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

      const hasVideoGenerateEntry = location.href.includes('type=video') || includesKeyword(['瑙嗛鐢熸垚', '鏂囩敓瑙嗛']);
      const hasSeedanceModel = includesKeyword(['Seedance 2.0']);
      const hasFullReference = includesKeyword(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
      const hasAtReferenceTrigger = hasExactText('@') || visibleTexts.some((text) => text.startsWith('@'));
      const hasReferenceContentEntry = includesKeyword(['鍙傝€冨唴瀹?, '@ 鍥剧墖1', '@鍥剧墖1', 'Reference']) || hasAtReferenceTrigger;
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
      const videoEntry = clickTarget(['瑙嗛鐢熸垚', '鏂囩敓瑙嗛']);
      if (videoEntry) clicks.push('video:' + videoEntry);

      const referenceModeTrigger = clickTarget(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?]);
      if (referenceModeTrigger) {
        clicks.push('reference-mode:' + referenceModeTrigger);
        await wait(300);
      }

      const fullReference = clickTarget(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
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
      const currentMode = clickByText(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?], { role: 'combobox' }) || clickByText(['棣栧熬甯?, '棣栧抚鍥?, '鍥剧墖鍙傝€?]);
      if (currentMode) {
        actions.push('open-mode:' + currentMode);
        await humanPause(450, 850);
      }

      const fullReference = clickByText(['鍏ㄨ兘鍙傝€?], { role: 'option', exact: true }) || clickByText(['鍏ㄨ兘鍙傝€?, 'Full Reference']);
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
        bodyText.includes('鍏ㄨ兘鍙傝€?) &&
        (bodyText.includes('鍙傝€冨唴瀹?) || bodyText.includes('@')) &&
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
        if (bodyAfterRound.includes('宸蹭负鎮ㄥ尮閰嶈嚦鏈€浣虫ā鍨?) && selections.currentModel !== ${JSON.stringify(targetModel)}) {
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
        hasFallbackToast: bodyText.includes('宸蹭负鎮ㄥ尮閰嶈嚦鏈€浣虫ā鍨?),
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
        hasFallbackToast: bodyText.includes('宸蹭负鎮ㄥ尮閰嶈嚦鏈€浣虫ā鍨?),
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
        return { ok: false, message: '鏈壘鍒版彁绀鸿瘝杈撳叆妗? };
      }

      const section = textbox.closest('.section-generator-N3XwXD') || document;
      const fileInput = section.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
      if (!(fileInput instanceof HTMLInputElement)) {
        return { ok: false, message: '鏈壘鍒板弬鑰冪礌鏉愪笂浼犺緭鍏ユ' };
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
        message: '宸插～鍏ユ暣娈垫彁绀鸿瘝骞朵笂浼犲弬鑰冨浘锛堟湭鎻愪氦锛?,
      };
    })()
  `;
}

const MultimodalAgentPanel = ({ scenes, characters, sceneSettings }: MultimodalAgentPanelProps) => {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'initializing' | 'browsing' | 'operating' | 'generating' | 'completed' | 'error'>('idle');
  const [currentAction, setCurrentAction] = useState<string>('绛夊緟寮€濮?..');
  const [progress, setProgress] = useState<number>(0);
  const [showBrowser, setShowBrowser] = useState<boolean>(true);
  const [browserLocked, setBrowserLocked] = useState<boolean>(false);
  const [reverseModel, setReverseModel] = useState<(typeof REVERSE_MODEL_OPTIONS)[number]>("Seedance 2.0 Fast");
  const [reverseDuration, setReverseDuration] = useState<(typeof REVERSE_DURATION_OPTIONS)[number]>("5s");
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [browserUrl, setBrowserUrl] = useState<string>('https://jimeng.jianying.com/ai-tool/home');
  const [playwrightPreviewDataUrl, setPlaywrightPreviewDataUrl] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<{ visible: boolean; url?: string; title?: string; loading: boolean; error?: string }>({
    visible: false,
    loading: false,
  });

  const logRef = useRef<HTMLDivElement>(null);
  const browserContainerRef = useRef<HTMLDivElement>(null);
  const browserPlaceholderRef = useRef<HTMLDivElement>(null);
  const browserViewportRef = useRef<HTMLDivElement>(null);
  const agentActiveRef = useRef<boolean>(false);

  // 滚动到日志底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [operationLog]);

  // 娣诲姞鏃ュ織娑堟伅
  const addLogMessage = (message: string) => {
    setOperationLog(prev => [...prev, message]);
  };

  const buildSceneReferences = useCallback((scene: Scene) => {
    const refs: Array<{ kind: "character" | "scene"; label: string; url: string }> = [];
    for (const name of scene.characters) {
      const normalizedName = normalizeCharacterName(name);
      const character = characters.find(
        (item) => normalizeCharacterName(item.name) === normalizedName,
      );
      if (!character) continue;
      let imageUrl = character.imageUrl;
      const costumeId =
        scene.characterCostumes?.[normalizedName] ||
        scene.characterCostumes?.[name] ||
        character.activeCostumeId;
      if (costumeId && character.costumes?.length) {
        const costume = character.costumes.find((item) => item.id === costumeId);
        if (costume?.imageUrl) imageUrl = costume.imageUrl;
      }
      if (imageUrl) refs.push({ kind: "character", label: normalizedName, url: imageUrl });
    }

    const normalizedSceneName = normalizeSceneName(scene.sceneName || "");
    const matchedScene = sceneSettings.find(
      (item) => normalizeSceneName(item.name || "") === normalizedSceneName,
    );
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
      if (imageUrl) refs.push({ kind: "scene", label: normalizedSceneName || "鍦烘櫙", url: imageUrl });
    }

    return refs.slice(0, 12);
  }, [characters, sceneSettings]);

  const buildScenePromptPayload = useCallback((scene: Scene) => {
    const refs = buildSceneReferences(scene);
    const refMentions = refs.map((ref, index) =>
      ref.kind === "character"
        ? `${ref.label}鍙傝€傽鍥剧墖${index + 1}`
        : `鍦烘櫙${ref.label}鍙傝€傽鍥剧墖${index + 1}`,
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

  const buildSegmentPromptPayload = useCallback((segmentScenes: Scene[]) => {
    const refs = [
      ...new Map(
        segmentScenes
          .flatMap((scene) => buildSceneReferences(scene))
          .map((ref) => [`${ref.kind}:${ref.label}:${ref.url}`, ref]),
      ).values(),
    ].slice(0, 12);

    const sceneTags = [
      ...new Set(
        refs
          .filter((ref) => ref.kind === "scene")
          .map((ref) => `【${ref.label}】`),
      ),
    ];
    const characterTags = [
      ...new Set(
        refs
          .filter((ref) => ref.kind === "character")
          .map((ref) => `【${ref.label}】`),
      ),
    ];

    const shotLines = segmentScenes.map((scene, index) => {
      const parts = [`分镜${index + 1}:${scene.description || ""}`];
      if (scene.dialogue) parts.push(`对白：${scene.dialogue}`);
      if (scene.cameraDirection) parts.push(scene.cameraDirection);
      return parts.join(" ");
    });

    const parts = [
      "场景/人物标签:",
      [...sceneTags, ...characterTags].join(""),
      ...shotLines,
      "无字幕、无水印、无背景音乐",
    ].filter(Boolean);

    return {
      prompt: parts.join("\n"),
      refs,
    };
  }, [buildSceneReferences]);

  const buildStableSegmentPromptPayload = useCallback((segmentScenes: Scene[]) => {
    const refs = [
      ...new Map(
        segmentScenes
          .flatMap((scene) => buildSceneReferences(scene))
          .map((ref) => [`${ref.kind}:${ref.label}:${ref.url}`, ref]),
      ).values(),
    ].slice(0, 12);

    const sceneTags = [
      ...new Set(
        refs
          .filter((ref) => ref.kind === "scene")
          .map((ref) => `【${ref.label}】`),
      ),
    ];
    const characterTags = [
      ...new Set(
        refs
          .filter((ref) => ref.kind === "character")
          .map((ref) => `【${ref.label}】`),
      ),
    ];

    const shotLines = segmentScenes.map((scene, index) => {
      const line = `分镜${index + 1}:${scene.description || ""}`;
      return scene.dialogue ? `${line} 对白：${scene.dialogue}` : line;
    });

    return {
      prompt: [
        "场景/人物标签:",
        [...sceneTags, ...characterTags].join(""),
        ...shotLines,
        "无字幕、无水印、无背景音乐",
      ]
        .filter(Boolean)
        .join("\n"),
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

  const executeNamedInBrowserView = useCallback(
    async <T,>(label: string, script: string): Promise<T | null> => {
      try {
        const api = window.electronAPI?.browserView;
        if (!api) throw new Error('鍐呭祵娴忚鍣ㄤ笉鍙敤');
        const result = await api.execute<T>({ script });
        if (!result.ok) throw new Error(result.error || '鑴氭湰鎵ц澶辫触');
        return result.result ?? null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${label}: ${message}`);
      }
    },
    [],
  );

  const rafRef = useRef<number | null>(null);

  const syncBrowserBounds = useCallback(async () => {
    const placeholder = browserPlaceholderRef.current;
    const container = browserContainerRef.current;
    const viewport = browserViewportRef.current;
    const api = window.electronAPI?.browserView;
    if (!placeholder || !container || !api || !showBrowser) return;

    // Use the placeholder's rect 鈥?it's in normal flow so its position reflects
    // where the browser area actually is in the viewport right now.
    const rect = (viewport || placeholder).getBoundingClientRect();
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
          addLogMessage(`[${new Date().toLocaleTimeString()}] 鍐呭祵娴忚鍣ㄥ凡鍑嗗灏辩华`);
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : String(error);
          addLogMessage(`[${new Date().toLocaleTimeString()}] 鍐呭祵娴忚鍣ㄥ垵濮嬪寲澶辫触: ${msg}`);
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
    if (!api) throw new Error('鍐呭祵娴忚鍣ㄤ笉鍙敤');
    const result = await api.execute<T>({ script });
    if (!result.ok) throw new Error(result.error || '鑴氭湰鎵ц澶辫触');
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
          return { ok: false, message: '鏈壘鍒版彁绀鸿瘝杈撳叆妗? };
        }

        const section = textbox.closest('.section-generator-N3XwXD') || document;
        const fileInput =
          section.querySelector('input[type="file"]') ||
          document.querySelector('input[type="file"]');

        if (!(fileInput instanceof HTMLInputElement)) {
          return { ok: false, message: '鏈壘鍒板弬鑰冪礌鏉愪笂浼犺緭鍏ユ' };
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
          return { ok: true, uploaded: refs.length, message: '宸插啓鍏ユ彁绀鸿瘝涓庡弬鑰冨浘锛屼絾鏈壘鍒板彲鐐瑰嚮鐨勬彁浜ゆ寜閽? };
        }

        submit.click();
        return { ok: true, uploaded: refs.length, submitted: true, message: '宸叉彁浜ゅ綋鍓嶅垎闀? };
      })()
    `;

    return await executeInBrowserView<{ ok: boolean; uploaded?: number; submitted?: boolean; message: string }>(script);
  }, [buildScenePromptPayload, executeInBrowserView]);

  const prepareSegmentPromptInBrowser = useCallback(async () => {
    const firstSegmentKey =
      scenes.find((scene) => String(scene.segmentLabel || "").trim())?.segmentLabel ||
      (scenes[0] ? String(scenes[0].sceneNumber) : "");
    const segmentScenes = scenes.filter(
      (scene) =>
        String(scene.segmentLabel || scene.sceneNumber).trim() ===
        String(firstSegmentKey || "").trim(),
    );
    if (segmentScenes.length === 0) {
      throw new Error("娌℃湁鍙～鍐欑殑鐗囨鎻愮ず璇?);
    }

        const payload = buildStableSegmentPromptPayload(segmentScenes);
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

    const promptTarget = await executeNamedInBrowserView<{
      ok: boolean;
      fileInputIndex: number;
    }>("瀹氫綅鎻愮ず璇嶄笌涓婁紶鍖?, `
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
      throw new Error("鏈壘鍒板彲鐢ㄧ殑鎻愮ず璇嶅尯鍩?);
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
        throw new Error(uploadResult?.error || "鍙傝€冨浘涓婁紶澶辫触");
      }
    }

    const script = buildPromptFillScript(
      payload.prompt,
      [],
    );

    return await executeNamedInBrowserView<{ ok: boolean; uploaded?: number; filled?: boolean; promptLength?: number; message: string }>("濉啓鏁存鎻愮ず璇?, script);
  }, [buildStableSegmentPromptPayload, executeNamedInBrowserView, scenes]);

  const ensureToolbarState = useCallback(
    async (targetModel: string, targetDuration: string) => {
      const state = await executeNamedInBrowserView<{
        currentModel: string;
        currentDuration: string;
        hasTargetModel: boolean;
        hasTargetDuration: boolean;
        hasReferenceMode: boolean;
        hasAtReference: boolean;
      }>(
        "鏍￠獙宸ュ叿鏍忕姸鎬?,
        buildReadToolbarStateScript(targetModel, targetDuration),
      );
      if (!state) throw new Error("鏍￠獙宸ュ叿鏍忕姸鎬? no state");
      return state;
    },
    [executeNamedInBrowserView],
  );

  const prepareSegmentInBrowserView = useCallback(
    async (
      segmentKey: string,
      payload: {
        prompt: string;
        refs: Array<{ kind: "character" | "scene"; label: string; url: string }>;
      },
    ) => {
      const fallbackApi = window.electronAPI?.browserView;
      const api = fallbackApi;
      if (!api) throw new Error("鍐呭祵娴忚鍣ㄤ笉鍙敤");

      await executeNamedInBrowserView(
        "鍏抽棴骞叉壈寮圭獥",
        buildDismissInterferingOverlaysScript(),
      );
      await executeNamedInBrowserView(
        "杩涘叆瑙嗛鐢熸垚妯″紡",
        buildEnterVideoGenerationModeScript(),
      );

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await executeNamedInBrowserView(
          "璁剧疆鐩爣妯″瀷",
          buildSetModelScript(reverseModel),
        );
        await executeNamedInBrowserView(
          "璁剧疆鐩爣鏃堕暱",
          buildSetDurationScript(reverseDuration),
        );
        await executeNamedInBrowserView(
          "鍒囨崲鍏ㄨ兘鍙傝€?,
          buildSetFullReferenceScript(),
        );
        const state = await ensureToolbarState(reverseModel, reverseDuration);
        addLogMessage(
          `[${new Date().toLocaleTimeString()}] 鐗囨 ${segmentKey} 鏍￠獙 ${attempt}: 妯″瀷=${state.currentModel || "鏃?} / 鏃堕暱=${state.currentDuration || "鏃?} / 鍙傝€?${state.hasReferenceMode ? "鏄? : "鍚?} / @=${state.hasAtReference ? "鏄? : "鍚?}`,
        );
        if (
          state.hasTargetModel &&
          state.hasTargetDuration &&
          state.hasReferenceMode
        ) {
          break;
        }
        if (attempt === 3) {
          throw new Error(
            `鐩爣鍙傛暟鏈牎鍑嗘垚鍔燂細鐩爣妯″瀷=${reverseModel}锛岀洰鏍囨椂闀?${reverseDuration}锛涘綋鍓嶆ā鍨?${state.currentModel || "鏃?}锛屽綋鍓嶆椂闀?${state.currentDuration || "鏃?}`,
          );
        }
        await sleep(800);
      }

      const refs = await Promise.all(
        payload.refs.map(async (ref, index) => ({
          fileName: `${segmentKey}-reference-${index + 1}.jpg`,
          dataUrl: await compressImage(ref.url, 400 * 1024, { maxDim: 1024 }),
        })),
      );

      const promptTarget = await executeNamedInBrowserView<{
        ok: boolean;
        fileInputIndex: number;
      }>("瀹氫綅鎻愮ず璇嶄笌涓婁紶鍖?, buildLocatePromptAreaScript());
      if (!promptTarget?.ok) {
        throw new Error("鏈壘鍒版彁绀鸿瘝涓庝笂浼犲尯");
      }

      if (refs.length > 0) {
        const uploadResult = await api.setFileInputFiles({
          selector: 'input[type="file"]',
          index: promptTarget.fileInputIndex,
          files: refs,
        });
        if (!uploadResult?.ok) {
          throw new Error(uploadResult?.error || "鍙傝€冨浘涓婁紶澶辫触");
        }
      }

      await executeNamedInBrowserView(
        "逐字填写片段提示词",
        buildTypePromptScript(payload.prompt, promptTarget.fileInputIndex, 20),
      );
      const promptValue = await executeNamedInBrowserView<string>(
        "读取提示词内容",
        buildReadPromptValueScript(promptTarget.fileInputIndex),
      );

      const submitResult = await executeNamedInBrowserView<{ ok: boolean; step: string }>(
        "鎻愪氦褰撳墠鐗囨",
        buildSubmitCurrentPromptStrictScript(promptTarget.fileInputIndex),
      );
      if (!submitResult?.ok) {
        throw new Error(`鎻愪氦澶辫触: ${submitResult?.step || "unknown"}`);
      }
    },
    [
      compressImage,
      ensureToolbarState,
      executeNamedInBrowserView,
      reverseDuration,
      reverseModel,
    ],
  );

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
          hasSeedanceReference: bodyText.includes('Seedance 2.0') && (bodyText.includes('Full Reference') || bodyText.includes('鍏ㄨ兘鍙傝€?)),
        };
      })()
    `);
    if (!data) throw new Error('椤甸潰鐘舵€佹娴嬪け璐?);
    return data;
  }, [executeInBrowserView]);

  const inspectPrecisePage = useCallback(async (): Promise<JimengPageState> => {
    const data = await executeNamedInBrowserView<JimengPageState>("妫€鏌ュ嵆姊﹂〉闈㈢姸鎬?, buildSafeInspectJimengPageScript(reverseDuration));
    if (!data) throw new Error("椤甸潰鐘舵€佹娴嬪け璐?);
    const dynamic = await executeNamedInBrowserView<{
      currentModel: string;
      currentDuration: string;
      targetModel: string;
      targetDuration: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
      hasFallbackToast: boolean;
    }>("妫€鏌ョ洰鏍囨ā鍨嬩笌鏃堕暱", 
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
    const data = await executeNamedInBrowserView<{
      currentModel: string;
      currentDuration: string;
      targetModel: string;
      targetDuration: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
      hasFallbackToast: boolean;
    }>("璇诲彇褰撳墠妯″瀷涓庢椂闀?, buildTargetVerificationScriptV2(reverseModel, reverseDuration));
    if (!data) {
      throw new Error("鐩爣鍙傛暟妫€娴嬪け璐?);
    }
    return data;
  }, [executeInBrowserView, reverseDuration, reverseModel]);

  const calibrateTargetSettings = useCallback(async () => {
    let latest = await inspectTargetSelections();
    addLogMessage(
      `[${new Date().toLocaleTimeString()}] 褰撳墠鍙傛暟: 妯″瀷=${latest.currentModel || "鏃?} / 鏃堕暱=${latest.currentDuration || "鏃?}`,
    );

    for (let round = 1; round <= 3; round += 1) {
      if (latest.hasTargetModel && latest.hasTargetDuration) {
        return latest;
      }

      const result = await executeNamedInBrowserView<{
        actions: string[];
        currentModel: string;
        currentDuration: string;
        targetModel: string;
        targetDuration: string;
        success: boolean;
      }>("鏍″噯鐩爣妯″瀷涓庢椂闀?, buildForceApplySettingsScriptV2(reverseModel, reverseDuration));

      if (result?.actions?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 鍙傛暟鏍″噯 ${round}: ${result.actions.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 鍙傛暟鏍″噯 ${round}: 鏈壘鍒板彲鎿嶄綔鐨勬ā鍨?鏃堕暱鎺т欢`);
      }

      latest = await inspectTargetSelections();
      addLogMessage(
        `[${new Date().toLocaleTimeString()}] 鍙傛暟鏍″噯鍚?${round}: 妯″瀷=${latest.currentModel || "鏃?} / 鏃堕暱=${latest.currentDuration || "鏃?}${latest.hasFallbackToast ? " / 妫€娴嬪埌鏈€浣虫ā鍨嬫彁绀? : ""}`,
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
        `[${new Date().toLocaleTimeString()}] Agent 瑙傚療 ${step}: ${observation.matchedSignals.join(", ") || "鏃犵壒寰?}`,
      );

      if (observation.targetMatched) {
        return await inspectPrecisePage();
      }

      const action = await decideJimengAgentAction(
        observation,
        { model: reverseModel, duration: reverseDuration },
      );
      addLogMessage(
        `[${new Date().toLocaleTimeString()}] Agent 鍐崇瓥 ${step}: ${action.action}${action.controlId ? ` #${action.controlId}` : ""} - ${action.reason}`,
      );

      const exec = await executeJimengAgentAction(action, observation.controls);
      addLogMessage(`[${new Date().toLocaleTimeString()}] Agent 鎵ц ${step}: ${exec.message}`);
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
      const result = await executeNamedInBrowserView<{
        actions: string[];
        success: boolean;
        bodyTextSnippet: string;
      }>("鍒囨崲鍒板叏鑳藉弬鑰冩ā寮?, buildSafeForceSwitchFullReferenceScript(reverseDuration));

      if (result?.actions?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 寮哄埗鍒囨崲 ${step}: ${result.actions.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 寮哄埗鍒囨崲 ${step}: 鏈壘鍒板弬鑰冩ā寮忓垏鎹㈡帶浠禶);
      }

      await sleep(900);
      const state = await inspectPrecisePage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 寮哄埗鍒囨崲鍚庣壒寰? ${state.matchedSignals.join(", ") || "鏃?}`);
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
      const action = await executeNamedInBrowserView<{ clicks: string[]; visibleTexts?: string[] }>("瀵归綈鍏ㄨ兘鍙傝€冮〉闈㈢粨鏋?, buildSafeAlignSeedanceReferenceScript(reverseDuration));
      if (action?.clicks?.length) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 绗?${attempt} 娆℃牎鍑嗙偣鍑? ${action.clicks.join(" | ")}`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 绗?${attempt} 娆℃牎鍑嗘湭鎵惧埌鏂扮殑鍙偣鍑荤洰鏍嘸);
      }
      if (action?.visibleTexts?.length) {
        const hints = action.visibleTexts.filter((text) =>
          /鍏ㄨ兘鍙傝€億棣栧抚鍥緗棣栧熬甯Seedance|16:9|5s|@/.test(text),
        );
        if (hints.length) {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 褰撳墠鍊欓€夋帶浠? ${hints.slice(0, 12).join(" / ")}`);
        }
      }

      await sleep(1200);
      latestState = await inspectPrecisePage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 褰撳墠鍛戒腑鐗瑰緛: ${latestState.matchedSignals.join(", ") || "鏃?}`);
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
    setPlaywrightPreviewDataUrl(null);
    addLogMessage(`[${new Date().toLocaleTimeString()}] 寮€濮嬪嵆姊﹂€嗗悜妯″紡...`);

    try {
      const browserView = window.electronAPI?.browserView;
      if (browserView) {
        await syncBrowserBounds();
        await browserView.create({ url: JIMENG_VIDEO_REFERENCE_URL });
        await browserView.show();
        await syncBrowserBounds();
        addLogMessage(`[${new Date().toLocaleTimeString()}] 宸插惎鍔ㄧ▼搴忓唴瀹炴椂娴忚鍣╜);

        const segmentMap = new Map<string, Scene[]>();
        for (const scene of scenes) {
          const key = String(scene.segmentLabel || scene.sceneNumber).trim();
          if (!segmentMap.has(key)) segmentMap.set(key, []);
          segmentMap.get(key)!.push(scene);
        }
        const segments = [...segmentMap.entries()].map(([segmentKey, segmentScenes]) => ({
          segmentKey,
          payload: buildStableSegmentPromptPayload(segmentScenes),
        }));
        if (segments.length === 0) {
          throw new Error("娌℃湁鍙鐞嗙殑鐗囨");
        }

        setAgentStatus('operating');
        for (let index = 0; index < segments.length; index += 1) {
          const segment = segments[index];
          setCurrentAction(`澶勭悊鐗囨 ${segment.segmentKey} (${index + 1}/${segments.length})`);
          setProgress(Math.min(95, 10 + Math.round(((index + 1) / segments.length) * 85)));
          addLogMessage(`[${new Date().toLocaleTimeString()}] 寮€濮嬪鐞嗙墖娈?${segment.segmentKey}`);
          await prepareSegmentInBrowserView(segment.segmentKey, segment.payload);
          addLogMessage(`[${new Date().toLocaleTimeString()}] 鐗囨 ${segment.segmentKey} 宸插畬鎴愭彁浜);
          await sleep(1200);
        }

        setProgress(100);
        setAgentStatus('completed');
        setCurrentAction('闃熷垪鎵ц瀹屾垚');
        toast({
          title: 'Reverse Queue Ready',
          description: `宸插畬鎴?${segments.length} 涓墖娈电殑涓茶鎻愪氦銆俙,
          className: 'bg-emerald-50 border-emerald-200',
        });
        return;
      }

      if (window.electronAPI?.reversePlaywright) {
        setCurrentAction('鍚姩 Playwright 鎵ц鍣?);
        setProgress(15);
        const segmentMap = new Map<string, Scene[]>();
        for (const scene of scenes) {
          const key = String(scene.segmentLabel || scene.sceneNumber).trim();
          if (!segmentMap.has(key)) segmentMap.set(key, []);
          segmentMap.get(key)!.push(scene);
        }
        const segments = [...segmentMap.entries()].map(([segmentKey, segmentScenes]) => {
          const payload = buildSegmentPromptPayload(segmentScenes);
          return {
            segmentKey,
            prompt: payload.prompt,
            refs: payload.refs.map((ref, index) => ({
              fileName: `${segmentKey}-reference-${index + 1}.jpg`,
              url: ref.url,
            })),
          };
        });
        if (segments.length === 0) {
          throw new Error("娌℃湁鍙鐞嗙殑鐗囨");
        }
        addLogMessage(`[${new Date().toLocaleTimeString()}] Playwright runner 鍑嗗 ${segments.length} 涓墖娈礰);
        const result = await window.electronAPI.reversePlaywright.runSegments({
          url: JIMENG_VIDEO_REFERENCE_URL,
          model: reverseModel,
          duration: reverseDuration,
          segments,
          headless: true,
        });
        result.logs.forEach((line) =>
          addLogMessage(`[${new Date().toLocaleTimeString()}] ${line}`),
        );
        if (result.screenshotBase64) {
          setPlaywrightPreviewDataUrl(`data:image/png;base64,${result.screenshotBase64}`);
        }
        if (!result.ok) {
          throw new Error(result.error || "Playwright runner 鎵ц澶辫触");
        }
        setProgress(100);
        setAgentStatus('completed');
        setCurrentAction('Playwright queue ready');
        toast({
          title: 'Playwright Queue Ready',
          description: `宸插畬鎴?${result.segments?.length || segments.length} 涓墖娈电殑妯″瀷/鏃堕暱鏍″噯銆佸弬鑰冨浘涓婁紶銆佹彁绀鸿瘝濉啓涓庝覆琛屾彁浜ゃ€俙,
          className: 'bg-emerald-50 border-emerald-200',
        });
        return;
      }

      const fallbackApi2 = window.electronAPI?.browserView;
      const api = fallbackApi2;
      if (!api) throw new Error('璇峰湪 Electron 搴旂敤涓娇鐢ㄩ€嗗悜妯″紡');

      await syncBrowserBounds();
      await api.create({ url: JIMENG_HOME_URL });
      await api.show();
      await syncBrowserBounds();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 鍐呭祵娴忚鍣ㄥ凡鍚姩`);

      await sleep(3000);

      setProgress(25);
      setAgentStatus('browsing');
      setCurrentAction('妫€鏌ョ櫥褰曠姸鎬?);
      const initialPageState = await inspectPage();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 椤甸潰鏍囬: ${initialPageState.title}`);

      if (!initialPageState.isLoggedIn) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 鏈娴嬪埌鐧诲綍鐘舵€侊紝姝ｅ湪鑷姩鐐瑰嚮鐧诲綍鍏ュ彛...`);
        toast({
          title: '闇€瑕佺櫥褰?,
          description: '璇峰湪鍐呭祵娴忚鍣ㄤ腑鎵爜鐧诲綍锛岀郴缁熷皢鑷姩绛夊緟鐧诲綍瀹屾垚銆?,
          variant: 'destructive',
        });

        // 鑷姩鐐瑰嚮鐧诲綍鎸夐挳
        const loginClicked = await executeInBrowserView<{ clicked: boolean }>(`
          (() => {
            const btn = document.querySelector('[class*="login-button"]');
            if (btn instanceof HTMLElement) { btn.click(); return { clicked: true }; }
            return { clicked: false };
          })()
        `);
        if (loginClicked?.clicked) {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 鐧诲綍鍏ュ彛宸茬偣鍑伙紝绛夊緟鐧诲綍寮圭獥...`);
          await sleep(2000);
          // 浠呭湪鍚屾椂鍑虹幇"鍚屾剰"鍜?涓嶅悓鎰?涓や釜鎸夐挳鏃舵墠璁や负鏄崗璁脊绐楋紝閬垮厤璇叧浜岀淮鐮?          const agreed = await executeInBrowserView<{ clicked: boolean; found: boolean }>(`
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
            addLogMessage(`[${new Date().toLocaleTimeString()}] 宸插悓鎰忓崗璁脊绐梎);
            await sleep(1000);
          } else {
            addLogMessage(`[${new Date().toLocaleTimeString()}] 鏈娴嬪埌鍗忚寮圭獥锛岀瓑寰呬簩缁寸爜...`);
          }
        } else {
          addLogMessage(`[${new Date().toLocaleTimeString()}] 鏈壘鍒扮櫥褰曟寜閽紝璇锋墜鍔ㄧ偣鍑诲唴宓屾祻瑙堝櫒涓殑鐧诲綍鍏ュ彛`);
        }

        setProgress(45);
        setCurrentAction('绛夊緟鎵爜鐧诲綍');
        addLogMessage(`[${new Date().toLocaleTimeString()}] 姝ｅ湪绛夊緟鐢ㄦ埛鍦ㄥ唴宓屾祻瑙堝櫒涓畬鎴愭壂鐮佺櫥褰?..`);

        // 杞绛夊緟鐧诲綍瀹屾垚锛?鍒嗛挓瓒呮椂锛?        const loginDeadline = Date.now() + 5 * 60 * 1000;
        let lastBucket = -1;
        while (Date.now() < loginDeadline) {
          const state = await inspectPage();
          if (state.isLoggedIn) break;
          const elapsed = Math.floor((Date.now() - (loginDeadline - 5 * 60 * 1000)) / 1000);
          const bucket = Math.floor(elapsed / 10);
          if (bucket !== lastBucket) {
            lastBucket = bucket;
            addLogMessage(`[${new Date().toLocaleTimeString()}] 绛夊緟鐧诲綍涓?.. ${elapsed}s`);
          }
          await sleep(2000);
          if (Date.now() >= loginDeadline) throw new Error('鐧诲綍瓒呮椂锛岃閲嶈瘯');
        }

        addLogMessage(`[${new Date().toLocaleTimeString()}] 鐧诲綍鎴愬姛`);
        toast({
          title: '鐧诲綍瀹屾垚',
          description: '姝ｅ湪璺宠浆鍒?Seedance 2.0 瑙嗛鐢熸垚椤甸潰...',
          className: 'bg-emerald-50 border-emerald-200',
        });
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 宸叉娴嬪埌鐧诲綍鐘舵€侊紝鐩存帴璺宠浆瑙嗛鐢熸垚椤礰);
      }

      setBrowserLocked(true);
      await window.electronAPI?.browserView?.setIgnoreMouseEvents(true);
      await api.show();
      await syncBrowserBounds();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 鑷姩鍖栨帶鍒跺凡閿佸畾娴忚鍣ㄤ氦浜掞紝榧犳爣涓嶄細鍐嶅共棰勬搷浣渀);

      setProgress(70);
      setAgentStatus('operating');
      setCurrentAction('璺宠浆 Seedance 2.0 鍏ㄨ兘鍙傝€?);

      // 瀵艰埅鍒拌棰戠敓鎴愰〉
      await api.navigate(JIMENG_VIDEO_REFERENCE_URL);
      await sleep(4000);

      // 鐐瑰嚮銆屽叏鑳藉弬鑰冦€峵ab锛堟寜鏂囨湰鍐呭鏌ユ壘锛岄伩鍏嶄緷璧栦笉绋冲畾鐨?class 鍚嶏級
      const tabClicked = await executeInBrowserView<{ clicked: boolean; text: string }>(`
        (() => {
          const keywords = ['鍏ㄨ兘鍙傝€?, 'Full Reference'];
          const all = Array.from(document.querySelectorAll('button, [role="tab"], div[class*="tab"], span'));
          for (const kw of keywords) {
            const el = all.find(n => n instanceof HTMLElement && n.innerText?.trim() === kw && n.getBoundingClientRect().width > 0);
            if (el instanceof HTMLElement) { el.click(); return { clicked: true, text: el.innerText.trim() }; }
          }
          // 瀹芥澗鍖归厤锛氬寘鍚叧閿瘝
          for (const kw of keywords) {
            const el = all.find(n => n instanceof HTMLElement && n.innerText?.includes(kw) && n.getBoundingClientRect().width > 0);
            if (el instanceof HTMLElement) { el.click(); return { clicked: true, text: el.innerText.trim() }; }
          }
          return { clicked: false, text: '' };
        })()
      `);
      if (tabClicked?.clicked) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 宸茬偣鍑诲叏鑳藉弬鑰?tab: ${tabClicked.text}`);
        await sleep(2000);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 鏈壘鍒板叏鑳藉弬鑰?tab锛岄〉闈㈠彲鑳藉凡鍦ㄦ纭綅缃甡);
      }

      addLogMessage(`[${new Date().toLocaleTimeString()}] 鎵ц寮哄埗妯″紡鍒囨崲...`);
      let finalState = await forceSwitchToFullReference();

      addLogMessage(`[${new Date().toLocaleTimeString()}] 搴旂敤鐩爣鍙傛暟: 妯″瀷 ${reverseModel} / 鏃堕暱 ${reverseDuration}`);
      const calibratedSettings = await calibrateTargetSettings();
      if (!calibratedSettings.hasTargetModel || !calibratedSettings.hasTargetDuration) {
        throw new Error(
          `鐩爣鍙傛暟鏈牎鍑嗘垚鍔燂細鐩爣妯″瀷=${reverseModel}锛岀洰鏍囨椂闀?${reverseDuration}锛涘綋鍓嶆ā鍨?${calibratedSettings.currentModel || "鏃?}锛屽綋鍓嶆椂闀?${calibratedSettings.currentDuration || "鏃?}`,
        );
      }
      await sleep(800);
      finalState = await inspectPrecisePage();

      addLogMessage(`[${new Date().toLocaleTimeString()}] 鍚姩鍐呯疆 Agent 瀵归綈鍏ㄨ兘鍙傝€?..`);
      if (!finalState.targetMatched) {
        finalState = await alignToSeedanceReferenceWithAgent();
      }
      if (!finalState.targetMatched) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] Agent 鏈畬鍏ㄥ懡涓紝鍥為€€鍒拌鍒欏厹搴?..`);
        finalState = await alignToSeedanceReference();
      }

      setBrowserUrl(finalState.url || JIMENG_VIDEO_REFERENCE_URL);
      if (!finalState.targetMatched) {
        throw new Error(`鏈兘绮剧‘瀹氫綅鍒?Seedance 2.0 鍏ㄨ兘鍙傝€冿紝褰撳墠鍛戒腑鐗瑰緛: ${finalState.matchedSignals.join(", ") || "鏃?}`);
      }
      addLogMessage(`[${new Date().toLocaleTimeString()}] 宸插埌杈?Seedance 2.0 鍏ㄨ兘鍙傝€冭棰戠敓鎴愰〉`);

      setProgress(82);
      setCurrentAction('涓婁紶鍙傝€冨浘骞跺～鍏ユ暣娈垫彁绀鸿瘝');
      addLogMessage(`[${new Date().toLocaleTimeString()}] 寮€濮嬩笂浼犺鑹?鍦烘櫙鍙傝€冨浘骞跺～鍐欐暣娈垫彁绀鸿瘝`);
      const fillResult = await prepareSegmentPromptInBrowser();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 鏁存鎻愮ず璇嶅～鍐欑粨鏋? ${fillResult?.message || "鎵ц瀹屾垚"}`);
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
      setCurrentAction('鍐欏叆鍒嗛暅鎻愮ず璇嶄笌鍙傝€冨浘');
      for (let index = 0; index < scenes.length; index += 1) {
        const scene = scenes[index];
        addLogMessage(`[${new Date().toLocaleTimeString()}] 寮€濮嬫彁浜ゅ垎闀?${scene.segmentLabel || scene.sceneNumber}/${scenes.length}`);
        const result = await pushScenePromptToBrowser(scene);
        addLogMessage(
          `[${new Date().toLocaleTimeString()}] 鍒嗛暅 ${scene.segmentLabel || scene.sceneNumber}: ${result?.message || "鎵ц瀹屾垚"}`,
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
    void window.electronAPI?.reversePlaywright?.close();
    void window.electronAPI?.browserView?.setIgnoreMouseEvents(false);
    void window.electronAPI?.browserView?.show();
    setBrowserLocked(false);
    setAgentStatus('idle');
    setCurrentAction('绛夊緟寮€濮?..');
    toast({
      title: "鎿嶄綔宸插仠姝?,
      description: "AI浠ｇ悊宸插仠姝㈡墽琛?
    });
  };

  // 閲嶇疆浠ｇ悊
  const resetAgent = () => {
    void window.electronAPI?.reversePlaywright?.close();
    void window.electronAPI?.browserView?.setIgnoreMouseEvents(false);
    void window.electronAPI?.browserView?.close();
    setBrowserLocked(false);
    setPlaywrightPreviewDataUrl(null);
    setAgentStatus('idle');
    setProgress(0);
    setCurrentAction('绛夊緟寮€濮?..');
    setBrowserUrl(JIMENG_HOME_URL);
    setOperationLog([]);
    toast({
      title: "宸查噸缃?,
      description: "浠ｇ悊鐘舵€佸凡閲嶇疆"
    });
  };

  // 鐘舵€佹樉绀洪厤缃?  const statusConfig = {
    idle: { label: '灏辩华', color: 'text-gray-600', bg: 'bg-gray-100' },
    initializing: { label: '鍒濆鍖?, color: 'text-blue-600', bg: 'bg-blue-100' },
    browsing: { label: '娴忚涓?, color: 'text-purple-600', bg: 'bg-purple-100' },
    operating: { label: '鎿嶄綔涓?, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    generating: { label: '鐢熸垚涓?, color: 'text-orange-600', bg: 'bg-orange-100' },
    completed: { label: '宸插畬鎴?, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    error: { label: '閿欒', color: 'text-red-600', bg: 'bg-red-100' }
  };

  const currentStatus = statusConfig[agentStatus];

  return (
    <div className="space-y-4">
      {/* 浠ｇ悊鐘舵€佹爮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-600" />
            <span className="font-medium">澶氭ā鎬丄I浠ｇ悊</span>
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
            {showBrowser ? "闅愯棌" : "鏄剧ず"}娴忚鍣?          </Button>
          <div className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            搴旂敤鍐呭疄鏃舵ā寮?          </div>
        </div>
      </div>

      {/* 娴忚鍣ㄧ獥鍙?*/}
      {false && playwrightPreviewDataUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" />
              Playwright 鎵ц蹇収
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border bg-muted">
              <img src={playwrightPreviewDataUrl} alt="Playwright preview" className="h-auto w-full" />
            </div>
          </CardContent>
        </Card>
      )}
      {showBrowser && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Chrome className="h-4 w-4" />
              鍐呯疆娴忚鍣?- 鍗虫ⅵ瑙嗛鐢熸垚
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-hidden">
            <div
              ref={browserViewportRef}
              className="w-full max-w-full overflow-hidden rounded-lg border bg-muted"
            >
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
                  placeholder="杈撳叆缃戝潃..."
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
                  璺宠浆
                </Button>
              </div>
              {/* Placeholder that reserves layout space 鈥?the actual BrowserView is fixed-positioned */}
              <div ref={browserPlaceholderRef} className="h-[70vh] min-h-[520px] w-full overflow-hidden" />
              {/* Fixed overlay: anchored to viewport so page scroll doesn't move the BrowserView */}
              <div
                ref={browserContainerRef}
                className="fixed overflow-hidden bg-transparent"
                style={{ zIndex: 10 }}
              >
                {browserLocked && (
                  <div className="absolute inset-x-0 top-0 z-10 pointer-events-none">
                    <div className="mx-3 mt-3 inline-flex rounded bg-amber-500/90 px-2 py-1 text-xs text-black select-none">
                      鑷姩鍖栨帶鍒朵腑锛氫粎閿佸畾鍐呯疆娴忚鍣ㄤ氦浜?                    </div>
                  </div>
                )}
                {!browserState.visible && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                    <div className="text-center">
                      <Chrome className="h-12 w-12 text-gray-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 mb-1">
                        {agentStatus === 'idle' ? 'AI浠ｇ悊宸插噯澶囧氨缁? : currentAction}
                      </p>
                      <p className="text-xs text-gray-500">
                        鍐呭祵娴忚鍣ㄥ皢鍦ㄦ鍖哄煙瀹炴椂灞曠ず鎿嶄綔杩囩▼
                      </p>
                    </div>
                  </div>
                )}
                {browserState.loading && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    椤甸潰鍔犺浇涓?..
                  </div>
                )}
                {!browserLocked && browserState.visible && (
                  <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-xs px-2 py-1 rounded flex items-center gap-1 z-10">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                    瀹炴椂鍐呭祵娴忚鍣?                  </div>
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

      {/* 鎺у埗闈㈡澘 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            浠ｇ悊閰嶇疆
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">鐩爣缃戠珯</Label>
              <Input
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="https://jiemeng.baidu.com"
                className="text-sm"
                disabled={agentStatus !== 'idle'}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">娴忚鍣ㄦ樉绀?/Label>
              <div className="flex items-center gap-2 pt-1 text-sm text-foreground">
                <Webhook className="h-4 w-4" />
                搴旂敤鍐呭疄鏃舵祻瑙?              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">鐩爣妯″瀷</Label>
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
              <Label className="text-xs text-muted-foreground">鐩爣鏃堕暱</Label>
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
            <Label className="text-xs text-muted-foreground">鎵ц鎽樿</Label>
            <div className="text-xs bg-secondary/30 p-3 rounded">
              <p>寰呭鐞嗗垎闀? {scenes.length}</p>
              <p>鐩爣鍙傛暟: {reverseModel} / {reverseDuration}</p>
              <p>棰勮鎵ц鏃堕棿: {Math.ceil(scenes.length * 15 / 60)}鍒嗛挓</p>
              <p className="mt-1 text-muted-foreground">鐪熷疄鎿嶄綔鍖呮嫭: 椤甸潰瀵艰埅銆佸厓绱犺瘑鍒€佽〃鍗曞～鍐欍€佹寜閽偣鍑汇€佺瓑寰呭搷搴旂瓑</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {agentStatus === 'idle' ? (
              <Button onClick={startAgent} className="gap-1.5">
                <Play className="h-3.5 w-3.5" />
                寮€濮嬬湡瀹炴搷浣?              </Button>
            ) : agentStatus === 'completed' ? (
              <Button className="gap-1.5" variant="default">
                <CheckCircle className="h-3.5 w-3.5" />
                浠诲姟宸插畬鎴?              </Button>
            ) : agentStatus === 'error' ? (
              <Button onClick={resetAgent} variant="secondary" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                閲嶆柊寮€濮?              </Button>
            ) : (
              <Button onClick={stopAgent} variant="destructive" className="gap-1.5">
                <Pause className="h-3.5 w-3.5" />
                鍋滄鎿嶄綔
              </Button>
            )}

            <Button
              variant="outline"
              onClick={resetAgent}
              className="gap-1.5"
              disabled={agentStatus === 'idle'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              閲嶇疆
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 杩涘害鎸囩ず鍣?*/}
      {(agentStatus !== 'idle' && agentStatus !== 'completed') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Loader2 className={`h-4 w-4 ${agentStatus === 'generating' ? 'animate-spin' : ''}`} />
              鎵ц杩涘害
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

      {/* 鎿嶄綔鏃ュ織 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            璇︾粏鎿嶄綔鏃ュ織
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
                      log.includes('閿欒') || log.includes('[閿欒]') ? 'text-red-600' :
                      log.includes('瀹屾垚') ? 'text-emerald-600' :
                      log.includes('寮€濮?) || log.includes('绛夊緟') ? 'text-blue-600' :
                      log.includes('AI浠ｇ悊') ? 'text-indigo-600' :
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
                <p>AI浠ｇ悊鏃ュ織灏嗗湪姝ゆ樉绀?/p>
                <p className="mt-1">寮€濮嬫搷浣滃悗灏嗘樉绀鸿缁嗙殑娴忚鍣ㄦ搷浣滄楠?/p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 鎶€鏈鏄?*/}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            鎶€鏈疄鐜拌鏄?          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-2">
            <p><strong>鐪熷疄娴忚鍣ㄦ搷浣?</strong> AI浠ｇ悊閫氳繃鑷姩鍖栨帶鍒跺櫒鎿嶄綔鐪熷疄鐨勬祻瑙堝櫒瀹炰緥</p>
            <p><strong>鎿嶄綔娴佺▼:</strong> 椤甸潰瀵艰埅 鈫?鍏冪礌璇嗗埆 鈫?淇℃伅濉厖 鈫?浜や簰鎿嶄綔 鈫?缁撴灉楠岃瘉</p>
            <p><strong>鏅鸿兘鍏冪礌瀹氫綅:</strong> 浣跨敤澶氶噸閫夋嫨鍣ㄧ瓥鐣ョ‘淇濊兘鎵惧埌姝ｇ‘鐨勯〉闈㈠厓绱?/p>
            <p><strong>瀹夊叏鎺柦:</strong> 鎵€鏈夋搷浣滈兘鍦ㄩ殧绂荤殑娴忚鍣ㄧ幆澧冧腑鎵ц</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MultimodalAgentPanel;
