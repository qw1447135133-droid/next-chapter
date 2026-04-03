var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/reverse-browserview-scripts.ts
function q(value) {
  return JSON.stringify(value);
}
function sharedHelpers() {
  return `
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const rectOf = (node) =>
      node instanceof HTMLElement
        ? node.getBoundingClientRect()
        : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const textOf = (node) =>
      normalize(
        node instanceof HTMLElement
          ? node.innerText || node.textContent || ""
          : node?.textContent || "",
      );
    const interactiveNodes = () =>
      Array.from(
        document.querySelectorAll(
          "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], [role='listbox'], label, li, a, div, span, textarea, input[type='text'], [role='textbox'], [contenteditable='true']",
        ),
      )
        .filter(isVisible)
        .sort((a, b) => {
          const rectA = rectOf(a);
          const rectB = rectOf(b);
          return rectA.top - rectB.top || rectA.left - rectB.left;
        });
    const clickLikeHuman = (node) => {
      if (!(node instanceof HTMLElement)) return "";
      node.scrollIntoView?.({ block: "center", inline: "nearest" });
      node.focus?.();
      node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      node.click();
      return textOf(node);
    };
    const promptTextboxes = () =>
      interactiveNodes().filter(
        (node) =>
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLInputElement ||
          (node instanceof HTMLElement &&
            (node.getAttribute("role") === "textbox" || node.getAttribute("contenteditable") === "true")),
      );
    const getTextboxValue = (textbox) => {
      if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
        return textbox.value || "";
      }
      return textbox instanceof HTMLElement ? textbox.innerText || textbox.textContent || "" : "";
    };
    const setTextboxValue = (textbox, value, skipChangeEvent = false) => {
      if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
        textbox.focus();
        const proto =
          textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(textbox, value);
        else textbox.value = value;
        textbox.setSelectionRange(value.length, value.length);
        try { textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" })); } catch (e) {}
        if (!skipChangeEvent) {
          try { textbox.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        }
        return;
      }
      if (textbox instanceof HTMLElement) {
        textbox.focus?.();
        // Use execCommand for contenteditable (safe with React/ProseMirror editors)
        const useExecCommand = textbox.getAttribute("contenteditable") === "true" || textbox.getAttribute("role") === "textbox";
        if (useExecCommand) {
          try {
            textbox.focus();
            document.execCommand("selectAll", false, undefined);
            document.execCommand("insertText", false, value);
            return;
          } catch (e) {}
        }
        // Fallback: direct textContent assignment
        try { textbox.textContent = value; } catch (e) {}
        try { textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" })); } catch (e) {}
        if (!skipChangeEvent) {
          try { textbox.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
        }
      }
    };
    const findPromptTextbox = () => {
      const candidates = promptTextboxes().map((node) => {
        const rect = rectOf(node);
        const parent =
          node.closest("[class*='generator']") ||
          node.closest("[class*='section']") ||
          node.closest("[class*='panel']") ||
          node.parentElement ||
          document.body;
        const scopeText = normalize(parent?.textContent || "");
        let score = rect.width * rect.height;
        if (node instanceof HTMLTextAreaElement) score += 20000;
        if (/\u95B9\u7ED8\u5297\u9287\u6C31\u62E0\u5B84\u7DCBrompt|\u95B8\u6B0F\u503D\u9227\uE100\u556B\u935E\u5BF8\u20AC\u572D\u756C@/i.test(scopeText)) score += 50000;
        if (parent?.querySelector?.("input[type='file']")) score += 30000;
        return { node, score };
      });
      return candidates.sort((a, b) => b.score - a.score)[0]?.node || null;
    };
    const resolvePromptScope = (textbox) => {
      if (!(textbox instanceof HTMLElement)) return document;
      const hasToolbarSignals = (root) => {
        if (!(root instanceof Element)) return false;
        const texts = Array.from(
          root.querySelectorAll("button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span"),
        )
          .filter(isVisible)
          .map((node) => textOf(node))
          .filter(Boolean);
        return (
          texts.some((text) => /Seedance 2\\.0/i.test(text)) &&
          texts.some((text) => /\u89C6\u9891\u751F\u6210/.test(text)) &&
          texts.some((text) => /16:9|9:16|3:2|2:3|1:1|21:9|4:3/.test(text))
        );
      };
      let current = textbox.parentElement;
      while (current && current !== document.body) {
        if (hasToolbarSignals(current)) return current;
        current = current.parentElement;
      }
      return (
        textbox.closest("[class*='layout']") ||
        textbox.closest("[class*='generator']") ||
        textbox.closest("[class*='section']") ||
        textbox.closest("[class*='panel']") ||
        textbox.parentElement ||
        document
      );
    };
    const locatePromptFileInput = () => {
      const textbox = findPromptTextbox();
      if (!(textbox instanceof HTMLElement)) {
        return { textbox: null, input: null, fileInputIndex: 0, textboxIndex: 0 };
      }
      const allTextboxes = promptTextboxes();
      const scope = resolvePromptScope(textbox);
      const allFileInputs = Array.from(document.querySelectorAll("input[type='file']"));
      const targetInput = scope.querySelector("input[type='file']") || allFileInputs[0] || null;
      const fileInputIndex = targetInput ? Math.max(0, allFileInputs.findIndex((item) => item === targetInput)) : 0;
      const textboxIndex = Math.max(0, allTextboxes.findIndex((item) => item === textbox));
      return { textbox, input: targetInput, fileInputIndex, textboxIndex };
    };
    const toolbarNodes = () => {
      const textbox = findPromptTextbox();
      const scope = resolvePromptScope(textbox);
      const nodes = Array.from(
        scope.querySelectorAll(
          "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], [role='listbox'], label, li, a, div, span",
        ),
      ).filter(isVisible);
      if (!(textbox instanceof HTMLElement)) return nodes;
      const tRect = rectOf(textbox);
      return nodes.filter((node) => {
        const rect = rectOf(node);
        const nearHorizontally =
          rect.right >= tRect.left - 260 && rect.left <= tRect.right + 260;
        const nearVertically =
          rect.top >= tRect.top - 180 && rect.bottom <= tRect.bottom + 220;
        return nearHorizontally && nearVertically;
      });
    };
    const compactToolbarControls = () =>
      toolbarNodes().filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = rectOf(node);
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.width > 220 || rect.height > 72) return false;
        const role = normalize(node.getAttribute("role") || "");
        const tag = node.tagName.toLowerCase();
        return role === "combobox" || tag === "button" || tag === "label" || role === "option" || role === "menuitem" || tag === "li";
      });
    const fireOpenMenu = (node) => {
      if (!(node instanceof HTMLElement)) return "";
      const clicked = clickLikeHuman(node);
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      node.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
      return clicked;
    };
    const closeTransientPopups = () => {
      try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      } catch (e0) {}
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        try { active.blur(); } catch (e1) {}
      }
      const textbox = findPromptTextbox();
      if (textbox instanceof HTMLElement) {
        try { textbox.focus(); } catch (e2) {}
      }
      return true;
    };
    const readToolbarTexts = () => toolbarNodes().map((node) => textOf(node)).filter(Boolean);
    const readScope = (textboxIndex = 0) => {
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, textboxIndex)] || findPromptTextbox();
      if (!(textbox instanceof HTMLElement)) {
        return {
          ok: false,
          step: "textbox-not-found",
          promptValue: "",
          signalTextKey: "",
          signalTexts: [],
          taskIndicatorCount: 0,
          hasPostSubmitSignals: false,
          submitButton: null,
        };
      }
      // Walk up to find a scope that contains both the textbox and a submit button
      const findScope = () => {
        const candidates = [
          textbox.closest("[class*='generator']"),
          textbox.closest("[class*='section']"),
          textbox.closest("[class*='panel']"),
          textbox.closest("[class*='layout']"),
          textbox.closest("[class*='container']"),
          textbox.closest("[class*='wrapper']"),
          textbox.parentElement,
          textbox.parentElement?.parentElement,
          textbox.parentElement?.parentElement?.parentElement,
          document.body,
        ].filter(Boolean);
        for (const candidate of candidates) {
          if (!(candidate instanceof Element)) continue;
          const btns = Array.from(candidate.querySelectorAll("button, [role='button']")).filter(isVisible);
          if (btns.length > 0) return candidate;
        }
        return document.body;
      };
      const scope = findScope();
      const buttons = Array.from(scope.querySelectorAll("button, [role='button'], [role='tab']")).filter(isVisible);
      const submitCandidates = buttons
        .map((node, order) => {
          const rect = rectOf(node);
          const text = textOf(node);
          const cls = normalize(node.className || "");
          let score = 0;
          if (/submit-button|send|generate/i.test(cls)) score += 600;
          if (/swap-button|toolbar-button/i.test(cls)) score -= 500;
          if (node instanceof HTMLButtonElement && node.disabled) score -= 200;
          if (rect.width >= 28 && rect.width <= 52 && rect.height >= 28 && rect.height <= 52) score += 160;
          if (rect.width >= 24 && rect.width <= 80 && rect.height >= 24 && rect.height <= 80) score += 80;
          if (!text && /submit-button/i.test(cls)) score += 140;
          const tRect = rectOf(textbox);
          const verticalNear = rect.top <= tRect.bottom + 24 && rect.bottom >= tRect.top - 24;
          const rightSide = rect.left >= tRect.left + tRect.width * 0.75;
          if (verticalNear) score += 120;
          if (rightSide) score += 160;
          return { node, score, order };
        })
        .sort((a, b) => b.score - a.score || a.order - b.order);
      const submitTarget = submitCandidates[0]?.node || null;
      const submitRect = submitTarget ? rectOf(submitTarget) : null;
      const signalTexts = [...new Set(buttons.map((node) => textOf(node)).filter(Boolean))]
        .filter((text) => /\u95B9\u70D8\u5E21\u59B2\uE6E2\u95BB\u3222\u5590\u9368\u6C2D\u7A09\u9421\u546E\u5F84\u9355\uE15F\u501E\u5A11\u64B6\u642E\u59AB\u677F\u5AEF\u9853\u7AF1\u95B8\u6B10\u7257\u7EC9\u70FD\u60BD\u9414\u7A3F\u7047|\u95C1\u63D2\u79F5\u93CC\u5A44\u7D13\u93CD\uE102\u5E06|\u95B8\u612C\u79F5\u9850\u5978\u60BD\u9414\u7A3F\u7047|queue|processing|cancel|retry|regenerate|details/i.test(text))
        .sort();
      const taskNodes = Array.from(
        scope.querySelectorAll("[class*='task-indicator'], [class*='inside-content-generator'], [class*='preview-container'], [class*='status-']"),
      ).filter(isVisible);
      return {
        ok: true,
        step: "scope-ready",
        promptValue: getTextboxValue(textbox),
        signalTextKey: signalTexts.join(" | "),
        signalTexts,
        taskIndicatorCount: taskNodes.length,
        hasPostSubmitSignals: signalTexts.length > 0 || taskNodes.length > 0,
        submitButton:
          submitTarget instanceof HTMLElement
            ? {
                text: textOf(submitTarget),
                className: normalize(submitTarget.className || ""),
                disabled: submitTarget instanceof HTMLButtonElement ? submitTarget.disabled : false,
                left: Math.round(submitRect?.left || 0),
                top: Math.round(submitRect?.top || 0),
                width: Math.round(submitRect?.width || 36),
                height: Math.round(submitRect?.height || 36),
              }
            : null,
      };
    };
  `;
}
function buildLocatePromptAreaScript() {
  return `
    (() => {
      ${sharedHelpers()}
      const located = locatePromptFileInput();
      return {
        ok: !!located.textbox,
        fileInputIndex: located.fileInputIndex,
        textboxIndex: located.textboxIndex,
        scopedFileCount:
          located.textbox instanceof HTMLElement
            ? Array.from(
                ((located.textbox.closest("[class*='generator']") ||
                  located.textbox.closest("[class*='section']") ||
                  located.textbox.closest("[class*='panel']") ||
                  located.textbox.parentElement ||
                  document).querySelectorAll?.("input[type='file']") || []),
              ).length
            : 0,
      };
    })()
  `;
}
function buildFillPromptScript(prompt2, files = [], fileInputIndex2 = 0, textboxIndex2 = 0) {
  return `
    (async () => {
      ${sharedHelpers()}
      const prompt = ${q(prompt2)};
      const files = ${q(files)};
      const explicitFileInputIndex = ${q(fileInputIndex2)};
      const explicitTextboxIndex = ${q(textboxIndex2)};
      const located = locatePromptFileInput();
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, explicitTextboxIndex)] || located.textbox || null;
      if (!(textbox instanceof HTMLElement)) {
        return { ok: false, uploaded: 0, filled: false, promptLength: 0, message: "\u95BA\u582B\u4E9D\u6FB9\u6A40\u5D1A\u9417\u581D\u7D79\u7F01\u20AC\u6966\u8DE8\u69E4\u93C9\u581F\u6338\u9359\u55DB\u5D20? };
      }
      const allFileInputs = Array.from(document.querySelectorAll("input[type='file']"));
      const targetInput = allFileInputs[Math.max(0, explicitFileInputIndex)] || located.input || allFileInputs[0] || null;
      if (files.length > 0) {
        if (!(targetInput instanceof HTMLInputElement)) {
          return { ok: false, uploaded: 0, filled: false, promptLength: 0, message: "\u95BA\u582B\u4E9D\u6FB9\u6A40\u5D1A\u68F0\u4F7A\u7450\u5A34\u80A9\u59FE\u7EF6\uE162\u5D17\u9289\uFE3B\u6531" };
        }
        const transfer = new DataTransfer();
        for (const file of files) {
          const response = await fetch(file.dataUrl);
          const blob = await response.blob();
          transfer.items.add(new File([blob], file.fileName, { type: blob.type || "application/octet-stream" }));
        }
        targetInput.files = transfer.files;
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setTextboxValue(textbox, prompt);
      return {
        ok: true,
        uploaded: files.length,
        filled: true,
        promptLength: prompt.length,
        currentValue: getTextboxValue(textbox),
        message: "\u7039\u544A\u5F43\u935F\u64BB\u5D17\u9289\uFE40\u7D79\u7F01\u20AC\u6966\u8DE8\u69E4",
      };
    })()
  `;
}
function buildReadPromptValueScript(textboxIndex2 = 0) {
  return `
    (() => {
      ${sharedHelpers()}
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex2)})] || findPromptTextbox();
      const directValue = textbox instanceof HTMLElement ? getTextboxValue(textbox) : "";
      if (normalize(directValue)) return directValue;
      const fallbackValues = textboxes
        .map((item) => getTextboxValue(item))
        .filter((value) => normalize(value))
        .sort((a, b) => b.length - a.length);
      return fallbackValues[0] || "";
    })()
  `;
}
function buildReadPromptScopeStateScript(textboxIndex2 = 0) {
  return `
    (() => {
      ${sharedHelpers()}
      return readScope(${q(textboxIndex2)});
    })()
  `;
}
function buildSubmitCurrentPromptStrictScript(textboxIndex2 = 0) {
  return `
    (async () => {
      ${sharedHelpers()}
      const before = readScope(${q(textboxIndex2)});
      if (!before.ok || !before.submitButton) {
        return { ok: false, step: before.step || "submit-not-found" };
      }
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex2)})] || findPromptTextbox();
      const scope =
        textbox instanceof HTMLElement
          ? textbox.closest("[class*='generator']") ||
            textbox.closest("[class*='section']") ||
            textbox.closest("[class*='panel']") ||
            textbox.closest("[class*='layout']") ||
            textbox.closest("[class*='container']") ||
            textbox.parentElement?.parentElement?.parentElement ||
            textbox.parentElement?.parentElement ||
            textbox.parentElement ||
            document.body
          : document.body;
      const target = Array.from(scope.querySelectorAll("button, [role='button'], [role='tab']")).find((node) => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
        const rect = rectOf(node);
        return (
          textOf(node) === before.submitButton.text &&
          normalize(node.className || "") === before.submitButton.className &&
          Math.round(rect.left) === before.submitButton.left &&
          Math.round(rect.top) === before.submitButton.top
        );
      });
      if (!(target instanceof HTMLElement)) {
        return { ok: false, step: "submit-not-found" };
      }
      const beforeValue = before.promptValue;
      const beforeDisabled = before.submitButton.disabled;
      const globalSignalSelector = [
        "[class*='task']",
        "[class*='queue']",
        "[class*='status']",
        "[class*='preview']",
        "[class*='history']",
        "[class*='record']",
        "[class*='creation']",
      ].join(", ");
      const readGlobalSignals = () => {
        const texts = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], div, span"))
          .filter((node) => node instanceof HTMLElement && isVisible(node))
          .map((node) => textOf(node))
          .filter(Boolean)
          .filter((text) => /\u961F\u5217|\u6392\u961F|\u751F\u6210\u4E2D|\u5904\u7406\u4E2D|\u91CD\u8BD5|\u91CD\u65B0\u751F\u6210|\u8BE6\u60C5|\u67E5\u770B|queue|processing|retry|regenerate|details/i.test(text))
          .slice(0, 40);
        const nodeCount = Array.from(document.querySelectorAll(globalSignalSelector))
          .filter((node) => node instanceof HTMLElement && isVisible(node))
          .length;
        return {
          textKey: [...new Set(texts)].join(" | "),
          nodeCount,
        };
      };
      const beforeGlobal = readGlobalSignals();
      let externalMutationCount = 0;
      const targetRoot =
        target.closest("[class*='generator']") ||
        target.closest("[class*='section']") ||
        target.closest("[class*='panel']") ||
        target.parentElement;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const mutationTarget = mutation.target;
          if (!(mutationTarget instanceof Node)) continue;
          if (targetRoot instanceof Node && targetRoot.contains(mutationTarget)) continue;
          externalMutationCount += 1;
        }
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      clickLikeHuman(target);
      const startedAt = Date.now();
      let after = before;
      while (Date.now() - startedAt <= 4000) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        after = readScope(${q(textboxIndex2)});
        const afterGlobal = readGlobalSignals();
        const submitChanged =
          !!before.submitButton !== !!after.submitButton ||
          before.submitButton?.disabled !== after.submitButton?.disabled ||
          before.submitButton?.className !== after.submitButton?.className ||
          before.submitButton?.text !== after.submitButton?.text;
        const signalsChanged =
          before.signalTextKey !== after.signalTextKey ||
          before.taskIndicatorCount !== after.taskIndicatorCount;
        const promptChanged = normalize(after.promptValue) !== normalize(before.promptValue);
        const submitDisappeared = !!before.submitButton && !after.submitButton;
        // Also detect page navigation: textbox itself disappeared
        const textboxGone = !after.ok || after.step === "textbox-not-found";
        const globalSignalsChanged =
          beforeGlobal.textKey !== afterGlobal.textKey ||
          beforeGlobal.nodeCount !== afterGlobal.nodeCount;
        const observedExternalMutation = externalMutationCount >= 3;
        const verified =
          textboxGone ||
          submitDisappeared ||
          ((submitChanged || signalsChanged) && (after.hasPostSubmitSignals || !!after.submitButton?.disabled)) ||
          (promptChanged && (after.hasPostSubmitSignals || signalsChanged || submitDisappeared)) ||
          globalSignalsChanged ||
          observedExternalMutation;
        if (verified) {
          observer.disconnect();
          return {
            ok: true,
            step: "submitted",
            beforeValue,
            afterValue: after.promptValue,
            beforeDisabled,
            afterDisabled: after.submitButton?.disabled || false,
            signalTextKey: after.signalTextKey,
            taskIndicatorCount: after.taskIndicatorCount,
            globalSignalTextKey: afterGlobal.textKey,
            globalSignalNodeCount: afterGlobal.nodeCount,
            externalMutationCount,
          };
        }
      }
      observer.disconnect();
      const afterGlobal = readGlobalSignals();
      return {
        ok: false,
        step: "submit-not-confirmed",
        beforeValue,
        afterValue: after.promptValue,
        beforeDisabled,
        afterDisabled: after.submitButton?.disabled || false,
        signalTextKey: after.signalTextKey,
        taskIndicatorCount: after.taskIndicatorCount,
        globalSignalTextKey: afterGlobal.textKey,
        globalSignalNodeCount: afterGlobal.nodeCount,
        externalMutationCount,
      };
    })()
  `;
}
function buildWaitForPromptScopeReadyScript(textboxIndex2 = 0, timeoutMs = 3e4) {
  return `
    (async () => {
      ${sharedHelpers()}
      const startedAt = Date.now();
      while (Date.now() - startedAt <= ${q(timeoutMs)}) {
        const state = readScope(${q(textboxIndex2)});
        if (
          state.ok &&
          ((state.submitButton && !state.submitButton.disabled) || normalize(state.promptValue).length === 0)
        ) {
          return { ok: true, step: "ready", state };
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { ok: false, step: "ready-timeout", state: readScope(${q(textboxIndex2)}) };
    })()
  `;
}
var init_reverse_browserview_scripts = __esm({
  "src/lib/reverse-browserview-scripts.ts"() {
  }
});

// src/lib/reverse-playwright-dom.ts
async function selectAspectRatioInDom(payload) {
  const normalize2 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeAspectRatioText = (value) => {
    const match = normalize2(value).match(/\b(16:9|9:16|3:2|2:3|1:1|21:9)\b/);
    return match ? match[1] : normalize2(value);
  };
  const isExactRatioText = (value) => /^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(normalize2(value));
  const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (node) => normalize2(
    node instanceof HTMLElement ? node.innerText || node.textContent || "" : node.textContent || ""
  );
  const isCompactCandidate = (node) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
    const rect = rectOf(node);
    const text = textOf(node);
    if (!text) return false;
    if (rect.width > 420 || rect.height > 96) return false;
    if (text.length > 40 && rect.width > 280) return false;
    return true;
  };
  const interactiveSelector = "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const sortByVisualOrder = (nodes) => [...nodes].sort((a, b) => {
    const rectA = rectOf(a);
    const rectB = rectOf(b);
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });
  const interactiveNodes = () => sortByVisualOrder(
    Array.from(document.querySelectorAll(interactiveSelector)).filter(
      isCompactCandidate
    )
  );
  const popupRootOf = (node) => node.closest(
    "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]"
  );
  const clickableOf = (node) => {
    if (!(node instanceof HTMLElement)) return null;
    return node.closest(
      "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a"
    ) || node;
  };
  const humanClick = (node) => {
    const clickable = clickableOf(node);
    if (!(clickable instanceof HTMLElement)) return "";
    clickable.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    clickable.focus?.();
    clickable.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickable.click();
    return textOf(clickable);
  };
  const controlNodes = () => interactiveNodes().filter((node) => {
    const role = normalize2(node.getAttribute("role") || "");
    if (role === "option" || role === "menuitem") return false;
    if (popupRootOf(node)) return false;
    return isExactRatioText(textOf(node));
  });
  const optionNodes = (anchorRect2) => interactiveNodes().filter((node) => {
    const role = normalize2(node.getAttribute("role") || "");
    const rawText = textOf(node);
    if (!isExactRatioText(rawText)) return false;
    const popupRoot = popupRootOf(node);
    if (role !== "option" && role !== "menuitem" && !popupRoot) return false;
    if (!anchorRect2) return true;
    const rect = rectOf(node);
    const horizontallyNear = rect.right >= anchorRect2.left - 80 && rect.left <= anchorRect2.right + 240;
    const verticallyNear = rect.top >= anchorRect2.top - 80 && rect.top <= anchorRect2.bottom + 420;
    return horizontallyNear && verticallyNear;
  });
  const waitForTargetOption = async (anchorRect2, timeoutMs = 1200) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const nearby = optionNodes(anchorRect2).find(
        (node) => normalizeAspectRatioText(textOf(node)) === payload.targetAspectRatio
      ) || interactiveNodes().find((node) => {
        const rawText = textOf(node);
        if (!isExactRatioText(rawText)) return false;
        const text = normalizeAspectRatioText(rawText);
        if (text !== payload.targetAspectRatio) return false;
        const rect = rectOf(node);
        const horizontallyNear = rect.right >= anchorRect2.left - 80 && rect.left <= anchorRect2.right + 240;
        const verticallyNear = rect.top >= anchorRect2.top - 80 && rect.top <= anchorRect2.bottom + 420;
        return horizontallyNear && verticallyNear;
      }) || optionNodes().find(
        (node) => normalizeAspectRatioText(textOf(node)) === payload.targetAspectRatio
      ) || null;
      if (nearby) return nearby;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  };
  const current = controlNodes()[0] || null;
  if (!current) return { ok: false, step: "current-ratio-not-found" };
  const currentText = normalizeAspectRatioText(textOf(current));
  if (currentText === payload.targetAspectRatio) {
    return { ok: true, step: "already-target", currentText };
  }
  humanClick(current);
  const anchorRect = rectOf(current);
  const targetOption = await waitForTargetOption(anchorRect);
  if (!targetOption) {
    return {
      ok: false,
      step: "target-ratio-not-found",
      currentText
    };
  }
  const targetText = normalizeAspectRatioText(humanClick(targetOption));
  return {
    ok: true,
    step: "target-selected",
    currentText,
    targetText
  };
}
async function selectFullReferenceInDom() {
  const normalize2 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (node) => normalize2(
    node instanceof HTMLElement ? node.innerText || node.textContent || "" : node.textContent || ""
  );
  const interactiveSelector = "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const popupRootOf = (node) => node.closest(
    "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]"
  );
  const sortByVisualOrder = (nodes) => [...nodes].sort((a, b) => {
    const rectA = rectOf(a);
    const rectB = rectOf(b);
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });
  const interactiveNodes = () => sortByVisualOrder(
    Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible)
  );
  const clickableOf = (node) => {
    if (!(node instanceof HTMLElement)) return null;
    return node.closest(
      "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a"
    ) || node;
  };
  const humanClick = (node) => {
    const clickable = clickableOf(node);
    if (!(clickable instanceof HTMLElement)) return "";
    clickable.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    clickable.focus?.();
    clickable.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickable.click();
    return textOf(clickable);
  };
  const referenceLabels = ["\u5168\u80FD\u53C2\u8003", "Full Reference", "\u9996\u5C3E\u5E27", "\u667A\u80FD\u591A\u5E27", "\u56FE\u7247\u53C2\u8003"];
  const isReferenceLabel = (text) => referenceLabels.includes(text);
  const controlCandidates = () => interactiveNodes().filter((node) => {
    const text = textOf(node);
    const role = normalize2(node.getAttribute("role") || "");
    if (!isReferenceLabel(text)) return false;
    if (popupRootOf(node)) return false;
    return role === "combobox" || role === "button" || node.tagName.toLowerCase() !== "li";
  });
  const optionCandidates = () => interactiveNodes().filter((node) => {
    const text = textOf(node);
    if (!isReferenceLabel(text)) return false;
    const role = normalize2(node.getAttribute("role") || "");
    return role === "option" || role === "menuitem" || !!popupRootOf(node);
  });
  const current = controlCandidates().find((node) => textOf(node) === "\u5168\u80FD\u53C2\u8003" || textOf(node) === "Full Reference") || controlCandidates()[0] || null;
  if (!current) return { ok: false, step: "reference-not-found" };
  const currentReference = textOf(current);
  if (currentReference === "\u5168\u80FD\u53C2\u8003" || currentReference === "Full Reference") {
    return { ok: true, step: "already-set", currentReference };
  }
  humanClick(current);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 1500) {
    const option = optionCandidates().find((node) => textOf(node) === "\u5168\u80FD\u53C2\u8003") || optionCandidates().find((node) => textOf(node) === "Full Reference") || null;
    if (option) {
      const targetText = humanClick(option);
      return {
        ok: true,
        step: "reference-selected",
        currentReference: targetText || "\u5168\u80FD\u53C2\u8003"
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return {
    ok: false,
    step: "option-not-found",
    currentReference
  };
}
async function selectModelInDom(payload) {
  const normalize2 = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeModelText2 = (value) => {
    const text = normalize2(value);
    if (/^Seedance 2\.0 Fast\b/i.test(text)) return "Seedance 2.0 Fast";
    if (/^Seedance 2\.0\b/i.test(text)) return "Seedance 2.0";
    return text;
  };
  const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (node) => normalize2(
    node instanceof HTMLElement ? node.innerText || node.textContent || "" : node.textContent || ""
  );
  const isCompactCandidate = (node) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
    const rect = rectOf(node);
    const text = textOf(node);
    if (!text) return false;
    if (rect.width > 420 || rect.height > 96) return false;
    if (text.length > 40 && rect.width > 280) return false;
    return true;
  };
  const interactiveSelector = "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const popupRootOf = (node) => node.closest(
    "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]"
  );
  const sortByVisualOrder = (nodes) => [...nodes].sort((a, b) => {
    const rectA = rectOf(a);
    const rectB = rectOf(b);
    return rectA.top - rectB.top || rectA.left - rectB.left;
  });
  const interactiveNodes = () => sortByVisualOrder(
    Array.from(document.querySelectorAll(interactiveSelector)).filter(
      isCompactCandidate
    )
  );
  const clickableOf = (node) => {
    if (!(node instanceof HTMLElement)) return null;
    return node.closest(
      "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a"
    ) || node;
  };
  const humanClick = (node) => {
    const clickable = clickableOf(node);
    if (!(clickable instanceof HTMLElement)) return "";
    clickable.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    clickable.focus?.();
    clickable.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clickable.click();
    return textOf(clickable);
  };
  const controlCandidates = () => interactiveNodes().filter((node) => {
    const text = textOf(node);
    const role = normalize2(node.getAttribute("role") || "");
    if (!/Seedance 2\.0/i.test(text)) return false;
    if (popupRootOf(node)) return false;
    return role === "combobox" || role === "button" || node.tagName.toLowerCase() === "button";
  });
  const optionCandidates = (anchorRect2, current2) => interactiveNodes().filter((node) => {
    if (node === current2) return false;
    const text = textOf(node);
    if (!/Seedance 2\.0/i.test(text)) return false;
    const role = normalize2(node.getAttribute("role") || "");
    const popupRoot = popupRootOf(node);
    const isPopupOption = role === "option" || role === "menuitem" || role === "button" || node.tagName.toLowerCase() === "button" || !!popupRoot || /option|item|menu|popup|dropdown|select|list/i.test(
      normalize2(node.className || "")
    );
    if (!isPopupOption) return false;
    if (!anchorRect2) return true;
    const rect = rectOf(node);
    const horizontallyNear = rect.right >= anchorRect2.left - 120 && rect.left <= anchorRect2.right + 280;
    const verticallyNear = rect.top >= anchorRect2.top - 80 && rect.top <= anchorRect2.bottom + 520;
    return horizontallyNear && verticallyNear;
  });
  const scoreOption = (node) => {
    const text = textOf(node);
    const normalized = normalizeModelText2(text);
    if (normalized === payload.targetModel && text === payload.targetModel) return 1400;
    if (normalized === payload.targetModel) return 1200;
    if (text.includes(payload.targetModel)) return 900;
    if (payload.targetModel.includes(text)) return 700;
    return 0;
  };
  const current = controlCandidates()[0] || null;
  if (!current) {
    return { ok: false, step: "control-not-found" };
  }
  const currentModel = normalizeModelText2(textOf(current));
  if (currentModel === payload.targetModel) {
    return { ok: true, step: "already-set", currentModel: textOf(current) };
  }
  humanClick(current);
  const anchorRect = rectOf(current);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 1500) {
    const options = optionCandidates(anchorRect, current).filter((node) => scoreOption(node) > 0).sort((a, b) => scoreOption(b) - scoreOption(a));
    const option = options[0] || null;
    if (option) {
      const targetText = humanClick(option);
      return {
        ok: true,
        step: "model-selected",
        currentModel: targetText,
        targetText,
        debug: options.slice(0, 6).map((node) => textOf(node)).join(" | ")
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return {
    ok: false,
    step: "option-not-found",
    currentModel: textOf(current),
    debug: interactiveNodes().map((node) => textOf(node)).filter((text) => /Seedance 2\.0/i.test(text)).slice(0, 12).join(" | ")
  };
}
var init_reverse_playwright_dom = __esm({
  "src/lib/reverse-playwright-dom.ts"() {
  }
});

// electron/reverse-playwright-runner.ts
var reverse_playwright_runner_exports = {};
__export(reverse_playwright_runner_exports, {
  ReversePlaywrightRunner: () => ReversePlaywrightRunner,
  reversePlaywrightRunner: () => reversePlaywrightRunner
});
function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}
function normalizeModelText(text) {
  const normalized = normalize(text);
  if (/^Seedance 2\.0 Fast\b/i.test(normalized)) return "Seedance 2.0 Fast";
  if (/^Seedance 2\.0\b/i.test(normalized)) return "Seedance 2.0";
  return normalized;
}
function normalizeDurationText(text) {
  const normalized = normalize(text);
  const match = normalized.match(/\b(\d+s)\b/i);
  return match ? match[1] : normalized;
}
function normalizePromptValue(text) {
  return String(text || "").replace(/\r\n?/g, "\n");
}
var import_node_path, import_node_fs, import_electron, import_playwright, ReversePlaywrightRunner, reversePlaywrightRunner;
var init_reverse_playwright_runner = __esm({
  "electron/reverse-playwright-runner.ts"() {
    import_node_path = __toESM(require("node:path"), 1);
    import_node_fs = __toESM(require("node:fs"), 1);
    import_electron = require("electron");
    import_playwright = require("playwright");
    init_reverse_browserview_scripts();
    init_reverse_playwright_dom();
    ReversePlaywrightRunner = class {
      context = null;
      page = null;
      headless = true;
      getUserDataDir() {
        return import_node_path.default.join(import_electron.app.getPath("userData"), "reverse_playwright_profile");
      }
      logLine(logs2, step, message) {
        logs2.push(`[${step}] ${message}`);
      }
      async clickLocator(locator, logs2, label) {
        try {
          await locator.click({ timeout: 5e3 });
          return;
        } catch (error) {
          this.logLine(
            logs2,
            label,
            `normal click failed, retry with force: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        try {
          await locator.evaluate((el) => {
            if (el instanceof HTMLElement) {
              el.scrollIntoView({ block: "center", inline: "center" });
              el.click();
            }
          });
          return;
        } catch (error) {
          this.logLine(
            logs2,
            label,
            `dom click failed, retry with force: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        await locator.click({ timeout: 5e3, force: true });
      }
      async dismissInterferingOverlays(page2, logs2) {
        const candidates = [
          page2.getByRole("button", { name: "\u540C\u610F" }).first(),
          page2.getByRole("button", { name: "\u77E5\u9053\u4E86" }).first(),
          page2.getByRole("button", { name: "\u5173\u95ED" }).first(),
          page2.getByRole("button", { name: "\u53D6\u6D88" }).first()
        ];
        for (const locator of candidates) {
          if (await locator.isVisible().catch(() => false)) {
            await this.clickLocator(locator, logs2, "overlay");
            await page2.waitForTimeout(300);
          }
        }
        await page2.keyboard.press("Escape").catch(() => {
        });
        const neutralized = await page2.evaluate(() => {
          const blockers = Array.from(
            document.querySelectorAll(
              ".lv-modal-mask, .lv-modal-wrapper, .dialog-wrapper-gzPtjx, .side-drawer-panel, .header-video-SDyhiM, video"
            )
          );
          for (const node of blockers) {
            if (!(node instanceof HTMLElement)) continue;
            node.style.pointerEvents = "none";
          }
          return blockers.length;
        }).catch(() => {
        });
        if (typeof neutralized === "number" && neutralized > 0) {
          this.logLine(logs2, "overlay", `neutralized ${neutralized} overlay blockers`);
        }
      }
      async syncCookiesFromElectron(logs2) {
        if (!this.context) return;
        try {
          const cookies = await import_electron.session.defaultSession.cookies.get({});
          const filtered = cookies.filter(
            (cookie) => /jianying\.com|dreamina\.cn|doubao\.com/i.test(cookie.domain)
          ).map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expirationDate,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite === "strict" ? "Strict" : cookie.sameSite === "lax" ? "Lax" : "None"
          }));
          if (filtered.length > 0) {
            await this.context.addCookies(filtered);
            this.logLine(
              logs2,
              "cookies",
              `synced ${filtered.length} cookies from electron session`
            );
          }
        } catch (error) {
          this.logLine(
            logs2,
            "cookies",
            `cookie sync skipped: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      async ensureContext(url, headless = true, logs2) {
        const needsRestart = !this.context || this.headless !== headless;
        if (needsRestart) {
          await this.close();
          const userDataDir = this.getUserDataDir();
          import_node_fs.default.mkdirSync(userDataDir, { recursive: true });
          this.context = await import_playwright.chromium.launchPersistentContext(userDataDir, {
            headless,
            viewport: { width: 1440, height: 1100 },
            locale: "zh-CN"
          });
          this.headless = headless;
          this.logLine(
            logs2,
            "launch",
            `started playwright (${headless ? "headless" : "headed"})`
          );
          await this.syncCookiesFromElectron(logs2);
        }
        if (!this.page || this.page.isClosed()) {
          this.page = this.context.pages()[0] || await this.context.newPage();
        }
        if (!this.page.url() || this.page.url() !== url) {
          this.logLine(logs2, "navigate", url);
          await this.page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 6e4
          });
        }
        await this.page.waitForLoadState("domcontentloaded");
        return this.page;
      }
      async getVisibleComboboxTexts(page2) {
        return await page2.evaluate(() => {
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          return Array.from(document.querySelectorAll("[role='combobox']")).filter(isVisible).map((node) => node instanceof HTMLElement ? node.innerText : "").map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean);
        });
      }
      async readSelections(page2) {
        const texts = await this.getVisibleComboboxTexts(page2);
        const rawModel = texts.find((text) => text.includes("Seedance 2.0")) || "";
        const rawDuration = texts.find((text) => /^\d+s$/.test(text) || /\b\d+s\b/.test(text)) || "";
        const rawReference = texts.find((text) => /全能参考|Full Reference|首尾帧|智能多帧|首帧图|图片参考/.test(text)) || "";
        return {
          currentModel: normalizeModelText(rawModel),
          currentDuration: normalizeDurationText(rawDuration),
          currentReference: normalize(rawReference)
        };
      }
      async clickComboboxByPredicate(page2, predicate, logs2) {
        const combos = page2.locator("[role='combobox']");
        const count = await combos.count();
        for (let i = 0; i < count; i += 1) {
          const combo = combos.nth(i);
          if (!await combo.isVisible().catch(() => false)) continue;
          const text = normalize(await combo.innerText().catch(() => ""));
          if (predicate(text)) {
            if (logs2) {
              await this.clickLocator(combo, logs2, "combobox");
            } else {
              await combo.click({ timeout: 5e3 });
            }
            return combo;
          }
        }
        return null;
      }
      async ensureVideoGeneratorMode(page2, logs2) {
        await this.dismissInterferingOverlays(page2, logs2);
        for (let settle = 1; settle <= 3; settle += 1) {
          const combosBefore = await this.getVisibleComboboxTexts(page2);
          if (combosBefore.some((text) => text.includes("Seedance 2.0"))) {
            this.logLine(logs2, "mode", "video generator toolbar already visible");
            return;
          }
          await page2.waitForTimeout(500);
        }
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await this.dismissInterferingOverlays(page2, logs2);
          const leftGenerate = page2.getByText("\u751F\u6210", { exact: true }).nth(0);
          if (await leftGenerate.isVisible().catch(() => false)) {
            await this.clickLocator(leftGenerate, logs2, "mode");
            await page2.waitForTimeout(300);
          }
          const videoEntry = page2.getByText("\u89C6\u9891\u751F\u6210", { exact: true }).last();
          if (await videoEntry.isVisible().catch(() => false)) {
            await this.clickLocator(videoEntry, logs2, "mode");
            await page2.waitForTimeout(900);
          }
          const combosAfter = await this.getVisibleComboboxTexts(page2);
          this.logLine(
            logs2,
            "mode",
            `attempt ${attempt}: ${combosAfter.join(" | ") || "no-combobox"}`
          );
          if (combosAfter.some((text) => text.includes("Seedance 2.0"))) {
            return;
          }
        }
        throw new Error("video generator mode not found");
      }
      async chooseModel(page2, targetModel, logs2) {
        const current = await this.readSelections(page2);
        if (current.currentModel === targetModel) {
          this.logLine(logs2, "model", `already ${targetModel}`);
          return;
        }
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await this.dismissInterferingOverlays(page2, logs2);
          const scriptedResult2 = await page2.evaluate(selectModelInDom, { targetModel }).catch((error) => ({
            ok: false,
            step: error instanceof Error ? error.message : String(error),
            currentModel: "",
            debug: ""
          }));
          await page2.waitForTimeout(500);
          const latest = await this.readSelections(page2);
          this.logLine(
            logs2,
            "model",
            `attempt ${attempt}: ${scriptedResult2?.step || "unknown"} -> ${latest.currentModel || "unknown"}${scriptedResult2?.debug ? ` / ${scriptedResult2.debug}` : ""}`
          );
          if (latest.currentModel === targetModel) return;
          if (targetModel === "Seedance 2.0 Fast" && latest.currentModel === "Seedance 2.0") {
            this.logLine(logs2, "model", "fallback to Seedance 2.0");
            return;
          }
        }
        throw new Error(`failed to set model to ${targetModel}`);
      }
      async chooseDuration(page2, targetDuration, logs2) {
        const current = await this.readSelections(page2);
        if (current.currentDuration === targetDuration) {
          this.logLine(logs2, "duration", `already ${targetDuration}`);
          return;
        }
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          await this.dismissInterferingOverlays(page2, logs2);
          const combo = await this.clickComboboxByPredicate(
            page2,
            (text) => /^\d+s$/.test(text) || /\b\d+s\b/.test(text),
            logs2
          );
          if (!combo) throw new Error("duration combobox not found");
          const option = page2.getByRole("option").filter({
            hasText: new RegExp(
              `\\b${targetDuration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
            )
          }).first();
          await option.waitFor({ state: "visible", timeout: 5e3 });
          await this.clickLocator(option, logs2, "duration");
          await page2.waitForTimeout(500);
          const latest = await this.readSelections(page2);
          this.logLine(
            logs2,
            "duration",
            `attempt ${attempt}: ${latest.currentDuration || "unknown"}`
          );
          if (latest.currentDuration === targetDuration) return;
        }
        throw new Error(`failed to set duration to ${targetDuration}`);
      }
      async ensureFullReference(page2, logs2) {
        const current = await this.readSelections(page2);
        if (current.currentReference?.includes("\u5168\u80FD\u53C2\u8003") || current.currentReference?.includes("Full Reference")) {
          this.logLine(logs2, "reference", "already full reference");
          return;
        }
        await this.dismissInterferingOverlays(page2, logs2);
        const scriptedResult2 = await page2.evaluate(selectFullReferenceInDom).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error),
          currentReference: ""
        }));
        if (scriptedResult2?.ok) {
          await page2.waitForTimeout(400);
          this.logLine(logs2, "reference", `scripted full reference ready: ${scriptedResult2.step}`);
          return;
        }
        const result2 = await page2.evaluate(() => {
          const normalize2 = (value) => (value || "").replace(/\s+/g, " ").trim();
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const clickNode = (node) => {
            const clickable = node instanceof HTMLElement ? node.closest("button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='combobox'], label, li, a") || node : null;
            if (!(clickable instanceof HTMLElement)) return "";
            clickable.scrollIntoView({ block: "center", inline: "center" });
            clickable.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
            clickable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            clickable.click();
            return normalize2(clickable.innerText || clickable.textContent || "");
          };
          const nodes = Array.from(
            document.querySelectorAll("button, [role='button'], [role='tab'], [role='option'], [role='menuitem'], [role='combobox'], div, span, label, li")
          ).filter(isVisible);
          const currentMode = nodes.find((node) => /全能参考|Full Reference|首尾帧|首帧图|图片参考/.test(normalize2(node.textContent || "")));
          if (!currentMode) return { ok: false, step: "reference-not-found" };
          clickNode(currentMode);
          const fullReference = nodes.find((node) => /^全能参考$|^Full Reference$/.test(normalize2(node.textContent || "")));
          if (fullReference) {
            clickNode(fullReference);
            return { ok: true, step: "full-reference-selected" };
          }
          return { ok: false, step: "full-reference-option-not-found" };
        }).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error)
        }));
        if (result2.ok) {
          await page2.waitForTimeout(400);
          this.logLine(logs2, "reference", "full reference ready");
          return;
        }
        this.logLine(logs2, "reference", `keep current mode: ${result2.step}`);
      }
      async ensureAspectRatio(page2, targetAspectRatio, logs2) {
        await this.dismissInterferingOverlays(page2, logs2);
        const result2 = await page2.evaluate(selectAspectRatioInDom, {
          targetAspectRatio
        }).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error)
        }));
        if (!result2.ok) {
          throw new Error(
            `aspect ratio control not found: ${targetAspectRatio} (${result2.step})`
          );
        }
        this.logLine(logs2, "ratio", `${targetAspectRatio} ${result2.step}`);
      }
      async locatePromptContext(page2, logs2) {
        const textarea2 = page2.locator(
          "textarea[placeholder*='\u7ED3\u5408\u56FE\u7247'], textarea[placeholder*='\u63CF\u8FF0'], textarea"
        ).first();
        await textarea2.waitFor({ state: "visible", timeout: 15e3 });
        const fileInputIndex2 = await page2.evaluate(() => {
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const textbox = Array.from(
            document.querySelectorAll("textarea,[role='textbox'],[contenteditable='true']")
          ).find(isVisible);
          if (!textbox) return 0;
          const fileInputs = Array.from(document.querySelectorAll("input[type='file']"));
          const section = textbox.closest("[class*='section-generator']") || document;
          const targetInput = section.querySelector("input[type='file']") || fileInputs[0] || null;
          return targetInput ? Math.max(0, fileInputs.findIndex((item) => item === targetInput)) : 0;
        });
        this.logLine(logs2, "context", `resolved file input index ${fileInputIndex2}`);
        return { textarea: textarea2, fileInputIndex: fileInputIndex2 };
      }
      async locatePromptContextViaScript(page, logs) {
        const located = await page.evaluate(
          (source) => eval(source),
          buildLocatePromptAreaScript()
        ).catch((error) => ({
          ok: false,
          fileInputIndex: 0,
          textboxIndex: 0,
          error: error instanceof Error ? error.message : String(error)
        }));
        if (!located?.ok) {
          throw new Error(
            `prompt context not found${located?.error ? `: ${located.error}` : ""}`
          );
        }
        const fileInputIndex = Math.max(0, Number(located.fileInputIndex || 0));
        const textboxIndex = Math.max(0, Number(located.textboxIndex || 0));
        this.logLine(logs, "context", `resolved file input index ${fileInputIndex}`);
        this.logLine(logs, "context", `resolved textbox index ${textboxIndex}`);
        return { fileInputIndex, textboxIndex };
      }
      async refsToPayloads(refs) {
        return await Promise.all(
          refs.map(async (ref, index) => {
            if (ref.dataUrl) {
              const match = ref.dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
              if (!match) throw new Error(`invalid data url for ${ref.fileName}`);
              return {
                name: ref.fileName || `reference-${index + 1}.png`,
                mimeType: match[1],
                buffer: Buffer.from(match[2], "base64")
              };
            }
            if (!ref.url) throw new Error(`missing ref source: ${ref.fileName}`);
            const response = await fetch(ref.url);
            if (!response.ok) {
              throw new Error(`failed to fetch ref: ${ref.url}`);
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            return {
              name: ref.fileName || `reference-${index + 1}.jpg`,
              mimeType: response.headers.get("content-type") || "image/jpeg",
              buffer
            };
          })
        );
      }
      async uploadRefs(page2, refs, logs2, promptContext2) {
        if (refs.length === 0) return 0;
        const { fileInputIndex: fileInputIndex2 } = promptContext2;
        const payloads = await this.refsToPayloads(refs);
        const allInputs = page2.locator("input[type='file']");
        const count = await allInputs.count();
        const firstInput = allInputs.nth(Math.max(0, Math.min(fileInputIndex2, Math.max(0, count - 1))));
        await firstInput.setInputFiles([payloads[0]]);
        if (payloads.length > 1 && count > fileInputIndex2 + 1) {
          const secondInput = allInputs.nth(fileInputIndex2 + 1);
          await secondInput.setInputFiles([payloads[1]]);
        }
        await page2.waitForTimeout(1200);
        await this.dismissInterferingOverlays(page2, logs2);
        this.logLine(logs2, "upload", `uploaded ${Math.min(payloads.length, Math.max(1, count - fileInputIndex2))} refs`);
        return payloads.length;
      }
      async fillPrompt(page, prompt, logs, promptContext) {
        const { fileInputIndex, textboxIndex } = promptContext;
        const result = await page.evaluate(
          (source) => eval(source),
          buildFillPromptScript(prompt, [], fileInputIndex, textboxIndex)
        ).catch((error) => ({
          ok: false,
          promptLength: 0,
          currentValue: "",
          message: error instanceof Error ? error.message : String(error)
        }));
        await page.waitForTimeout(300);
        const immediateValue = typeof result?.currentValue === "string" ? result.currentValue : "";
        const readBack = await page.evaluate(
          (source) => eval(source),
          buildReadPromptValueScript(textboxIndex)
        ).catch(() => "");
        if (!result?.ok) {
          throw new Error(`prompt fill failed: ${result?.message || "unknown"}`);
        }
        const normalizedPrompt = normalizePromptValue(prompt);
        const normalizedImmediate = normalizePromptValue(immediateValue);
        const normalizedReadBack = normalizePromptValue(readBack);
        const verified = normalizedImmediate === normalizedPrompt ? immediateValue : normalizedReadBack === normalizedPrompt ? readBack : "";
        if (!verified) {
          this.logLine(
            logs,
            "prompt",
            `verification mismatch expected=${normalizedPrompt.length} immediate=${normalizedImmediate.length} readBack=${normalizedReadBack.length}`
          );
          throw new Error("prompt verification failed");
        }
        this.logLine(logs, "prompt", `filled ${prompt.length} chars`);
        return verified.length;
      }
      async getVisibleSubmitButton(page2) {
        const textarea2 = page2.locator("textarea").filter({ hasNotText: /^$/ }).first();
        const textareaBox = await textarea2.boundingBox().catch(() => null);
        const buttons = page2.locator("button");
        const count = await buttons.count();
        let best = null;
        for (let i = 0; i < count; i += 1) {
          const button = buttons.nth(i);
          if (!await button.isVisible().catch(() => false)) continue;
          const disabled = await button.isDisabled().catch(() => false);
          const box = await button.boundingBox().catch(() => null);
          if (!box) continue;
          const text = normalize(await button.innerText().catch(() => ""));
          let score = 0;
          if (box.width >= 24 && box.width <= 80 && box.height >= 24 && box.height <= 80) score += 120;
          if (!text) score += 150;
          if (/提交|发送|生成|send|submit|generate/i.test(text)) score += 60;
          if (/Agent 模式|自动|灵感搜索|创意设计|去查看|首帧|尾帧|16:9|9:16|15s|5s/.test(text)) score -= 300;
          if (disabled) score -= 10;
          if (textareaBox) {
            const verticalNear = box.top >= textareaBox.top - 24 && box.top <= textareaBox.bottom + 48;
            const rightSide = box.left >= textareaBox.x + textareaBox.width * 0.75;
            if (verticalNear) score += 100;
            if (rightSide) score += 140;
          }
          if (!best || score > best.score) {
            best = { index: i, score };
          }
        }
        return best ? buttons.nth(best.index) : null;
      }
      async getPreferredSubmitButton(page2, logs2) {
        const best = await page2.evaluate(() => {
          const normalize2 = (value) => (value || "").replace(/\s+/g, " ").trim();
          const isVisible = (node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const textarea2 = Array.from(document.querySelectorAll("textarea")).find(
            isVisible
          );
          const textareaBox = textarea2?.getBoundingClientRect() || null;
          const allButtons = Array.from(
            document.querySelectorAll("button")
          );
          const scored = allButtons.flatMap((button, domIndex) => {
            if (!isVisible(button)) return [];
            const rect = button.getBoundingClientRect();
            const text = normalize2(button.innerText || button.textContent || "");
            const cls = normalize2(button.className || "");
            const aria = normalize2(button.getAttribute("aria-label") || "");
            let score = 0;
            if (/submit-button|send|generate/i.test(cls)) score += 600;
            if (/swap-button|button-YBvLch|button-vIZAMt/.test(cls)) score -= 500;
            if (button.disabled) score -= 200;
            if (rect.width >= 28 && rect.width <= 52 && rect.height >= 28 && rect.height <= 52) score += 160;
            if (rect.width >= 24 && rect.width <= 80 && rect.height >= 24 && rect.height <= 80) score += 80;
            if (!text && /submit-button/i.test(cls)) score += 140;
            if (!text && !/submit-button/i.test(cls)) score -= 120;
            if (/submit|send|generate/i.test(`${text} ${aria} ${cls}`)) score += 120;
            if (/Agent 妯″紡|鑷姩|鐏垫劅鎼滅储|鍒涙剰璁捐|鍘绘煡鐪媩棣栧抚|灏惧抚|16:9|9:16|15s|5s/.test(text)) score -= 300;
            if (textareaBox) {
              const verticalNear = rect.top >= textareaBox.top - 24 && rect.top <= textareaBox.bottom + 48;
              const rightSide = rect.left >= textareaBox.left + textareaBox.width * 0.75;
              const farLeft = rect.left <= textareaBox.left + textareaBox.width * 0.25;
              if (verticalNear) score += 120;
              if (rightSide) score += 200;
              if (farLeft) score -= 120;
            }
            return {
              domIndex,
              score,
              text,
              cls,
              disabled: button.disabled
            };
          }).sort((a, b) => b.score - a.score);
          return scored[0] || null;
        });
        if (best && logs2) {
          this.logLine(
            logs2,
            "submit",
            `candidate domIndex=${best.domIndex} score=${best.score} text="${best.text}" cls="${best.cls}" disabled=${best.disabled}`
          );
        }
        if (!best) return null;
        return page2.locator("button").nth(best.domIndex);
      }
      async readPromptScopeState(page, promptContext) {
        return await page.evaluate(
          (source) => eval(source),
          buildReadPromptScopeStateScript(promptContext.textboxIndex)
        ).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error),
          promptValue: "",
          signalTextKey: "",
          signalTexts: [],
          taskIndicatorCount: 0,
          hasPostSubmitSignals: false,
          submitButton: null
        }));
      }
      hasPromptScopeSubmissionAdvanced(beforeState, afterState) {
        if (!afterState?.ok) return false;
        const submitChanged = !!beforeState?.submitButton !== !!afterState?.submitButton || beforeState?.submitButton?.disabled !== afterState?.submitButton?.disabled || beforeState?.submitButton?.className !== afterState?.submitButton?.className || beforeState?.submitButton?.text !== afterState?.submitButton?.text;
        const signalsChanged = beforeState?.signalTextKey !== afterState?.signalTextKey || beforeState?.taskIndicatorCount !== afterState?.taskIndicatorCount;
        const promptChanged = normalizePromptValue(beforeState?.promptValue || "") !== normalizePromptValue(afterState?.promptValue || "");
        const submitDisappeared = !!beforeState?.submitButton && !afterState?.submitButton;
        return (submitChanged || signalsChanged) && (afterState?.hasPostSubmitSignals || !!afterState?.submitButton?.disabled) || promptChanged && (afterState?.hasPostSubmitSignals || signalsChanged || submitDisappeared) || submitDisappeared && promptChanged;
      }
      async confirmPromptScopeSubmission(page2, promptContext2, beforeState, timeoutMs = 4e3) {
        const startedAt = Date.now();
        let latestState = beforeState;
        while (Date.now() - startedAt <= timeoutMs) {
          await page2.waitForTimeout(120);
          latestState = await this.readPromptScopeState(page2, promptContext2);
          if (this.hasPromptScopeSubmissionAdvanced(beforeState, latestState)) {
            return { ok: true, state: latestState };
          }
        }
        return { ok: false, state: latestState };
      }
      async submitCurrentPrompt(page, logs, promptContext) {
        await this.dismissInterferingOverlays(page, logs);
        const textarea = page.locator(
          "textarea[placeholder*='\u7ED3\u5408\u56FE\u7247'], textarea[placeholder*='\u63CF\u8FF0'], textarea"
        ).first();
        const beforeValue = await page.evaluate(
          (source) => eval(source),
          buildReadPromptValueScript(promptContext.textboxIndex)
        ).catch(() => "");
        const scriptedResult = await page.evaluate(
          (source) => eval(source),
          buildSubmitCurrentPromptStrictScript(promptContext.textboxIndex)
        ).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error)
        }));
        if (scriptedResult?.ok) {
          this.logLine(logs, "submit", `scripted submit accepted: ${scriptedResult.step}`);
          await page.waitForTimeout(1e3);
          return;
        }
        const submitButton = await this.getPreferredSubmitButton(page, logs);
        if (!submitButton) throw new Error("submit button not found");
        let beforeDisabled = await submitButton.isDisabled().catch(() => false);
        if (beforeDisabled) {
          await page.waitForFunction(
            () => {
              const button = Array.from(document.querySelectorAll("button")).find(
                (node) => /submit-button|send|generate/i.test(
                  node.className || ""
                )
              );
              return !!button && !button.disabled;
            },
            { timeout: 1e4 }
          ).catch(() => {
          });
          beforeDisabled = await submitButton.isDisabled().catch(() => false);
        }
        await this.dismissInterferingOverlays(page, logs);
        await this.clickLocator(submitButton, logs, "submit");
        this.logLine(logs, "submit", `clicked submit button (beforeDisabled=${beforeDisabled})`);
        await page.waitForFunction(
          (previous) => {
            const textareaNode = document.querySelector("textarea");
            const buttons = Array.from(document.querySelectorAll("button")).filter(
              (node) => node instanceof HTMLElement && node.getBoundingClientRect().width > 0
            );
            const button = buttons.find((node) => {
              const text = (node.innerText || "").replace(/\s+/g, " ").trim();
              const rect = node.getBoundingClientRect();
              return rect.width >= 24 && rect.width <= 80 && rect.height >= 24 && rect.height <= 80 && !/Agent 模式|自动|灵感搜索|创意设计|去查看|首帧|尾帧|16:9|9:16|15s|5s/.test(text);
            });
            const currentValue = textareaNode instanceof HTMLTextAreaElement ? textareaNode.value : "";
            return currentValue !== previous || !!button?.disabled || document.body.innerText.includes("\u751F\u6210\u4E2D") || document.body.innerText.includes("\u6392\u961F\u4E2D");
          },
          beforeValue,
          { timeout: 1e4 }
        );
        await page.waitForTimeout(1e3);
        this.logLine(logs, "submit", "submission accepted");
      }
      async waitUntilFormReady(page2, logs2, promptContext2) {
        await this.locatePromptContextViaScript(page2, logs2);
        const preferredSubmitButton = await this.getPreferredSubmitButton(page2, logs2);
        if (preferredSubmitButton) {
          await page2.waitForFunction(
            () => {
              const button = Array.from(document.querySelectorAll("button")).find(
                (node) => /submit-button|send|generate/i.test(
                  node.className || ""
                )
              );
              return !!button && !button.disabled;
            },
            { timeout: 3e4 }
          );
        }
        this.logLine(logs2, "ready", "form ready for next segment");
        return;
        const textarea2 = page2.locator(
          "textarea[placeholder*='\u7ED3\u5408\u56FE\u7247'], textarea[placeholder*='\u63CF\u8FF0'], textarea"
        ).first();
        await textarea2.waitFor({ state: "visible", timeout: 15e3 });
        const submitButton2 = await this.getPreferredSubmitButton(page2, logs2);
        if (submitButton2) {
          await page2.waitForFunction(
            () => {
              const button = Array.from(document.querySelectorAll("button")).find(
                (node) => /submit-button|send|generate/i.test(
                  node.className || ""
                )
              );
              return !!button && !button.disabled;
            },
            { timeout: 3e4 }
          );
        }
        this.logLine(logs2, "ready", "form ready for next segment");
      }
      async submitCurrentPromptStrict(page2, logs2, promptContext2) {
        await this.dismissInterferingOverlays(page2, logs2);
        const beforeState = await this.readPromptScopeState(page2, promptContext2);
        const beforeValue2 = normalizePromptValue(beforeState?.promptValue || "");
        const submitButton2 = await this.getPreferredSubmitButton(page2, logs2);
        if (!submitButton2) throw new Error("submit button not found");
        let beforeDisabled2 = await submitButton2.isDisabled().catch(() => false);
        if (beforeDisabled2) {
          await page2.waitForFunction(
            () => {
              const button = Array.from(document.querySelectorAll("button")).find(
                (node) => /submit-button|send|generate/i.test(
                  node.className || ""
                )
              );
              return !!button && !button.disabled;
            },
            { timeout: 1e4 }
          ).catch(() => {
          });
          beforeDisabled2 = await submitButton2.isDisabled().catch(() => false);
        }
        await this.dismissInterferingOverlays(page2, logs2);
        await this.clickLocator(submitButton2, logs2, "submit");
        this.logLine(logs2, "submit", `clicked submit button (beforeDisabled=${beforeDisabled2})`);
        const confirmation = await this.confirmPromptScopeSubmission(
          page2,
          promptContext2,
          beforeState,
          4500
        );
        if (!confirmation.ok) {
          throw new Error(
            `submit not confirmed after click: signalTextKey=${confirmation.state?.signalTextKey || ""} taskIndicatorCount=${confirmation.state?.taskIndicatorCount || 0} beforeValueLength=${beforeValue2.length}`
          );
        }
        await page2.waitForTimeout(1e3);
        this.logLine(logs2, "submit", "submission accepted");
      }
      async waitUntilFormReadyStrict(page, logs, promptContext) {
        const readyResult = await page.evaluate(
          (source) => eval(source),
          buildWaitForPromptScopeReadyScript(promptContext.textboxIndex, 3e4)
        ).catch((error) => ({
          ok: false,
          step: error instanceof Error ? error.message : String(error)
        }));
        if (!readyResult?.ok) {
          throw new Error(`form not ready: ${readyResult?.step || "unknown"}`);
        }
        this.logLine(logs, "ready", "form ready for next segment");
      }
      async resetPageForNextSegment(page2, url, logs2) {
        this.logLine(logs2, "navigate", `reset ${url}`);
        await page2.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 6e4
        });
        await page2.waitForLoadState("domcontentloaded");
        await page2.waitForTimeout(1500);
      }
      async prepareSingleSegment(page2, model, duration, aspectRatio, segment, logs2, waitForReadyAfterSubmit = true) {
        await this.ensureVideoGeneratorMode(page2, logs2);
        await this.ensureFullReference(page2, logs2).catch((error) => {
          this.logLine(logs2, "reference", `skip full reference: ${error instanceof Error ? error.message : String(error)}`);
        });
        await this.chooseModel(page2, model, logs2);
        await this.chooseDuration(page2, duration, logs2);
        await this.ensureAspectRatio(page2, aspectRatio, logs2);
        const promptContext2 = await this.locatePromptContextViaScript(page2, logs2);
        const uploadedCount = await this.uploadRefs(page2, segment.refs, logs2, promptContext2);
        const promptLength = await this.fillPrompt(page2, segment.prompt, logs2, promptContext2);
        await this.submitCurrentPromptStrict(page2, logs2, promptContext2);
        if (waitForReadyAfterSubmit) {
          await this.waitUntilFormReadyStrict(page2, logs2, promptContext2);
        }
        return {
          segmentKey: segment.segmentKey,
          ok: true,
          uploadedCount,
          promptLength
        };
      }
      async prepareSegment(params) {
        const logs2 = [];
        try {
          const page2 = await this.ensureContext(
            params.url,
            params.headless ?? true,
            logs2
          );
          await page2.bringToFront().catch(() => {
          });
          await page2.waitForLoadState("domcontentloaded");
          await this.ensureVideoGeneratorMode(page2, logs2);
          await this.ensureFullReference(page2, logs2).catch((error) => {
            this.logLine(logs2, "reference", `skip full reference: ${error instanceof Error ? error.message : String(error)}`);
          });
          await this.chooseModel(page2, params.model, logs2);
          await this.chooseDuration(page2, params.duration, logs2);
          await this.ensureAspectRatio(page2, params.aspectRatio || "16:9", logs2);
          const promptContext2 = await this.locatePromptContextViaScript(page2, logs2);
          const uploadedCount = await this.uploadRefs(page2, params.refs, logs2, promptContext2);
          const promptLength = await this.fillPrompt(page2, params.prompt, logs2, promptContext2);
          await this.submitCurrentPromptStrict(page2, logs2, promptContext2);
          const selections = await this.readSelections(page2);
          const screenshot = await page2.screenshot({ type: "png" });
          return {
            ok: true,
            logs: logs2,
            currentModel: selections.currentModel,
            currentDuration: selections.currentDuration,
            uploadedCount,
            promptLength,
            screenshotBase64: screenshot.toString("base64")
          };
        } catch (error) {
          let screenshotBase64;
          try {
            if (this.page && !this.page.isClosed()) {
              screenshotBase64 = (await this.page.screenshot({ type: "png" })).toString("base64");
            }
          } catch {
          }
          return {
            ok: false,
            logs: logs2,
            screenshotBase64,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
      async runSegments(params) {
        const logs2 = [];
        const segmentResults = [];
        try {
          const page2 = await this.ensureContext(
            params.url,
            params.headless ?? true,
            logs2
          );
          await page2.bringToFront().catch(() => {
          });
          await page2.waitForLoadState("domcontentloaded");
          for (const segment of params.segments) {
            this.logLine(logs2, "segment", `start ${segment.segmentKey}`);
            try {
              const result2 = await this.prepareSingleSegment(
                page2,
                params.model,
                params.duration,
                params.aspectRatio || "16:9",
                segment,
                logs2,
                false
              );
              segmentResults.push(result2);
              this.logLine(logs2, "segment", `done ${segment.segmentKey}`);
              if (segment !== params.segments[params.segments.length - 1]) {
                await this.resetPageForNextSegment(page2, params.url, logs2);
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              segmentResults.push({
                segmentKey: segment.segmentKey,
                ok: false,
                error: message
              });
              throw new Error(`segment ${segment.segmentKey}: ${message}`);
            }
          }
          const selections = await this.readSelections(page2);
          const screenshot = await page2.screenshot({ type: "png" });
          return {
            ok: true,
            logs: logs2,
            currentModel: selections.currentModel,
            currentDuration: selections.currentDuration,
            screenshotBase64: screenshot.toString("base64"),
            segments: segmentResults
          };
        } catch (error) {
          let screenshotBase64;
          try {
            if (this.page && !this.page.isClosed()) {
              screenshotBase64 = (await this.page.screenshot({ type: "png" })).toString("base64");
            }
          } catch {
          }
          return {
            ok: false,
            logs: logs2,
            screenshotBase64,
            error: error instanceof Error ? error.message : String(error),
            segments: segmentResults
          };
        }
      }
      async capture() {
        try {
          if (!this.page || this.page.isClosed()) {
            return { ok: false, error: "runner page unavailable" };
          }
          const screenshot = await this.page.screenshot({ type: "png" });
          return { ok: true, base64: screenshot.toString("base64") };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
      async close() {
        if (this.context) {
          await this.context.close().catch(() => {
          });
        }
        this.context = null;
        this.page = null;
      }
    };
    reversePlaywrightRunner = new ReversePlaywrightRunner();
  }
});

// node_modules/uuid/dist/esm/stringify.js
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
var byteToHex;
var init_stringify = __esm({
  "node_modules/uuid/dist/esm/stringify.js"() {
    byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).slice(1));
    }
  }
});

// node_modules/uuid/dist/esm/rng.js
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    (0, import_crypto.randomFillSync)(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}
var import_crypto, rnds8Pool, poolPtr;
var init_rng = __esm({
  "node_modules/uuid/dist/esm/rng.js"() {
    import_crypto = require("crypto");
    rnds8Pool = new Uint8Array(256);
    poolPtr = rnds8Pool.length;
  }
});

// node_modules/uuid/dist/esm/native.js
var import_crypto2, native_default;
var init_native = __esm({
  "node_modules/uuid/dist/esm/native.js"() {
    import_crypto2 = require("crypto");
    native_default = { randomUUID: import_crypto2.randomUUID };
  }
});

// node_modules/uuid/dist/esm/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default;
var init_v4 = __esm({
  "node_modules/uuid/dist/esm/v4.js"() {
    init_native();
    init_rng();
    init_stringify();
    v4_default = v4;
  }
});

// node_modules/uuid/dist/esm/index.js
var init_esm = __esm({
  "node_modules/uuid/dist/esm/index.js"() {
    init_v4();
  }
});

// src/lib/agent/api-client.ts
function getMaxOutputTokens(model) {
  return model.toLowerCase().includes("opus") ? MAX_OUTPUT_TOKENS_THINKING : MAX_OUTPUT_TOKENS_DEFAULT;
}
function buildSystemBlocks(systemPrompt) {
  if (systemPrompt.length === 0) return "";
  if (systemPrompt.length === 1) return systemPrompt[0];
  return systemPrompt.map((s) => ({ type: "text", text: s }));
}
function buildToolsParam(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.searchHint ?? t.name,
    input_schema: t.inputSchema()
  }));
}
function buildMessagesApiUrl(baseUrl) {
  const root = String(baseUrl || "https://api.anthropic.com").replace(/\/v1beta(\/.*)?$/i, "").replace(/\/v1(\/.*)?$/i, "").replace(/\/+$/i, "");
  return `${root}/v1/messages`;
}
async function callModelAPI(opts) {
  const {
    messages,
    systemPrompt,
    model,
    tools,
    thinkingConfig,
    maxTokens,
    apiKey,
    baseUrl
  } = opts;
  const effectiveMaxTokens = maxTokens ?? getMaxOutputTokens(model);
  const systemBlock = buildSystemBlocks(systemPrompt);
  const toolsParam = tools.length > 0 ? buildToolsParam(tools) : void 0;
  const requestParams = {
    model,
    max_tokens: effectiveMaxTokens,
    messages,
    ...systemBlock ? { system: systemBlock } : {},
    ...toolsParam ? { tools: toolsParam } : {},
    ...thinkingConfig ? { thinking: thinkingConfig } : {}
  };
  const response = await fetch(buildMessagesApiUrl(baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestParams)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Model ${model} failed (${response.status}): ${text.slice(0, 300) || response.statusText}`
    );
  }
  const parsed = await response.json();
  const contentBlocks = parsed.content.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text };
    if (block.type === "tool_use") {
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input
      };
    }
    if (block.type === "thinking") {
      return { type: "thinking", thinking: block.thinking };
    }
    return { type: "text", text: "" };
  });
  const usage = {
    inputTokens: parsed.usage.input_tokens,
    outputTokens: parsed.usage.output_tokens,
    cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: parsed.usage.cache_read_input_tokens ?? 0
  };
  return {
    type: "assistant",
    uuid: v4_default(),
    message: {
      role: "assistant",
      content: contentBlocks,
      model: parsed.model,
      stop_reason: parsed.stop_reason ?? "end_turn",
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_creation_input_tokens: usage.cacheCreationInputTokens,
        cache_read_input_tokens: usage.cacheReadInputTokens
      }
    }
  };
}
function toAPIMessages(messages) {
  const result2 = [];
  for (const msg of messages) {
    if (msg.type === "user" || msg.type === "assistant") {
      const content = msg.message.content;
      if (typeof content === "string") {
        result2.push({ role: msg.message.role, content });
      } else {
        const blocks = content.filter((b) => b.type !== "thinking");
        if (blocks.length > 0) {
          result2.push({
            role: msg.message.role,
            content: blocks
          });
        }
      }
    }
  }
  return result2;
}
var MAX_OUTPUT_TOKENS_DEFAULT, MAX_OUTPUT_TOKENS_THINKING;
var init_api_client = __esm({
  "src/lib/agent/api-client.ts"() {
    init_esm();
    MAX_OUTPUT_TOKENS_DEFAULT = 16384;
    MAX_OUTPUT_TOKENS_THINKING = 32768;
  }
});

// src/lib/agent/retry.ts
function isRetryable(error) {
  const msg = String(error).toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function withRetry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt >= maxRetries) {
        throw err;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * delay * 0.1;
      await sleep(delay + jitter);
    }
  }
  throw lastError;
}
var DEFAULT_MAX_RETRIES, DEFAULT_BASE_DELAY_MS, DEFAULT_MAX_DELAY_MS, RETRYABLE_PATTERNS;
var init_retry = __esm({
  "src/lib/agent/retry.ts"() {
    DEFAULT_MAX_RETRIES = 3;
    DEFAULT_BASE_DELAY_MS = 1e3;
    DEFAULT_MAX_DELAY_MS = 3e4;
    RETRYABLE_PATTERNS = [
      "rate limit",
      "overloaded",
      "529",
      "503",
      "502",
      "timeout",
      "connection"
    ];
  }
});

// src/lib/agent/tool.ts
function findToolByName(tools, name) {
  return tools.find((t) => t.name === name || (t.aliases ?? []).includes(name));
}
var ToolUseContext;
var init_tool = __esm({
  "src/lib/agent/tool.ts"() {
    ToolUseContext = class {
      options;
      abortSignal;
      readFileState;
      messages;
      getAppState;
      setAppState;
      constructor(opts) {
        this.options = opts.options;
        this.abortSignal = opts.abortSignal;
        this.readFileState = opts.readFileState ?? /* @__PURE__ */ new Map();
        this.messages = opts.messages ?? [];
        this.getAppState = opts.getAppState;
        this.setAppState = opts.setAppState;
      }
    };
  }
});

// src/lib/agent/query-loop.ts
async function* queryLoop(params) {
  const { systemPrompt, canUseTool, toolUseContext, maxTurns, apiKey, baseUrl } = params;
  const model = toolUseContext.options.model;
  const tools = toolUseContext.options.tools;
  const state = {
    messages: [...params.messages],
    turnCount: 1
  };
  while (true) {
    if (toolUseContext.abortSignal?.aborted) return;
    yield { type: "stream_request_start" };
    const apiMessages = toAPIMessages(state.messages);
    let assistantMsg;
    try {
      assistantMsg = await withRetry(
        () => callModelAPI({
          messages: apiMessages,
          systemPrompt,
          model,
          tools,
          thinkingConfig: toolUseContext.options.thinkingConfig,
          apiKey,
          baseUrl
        })
      );
    } catch (err) {
      const errorMsg = {
        type: "assistant",
        uuid: v4_default(),
        isApiErrorMessage: true,
        message: {
          role: "assistant",
          content: [{ type: "text", text: String(err) }],
          stop_reason: "end_turn"
        }
      };
      yield errorMsg;
      return;
    }
    state.messages.push(assistantMsg);
    yield assistantMsg;
    if (toolUseContext.abortSignal?.aborted) return;
    const content = assistantMsg.message.content;
    const toolUseBlocks = Array.isArray(content) ? content.filter((b) => b.type === "tool_use") : [];
    if (toolUseBlocks.length === 0) {
      return;
    }
    const toolResultBlocks = [];
    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const { id: toolUseId, name: toolName, input } = block;
      const toolInput = input;
      const tool = findToolByName(tools, toolName);
      if (!tool) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUseId,
          content: `Tool "${toolName}" not found`,
          is_error: true
        });
        continue;
      }
      if (canUseTool) {
        const perm = await canUseTool(
          tool,
          toolInput,
          toolUseContext,
          assistantMsg,
          toolUseId
        );
        if (perm.behavior === "deny") {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: perm.message ?? "Permission denied",
            is_error: true
          });
          continue;
        }
      }
      try {
        const result2 = await tool.call(
          toolInput,
          toolUseContext,
          canUseTool ?? defaultAllowAll,
          assistantMsg
        );
        const resultBlock = tool.mapToolResultToBlock(result2.data, toolUseId);
        toolResultBlocks.push(resultBlock);
        if (result2.contextModifier) {
          Object.assign(toolUseContext, result2.contextModifier(toolUseContext));
        }
      } catch (err) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUseId,
          content: `Error: ${String(err)}`,
          is_error: true
        });
      }
      if (toolUseContext.abortSignal?.aborted) return;
    }
    const toolResultMsg = {
      type: "user",
      uuid: v4_default(),
      message: {
        role: "user",
        content: toolResultBlocks
      },
      sourceToolAssistantUuid: assistantMsg.uuid
    };
    state.messages.push(toolResultMsg);
    yield toolResultMsg;
    state.turnCount++;
    if (maxTurns != null && state.turnCount > maxTurns) {
      return;
    }
  }
}
async function defaultAllowAll(_tool, _input) {
  return { behavior: "allow" };
}
var init_query_loop = __esm({
  "src/lib/agent/query-loop.ts"() {
    init_esm();
    init_api_client();
    init_retry();
    init_tool();
  }
});

// src/lib/agent/types.ts
function accumulateUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: (a.cacheCreationInputTokens ?? 0) + (b.cacheCreationInputTokens ?? 0),
    cacheReadInputTokens: (a.cacheReadInputTokens ?? 0) + (b.cacheReadInputTokens ?? 0)
  };
}
var EMPTY_USAGE;
var init_types = __esm({
  "src/lib/agent/types.ts"() {
    EMPTY_USAGE = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0
    };
  }
});

// src/lib/agent/query-engine.ts
var query_engine_exports = {};
__export(query_engine_exports, {
  QueryEngine: () => QueryEngine
});
var QueryEngine;
var init_query_engine = __esm({
  "src/lib/agent/query-engine.ts"() {
    init_esm();
    init_query_loop();
    init_tool();
    init_types();
    QueryEngine = class {
      config;
      messages;
      abortController;
      totalUsage;
      totalCostUsd;
      constructor(config) {
        this.config = config;
        this.messages = [...config.initialMessages ?? []];
        this.abortController = new AbortController();
        this.totalUsage = { ...EMPTY_USAGE };
        this.totalCostUsd = 0;
      }
      async *submitMessage(prompt2, opts = {}) {
        const cfg = this.config;
        const model = cfg.model ?? "claude-sonnet-4-6";
        const tools = cfg.tools ?? [];
        const sessionId = v4_default();
        const startTime = Date.now();
        this.abortController = new AbortController();
        const systemParts = [];
        if (cfg.systemPrompt) systemParts.push(cfg.systemPrompt);
        if (cfg.appendSystemPrompt) systemParts.push(cfg.appendSystemPrompt);
        const userMsg = {
          type: "user",
          uuid: opts.uuid ?? v4_default(),
          isMeta: opts.isMeta,
          message: {
            role: "user",
            content: typeof prompt2 === "string" ? prompt2 : JSON.stringify(prompt2)
          }
        };
        this.messages.push(userMsg);
        yield {
          type: "system",
          subtype: "init",
          sessionId,
          tools: tools.map((t) => t.name),
          model
        };
        const context = new ToolUseContext({
          options: {
            model,
            tools,
            maxBudgetUsd: cfg.maxBudgetUsd,
            customSystemPrompt: cfg.systemPrompt,
            appendSystemPrompt: cfg.appendSystemPrompt
          },
          abortSignal: this.abortController.signal,
          messages: [...this.messages],
          getAppState: cfg.getAppState,
          setAppState: cfg.setAppState
        });
        let turnCount = 1;
        let lastStopReason;
        try {
          for await (const event of queryLoop({
            messages: [...this.messages],
            systemPrompt: systemParts,
            canUseTool: cfg.canUseTool,
            toolUseContext: context,
            maxTurns: cfg.maxTurns,
            apiKey: cfg.apiKey,
            baseUrl: cfg.baseUrl
          })) {
            if (event.type === "stream_request_start") continue;
            if (event.type === "assistant") {
              this.messages.push(event);
              const msg = event;
              const content = msg.message.content;
              if (Array.isArray(content)) {
                const last = content[content.length - 1];
                if (last?.type === "text") lastStopReason = msg.message.stop_reason;
                if (msg.message.usage) {
                  this.totalUsage = accumulateUsage(this.totalUsage, {
                    inputTokens: msg.message.usage.input_tokens ?? 0,
                    outputTokens: msg.message.usage.output_tokens ?? 0,
                    cacheCreationInputTokens: msg.message.usage.cache_creation_input_tokens ?? 0,
                    cacheReadInputTokens: msg.message.usage.cache_read_input_tokens ?? 0
                  });
                }
              }
              yield {
                type: "assistant",
                uuid: msg.uuid,
                sessionId,
                message: msg
              };
            } else if (event.type === "user") {
              const msg = event;
              this.messages.push(msg);
              turnCount++;
              yield {
                type: "user",
                uuid: msg.uuid,
                sessionId,
                message: msg
              };
            } else if (event.type === "progress") {
              yield {
                type: "progress",
                uuid: event.uuid ?? v4_default(),
                sessionId,
                message: event
              };
            }
            if (cfg.maxBudgetUsd != null && this.totalCostUsd >= cfg.maxBudgetUsd) {
              yield {
                type: "result",
                subtype: "error_max_budget_usd",
                isError: true,
                durationMs: Date.now() - startTime,
                numTurns: turnCount,
                sessionId,
                totalCostUsd: this.totalCostUsd,
                usage: { ...this.totalUsage },
                uuid: v4_default()
              };
              return;
            }
          }
        } catch (err) {
          yield {
            type: "result",
            subtype: "success",
            isError: true,
            durationMs: Date.now() - startTime,
            numTurns: turnCount,
            result: String(err),
            sessionId,
            totalCostUsd: this.totalCostUsd,
            usage: { ...this.totalUsage },
            uuid: v4_default()
          };
          return;
        }
        let textResult = "";
        for (let i = this.messages.length - 1; i >= 0; i--) {
          const msg = this.messages[i];
          if (msg.type === "assistant") {
            const content = msg.message.content;
            if (Array.isArray(content)) {
              const last = content[content.length - 1];
              if (last?.type === "text") textResult = last.text;
            }
            break;
          }
        }
        yield {
          type: "result",
          subtype: "success",
          isError: false,
          durationMs: Date.now() - startTime,
          numTurns: turnCount,
          result: textResult,
          stopReason: lastStopReason,
          sessionId,
          totalCostUsd: this.totalCostUsd,
          usage: { ...this.totalUsage },
          uuid: v4_default()
        };
      }
      /** Abort the current query. */
      interrupt() {
        this.abortController.abort();
      }
      /** Return a copy of the conversation history. */
      getMessages() {
        return [...this.messages];
      }
      /** Switch the model for subsequent messages. */
      setModel(model) {
        this.config.model = model;
      }
    };
  }
});

// node_modules/fast-glob/out/utils/array.js
var require_array = __commonJS({
  "node_modules/fast-glob/out/utils/array.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.splitWhen = exports2.flatten = void 0;
    function flatten(items) {
      return items.reduce((collection, item) => [].concat(collection, item), []);
    }
    exports2.flatten = flatten;
    function splitWhen(items, predicate) {
      const result2 = [[]];
      let groupIndex = 0;
      for (const item of items) {
        if (predicate(item)) {
          groupIndex++;
          result2[groupIndex] = [];
        } else {
          result2[groupIndex].push(item);
        }
      }
      return result2;
    }
    exports2.splitWhen = splitWhen;
  }
});

// node_modules/fast-glob/out/utils/errno.js
var require_errno = __commonJS({
  "node_modules/fast-glob/out/utils/errno.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isEnoentCodeError = void 0;
    function isEnoentCodeError(error) {
      return error.code === "ENOENT";
    }
    exports2.isEnoentCodeError = isEnoentCodeError;
  }
});

// node_modules/fast-glob/out/utils/fs.js
var require_fs = __commonJS({
  "node_modules/fast-glob/out/utils/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports2.createDirentFromStats = createDirentFromStats;
  }
});

// node_modules/fast-glob/out/utils/path.js
var require_path = __commonJS({
  "node_modules/fast-glob/out/utils/path.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.convertPosixPathToPattern = exports2.convertWindowsPathToPattern = exports2.convertPathToPattern = exports2.escapePosixPath = exports2.escapeWindowsPath = exports2.escape = exports2.removeLeadingDotSegment = exports2.makeAbsolute = exports2.unixify = void 0;
    var os = require("os");
    var path3 = require("path");
    var IS_WINDOWS_PLATFORM = os.platform() === "win32";
    var LEADING_DOT_SEGMENT_CHARACTERS_COUNT = 2;
    var POSIX_UNESCAPED_GLOB_SYMBOLS_RE = /(\\?)([()*?[\]{|}]|^!|[!+@](?=\()|\\(?![!()*+?@[\]{|}]))/g;
    var WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE = /(\\?)([()[\]{}]|^!|[!+@](?=\())/g;
    var DOS_DEVICE_PATH_RE = /^\\\\([.?])/;
    var WINDOWS_BACKSLASHES_RE = /\\(?![!()+@[\]{}])/g;
    function unixify(filepath) {
      return filepath.replace(/\\/g, "/");
    }
    exports2.unixify = unixify;
    function makeAbsolute(cwd, filepath) {
      return path3.resolve(cwd, filepath);
    }
    exports2.makeAbsolute = makeAbsolute;
    function removeLeadingDotSegment(entry) {
      if (entry.charAt(0) === ".") {
        const secondCharactery = entry.charAt(1);
        if (secondCharactery === "/" || secondCharactery === "\\") {
          return entry.slice(LEADING_DOT_SEGMENT_CHARACTERS_COUNT);
        }
      }
      return entry;
    }
    exports2.removeLeadingDotSegment = removeLeadingDotSegment;
    exports2.escape = IS_WINDOWS_PLATFORM ? escapeWindowsPath : escapePosixPath;
    function escapeWindowsPath(pattern) {
      return pattern.replace(WINDOWS_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports2.escapeWindowsPath = escapeWindowsPath;
    function escapePosixPath(pattern) {
      return pattern.replace(POSIX_UNESCAPED_GLOB_SYMBOLS_RE, "\\$2");
    }
    exports2.escapePosixPath = escapePosixPath;
    exports2.convertPathToPattern = IS_WINDOWS_PLATFORM ? convertWindowsPathToPattern : convertPosixPathToPattern;
    function convertWindowsPathToPattern(filepath) {
      return escapeWindowsPath(filepath).replace(DOS_DEVICE_PATH_RE, "//$1").replace(WINDOWS_BACKSLASHES_RE, "/");
    }
    exports2.convertWindowsPathToPattern = convertWindowsPathToPattern;
    function convertPosixPathToPattern(filepath) {
      return escapePosixPath(filepath);
    }
    exports2.convertPosixPathToPattern = convertPosixPathToPattern;
  }
});

// node_modules/is-extglob/index.js
var require_is_extglob = __commonJS({
  "node_modules/is-extglob/index.js"(exports2, module2) {
    module2.exports = function isExtglob(str) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      var match;
      while (match = /(\\).|([@?!+*]\(.*\))/g.exec(str)) {
        if (match[2]) return true;
        str = str.slice(match.index + match[0].length);
      }
      return false;
    };
  }
});

// node_modules/is-glob/index.js
var require_is_glob = __commonJS({
  "node_modules/is-glob/index.js"(exports2, module2) {
    var isExtglob = require_is_extglob();
    var chars = { "{": "}", "(": ")", "[": "]" };
    var strictCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      var pipeIndex = -2;
      var closeSquareIndex = -2;
      var closeCurlyIndex = -2;
      var closeParenIndex = -2;
      var backSlashIndex = -2;
      while (index < str.length) {
        if (str[index] === "*") {
          return true;
        }
        if (str[index + 1] === "?" && /[\].+)]/.test(str[index])) {
          return true;
        }
        if (closeSquareIndex !== -1 && str[index] === "[" && str[index + 1] !== "]") {
          if (closeSquareIndex < index) {
            closeSquareIndex = str.indexOf("]", index);
          }
          if (closeSquareIndex > index) {
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeSquareIndex) {
              return true;
            }
          }
        }
        if (closeCurlyIndex !== -1 && str[index] === "{" && str[index + 1] !== "}") {
          closeCurlyIndex = str.indexOf("}", index);
          if (closeCurlyIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeCurlyIndex) {
              return true;
            }
          }
        }
        if (closeParenIndex !== -1 && str[index] === "(" && str[index + 1] === "?" && /[:!=]/.test(str[index + 2]) && str[index + 3] !== ")") {
          closeParenIndex = str.indexOf(")", index);
          if (closeParenIndex > index) {
            backSlashIndex = str.indexOf("\\", index);
            if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
              return true;
            }
          }
        }
        if (pipeIndex !== -1 && str[index] === "(" && str[index + 1] !== "|") {
          if (pipeIndex < index) {
            pipeIndex = str.indexOf("|", index);
          }
          if (pipeIndex !== -1 && str[pipeIndex + 1] !== ")") {
            closeParenIndex = str.indexOf(")", pipeIndex);
            if (closeParenIndex > pipeIndex) {
              backSlashIndex = str.indexOf("\\", pipeIndex);
              if (backSlashIndex === -1 || backSlashIndex > closeParenIndex) {
                return true;
              }
            }
          }
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    var relaxedCheck = function(str) {
      if (str[0] === "!") {
        return true;
      }
      var index = 0;
      while (index < str.length) {
        if (/[*?{}()[\]]/.test(str[index])) {
          return true;
        }
        if (str[index] === "\\") {
          var open = str[index + 1];
          index += 2;
          var close = chars[open];
          if (close) {
            var n = str.indexOf(close, index);
            if (n !== -1) {
              index = n + 1;
            }
          }
          if (str[index] === "!") {
            return true;
          }
        } else {
          index++;
        }
      }
      return false;
    };
    module2.exports = function isGlob(str, options) {
      if (typeof str !== "string" || str === "") {
        return false;
      }
      if (isExtglob(str)) {
        return true;
      }
      var check = strictCheck;
      if (options && options.strict === false) {
        check = relaxedCheck;
      }
      return check(str);
    };
  }
});

// node_modules/fast-glob/node_modules/glob-parent/index.js
var require_glob_parent = __commonJS({
  "node_modules/fast-glob/node_modules/glob-parent/index.js"(exports2, module2) {
    "use strict";
    var isGlob = require_is_glob();
    var pathPosixDirname = require("path").posix.dirname;
    var isWin32 = require("os").platform() === "win32";
    var slash = "/";
    var backslash = /\\/g;
    var enclosure = /[\{\[].*[\}\]]$/;
    var globby = /(^|[^\\])([\{\[]|\([^\)]+$)/;
    var escaped = /\\([\!\*\?\|\[\]\(\)\{\}])/g;
    module2.exports = function globParent(str, opts) {
      var options = Object.assign({ flipBackslashes: true }, opts);
      if (options.flipBackslashes && isWin32 && str.indexOf(slash) < 0) {
        str = str.replace(backslash, slash);
      }
      if (enclosure.test(str)) {
        str += slash;
      }
      str += "a";
      do {
        str = pathPosixDirname(str);
      } while (isGlob(str) || globby.test(str));
      return str.replace(escaped, "$1");
    };
  }
});

// node_modules/braces/lib/utils.js
var require_utils = __commonJS({
  "node_modules/braces/lib/utils.js"(exports2) {
    "use strict";
    exports2.isInteger = (num) => {
      if (typeof num === "number") {
        return Number.isInteger(num);
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isInteger(Number(num));
      }
      return false;
    };
    exports2.find = (node, type) => node.nodes.find((node2) => node2.type === type);
    exports2.exceedsLimit = (min, max, step = 1, limit) => {
      if (limit === false) return false;
      if (!exports2.isInteger(min) || !exports2.isInteger(max)) return false;
      return (Number(max) - Number(min)) / Number(step) >= limit;
    };
    exports2.escapeNode = (block, n = 0, type) => {
      const node = block.nodes[n];
      if (!node) return;
      if (type && node.type === type || node.type === "open" || node.type === "close") {
        if (node.escaped !== true) {
          node.value = "\\" + node.value;
          node.escaped = true;
        }
      }
    };
    exports2.encloseBrace = (node) => {
      if (node.type !== "brace") return false;
      if (node.commas >> 0 + node.ranges >> 0 === 0) {
        node.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isInvalidBrace = (block) => {
      if (block.type !== "brace") return false;
      if (block.invalid === true || block.dollar) return true;
      if (block.commas >> 0 + block.ranges >> 0 === 0) {
        block.invalid = true;
        return true;
      }
      if (block.open !== true || block.close !== true) {
        block.invalid = true;
        return true;
      }
      return false;
    };
    exports2.isOpenOrClose = (node) => {
      if (node.type === "open" || node.type === "close") {
        return true;
      }
      return node.open === true || node.close === true;
    };
    exports2.reduce = (nodes) => nodes.reduce((acc, node) => {
      if (node.type === "text") acc.push(node.value);
      if (node.type === "range") node.type = "text";
      return acc;
    }, []);
    exports2.flatten = (...args) => {
      const result2 = [];
      const flat = (arr) => {
        for (let i = 0; i < arr.length; i++) {
          const ele = arr[i];
          if (Array.isArray(ele)) {
            flat(ele);
            continue;
          }
          if (ele !== void 0) {
            result2.push(ele);
          }
        }
        return result2;
      };
      flat(args);
      return result2;
    };
  }
});

// node_modules/braces/lib/stringify.js
var require_stringify = __commonJS({
  "node_modules/braces/lib/stringify.js"(exports2, module2) {
    "use strict";
    var utils = require_utils();
    module2.exports = (ast, options = {}) => {
      const stringify = (node, parent = {}) => {
        const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        let output = "";
        if (node.value) {
          if ((invalidBlock || invalidNode) && utils.isOpenOrClose(node)) {
            return "\\" + node.value;
          }
          return node.value;
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += stringify(child);
          }
        }
        return output;
      };
      return stringify(ast);
    };
  }
});

// node_modules/is-number/index.js
var require_is_number = __commonJS({
  "node_modules/is-number/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function(num) {
      if (typeof num === "number") {
        return num - num === 0;
      }
      if (typeof num === "string" && num.trim() !== "") {
        return Number.isFinite ? Number.isFinite(+num) : isFinite(+num);
      }
      return false;
    };
  }
});

// node_modules/to-regex-range/index.js
var require_to_regex_range = __commonJS({
  "node_modules/to-regex-range/index.js"(exports2, module2) {
    "use strict";
    var isNumber = require_is_number();
    var toRegexRange = (min, max, options) => {
      if (isNumber(min) === false) {
        throw new TypeError("toRegexRange: expected the first argument to be a number");
      }
      if (max === void 0 || min === max) {
        return String(min);
      }
      if (isNumber(max) === false) {
        throw new TypeError("toRegexRange: expected the second argument to be a number.");
      }
      let opts = { relaxZeros: true, ...options };
      if (typeof opts.strictZeros === "boolean") {
        opts.relaxZeros = opts.strictZeros === false;
      }
      let relax = String(opts.relaxZeros);
      let shorthand = String(opts.shorthand);
      let capture = String(opts.capture);
      let wrap = String(opts.wrap);
      let cacheKey = min + ":" + max + "=" + relax + shorthand + capture + wrap;
      if (toRegexRange.cache.hasOwnProperty(cacheKey)) {
        return toRegexRange.cache[cacheKey].result;
      }
      let a = Math.min(min, max);
      let b = Math.max(min, max);
      if (Math.abs(a - b) === 1) {
        let result2 = min + "|" + max;
        if (opts.capture) {
          return `(${result2})`;
        }
        if (opts.wrap === false) {
          return result2;
        }
        return `(?:${result2})`;
      }
      let isPadded = hasPadding(min) || hasPadding(max);
      let state = { min, max, a, b };
      let positives = [];
      let negatives = [];
      if (isPadded) {
        state.isPadded = isPadded;
        state.maxLen = String(state.max).length;
      }
      if (a < 0) {
        let newMin = b < 0 ? Math.abs(b) : 1;
        negatives = splitToPatterns(newMin, Math.abs(a), state, opts);
        a = state.a = 0;
      }
      if (b >= 0) {
        positives = splitToPatterns(a, b, state, opts);
      }
      state.negatives = negatives;
      state.positives = positives;
      state.result = collatePatterns(negatives, positives, opts);
      if (opts.capture === true) {
        state.result = `(${state.result})`;
      } else if (opts.wrap !== false && positives.length + negatives.length > 1) {
        state.result = `(?:${state.result})`;
      }
      toRegexRange.cache[cacheKey] = state;
      return state.result;
    };
    function collatePatterns(neg, pos, options) {
      let onlyNegative = filterPatterns(neg, pos, "-", false, options) || [];
      let onlyPositive = filterPatterns(pos, neg, "", false, options) || [];
      let intersected = filterPatterns(neg, pos, "-?", true, options) || [];
      let subpatterns = onlyNegative.concat(intersected).concat(onlyPositive);
      return subpatterns.join("|");
    }
    function splitToRanges(min, max) {
      let nines = 1;
      let zeros = 1;
      let stop = countNines(min, nines);
      let stops = /* @__PURE__ */ new Set([max]);
      while (min <= stop && stop <= max) {
        stops.add(stop);
        nines += 1;
        stop = countNines(min, nines);
      }
      stop = countZeros(max + 1, zeros) - 1;
      while (min < stop && stop <= max) {
        stops.add(stop);
        zeros += 1;
        stop = countZeros(max + 1, zeros) - 1;
      }
      stops = [...stops];
      stops.sort(compare);
      return stops;
    }
    function rangeToPattern(start, stop, options) {
      if (start === stop) {
        return { pattern: start, count: [], digits: 0 };
      }
      let zipped = zip(start, stop);
      let digits = zipped.length;
      let pattern = "";
      let count = 0;
      for (let i = 0; i < digits; i++) {
        let [startDigit, stopDigit] = zipped[i];
        if (startDigit === stopDigit) {
          pattern += startDigit;
        } else if (startDigit !== "0" || stopDigit !== "9") {
          pattern += toCharacterClass(startDigit, stopDigit, options);
        } else {
          count++;
        }
      }
      if (count) {
        pattern += options.shorthand === true ? "\\d" : "[0-9]";
      }
      return { pattern, count: [count], digits };
    }
    function splitToPatterns(min, max, tok, options) {
      let ranges = splitToRanges(min, max);
      let tokens = [];
      let start = min;
      let prev;
      for (let i = 0; i < ranges.length; i++) {
        let max2 = ranges[i];
        let obj = rangeToPattern(String(start), String(max2), options);
        let zeros = "";
        if (!tok.isPadded && prev && prev.pattern === obj.pattern) {
          if (prev.count.length > 1) {
            prev.count.pop();
          }
          prev.count.push(obj.count[0]);
          prev.string = prev.pattern + toQuantifier(prev.count);
          start = max2 + 1;
          continue;
        }
        if (tok.isPadded) {
          zeros = padZeros(max2, tok, options);
        }
        obj.string = zeros + obj.pattern + toQuantifier(obj.count);
        tokens.push(obj);
        start = max2 + 1;
        prev = obj;
      }
      return tokens;
    }
    function filterPatterns(arr, comparison, prefix, intersection, options) {
      let result2 = [];
      for (let ele of arr) {
        let { string } = ele;
        if (!intersection && !contains(comparison, "string", string)) {
          result2.push(prefix + string);
        }
        if (intersection && contains(comparison, "string", string)) {
          result2.push(prefix + string);
        }
      }
      return result2;
    }
    function zip(a, b) {
      let arr = [];
      for (let i = 0; i < a.length; i++) arr.push([a[i], b[i]]);
      return arr;
    }
    function compare(a, b) {
      return a > b ? 1 : b > a ? -1 : 0;
    }
    function contains(arr, key, val) {
      return arr.some((ele) => ele[key] === val);
    }
    function countNines(min, len) {
      return Number(String(min).slice(0, -len) + "9".repeat(len));
    }
    function countZeros(integer, zeros) {
      return integer - integer % Math.pow(10, zeros);
    }
    function toQuantifier(digits) {
      let [start = 0, stop = ""] = digits;
      if (stop || start > 1) {
        return `{${start + (stop ? "," + stop : "")}}`;
      }
      return "";
    }
    function toCharacterClass(a, b, options) {
      return `[${a}${b - a === 1 ? "" : "-"}${b}]`;
    }
    function hasPadding(str) {
      return /^-?(0+)\d/.test(str);
    }
    function padZeros(value, tok, options) {
      if (!tok.isPadded) {
        return value;
      }
      let diff = Math.abs(tok.maxLen - String(value).length);
      let relax = options.relaxZeros !== false;
      switch (diff) {
        case 0:
          return "";
        case 1:
          return relax ? "0?" : "0";
        case 2:
          return relax ? "0{0,2}" : "00";
        default: {
          return relax ? `0{0,${diff}}` : `0{${diff}}`;
        }
      }
    }
    toRegexRange.cache = {};
    toRegexRange.clearCache = () => toRegexRange.cache = {};
    module2.exports = toRegexRange;
  }
});

// node_modules/fill-range/index.js
var require_fill_range = __commonJS({
  "node_modules/fill-range/index.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var toRegexRange = require_to_regex_range();
    var isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    var transform = (toNumber) => {
      return (value) => toNumber === true ? Number(value) : String(value);
    };
    var isValidValue = (value) => {
      return typeof value === "number" || typeof value === "string" && value !== "";
    };
    var isNumber = (num) => Number.isInteger(+num);
    var zeros = (input) => {
      let value = `${input}`;
      let index = -1;
      if (value[0] === "-") value = value.slice(1);
      if (value === "0") return false;
      while (value[++index] === "0") ;
      return index > 0;
    };
    var stringify = (start, end, options) => {
      if (typeof start === "string" || typeof end === "string") {
        return true;
      }
      return options.stringify === true;
    };
    var pad = (input, maxLength, toNumber) => {
      if (maxLength > 0) {
        let dash = input[0] === "-" ? "-" : "";
        if (dash) input = input.slice(1);
        input = dash + input.padStart(dash ? maxLength - 1 : maxLength, "0");
      }
      if (toNumber === false) {
        return String(input);
      }
      return input;
    };
    var toMaxLen = (input, maxLength) => {
      let negative = input[0] === "-" ? "-" : "";
      if (negative) {
        input = input.slice(1);
        maxLength--;
      }
      while (input.length < maxLength) input = "0" + input;
      return negative ? "-" + input : input;
    };
    var toSequence = (parts, options, maxLen) => {
      parts.negatives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      parts.positives.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      let prefix = options.capture ? "" : "?:";
      let positives = "";
      let negatives = "";
      let result2;
      if (parts.positives.length) {
        positives = parts.positives.map((v) => toMaxLen(String(v), maxLen)).join("|");
      }
      if (parts.negatives.length) {
        negatives = `-(${prefix}${parts.negatives.map((v) => toMaxLen(String(v), maxLen)).join("|")})`;
      }
      if (positives && negatives) {
        result2 = `${positives}|${negatives}`;
      } else {
        result2 = positives || negatives;
      }
      if (options.wrap) {
        return `(${prefix}${result2})`;
      }
      return result2;
    };
    var toRange = (a, b, isNumbers, options) => {
      if (isNumbers) {
        return toRegexRange(a, b, { wrap: false, ...options });
      }
      let start = String.fromCharCode(a);
      if (a === b) return start;
      let stop = String.fromCharCode(b);
      return `[${start}-${stop}]`;
    };
    var toRegex = (start, end, options) => {
      if (Array.isArray(start)) {
        let wrap = options.wrap === true;
        let prefix = options.capture ? "" : "?:";
        return wrap ? `(${prefix}${start.join("|")})` : start.join("|");
      }
      return toRegexRange(start, end, options);
    };
    var rangeError = (...args) => {
      return new RangeError("Invalid range arguments: " + util.inspect(...args));
    };
    var invalidRange = (start, end, options) => {
      if (options.strictRanges === true) throw rangeError([start, end]);
      return [];
    };
    var invalidStep = (step, options) => {
      if (options.strictRanges === true) {
        throw new TypeError(`Expected step "${step}" to be a number`);
      }
      return [];
    };
    var fillNumbers = (start, end, step = 1, options = {}) => {
      let a = Number(start);
      let b = Number(end);
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        if (options.strictRanges === true) throw rangeError([start, end]);
        return [];
      }
      if (a === 0) a = 0;
      if (b === 0) b = 0;
      let descending = a > b;
      let startString = String(start);
      let endString = String(end);
      let stepString = String(step);
      step = Math.max(Math.abs(step), 1);
      let padded = zeros(startString) || zeros(endString) || zeros(stepString);
      let maxLen = padded ? Math.max(startString.length, endString.length, stepString.length) : 0;
      let toNumber = padded === false && stringify(start, end, options) === false;
      let format = options.transform || transform(toNumber);
      if (options.toRegex && step === 1) {
        return toRange(toMaxLen(start, maxLen), toMaxLen(end, maxLen), true, options);
      }
      let parts = { negatives: [], positives: [] };
      let push = (num) => parts[num < 0 ? "negatives" : "positives"].push(Math.abs(num));
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        if (options.toRegex === true && step > 1) {
          push(a);
        } else {
          range.push(pad(format(a, index), maxLen, toNumber));
        }
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true) {
        return step > 1 ? toSequence(parts, options, maxLen) : toRegex(range, null, { wrap: false, ...options });
      }
      return range;
    };
    var fillLetters = (start, end, step = 1, options = {}) => {
      if (!isNumber(start) && start.length > 1 || !isNumber(end) && end.length > 1) {
        return invalidRange(start, end, options);
      }
      let format = options.transform || ((val) => String.fromCharCode(val));
      let a = `${start}`.charCodeAt(0);
      let b = `${end}`.charCodeAt(0);
      let descending = a > b;
      let min = Math.min(a, b);
      let max = Math.max(a, b);
      if (options.toRegex && step === 1) {
        return toRange(min, max, false, options);
      }
      let range = [];
      let index = 0;
      while (descending ? a >= b : a <= b) {
        range.push(format(a, index));
        a = descending ? a - step : a + step;
        index++;
      }
      if (options.toRegex === true) {
        return toRegex(range, null, { wrap: false, options });
      }
      return range;
    };
    var fill = (start, end, step, options = {}) => {
      if (end == null && isValidValue(start)) {
        return [start];
      }
      if (!isValidValue(start) || !isValidValue(end)) {
        return invalidRange(start, end, options);
      }
      if (typeof step === "function") {
        return fill(start, end, 1, { transform: step });
      }
      if (isObject(step)) {
        return fill(start, end, 0, step);
      }
      let opts = { ...options };
      if (opts.capture === true) opts.wrap = true;
      step = step || opts.step || 1;
      if (!isNumber(step)) {
        if (step != null && !isObject(step)) return invalidStep(step, opts);
        return fill(start, end, 1, step);
      }
      if (isNumber(start) && isNumber(end)) {
        return fillNumbers(start, end, step, opts);
      }
      return fillLetters(start, end, Math.max(Math.abs(step), 1), opts);
    };
    module2.exports = fill;
  }
});

// node_modules/braces/lib/compile.js
var require_compile = __commonJS({
  "node_modules/braces/lib/compile.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var utils = require_utils();
    var compile = (ast, options = {}) => {
      const walk = (node, parent = {}) => {
        const invalidBlock = utils.isInvalidBrace(parent);
        const invalidNode = node.invalid === true && options.escapeInvalid === true;
        const invalid = invalidBlock === true || invalidNode === true;
        const prefix = options.escapeInvalid === true ? "\\" : "";
        let output = "";
        if (node.isOpen === true) {
          return prefix + node.value;
        }
        if (node.isClose === true) {
          console.log("node.isClose", prefix, node.value);
          return prefix + node.value;
        }
        if (node.type === "open") {
          return invalid ? prefix + node.value : "(";
        }
        if (node.type === "close") {
          return invalid ? prefix + node.value : ")";
        }
        if (node.type === "comma") {
          return node.prev.type === "comma" ? "" : invalid ? node.value : "|";
        }
        if (node.value) {
          return node.value;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          const range = fill(...args, { ...options, wrap: false, toRegex: true, strictZeros: true });
          if (range.length !== 0) {
            return args.length > 1 && range.length > 1 ? `(${range})` : range;
          }
        }
        if (node.nodes) {
          for (const child of node.nodes) {
            output += walk(child, node);
          }
        }
        return output;
      };
      return walk(ast);
    };
    module2.exports = compile;
  }
});

// node_modules/braces/lib/expand.js
var require_expand = __commonJS({
  "node_modules/braces/lib/expand.js"(exports2, module2) {
    "use strict";
    var fill = require_fill_range();
    var stringify = require_stringify();
    var utils = require_utils();
    var append = (queue = "", stash = "", enclose = false) => {
      const result2 = [];
      queue = [].concat(queue);
      stash = [].concat(stash);
      if (!stash.length) return queue;
      if (!queue.length) {
        return enclose ? utils.flatten(stash).map((ele) => `{${ele}}`) : stash;
      }
      for (const item of queue) {
        if (Array.isArray(item)) {
          for (const value of item) {
            result2.push(append(value, stash, enclose));
          }
        } else {
          for (let ele of stash) {
            if (enclose === true && typeof ele === "string") ele = `{${ele}}`;
            result2.push(Array.isArray(ele) ? append(item, ele, enclose) : item + ele);
          }
        }
      }
      return utils.flatten(result2);
    };
    var expand = (ast, options = {}) => {
      const rangeLimit = options.rangeLimit === void 0 ? 1e3 : options.rangeLimit;
      const walk = (node, parent = {}) => {
        node.queue = [];
        let p = parent;
        let q2 = parent.queue;
        while (p.type !== "brace" && p.type !== "root" && p.parent) {
          p = p.parent;
          q2 = p.queue;
        }
        if (node.invalid || node.dollar) {
          q2.push(append(q2.pop(), stringify(node, options)));
          return;
        }
        if (node.type === "brace" && node.invalid !== true && node.nodes.length === 2) {
          q2.push(append(q2.pop(), ["{}"]));
          return;
        }
        if (node.nodes && node.ranges > 0) {
          const args = utils.reduce(node.nodes);
          if (utils.exceedsLimit(...args, options.step, rangeLimit)) {
            throw new RangeError("expanded array length exceeds range limit. Use options.rangeLimit to increase or disable the limit.");
          }
          let range = fill(...args, options);
          if (range.length === 0) {
            range = stringify(node, options);
          }
          q2.push(append(q2.pop(), range));
          node.nodes = [];
          return;
        }
        const enclose = utils.encloseBrace(node);
        let queue = node.queue;
        let block = node;
        while (block.type !== "brace" && block.type !== "root" && block.parent) {
          block = block.parent;
          queue = block.queue;
        }
        for (let i = 0; i < node.nodes.length; i++) {
          const child = node.nodes[i];
          if (child.type === "comma" && node.type === "brace") {
            if (i === 1) queue.push("");
            queue.push("");
            continue;
          }
          if (child.type === "close") {
            q2.push(append(q2.pop(), queue, enclose));
            continue;
          }
          if (child.value && child.type !== "open") {
            queue.push(append(queue.pop(), child.value));
            continue;
          }
          if (child.nodes) {
            walk(child, node);
          }
        }
        return queue;
      };
      return utils.flatten(walk(ast));
    };
    module2.exports = expand;
  }
});

// node_modules/braces/lib/constants.js
var require_constants = __commonJS({
  "node_modules/braces/lib/constants.js"(exports2, module2) {
    "use strict";
    module2.exports = {
      MAX_LENGTH: 1e4,
      // Digits
      CHAR_0: "0",
      /* 0 */
      CHAR_9: "9",
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: "A",
      /* A */
      CHAR_LOWERCASE_A: "a",
      /* a */
      CHAR_UPPERCASE_Z: "Z",
      /* Z */
      CHAR_LOWERCASE_Z: "z",
      /* z */
      CHAR_LEFT_PARENTHESES: "(",
      /* ( */
      CHAR_RIGHT_PARENTHESES: ")",
      /* ) */
      CHAR_ASTERISK: "*",
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: "&",
      /* & */
      CHAR_AT: "@",
      /* @ */
      CHAR_BACKSLASH: "\\",
      /* \ */
      CHAR_BACKTICK: "`",
      /* ` */
      CHAR_CARRIAGE_RETURN: "\r",
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: "^",
      /* ^ */
      CHAR_COLON: ":",
      /* : */
      CHAR_COMMA: ",",
      /* , */
      CHAR_DOLLAR: "$",
      /* . */
      CHAR_DOT: ".",
      /* . */
      CHAR_DOUBLE_QUOTE: '"',
      /* " */
      CHAR_EQUAL: "=",
      /* = */
      CHAR_EXCLAMATION_MARK: "!",
      /* ! */
      CHAR_FORM_FEED: "\f",
      /* \f */
      CHAR_FORWARD_SLASH: "/",
      /* / */
      CHAR_HASH: "#",
      /* # */
      CHAR_HYPHEN_MINUS: "-",
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: "<",
      /* < */
      CHAR_LEFT_CURLY_BRACE: "{",
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: "[",
      /* [ */
      CHAR_LINE_FEED: "\n",
      /* \n */
      CHAR_NO_BREAK_SPACE: "\xA0",
      /* \u00A0 */
      CHAR_PERCENT: "%",
      /* % */
      CHAR_PLUS: "+",
      /* + */
      CHAR_QUESTION_MARK: "?",
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: ">",
      /* > */
      CHAR_RIGHT_CURLY_BRACE: "}",
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: "]",
      /* ] */
      CHAR_SEMICOLON: ";",
      /* ; */
      CHAR_SINGLE_QUOTE: "'",
      /* ' */
      CHAR_SPACE: " ",
      /*   */
      CHAR_TAB: "	",
      /* \t */
      CHAR_UNDERSCORE: "_",
      /* _ */
      CHAR_VERTICAL_LINE: "|",
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: "\uFEFF"
      /* \uFEFF */
    };
  }
});

// node_modules/braces/lib/parse.js
var require_parse = __commonJS({
  "node_modules/braces/lib/parse.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var {
      MAX_LENGTH,
      CHAR_BACKSLASH,
      /* \ */
      CHAR_BACKTICK,
      /* ` */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_RIGHT_SQUARE_BRACKET,
      /* ] */
      CHAR_DOUBLE_QUOTE,
      /* " */
      CHAR_SINGLE_QUOTE,
      /* ' */
      CHAR_NO_BREAK_SPACE,
      CHAR_ZERO_WIDTH_NOBREAK_SPACE
    } = require_constants();
    var parse = (input, options = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      const opts = options || {};
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      if (input.length > max) {
        throw new SyntaxError(`Input length (${input.length}), exceeds max characters (${max})`);
      }
      const ast = { type: "root", input, nodes: [] };
      const stack = [ast];
      let block = ast;
      let prev = ast;
      let brackets = 0;
      const length = input.length;
      let index = 0;
      let depth = 0;
      let value;
      const advance = () => input[index++];
      const push = (node) => {
        if (node.type === "text" && prev.type === "dot") {
          prev.type = "text";
        }
        if (prev && prev.type === "text" && node.type === "text") {
          prev.value += node.value;
          return;
        }
        block.nodes.push(node);
        node.parent = block;
        node.prev = prev;
        prev = node;
        return node;
      };
      push({ type: "bos" });
      while (index < length) {
        block = stack[stack.length - 1];
        value = advance();
        if (value === CHAR_ZERO_WIDTH_NOBREAK_SPACE || value === CHAR_NO_BREAK_SPACE) {
          continue;
        }
        if (value === CHAR_BACKSLASH) {
          push({ type: "text", value: (options.keepEscaping ? value : "") + advance() });
          continue;
        }
        if (value === CHAR_RIGHT_SQUARE_BRACKET) {
          push({ type: "text", value: "\\" + value });
          continue;
        }
        if (value === CHAR_LEFT_SQUARE_BRACKET) {
          brackets++;
          let next;
          while (index < length && (next = advance())) {
            value += next;
            if (next === CHAR_LEFT_SQUARE_BRACKET) {
              brackets++;
              continue;
            }
            if (next === CHAR_BACKSLASH) {
              value += advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              brackets--;
              if (brackets === 0) {
                break;
              }
            }
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_PARENTHESES) {
          block = push({ type: "paren", nodes: [] });
          stack.push(block);
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_RIGHT_PARENTHESES) {
          if (block.type !== "paren") {
            push({ type: "text", value });
            continue;
          }
          block = stack.pop();
          push({ type: "text", value });
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_DOUBLE_QUOTE || value === CHAR_SINGLE_QUOTE || value === CHAR_BACKTICK) {
          const open = value;
          let next;
          if (options.keepQuotes !== true) {
            value = "";
          }
          while (index < length && (next = advance())) {
            if (next === CHAR_BACKSLASH) {
              value += next + advance();
              continue;
            }
            if (next === open) {
              if (options.keepQuotes === true) value += next;
              break;
            }
            value += next;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === CHAR_LEFT_CURLY_BRACE) {
          depth++;
          const dollar = prev.value && prev.value.slice(-1) === "$" || block.dollar === true;
          const brace = {
            type: "brace",
            open: true,
            close: false,
            dollar,
            depth,
            commas: 0,
            ranges: 0,
            nodes: []
          };
          block = push(brace);
          stack.push(block);
          push({ type: "open", value });
          continue;
        }
        if (value === CHAR_RIGHT_CURLY_BRACE) {
          if (block.type !== "brace") {
            push({ type: "text", value });
            continue;
          }
          const type = "close";
          block = stack.pop();
          block.close = true;
          push({ type, value });
          depth--;
          block = stack[stack.length - 1];
          continue;
        }
        if (value === CHAR_COMMA && depth > 0) {
          if (block.ranges > 0) {
            block.ranges = 0;
            const open = block.nodes.shift();
            block.nodes = [open, { type: "text", value: stringify(block) }];
          }
          push({ type: "comma", value });
          block.commas++;
          continue;
        }
        if (value === CHAR_DOT && depth > 0 && block.commas === 0) {
          const siblings = block.nodes;
          if (depth === 0 || siblings.length === 0) {
            push({ type: "text", value });
            continue;
          }
          if (prev.type === "dot") {
            block.range = [];
            prev.value += value;
            prev.type = "range";
            if (block.nodes.length !== 3 && block.nodes.length !== 5) {
              block.invalid = true;
              block.ranges = 0;
              prev.type = "text";
              continue;
            }
            block.ranges++;
            block.args = [];
            continue;
          }
          if (prev.type === "range") {
            siblings.pop();
            const before = siblings[siblings.length - 1];
            before.value += prev.value + value;
            prev = before;
            block.ranges--;
            continue;
          }
          push({ type: "dot", value });
          continue;
        }
        push({ type: "text", value });
      }
      do {
        block = stack.pop();
        if (block.type !== "root") {
          block.nodes.forEach((node) => {
            if (!node.nodes) {
              if (node.type === "open") node.isOpen = true;
              if (node.type === "close") node.isClose = true;
              if (!node.nodes) node.type = "text";
              node.invalid = true;
            }
          });
          const parent = stack[stack.length - 1];
          const index2 = parent.nodes.indexOf(block);
          parent.nodes.splice(index2, 1, ...block.nodes);
        }
      } while (stack.length > 0);
      push({ type: "eos" });
      return ast;
    };
    module2.exports = parse;
  }
});

// node_modules/braces/index.js
var require_braces = __commonJS({
  "node_modules/braces/index.js"(exports2, module2) {
    "use strict";
    var stringify = require_stringify();
    var compile = require_compile();
    var expand = require_expand();
    var parse = require_parse();
    var braces = (input, options = {}) => {
      let output = [];
      if (Array.isArray(input)) {
        for (const pattern of input) {
          const result2 = braces.create(pattern, options);
          if (Array.isArray(result2)) {
            output.push(...result2);
          } else {
            output.push(result2);
          }
        }
      } else {
        output = [].concat(braces.create(input, options));
      }
      if (options && options.expand === true && options.nodupes === true) {
        output = [...new Set(output)];
      }
      return output;
    };
    braces.parse = (input, options = {}) => parse(input, options);
    braces.stringify = (input, options = {}) => {
      if (typeof input === "string") {
        return stringify(braces.parse(input, options), options);
      }
      return stringify(input, options);
    };
    braces.compile = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      return compile(input, options);
    };
    braces.expand = (input, options = {}) => {
      if (typeof input === "string") {
        input = braces.parse(input, options);
      }
      let result2 = expand(input, options);
      if (options.noempty === true) {
        result2 = result2.filter(Boolean);
      }
      if (options.nodupes === true) {
        result2 = [...new Set(result2)];
      }
      return result2;
    };
    braces.create = (input, options = {}) => {
      if (input === "" || input.length < 3) {
        return [input];
      }
      return options.expand !== true ? braces.compile(input, options) : braces.expand(input, options);
    };
    module2.exports = braces;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/constants.js
var require_constants2 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/constants.js"(exports2, module2) {
    "use strict";
    var path3 = require("path");
    var WIN_SLASH = "\\\\/";
    var WIN_NO_SLASH = `[^${WIN_SLASH}]`;
    var DOT_LITERAL = "\\.";
    var PLUS_LITERAL = "\\+";
    var QMARK_LITERAL = "\\?";
    var SLASH_LITERAL = "\\/";
    var ONE_CHAR = "(?=.)";
    var QMARK = "[^/]";
    var END_ANCHOR = `(?:${SLASH_LITERAL}|$)`;
    var START_ANCHOR = `(?:^|${SLASH_LITERAL})`;
    var DOTS_SLASH = `${DOT_LITERAL}{1,2}${END_ANCHOR}`;
    var NO_DOT = `(?!${DOT_LITERAL})`;
    var NO_DOTS = `(?!${START_ANCHOR}${DOTS_SLASH})`;
    var NO_DOT_SLASH = `(?!${DOT_LITERAL}{0,1}${END_ANCHOR})`;
    var NO_DOTS_SLASH = `(?!${DOTS_SLASH})`;
    var QMARK_NO_DOT = `[^.${SLASH_LITERAL}]`;
    var STAR = `${QMARK}*?`;
    var POSIX_CHARS = {
      DOT_LITERAL,
      PLUS_LITERAL,
      QMARK_LITERAL,
      SLASH_LITERAL,
      ONE_CHAR,
      QMARK,
      END_ANCHOR,
      DOTS_SLASH,
      NO_DOT,
      NO_DOTS,
      NO_DOT_SLASH,
      NO_DOTS_SLASH,
      QMARK_NO_DOT,
      STAR,
      START_ANCHOR
    };
    var WINDOWS_CHARS = {
      ...POSIX_CHARS,
      SLASH_LITERAL: `[${WIN_SLASH}]`,
      QMARK: WIN_NO_SLASH,
      STAR: `${WIN_NO_SLASH}*?`,
      DOTS_SLASH: `${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$)`,
      NO_DOT: `(?!${DOT_LITERAL})`,
      NO_DOTS: `(?!(?:^|[${WIN_SLASH}])${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      NO_DOT_SLASH: `(?!${DOT_LITERAL}{0,1}(?:[${WIN_SLASH}]|$))`,
      NO_DOTS_SLASH: `(?!${DOT_LITERAL}{1,2}(?:[${WIN_SLASH}]|$))`,
      QMARK_NO_DOT: `[^.${WIN_SLASH}]`,
      START_ANCHOR: `(?:^|[${WIN_SLASH}])`,
      END_ANCHOR: `(?:[${WIN_SLASH}]|$)`
    };
    var POSIX_REGEX_SOURCE = {
      alnum: "a-zA-Z0-9",
      alpha: "a-zA-Z",
      ascii: "\\x00-\\x7F",
      blank: " \\t",
      cntrl: "\\x00-\\x1F\\x7F",
      digit: "0-9",
      graph: "\\x21-\\x7E",
      lower: "a-z",
      print: "\\x20-\\x7E ",
      punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~",
      space: " \\t\\r\\n\\v\\f",
      upper: "A-Z",
      word: "A-Za-z0-9_",
      xdigit: "A-Fa-f0-9"
    };
    module2.exports = {
      MAX_LENGTH: 1024 * 64,
      POSIX_REGEX_SOURCE,
      // regular expressions
      REGEX_BACKSLASH: /\\(?![*+?^${}(|)[\]])/g,
      REGEX_NON_SPECIAL_CHARS: /^[^@![\].,$*+?^{}()|\\/]+/,
      REGEX_SPECIAL_CHARS: /[-*+?.^${}(|)[\]]/,
      REGEX_SPECIAL_CHARS_BACKREF: /(\\?)((\W)(\3*))/g,
      REGEX_SPECIAL_CHARS_GLOBAL: /([-*+?.^${}(|)[\]])/g,
      REGEX_REMOVE_BACKSLASH: /(?:\[.*?[^\\]\]|\\(?=.))/g,
      // Replace globs with equivalent patterns to reduce parsing time.
      REPLACEMENTS: {
        "***": "*",
        "**/**": "**",
        "**/**/**": "**"
      },
      // Digits
      CHAR_0: 48,
      /* 0 */
      CHAR_9: 57,
      /* 9 */
      // Alphabet chars.
      CHAR_UPPERCASE_A: 65,
      /* A */
      CHAR_LOWERCASE_A: 97,
      /* a */
      CHAR_UPPERCASE_Z: 90,
      /* Z */
      CHAR_LOWERCASE_Z: 122,
      /* z */
      CHAR_LEFT_PARENTHESES: 40,
      /* ( */
      CHAR_RIGHT_PARENTHESES: 41,
      /* ) */
      CHAR_ASTERISK: 42,
      /* * */
      // Non-alphabetic chars.
      CHAR_AMPERSAND: 38,
      /* & */
      CHAR_AT: 64,
      /* @ */
      CHAR_BACKWARD_SLASH: 92,
      /* \ */
      CHAR_CARRIAGE_RETURN: 13,
      /* \r */
      CHAR_CIRCUMFLEX_ACCENT: 94,
      /* ^ */
      CHAR_COLON: 58,
      /* : */
      CHAR_COMMA: 44,
      /* , */
      CHAR_DOT: 46,
      /* . */
      CHAR_DOUBLE_QUOTE: 34,
      /* " */
      CHAR_EQUAL: 61,
      /* = */
      CHAR_EXCLAMATION_MARK: 33,
      /* ! */
      CHAR_FORM_FEED: 12,
      /* \f */
      CHAR_FORWARD_SLASH: 47,
      /* / */
      CHAR_GRAVE_ACCENT: 96,
      /* ` */
      CHAR_HASH: 35,
      /* # */
      CHAR_HYPHEN_MINUS: 45,
      /* - */
      CHAR_LEFT_ANGLE_BRACKET: 60,
      /* < */
      CHAR_LEFT_CURLY_BRACE: 123,
      /* { */
      CHAR_LEFT_SQUARE_BRACKET: 91,
      /* [ */
      CHAR_LINE_FEED: 10,
      /* \n */
      CHAR_NO_BREAK_SPACE: 160,
      /* \u00A0 */
      CHAR_PERCENT: 37,
      /* % */
      CHAR_PLUS: 43,
      /* + */
      CHAR_QUESTION_MARK: 63,
      /* ? */
      CHAR_RIGHT_ANGLE_BRACKET: 62,
      /* > */
      CHAR_RIGHT_CURLY_BRACE: 125,
      /* } */
      CHAR_RIGHT_SQUARE_BRACKET: 93,
      /* ] */
      CHAR_SEMICOLON: 59,
      /* ; */
      CHAR_SINGLE_QUOTE: 39,
      /* ' */
      CHAR_SPACE: 32,
      /*   */
      CHAR_TAB: 9,
      /* \t */
      CHAR_UNDERSCORE: 95,
      /* _ */
      CHAR_VERTICAL_LINE: 124,
      /* | */
      CHAR_ZERO_WIDTH_NOBREAK_SPACE: 65279,
      /* \uFEFF */
      SEP: path3.sep,
      /**
       * Create EXTGLOB_CHARS
       */
      extglobChars(chars) {
        return {
          "!": { type: "negate", open: "(?:(?!(?:", close: `))${chars.STAR})` },
          "?": { type: "qmark", open: "(?:", close: ")?" },
          "+": { type: "plus", open: "(?:", close: ")+" },
          "*": { type: "star", open: "(?:", close: ")*" },
          "@": { type: "at", open: "(?:", close: ")" }
        };
      },
      /**
       * Create GLOB_CHARS
       */
      globChars(win32) {
        return win32 === true ? WINDOWS_CHARS : POSIX_CHARS;
      }
    };
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/utils.js
var require_utils2 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/utils.js"(exports2) {
    "use strict";
    var path3 = require("path");
    var win32 = process.platform === "win32";
    var {
      REGEX_BACKSLASH,
      REGEX_REMOVE_BACKSLASH,
      REGEX_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_GLOBAL
    } = require_constants2();
    exports2.isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    exports2.hasRegexChars = (str) => REGEX_SPECIAL_CHARS.test(str);
    exports2.isRegexChar = (str) => str.length === 1 && exports2.hasRegexChars(str);
    exports2.escapeRegex = (str) => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, "\\$1");
    exports2.toPosixSlashes = (str) => str.replace(REGEX_BACKSLASH, "/");
    exports2.removeBackslashes = (str) => {
      return str.replace(REGEX_REMOVE_BACKSLASH, (match) => {
        return match === "\\" ? "" : match;
      });
    };
    exports2.supportsLookbehinds = () => {
      const segs = process.version.slice(1).split(".").map(Number);
      if (segs.length === 3 && segs[0] >= 9 || segs[0] === 8 && segs[1] >= 10) {
        return true;
      }
      return false;
    };
    exports2.isWindows = (options) => {
      if (options && typeof options.windows === "boolean") {
        return options.windows;
      }
      return win32 === true || path3.sep === "\\";
    };
    exports2.escapeLast = (input, char, lastIdx) => {
      const idx = input.lastIndexOf(char, lastIdx);
      if (idx === -1) return input;
      if (input[idx - 1] === "\\") return exports2.escapeLast(input, char, idx - 1);
      return `${input.slice(0, idx)}\\${input.slice(idx)}`;
    };
    exports2.removePrefix = (input, state = {}) => {
      let output = input;
      if (output.startsWith("./")) {
        output = output.slice(2);
        state.prefix = "./";
      }
      return output;
    };
    exports2.wrapOutput = (input, state = {}, options = {}) => {
      const prepend = options.contains ? "" : "^";
      const append = options.contains ? "" : "$";
      let output = `${prepend}(?:${input})${append}`;
      if (state.negated === true) {
        output = `(?:^(?!${output}).*$)`;
      }
      return output;
    };
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/scan.js
var require_scan = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/scan.js"(exports2, module2) {
    "use strict";
    var utils = require_utils2();
    var {
      CHAR_ASTERISK,
      /* * */
      CHAR_AT,
      /* @ */
      CHAR_BACKWARD_SLASH,
      /* \ */
      CHAR_COMMA,
      /* , */
      CHAR_DOT,
      /* . */
      CHAR_EXCLAMATION_MARK,
      /* ! */
      CHAR_FORWARD_SLASH,
      /* / */
      CHAR_LEFT_CURLY_BRACE,
      /* { */
      CHAR_LEFT_PARENTHESES,
      /* ( */
      CHAR_LEFT_SQUARE_BRACKET,
      /* [ */
      CHAR_PLUS,
      /* + */
      CHAR_QUESTION_MARK,
      /* ? */
      CHAR_RIGHT_CURLY_BRACE,
      /* } */
      CHAR_RIGHT_PARENTHESES,
      /* ) */
      CHAR_RIGHT_SQUARE_BRACKET
      /* ] */
    } = require_constants2();
    var isPathSeparator = (code) => {
      return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
    };
    var depth = (token) => {
      if (token.isPrefix !== true) {
        token.depth = token.isGlobstar ? Infinity : 1;
      }
    };
    var scan = (input, options) => {
      const opts = options || {};
      const length = input.length - 1;
      const scanToEnd = opts.parts === true || opts.scanToEnd === true;
      const slashes = [];
      const tokens = [];
      const parts = [];
      let str = input;
      let index = -1;
      let start = 0;
      let lastIndex = 0;
      let isBrace = false;
      let isBracket = false;
      let isGlob = false;
      let isExtglob = false;
      let isGlobstar = false;
      let braceEscaped = false;
      let backslashes = false;
      let negated = false;
      let negatedExtglob = false;
      let finished = false;
      let braces = 0;
      let prev;
      let code;
      let token = { value: "", depth: 0, isGlob: false };
      const eos = () => index >= length;
      const peek = () => str.charCodeAt(index + 1);
      const advance = () => {
        prev = code;
        return str.charCodeAt(++index);
      };
      while (index < length) {
        code = advance();
        let next;
        if (code === CHAR_BACKWARD_SLASH) {
          backslashes = token.backslashes = true;
          code = advance();
          if (code === CHAR_LEFT_CURLY_BRACE) {
            braceEscaped = true;
          }
          continue;
        }
        if (braceEscaped === true || code === CHAR_LEFT_CURLY_BRACE) {
          braces++;
          while (eos() !== true && (code = advance())) {
            if (code === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (code === CHAR_LEFT_CURLY_BRACE) {
              braces++;
              continue;
            }
            if (braceEscaped !== true && code === CHAR_DOT && (code = advance()) === CHAR_DOT) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (braceEscaped !== true && code === CHAR_COMMA) {
              isBrace = token.isBrace = true;
              isGlob = token.isGlob = true;
              finished = true;
              if (scanToEnd === true) {
                continue;
              }
              break;
            }
            if (code === CHAR_RIGHT_CURLY_BRACE) {
              braces--;
              if (braces === 0) {
                braceEscaped = false;
                isBrace = token.isBrace = true;
                finished = true;
                break;
              }
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_FORWARD_SLASH) {
          slashes.push(index);
          tokens.push(token);
          token = { value: "", depth: 0, isGlob: false };
          if (finished === true) continue;
          if (prev === CHAR_DOT && index === start + 1) {
            start += 2;
            continue;
          }
          lastIndex = index + 1;
          continue;
        }
        if (opts.noext !== true) {
          const isExtglobChar = code === CHAR_PLUS || code === CHAR_AT || code === CHAR_ASTERISK || code === CHAR_QUESTION_MARK || code === CHAR_EXCLAMATION_MARK;
          if (isExtglobChar === true && peek() === CHAR_LEFT_PARENTHESES) {
            isGlob = token.isGlob = true;
            isExtglob = token.isExtglob = true;
            finished = true;
            if (code === CHAR_EXCLAMATION_MARK && index === start) {
              negatedExtglob = true;
            }
            if (scanToEnd === true) {
              while (eos() !== true && (code = advance())) {
                if (code === CHAR_BACKWARD_SLASH) {
                  backslashes = token.backslashes = true;
                  code = advance();
                  continue;
                }
                if (code === CHAR_RIGHT_PARENTHESES) {
                  isGlob = token.isGlob = true;
                  finished = true;
                  break;
                }
              }
              continue;
            }
            break;
          }
        }
        if (code === CHAR_ASTERISK) {
          if (prev === CHAR_ASTERISK) isGlobstar = token.isGlobstar = true;
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_QUESTION_MARK) {
          isGlob = token.isGlob = true;
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (code === CHAR_LEFT_SQUARE_BRACKET) {
          while (eos() !== true && (next = advance())) {
            if (next === CHAR_BACKWARD_SLASH) {
              backslashes = token.backslashes = true;
              advance();
              continue;
            }
            if (next === CHAR_RIGHT_SQUARE_BRACKET) {
              isBracket = token.isBracket = true;
              isGlob = token.isGlob = true;
              finished = true;
              break;
            }
          }
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
        if (opts.nonegate !== true && code === CHAR_EXCLAMATION_MARK && index === start) {
          negated = token.negated = true;
          start++;
          continue;
        }
        if (opts.noparen !== true && code === CHAR_LEFT_PARENTHESES) {
          isGlob = token.isGlob = true;
          if (scanToEnd === true) {
            while (eos() !== true && (code = advance())) {
              if (code === CHAR_LEFT_PARENTHESES) {
                backslashes = token.backslashes = true;
                code = advance();
                continue;
              }
              if (code === CHAR_RIGHT_PARENTHESES) {
                finished = true;
                break;
              }
            }
            continue;
          }
          break;
        }
        if (isGlob === true) {
          finished = true;
          if (scanToEnd === true) {
            continue;
          }
          break;
        }
      }
      if (opts.noext === true) {
        isExtglob = false;
        isGlob = false;
      }
      let base = str;
      let prefix = "";
      let glob = "";
      if (start > 0) {
        prefix = str.slice(0, start);
        str = str.slice(start);
        lastIndex -= start;
      }
      if (base && isGlob === true && lastIndex > 0) {
        base = str.slice(0, lastIndex);
        glob = str.slice(lastIndex);
      } else if (isGlob === true) {
        base = "";
        glob = str;
      } else {
        base = str;
      }
      if (base && base !== "" && base !== "/" && base !== str) {
        if (isPathSeparator(base.charCodeAt(base.length - 1))) {
          base = base.slice(0, -1);
        }
      }
      if (opts.unescape === true) {
        if (glob) glob = utils.removeBackslashes(glob);
        if (base && backslashes === true) {
          base = utils.removeBackslashes(base);
        }
      }
      const state = {
        prefix,
        input,
        start,
        base,
        glob,
        isBrace,
        isBracket,
        isGlob,
        isExtglob,
        isGlobstar,
        negated,
        negatedExtglob
      };
      if (opts.tokens === true) {
        state.maxDepth = 0;
        if (!isPathSeparator(code)) {
          tokens.push(token);
        }
        state.tokens = tokens;
      }
      if (opts.parts === true || opts.tokens === true) {
        let prevIndex;
        for (let idx = 0; idx < slashes.length; idx++) {
          const n = prevIndex ? prevIndex + 1 : start;
          const i = slashes[idx];
          const value = input.slice(n, i);
          if (opts.tokens) {
            if (idx === 0 && start !== 0) {
              tokens[idx].isPrefix = true;
              tokens[idx].value = prefix;
            } else {
              tokens[idx].value = value;
            }
            depth(tokens[idx]);
            state.maxDepth += tokens[idx].depth;
          }
          if (idx !== 0 || value !== "") {
            parts.push(value);
          }
          prevIndex = i;
        }
        if (prevIndex && prevIndex + 1 < input.length) {
          const value = input.slice(prevIndex + 1);
          parts.push(value);
          if (opts.tokens) {
            tokens[tokens.length - 1].value = value;
            depth(tokens[tokens.length - 1]);
            state.maxDepth += tokens[tokens.length - 1].depth;
          }
        }
        state.slashes = slashes;
        state.parts = parts;
      }
      return state;
    };
    module2.exports = scan;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/parse.js
var require_parse2 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/parse.js"(exports2, module2) {
    "use strict";
    var constants = require_constants2();
    var utils = require_utils2();
    var {
      MAX_LENGTH,
      POSIX_REGEX_SOURCE,
      REGEX_NON_SPECIAL_CHARS,
      REGEX_SPECIAL_CHARS_BACKREF,
      REPLACEMENTS
    } = constants;
    var expandRange = (args, options) => {
      if (typeof options.expandRange === "function") {
        return options.expandRange(...args, options);
      }
      args.sort();
      const value = `[${args.join("-")}]`;
      try {
        new RegExp(value);
      } catch (ex) {
        return args.map((v) => utils.escapeRegex(v)).join("..");
      }
      return value;
    };
    var syntaxError = (type, char) => {
      return `Missing ${type}: "${char}" - use "\\\\${char}" to match literal characters`;
    };
    var parse = (input, options) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected a string");
      }
      input = REPLACEMENTS[input] || input;
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      let len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      const bos = { type: "bos", value: "", output: opts.prepend || "" };
      const tokens = [bos];
      const capture = opts.capture ? "" : "?:";
      const win32 = utils.isWindows(options);
      const PLATFORM_CHARS = constants.globChars(win32);
      const EXTGLOB_CHARS = constants.extglobChars(PLATFORM_CHARS);
      const {
        DOT_LITERAL,
        PLUS_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOT_SLASH,
        NO_DOTS_SLASH,
        QMARK,
        QMARK_NO_DOT,
        STAR,
        START_ANCHOR
      } = PLATFORM_CHARS;
      const globstar = (opts2) => {
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const nodot = opts.dot ? "" : NO_DOT;
      const qmarkNoDot = opts.dot ? QMARK : QMARK_NO_DOT;
      let star = opts.bash === true ? globstar(opts) : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      if (typeof opts.noext === "boolean") {
        opts.noextglob = opts.noext;
      }
      const state = {
        input,
        index: -1,
        start: 0,
        dot: opts.dot === true,
        consumed: "",
        output: "",
        prefix: "",
        backtrack: false,
        negated: false,
        brackets: 0,
        braces: 0,
        parens: 0,
        quotes: 0,
        globstar: false,
        tokens
      };
      input = utils.removePrefix(input, state);
      len = input.length;
      const extglobs = [];
      const braces = [];
      const stack = [];
      let prev = bos;
      let value;
      const eos = () => state.index === len - 1;
      const peek = state.peek = (n = 1) => input[state.index + n];
      const advance = state.advance = () => input[++state.index] || "";
      const remaining = () => input.slice(state.index + 1);
      const consume = (value2 = "", num = 0) => {
        state.consumed += value2;
        state.index += num;
      };
      const append = (token) => {
        state.output += token.output != null ? token.output : token.value;
        consume(token.value);
      };
      const negate = () => {
        let count = 1;
        while (peek() === "!" && (peek(2) !== "(" || peek(3) === "?")) {
          advance();
          state.start++;
          count++;
        }
        if (count % 2 === 0) {
          return false;
        }
        state.negated = true;
        state.start++;
        return true;
      };
      const increment = (type) => {
        state[type]++;
        stack.push(type);
      };
      const decrement = (type) => {
        state[type]--;
        stack.pop();
      };
      const push = (tok) => {
        if (prev.type === "globstar") {
          const isBrace = state.braces > 0 && (tok.type === "comma" || tok.type === "brace");
          const isExtglob = tok.extglob === true || extglobs.length && (tok.type === "pipe" || tok.type === "paren");
          if (tok.type !== "slash" && tok.type !== "paren" && !isBrace && !isExtglob) {
            state.output = state.output.slice(0, -prev.output.length);
            prev.type = "star";
            prev.value = "*";
            prev.output = star;
            state.output += prev.output;
          }
        }
        if (extglobs.length && tok.type !== "paren") {
          extglobs[extglobs.length - 1].inner += tok.value;
        }
        if (tok.value || tok.output) append(tok);
        if (prev && prev.type === "text" && tok.type === "text") {
          prev.value += tok.value;
          prev.output = (prev.output || "") + tok.value;
          return;
        }
        tok.prev = prev;
        tokens.push(tok);
        prev = tok;
      };
      const extglobOpen = (type, value2) => {
        const token = { ...EXTGLOB_CHARS[value2], conditions: 1, inner: "" };
        token.prev = prev;
        token.parens = state.parens;
        token.output = state.output;
        const output = (opts.capture ? "(" : "") + token.open;
        increment("parens");
        push({ type, value: value2, output: state.output ? "" : ONE_CHAR });
        push({ type: "paren", extglob: true, value: advance(), output });
        extglobs.push(token);
      };
      const extglobClose = (token) => {
        let output = token.close + (opts.capture ? ")" : "");
        let rest;
        if (token.type === "negate") {
          let extglobStar = star;
          if (token.inner && token.inner.length > 1 && token.inner.includes("/")) {
            extglobStar = globstar(opts);
          }
          if (extglobStar !== star || eos() || /^\)+$/.test(remaining())) {
            output = token.close = `)$))${extglobStar}`;
          }
          if (token.inner.includes("*") && (rest = remaining()) && /^\.[^\\/.]+$/.test(rest)) {
            const expression = parse(rest, { ...options, fastpaths: false }).output;
            output = token.close = `)${expression})${extglobStar})`;
          }
          if (token.prev.type === "bos") {
            state.negatedExtglob = true;
          }
        }
        push({ type: "paren", extglob: true, value, output });
        decrement("parens");
      };
      if (opts.fastpaths !== false && !/(^[*!]|[/()[\]{}"])/.test(input)) {
        let backslashes = false;
        let output = input.replace(REGEX_SPECIAL_CHARS_BACKREF, (m, esc, chars, first, rest, index) => {
          if (first === "\\") {
            backslashes = true;
            return m;
          }
          if (first === "?") {
            if (esc) {
              return esc + first + (rest ? QMARK.repeat(rest.length) : "");
            }
            if (index === 0) {
              return qmarkNoDot + (rest ? QMARK.repeat(rest.length) : "");
            }
            return QMARK.repeat(chars.length);
          }
          if (first === ".") {
            return DOT_LITERAL.repeat(chars.length);
          }
          if (first === "*") {
            if (esc) {
              return esc + first + (rest ? star : "");
            }
            return star;
          }
          return esc ? m : `\\${m}`;
        });
        if (backslashes === true) {
          if (opts.unescape === true) {
            output = output.replace(/\\/g, "");
          } else {
            output = output.replace(/\\+/g, (m) => {
              return m.length % 2 === 0 ? "\\\\" : m ? "\\" : "";
            });
          }
        }
        if (output === input && opts.contains === true) {
          state.output = input;
          return state;
        }
        state.output = utils.wrapOutput(output, state, options);
        return state;
      }
      while (!eos()) {
        value = advance();
        if (value === "\0") {
          continue;
        }
        if (value === "\\") {
          const next = peek();
          if (next === "/" && opts.bash !== true) {
            continue;
          }
          if (next === "." || next === ";") {
            continue;
          }
          if (!next) {
            value += "\\";
            push({ type: "text", value });
            continue;
          }
          const match = /^\\+/.exec(remaining());
          let slashes = 0;
          if (match && match[0].length > 2) {
            slashes = match[0].length;
            state.index += slashes;
            if (slashes % 2 !== 0) {
              value += "\\";
            }
          }
          if (opts.unescape === true) {
            value = advance();
          } else {
            value += advance();
          }
          if (state.brackets === 0) {
            push({ type: "text", value });
            continue;
          }
        }
        if (state.brackets > 0 && (value !== "]" || prev.value === "[" || prev.value === "[^")) {
          if (opts.posix !== false && value === ":") {
            const inner = prev.value.slice(1);
            if (inner.includes("[")) {
              prev.posix = true;
              if (inner.includes(":")) {
                const idx = prev.value.lastIndexOf("[");
                const pre = prev.value.slice(0, idx);
                const rest2 = prev.value.slice(idx + 2);
                const posix = POSIX_REGEX_SOURCE[rest2];
                if (posix) {
                  prev.value = pre + posix;
                  state.backtrack = true;
                  advance();
                  if (!bos.output && tokens.indexOf(prev) === 1) {
                    bos.output = ONE_CHAR;
                  }
                  continue;
                }
              }
            }
          }
          if (value === "[" && peek() !== ":" || value === "-" && peek() === "]") {
            value = `\\${value}`;
          }
          if (value === "]" && (prev.value === "[" || prev.value === "[^")) {
            value = `\\${value}`;
          }
          if (opts.posix === true && value === "!" && prev.value === "[") {
            value = "^";
          }
          prev.value += value;
          append({ value });
          continue;
        }
        if (state.quotes === 1 && value !== '"') {
          value = utils.escapeRegex(value);
          prev.value += value;
          append({ value });
          continue;
        }
        if (value === '"') {
          state.quotes = state.quotes === 1 ? 0 : 1;
          if (opts.keepQuotes === true) {
            push({ type: "text", value });
          }
          continue;
        }
        if (value === "(") {
          increment("parens");
          push({ type: "paren", value });
          continue;
        }
        if (value === ")") {
          if (state.parens === 0 && opts.strictBrackets === true) {
            throw new SyntaxError(syntaxError("opening", "("));
          }
          const extglob = extglobs[extglobs.length - 1];
          if (extglob && state.parens === extglob.parens + 1) {
            extglobClose(extglobs.pop());
            continue;
          }
          push({ type: "paren", value, output: state.parens ? ")" : "\\)" });
          decrement("parens");
          continue;
        }
        if (value === "[") {
          if (opts.nobracket === true || !remaining().includes("]")) {
            if (opts.nobracket !== true && opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("closing", "]"));
            }
            value = `\\${value}`;
          } else {
            increment("brackets");
          }
          push({ type: "bracket", value });
          continue;
        }
        if (value === "]") {
          if (opts.nobracket === true || prev && prev.type === "bracket" && prev.value.length === 1) {
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          if (state.brackets === 0) {
            if (opts.strictBrackets === true) {
              throw new SyntaxError(syntaxError("opening", "["));
            }
            push({ type: "text", value, output: `\\${value}` });
            continue;
          }
          decrement("brackets");
          const prevValue = prev.value.slice(1);
          if (prev.posix !== true && prevValue[0] === "^" && !prevValue.includes("/")) {
            value = `/${value}`;
          }
          prev.value += value;
          append({ value });
          if (opts.literalBrackets === false || utils.hasRegexChars(prevValue)) {
            continue;
          }
          const escaped = utils.escapeRegex(prev.value);
          state.output = state.output.slice(0, -prev.value.length);
          if (opts.literalBrackets === true) {
            state.output += escaped;
            prev.value = escaped;
            continue;
          }
          prev.value = `(${capture}${escaped}|${prev.value})`;
          state.output += prev.value;
          continue;
        }
        if (value === "{" && opts.nobrace !== true) {
          increment("braces");
          const open = {
            type: "brace",
            value,
            output: "(",
            outputIndex: state.output.length,
            tokensIndex: state.tokens.length
          };
          braces.push(open);
          push(open);
          continue;
        }
        if (value === "}") {
          const brace = braces[braces.length - 1];
          if (opts.nobrace === true || !brace) {
            push({ type: "text", value, output: value });
            continue;
          }
          let output = ")";
          if (brace.dots === true) {
            const arr = tokens.slice();
            const range = [];
            for (let i = arr.length - 1; i >= 0; i--) {
              tokens.pop();
              if (arr[i].type === "brace") {
                break;
              }
              if (arr[i].type !== "dots") {
                range.unshift(arr[i].value);
              }
            }
            output = expandRange(range, opts);
            state.backtrack = true;
          }
          if (brace.comma !== true && brace.dots !== true) {
            const out = state.output.slice(0, brace.outputIndex);
            const toks = state.tokens.slice(brace.tokensIndex);
            brace.value = brace.output = "\\{";
            value = output = "\\}";
            state.output = out;
            for (const t of toks) {
              state.output += t.output || t.value;
            }
          }
          push({ type: "brace", value, output });
          decrement("braces");
          braces.pop();
          continue;
        }
        if (value === "|") {
          if (extglobs.length > 0) {
            extglobs[extglobs.length - 1].conditions++;
          }
          push({ type: "text", value });
          continue;
        }
        if (value === ",") {
          let output = value;
          const brace = braces[braces.length - 1];
          if (brace && stack[stack.length - 1] === "braces") {
            brace.comma = true;
            output = "|";
          }
          push({ type: "comma", value, output });
          continue;
        }
        if (value === "/") {
          if (prev.type === "dot" && state.index === state.start + 1) {
            state.start = state.index + 1;
            state.consumed = "";
            state.output = "";
            tokens.pop();
            prev = bos;
            continue;
          }
          push({ type: "slash", value, output: SLASH_LITERAL });
          continue;
        }
        if (value === ".") {
          if (state.braces > 0 && prev.type === "dot") {
            if (prev.value === ".") prev.output = DOT_LITERAL;
            const brace = braces[braces.length - 1];
            prev.type = "dots";
            prev.output += value;
            prev.value += value;
            brace.dots = true;
            continue;
          }
          if (state.braces + state.parens === 0 && prev.type !== "bos" && prev.type !== "slash") {
            push({ type: "text", value, output: DOT_LITERAL });
            continue;
          }
          push({ type: "dot", value, output: DOT_LITERAL });
          continue;
        }
        if (value === "?") {
          const isGroup = prev && prev.value === "(";
          if (!isGroup && opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("qmark", value);
            continue;
          }
          if (prev && prev.type === "paren") {
            const next = peek();
            let output = value;
            if (next === "<" && !utils.supportsLookbehinds()) {
              throw new Error("Node.js v10 or higher is required for regex lookbehinds");
            }
            if (prev.value === "(" && !/[!=<:]/.test(next) || next === "<" && !/<([!=]|\w+>)/.test(remaining())) {
              output = `\\${value}`;
            }
            push({ type: "text", value, output });
            continue;
          }
          if (opts.dot !== true && (prev.type === "slash" || prev.type === "bos")) {
            push({ type: "qmark", value, output: QMARK_NO_DOT });
            continue;
          }
          push({ type: "qmark", value, output: QMARK });
          continue;
        }
        if (value === "!") {
          if (opts.noextglob !== true && peek() === "(") {
            if (peek(2) !== "?" || !/[!=<:]/.test(peek(3))) {
              extglobOpen("negate", value);
              continue;
            }
          }
          if (opts.nonegate !== true && state.index === 0) {
            negate();
            continue;
          }
        }
        if (value === "+") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            extglobOpen("plus", value);
            continue;
          }
          if (prev && prev.value === "(" || opts.regex === false) {
            push({ type: "plus", value, output: PLUS_LITERAL });
            continue;
          }
          if (prev && (prev.type === "bracket" || prev.type === "paren" || prev.type === "brace") || state.parens > 0) {
            push({ type: "plus", value });
            continue;
          }
          push({ type: "plus", value: PLUS_LITERAL });
          continue;
        }
        if (value === "@") {
          if (opts.noextglob !== true && peek() === "(" && peek(2) !== "?") {
            push({ type: "at", extglob: true, value, output: "" });
            continue;
          }
          push({ type: "text", value });
          continue;
        }
        if (value !== "*") {
          if (value === "$" || value === "^") {
            value = `\\${value}`;
          }
          const match = REGEX_NON_SPECIAL_CHARS.exec(remaining());
          if (match) {
            value += match[0];
            state.index += match[0].length;
          }
          push({ type: "text", value });
          continue;
        }
        if (prev && (prev.type === "globstar" || prev.star === true)) {
          prev.type = "star";
          prev.star = true;
          prev.value += value;
          prev.output = star;
          state.backtrack = true;
          state.globstar = true;
          consume(value);
          continue;
        }
        let rest = remaining();
        if (opts.noextglob !== true && /^\([^?]/.test(rest)) {
          extglobOpen("star", value);
          continue;
        }
        if (prev.type === "star") {
          if (opts.noglobstar === true) {
            consume(value);
            continue;
          }
          const prior = prev.prev;
          const before = prior.prev;
          const isStart = prior.type === "slash" || prior.type === "bos";
          const afterStar = before && (before.type === "star" || before.type === "globstar");
          if (opts.bash === true && (!isStart || rest[0] && rest[0] !== "/")) {
            push({ type: "star", value, output: "" });
            continue;
          }
          const isBrace = state.braces > 0 && (prior.type === "comma" || prior.type === "brace");
          const isExtglob = extglobs.length && (prior.type === "pipe" || prior.type === "paren");
          if (!isStart && prior.type !== "paren" && !isBrace && !isExtglob) {
            push({ type: "star", value, output: "" });
            continue;
          }
          while (rest.slice(0, 3) === "/**") {
            const after = input[state.index + 4];
            if (after && after !== "/") {
              break;
            }
            rest = rest.slice(3);
            consume("/**", 3);
          }
          if (prior.type === "bos" && eos()) {
            prev.type = "globstar";
            prev.value += value;
            prev.output = globstar(opts);
            state.output = prev.output;
            state.globstar = true;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && !afterStar && eos()) {
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = globstar(opts) + (opts.strictSlashes ? ")" : "|$)");
            prev.value += value;
            state.globstar = true;
            state.output += prior.output + prev.output;
            consume(value);
            continue;
          }
          if (prior.type === "slash" && prior.prev.type !== "bos" && rest[0] === "/") {
            const end = rest[1] !== void 0 ? "|$" : "";
            state.output = state.output.slice(0, -(prior.output + prev.output).length);
            prior.output = `(?:${prior.output}`;
            prev.type = "globstar";
            prev.output = `${globstar(opts)}${SLASH_LITERAL}|${SLASH_LITERAL}${end})`;
            prev.value += value;
            state.output += prior.output + prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          if (prior.type === "bos" && rest[0] === "/") {
            prev.type = "globstar";
            prev.value += value;
            prev.output = `(?:^|${SLASH_LITERAL}|${globstar(opts)}${SLASH_LITERAL})`;
            state.output = prev.output;
            state.globstar = true;
            consume(value + advance());
            push({ type: "slash", value: "/", output: "" });
            continue;
          }
          state.output = state.output.slice(0, -prev.output.length);
          prev.type = "globstar";
          prev.output = globstar(opts);
          prev.value += value;
          state.output += prev.output;
          state.globstar = true;
          consume(value);
          continue;
        }
        const token = { type: "star", value, output: star };
        if (opts.bash === true) {
          token.output = ".*?";
          if (prev.type === "bos" || prev.type === "slash") {
            token.output = nodot + token.output;
          }
          push(token);
          continue;
        }
        if (prev && (prev.type === "bracket" || prev.type === "paren") && opts.regex === true) {
          token.output = value;
          push(token);
          continue;
        }
        if (state.index === state.start || prev.type === "slash" || prev.type === "dot") {
          if (prev.type === "dot") {
            state.output += NO_DOT_SLASH;
            prev.output += NO_DOT_SLASH;
          } else if (opts.dot === true) {
            state.output += NO_DOTS_SLASH;
            prev.output += NO_DOTS_SLASH;
          } else {
            state.output += nodot;
            prev.output += nodot;
          }
          if (peek() !== "*") {
            state.output += ONE_CHAR;
            prev.output += ONE_CHAR;
          }
        }
        push(token);
      }
      while (state.brackets > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "]"));
        state.output = utils.escapeLast(state.output, "[");
        decrement("brackets");
      }
      while (state.parens > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", ")"));
        state.output = utils.escapeLast(state.output, "(");
        decrement("parens");
      }
      while (state.braces > 0) {
        if (opts.strictBrackets === true) throw new SyntaxError(syntaxError("closing", "}"));
        state.output = utils.escapeLast(state.output, "{");
        decrement("braces");
      }
      if (opts.strictSlashes !== true && (prev.type === "star" || prev.type === "bracket")) {
        push({ type: "maybe_slash", value: "", output: `${SLASH_LITERAL}?` });
      }
      if (state.backtrack === true) {
        state.output = "";
        for (const token of state.tokens) {
          state.output += token.output != null ? token.output : token.value;
          if (token.suffix) {
            state.output += token.suffix;
          }
        }
      }
      return state;
    };
    parse.fastpaths = (input, options) => {
      const opts = { ...options };
      const max = typeof opts.maxLength === "number" ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
      const len = input.length;
      if (len > max) {
        throw new SyntaxError(`Input length: ${len}, exceeds maximum allowed length: ${max}`);
      }
      input = REPLACEMENTS[input] || input;
      const win32 = utils.isWindows(options);
      const {
        DOT_LITERAL,
        SLASH_LITERAL,
        ONE_CHAR,
        DOTS_SLASH,
        NO_DOT,
        NO_DOTS,
        NO_DOTS_SLASH,
        STAR,
        START_ANCHOR
      } = constants.globChars(win32);
      const nodot = opts.dot ? NO_DOTS : NO_DOT;
      const slashDot = opts.dot ? NO_DOTS_SLASH : NO_DOT;
      const capture = opts.capture ? "" : "?:";
      const state = { negated: false, prefix: "" };
      let star = opts.bash === true ? ".*?" : STAR;
      if (opts.capture) {
        star = `(${star})`;
      }
      const globstar = (opts2) => {
        if (opts2.noglobstar === true) return star;
        return `(${capture}(?:(?!${START_ANCHOR}${opts2.dot ? DOTS_SLASH : DOT_LITERAL}).)*?)`;
      };
      const create = (str) => {
        switch (str) {
          case "*":
            return `${nodot}${ONE_CHAR}${star}`;
          case ".*":
            return `${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*.*":
            return `${nodot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "*/*":
            return `${nodot}${star}${SLASH_LITERAL}${ONE_CHAR}${slashDot}${star}`;
          case "**":
            return nodot + globstar(opts);
          case "**/*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${ONE_CHAR}${star}`;
          case "**/*.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${slashDot}${star}${DOT_LITERAL}${ONE_CHAR}${star}`;
          case "**/.*":
            return `(?:${nodot}${globstar(opts)}${SLASH_LITERAL})?${DOT_LITERAL}${ONE_CHAR}${star}`;
          default: {
            const match = /^(.*?)\.(\w+)$/.exec(str);
            if (!match) return;
            const source3 = create(match[1]);
            if (!source3) return;
            return source3 + DOT_LITERAL + match[2];
          }
        }
      };
      const output = utils.removePrefix(input, state);
      let source2 = create(output);
      if (source2 && opts.strictSlashes !== true) {
        source2 += `${SLASH_LITERAL}?`;
      }
      return source2;
    };
    module2.exports = parse;
  }
});

// node_modules/micromatch/node_modules/picomatch/lib/picomatch.js
var require_picomatch = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/lib/picomatch.js"(exports2, module2) {
    "use strict";
    var path3 = require("path");
    var scan = require_scan();
    var parse = require_parse2();
    var utils = require_utils2();
    var constants = require_constants2();
    var isObject = (val) => val && typeof val === "object" && !Array.isArray(val);
    var picomatch = (glob, options, returnState = false) => {
      if (Array.isArray(glob)) {
        const fns = glob.map((input) => picomatch(input, options, returnState));
        const arrayMatcher = (str) => {
          for (const isMatch of fns) {
            const state2 = isMatch(str);
            if (state2) return state2;
          }
          return false;
        };
        return arrayMatcher;
      }
      const isState = isObject(glob) && glob.tokens && glob.input;
      if (glob === "" || typeof glob !== "string" && !isState) {
        throw new TypeError("Expected pattern to be a non-empty string");
      }
      const opts = options || {};
      const posix = utils.isWindows(options);
      const regex = isState ? picomatch.compileRe(glob, options) : picomatch.makeRe(glob, options, false, true);
      const state = regex.state;
      delete regex.state;
      let isIgnored = () => false;
      if (opts.ignore) {
        const ignoreOpts = { ...options, ignore: null, onMatch: null, onResult: null };
        isIgnored = picomatch(opts.ignore, ignoreOpts, returnState);
      }
      const matcher = (input, returnObject = false) => {
        const { isMatch, match, output } = picomatch.test(input, regex, options, { glob, posix });
        const result2 = { glob, state, regex, posix, input, output, match, isMatch };
        if (typeof opts.onResult === "function") {
          opts.onResult(result2);
        }
        if (isMatch === false) {
          result2.isMatch = false;
          return returnObject ? result2 : false;
        }
        if (isIgnored(input)) {
          if (typeof opts.onIgnore === "function") {
            opts.onIgnore(result2);
          }
          result2.isMatch = false;
          return returnObject ? result2 : false;
        }
        if (typeof opts.onMatch === "function") {
          opts.onMatch(result2);
        }
        return returnObject ? result2 : true;
      };
      if (returnState) {
        matcher.state = state;
      }
      return matcher;
    };
    picomatch.test = (input, regex, options, { glob, posix } = {}) => {
      if (typeof input !== "string") {
        throw new TypeError("Expected input to be a string");
      }
      if (input === "") {
        return { isMatch: false, output: "" };
      }
      const opts = options || {};
      const format = opts.format || (posix ? utils.toPosixSlashes : null);
      let match = input === glob;
      let output = match && format ? format(input) : input;
      if (match === false) {
        output = format ? format(input) : input;
        match = output === glob;
      }
      if (match === false || opts.capture === true) {
        if (opts.matchBase === true || opts.basename === true) {
          match = picomatch.matchBase(input, regex, options, posix);
        } else {
          match = regex.exec(output);
        }
      }
      return { isMatch: Boolean(match), match, output };
    };
    picomatch.matchBase = (input, glob, options, posix = utils.isWindows(options)) => {
      const regex = glob instanceof RegExp ? glob : picomatch.makeRe(glob, options);
      return regex.test(path3.basename(input));
    };
    picomatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);
    picomatch.parse = (pattern, options) => {
      if (Array.isArray(pattern)) return pattern.map((p) => picomatch.parse(p, options));
      return parse(pattern, { ...options, fastpaths: false });
    };
    picomatch.scan = (input, options) => scan(input, options);
    picomatch.compileRe = (state, options, returnOutput = false, returnState = false) => {
      if (returnOutput === true) {
        return state.output;
      }
      const opts = options || {};
      const prepend = opts.contains ? "" : "^";
      const append = opts.contains ? "" : "$";
      let source2 = `${prepend}(?:${state.output})${append}`;
      if (state && state.negated === true) {
        source2 = `^(?!${source2}).*$`;
      }
      const regex = picomatch.toRegex(source2, options);
      if (returnState === true) {
        regex.state = state;
      }
      return regex;
    };
    picomatch.makeRe = (input, options = {}, returnOutput = false, returnState = false) => {
      if (!input || typeof input !== "string") {
        throw new TypeError("Expected a non-empty string");
      }
      let parsed = { negated: false, fastpaths: true };
      if (options.fastpaths !== false && (input[0] === "." || input[0] === "*")) {
        parsed.output = parse.fastpaths(input, options);
      }
      if (!parsed.output) {
        parsed = parse(input, options);
      }
      return picomatch.compileRe(parsed, options, returnOutput, returnState);
    };
    picomatch.toRegex = (source2, options) => {
      try {
        const opts = options || {};
        return new RegExp(source2, opts.flags || (opts.nocase ? "i" : ""));
      } catch (err) {
        if (options && options.debug === true) throw err;
        return /$^/;
      }
    };
    picomatch.constants = constants;
    module2.exports = picomatch;
  }
});

// node_modules/micromatch/node_modules/picomatch/index.js
var require_picomatch2 = __commonJS({
  "node_modules/micromatch/node_modules/picomatch/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_picomatch();
  }
});

// node_modules/micromatch/index.js
var require_micromatch = __commonJS({
  "node_modules/micromatch/index.js"(exports2, module2) {
    "use strict";
    var util = require("util");
    var braces = require_braces();
    var picomatch = require_picomatch2();
    var utils = require_utils2();
    var isEmptyString = (v) => v === "" || v === "./";
    var hasBraces = (v) => {
      const index = v.indexOf("{");
      return index > -1 && v.indexOf("}", index) > -1;
    };
    var micromatch = (list, patterns, options) => {
      patterns = [].concat(patterns);
      list = [].concat(list);
      let omit = /* @__PURE__ */ new Set();
      let keep = /* @__PURE__ */ new Set();
      let items = /* @__PURE__ */ new Set();
      let negatives = 0;
      let onResult = (state) => {
        items.add(state.output);
        if (options && options.onResult) {
          options.onResult(state);
        }
      };
      for (let i = 0; i < patterns.length; i++) {
        let isMatch = picomatch(String(patterns[i]), { ...options, onResult }, true);
        let negated = isMatch.state.negated || isMatch.state.negatedExtglob;
        if (negated) negatives++;
        for (let item of list) {
          let matched = isMatch(item, true);
          let match = negated ? !matched.isMatch : matched.isMatch;
          if (!match) continue;
          if (negated) {
            omit.add(matched.output);
          } else {
            omit.delete(matched.output);
            keep.add(matched.output);
          }
        }
      }
      let result2 = negatives === patterns.length ? [...items] : [...keep];
      let matches = result2.filter((item) => !omit.has(item));
      if (options && matches.length === 0) {
        if (options.failglob === true) {
          throw new Error(`No matches found for "${patterns.join(", ")}"`);
        }
        if (options.nonull === true || options.nullglob === true) {
          return options.unescape ? patterns.map((p) => p.replace(/\\/g, "")) : patterns;
        }
      }
      return matches;
    };
    micromatch.match = micromatch;
    micromatch.matcher = (pattern, options) => picomatch(pattern, options);
    micromatch.isMatch = (str, patterns, options) => picomatch(patterns, options)(str);
    micromatch.any = micromatch.isMatch;
    micromatch.not = (list, patterns, options = {}) => {
      patterns = [].concat(patterns).map(String);
      let result2 = /* @__PURE__ */ new Set();
      let items = [];
      let onResult = (state) => {
        if (options.onResult) options.onResult(state);
        items.push(state.output);
      };
      let matches = new Set(micromatch(list, patterns, { ...options, onResult }));
      for (let item of items) {
        if (!matches.has(item)) {
          result2.add(item);
        }
      }
      return [...result2];
    };
    micromatch.contains = (str, pattern, options) => {
      if (typeof str !== "string") {
        throw new TypeError(`Expected a string: "${util.inspect(str)}"`);
      }
      if (Array.isArray(pattern)) {
        return pattern.some((p) => micromatch.contains(str, p, options));
      }
      if (typeof pattern === "string") {
        if (isEmptyString(str) || isEmptyString(pattern)) {
          return false;
        }
        if (str.includes(pattern) || str.startsWith("./") && str.slice(2).includes(pattern)) {
          return true;
        }
      }
      return micromatch.isMatch(str, pattern, { ...options, contains: true });
    };
    micromatch.matchKeys = (obj, patterns, options) => {
      if (!utils.isObject(obj)) {
        throw new TypeError("Expected the first argument to be an object");
      }
      let keys = micromatch(Object.keys(obj), patterns, options);
      let res = {};
      for (let key of keys) res[key] = obj[key];
      return res;
    };
    micromatch.some = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch(String(pattern), options);
        if (items.some((item) => isMatch(item))) {
          return true;
        }
      }
      return false;
    };
    micromatch.every = (list, patterns, options) => {
      let items = [].concat(list);
      for (let pattern of [].concat(patterns)) {
        let isMatch = picomatch(String(pattern), options);
        if (!items.every((item) => isMatch(item))) {
          return false;
        }
      }
      return true;
    };
    micromatch.all = (str, patterns, options) => {
      if (typeof str !== "string") {
        throw new TypeError(`Expected a string: "${util.inspect(str)}"`);
      }
      return [].concat(patterns).every((p) => picomatch(p, options)(str));
    };
    micromatch.capture = (glob, input, options) => {
      let posix = utils.isWindows(options);
      let regex = picomatch.makeRe(String(glob), { ...options, capture: true });
      let match = regex.exec(posix ? utils.toPosixSlashes(input) : input);
      if (match) {
        return match.slice(1).map((v) => v === void 0 ? "" : v);
      }
    };
    micromatch.makeRe = (...args) => picomatch.makeRe(...args);
    micromatch.scan = (...args) => picomatch.scan(...args);
    micromatch.parse = (patterns, options) => {
      let res = [];
      for (let pattern of [].concat(patterns || [])) {
        for (let str of braces(String(pattern), options)) {
          res.push(picomatch.parse(str, options));
        }
      }
      return res;
    };
    micromatch.braces = (pattern, options) => {
      if (typeof pattern !== "string") throw new TypeError("Expected a string");
      if (options && options.nobrace === true || !hasBraces(pattern)) {
        return [pattern];
      }
      return braces(pattern, options);
    };
    micromatch.braceExpand = (pattern, options) => {
      if (typeof pattern !== "string") throw new TypeError("Expected a string");
      return micromatch.braces(pattern, { ...options, expand: true });
    };
    micromatch.hasBraces = hasBraces;
    module2.exports = micromatch;
  }
});

// node_modules/fast-glob/out/utils/pattern.js
var require_pattern = __commonJS({
  "node_modules/fast-glob/out/utils/pattern.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.removeDuplicateSlashes = exports2.matchAny = exports2.convertPatternsToRe = exports2.makeRe = exports2.getPatternParts = exports2.expandBraceExpansion = exports2.expandPatternsWithBraceExpansion = exports2.isAffectDepthOfReadingPattern = exports2.endsWithSlashGlobStar = exports2.hasGlobStar = exports2.getBaseDirectory = exports2.isPatternRelatedToParentDirectory = exports2.getPatternsOutsideCurrentDirectory = exports2.getPatternsInsideCurrentDirectory = exports2.getPositivePatterns = exports2.getNegativePatterns = exports2.isPositivePattern = exports2.isNegativePattern = exports2.convertToNegativePattern = exports2.convertToPositivePattern = exports2.isDynamicPattern = exports2.isStaticPattern = void 0;
    var path3 = require("path");
    var globParent = require_glob_parent();
    var micromatch = require_micromatch();
    var GLOBSTAR = "**";
    var ESCAPE_SYMBOL = "\\";
    var COMMON_GLOB_SYMBOLS_RE = /[*?]|^!/;
    var REGEX_CHARACTER_CLASS_SYMBOLS_RE = /\[[^[]*]/;
    var REGEX_GROUP_SYMBOLS_RE = /(?:^|[^!*+?@])\([^(]*\|[^|]*\)/;
    var GLOB_EXTENSION_SYMBOLS_RE = /[!*+?@]\([^(]*\)/;
    var BRACE_EXPANSION_SEPARATORS_RE = /,|\.\./;
    var DOUBLE_SLASH_RE = /(?!^)\/{2,}/g;
    function isStaticPattern(pattern, options = {}) {
      return !isDynamicPattern(pattern, options);
    }
    exports2.isStaticPattern = isStaticPattern;
    function isDynamicPattern(pattern, options = {}) {
      if (pattern === "") {
        return false;
      }
      if (options.caseSensitiveMatch === false || pattern.includes(ESCAPE_SYMBOL)) {
        return true;
      }
      if (COMMON_GLOB_SYMBOLS_RE.test(pattern) || REGEX_CHARACTER_CLASS_SYMBOLS_RE.test(pattern) || REGEX_GROUP_SYMBOLS_RE.test(pattern)) {
        return true;
      }
      if (options.extglob !== false && GLOB_EXTENSION_SYMBOLS_RE.test(pattern)) {
        return true;
      }
      if (options.braceExpansion !== false && hasBraceExpansion(pattern)) {
        return true;
      }
      return false;
    }
    exports2.isDynamicPattern = isDynamicPattern;
    function hasBraceExpansion(pattern) {
      const openingBraceIndex = pattern.indexOf("{");
      if (openingBraceIndex === -1) {
        return false;
      }
      const closingBraceIndex = pattern.indexOf("}", openingBraceIndex + 1);
      if (closingBraceIndex === -1) {
        return false;
      }
      const braceContent = pattern.slice(openingBraceIndex, closingBraceIndex);
      return BRACE_EXPANSION_SEPARATORS_RE.test(braceContent);
    }
    function convertToPositivePattern(pattern) {
      return isNegativePattern(pattern) ? pattern.slice(1) : pattern;
    }
    exports2.convertToPositivePattern = convertToPositivePattern;
    function convertToNegativePattern(pattern) {
      return "!" + pattern;
    }
    exports2.convertToNegativePattern = convertToNegativePattern;
    function isNegativePattern(pattern) {
      return pattern.startsWith("!") && pattern[1] !== "(";
    }
    exports2.isNegativePattern = isNegativePattern;
    function isPositivePattern(pattern) {
      return !isNegativePattern(pattern);
    }
    exports2.isPositivePattern = isPositivePattern;
    function getNegativePatterns(patterns) {
      return patterns.filter(isNegativePattern);
    }
    exports2.getNegativePatterns = getNegativePatterns;
    function getPositivePatterns(patterns) {
      return patterns.filter(isPositivePattern);
    }
    exports2.getPositivePatterns = getPositivePatterns;
    function getPatternsInsideCurrentDirectory(patterns) {
      return patterns.filter((pattern) => !isPatternRelatedToParentDirectory(pattern));
    }
    exports2.getPatternsInsideCurrentDirectory = getPatternsInsideCurrentDirectory;
    function getPatternsOutsideCurrentDirectory(patterns) {
      return patterns.filter(isPatternRelatedToParentDirectory);
    }
    exports2.getPatternsOutsideCurrentDirectory = getPatternsOutsideCurrentDirectory;
    function isPatternRelatedToParentDirectory(pattern) {
      return pattern.startsWith("..") || pattern.startsWith("./..");
    }
    exports2.isPatternRelatedToParentDirectory = isPatternRelatedToParentDirectory;
    function getBaseDirectory(pattern) {
      return globParent(pattern, { flipBackslashes: false });
    }
    exports2.getBaseDirectory = getBaseDirectory;
    function hasGlobStar(pattern) {
      return pattern.includes(GLOBSTAR);
    }
    exports2.hasGlobStar = hasGlobStar;
    function endsWithSlashGlobStar(pattern) {
      return pattern.endsWith("/" + GLOBSTAR);
    }
    exports2.endsWithSlashGlobStar = endsWithSlashGlobStar;
    function isAffectDepthOfReadingPattern(pattern) {
      const basename = path3.basename(pattern);
      return endsWithSlashGlobStar(pattern) || isStaticPattern(basename);
    }
    exports2.isAffectDepthOfReadingPattern = isAffectDepthOfReadingPattern;
    function expandPatternsWithBraceExpansion(patterns) {
      return patterns.reduce((collection, pattern) => {
        return collection.concat(expandBraceExpansion(pattern));
      }, []);
    }
    exports2.expandPatternsWithBraceExpansion = expandPatternsWithBraceExpansion;
    function expandBraceExpansion(pattern) {
      const patterns = micromatch.braces(pattern, { expand: true, nodupes: true, keepEscaping: true });
      patterns.sort((a, b) => a.length - b.length);
      return patterns.filter((pattern2) => pattern2 !== "");
    }
    exports2.expandBraceExpansion = expandBraceExpansion;
    function getPatternParts(pattern, options) {
      let { parts } = micromatch.scan(pattern, Object.assign(Object.assign({}, options), { parts: true }));
      if (parts.length === 0) {
        parts = [pattern];
      }
      if (parts[0].startsWith("/")) {
        parts[0] = parts[0].slice(1);
        parts.unshift("");
      }
      return parts;
    }
    exports2.getPatternParts = getPatternParts;
    function makeRe(pattern, options) {
      return micromatch.makeRe(pattern, options);
    }
    exports2.makeRe = makeRe;
    function convertPatternsToRe(patterns, options) {
      return patterns.map((pattern) => makeRe(pattern, options));
    }
    exports2.convertPatternsToRe = convertPatternsToRe;
    function matchAny(entry, patternsRe) {
      return patternsRe.some((patternRe) => patternRe.test(entry));
    }
    exports2.matchAny = matchAny;
    function removeDuplicateSlashes(pattern) {
      return pattern.replace(DOUBLE_SLASH_RE, "/");
    }
    exports2.removeDuplicateSlashes = removeDuplicateSlashes;
  }
});

// node_modules/merge2/index.js
var require_merge2 = __commonJS({
  "node_modules/merge2/index.js"(exports2, module2) {
    "use strict";
    var Stream = require("stream");
    var PassThrough = Stream.PassThrough;
    var slice = Array.prototype.slice;
    module2.exports = merge2;
    function merge2() {
      const streamsQueue = [];
      const args = slice.call(arguments);
      let merging = false;
      let options = args[args.length - 1];
      if (options && !Array.isArray(options) && options.pipe == null) {
        args.pop();
      } else {
        options = {};
      }
      const doEnd = options.end !== false;
      const doPipeError = options.pipeError === true;
      if (options.objectMode == null) {
        options.objectMode = true;
      }
      if (options.highWaterMark == null) {
        options.highWaterMark = 64 * 1024;
      }
      const mergedStream = PassThrough(options);
      function addStream() {
        for (let i = 0, len = arguments.length; i < len; i++) {
          streamsQueue.push(pauseStreams(arguments[i], options));
        }
        mergeStream();
        return this;
      }
      function mergeStream() {
        if (merging) {
          return;
        }
        merging = true;
        let streams = streamsQueue.shift();
        if (!streams) {
          process.nextTick(endStream);
          return;
        }
        if (!Array.isArray(streams)) {
          streams = [streams];
        }
        let pipesCount = streams.length + 1;
        function next() {
          if (--pipesCount > 0) {
            return;
          }
          merging = false;
          mergeStream();
        }
        function pipe(stream) {
          function onend() {
            stream.removeListener("merge2UnpipeEnd", onend);
            stream.removeListener("end", onend);
            if (doPipeError) {
              stream.removeListener("error", onerror);
            }
            next();
          }
          function onerror(err) {
            mergedStream.emit("error", err);
          }
          if (stream._readableState.endEmitted) {
            return next();
          }
          stream.on("merge2UnpipeEnd", onend);
          stream.on("end", onend);
          if (doPipeError) {
            stream.on("error", onerror);
          }
          stream.pipe(mergedStream, { end: false });
          stream.resume();
        }
        for (let i = 0; i < streams.length; i++) {
          pipe(streams[i]);
        }
        next();
      }
      function endStream() {
        merging = false;
        mergedStream.emit("queueDrain");
        if (doEnd) {
          mergedStream.end();
        }
      }
      mergedStream.setMaxListeners(0);
      mergedStream.add = addStream;
      mergedStream.on("unpipe", function(stream) {
        stream.emit("merge2UnpipeEnd");
      });
      if (args.length) {
        addStream.apply(null, args);
      }
      return mergedStream;
    }
    function pauseStreams(streams, options) {
      if (!Array.isArray(streams)) {
        if (!streams._readableState && streams.pipe) {
          streams = streams.pipe(PassThrough(options));
        }
        if (!streams._readableState || !streams.pause || !streams.pipe) {
          throw new Error("Only readable stream can be merged.");
        }
        streams.pause();
      } else {
        for (let i = 0, len = streams.length; i < len; i++) {
          streams[i] = pauseStreams(streams[i], options);
        }
      }
      return streams;
    }
  }
});

// node_modules/fast-glob/out/utils/stream.js
var require_stream = __commonJS({
  "node_modules/fast-glob/out/utils/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.merge = void 0;
    var merge2 = require_merge2();
    function merge(streams) {
      const mergedStream = merge2(streams);
      streams.forEach((stream) => {
        stream.once("error", (error) => mergedStream.emit("error", error));
      });
      mergedStream.once("close", () => propagateCloseEventToSources(streams));
      mergedStream.once("end", () => propagateCloseEventToSources(streams));
      return mergedStream;
    }
    exports2.merge = merge;
    function propagateCloseEventToSources(streams) {
      streams.forEach((stream) => stream.emit("close"));
    }
  }
});

// node_modules/fast-glob/out/utils/string.js
var require_string = __commonJS({
  "node_modules/fast-glob/out/utils/string.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isEmpty = exports2.isString = void 0;
    function isString(input) {
      return typeof input === "string";
    }
    exports2.isString = isString;
    function isEmpty(input) {
      return input === "";
    }
    exports2.isEmpty = isEmpty;
  }
});

// node_modules/fast-glob/out/utils/index.js
var require_utils3 = __commonJS({
  "node_modules/fast-glob/out/utils/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.string = exports2.stream = exports2.pattern = exports2.path = exports2.fs = exports2.errno = exports2.array = void 0;
    var array = require_array();
    exports2.array = array;
    var errno = require_errno();
    exports2.errno = errno;
    var fs3 = require_fs();
    exports2.fs = fs3;
    var path3 = require_path();
    exports2.path = path3;
    var pattern = require_pattern();
    exports2.pattern = pattern;
    var stream = require_stream();
    exports2.stream = stream;
    var string = require_string();
    exports2.string = string;
  }
});

// node_modules/fast-glob/out/managers/tasks.js
var require_tasks = __commonJS({
  "node_modules/fast-glob/out/managers/tasks.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.convertPatternGroupToTask = exports2.convertPatternGroupsToTasks = exports2.groupPatternsByBaseDirectory = exports2.getNegativePatternsAsPositive = exports2.getPositivePatterns = exports2.convertPatternsToTasks = exports2.generate = void 0;
    var utils = require_utils3();
    function generate(input, settings) {
      const patterns = processPatterns(input, settings);
      const ignore = processPatterns(settings.ignore, settings);
      const positivePatterns = getPositivePatterns(patterns);
      const negativePatterns = getNegativePatternsAsPositive(patterns, ignore);
      const staticPatterns = positivePatterns.filter((pattern) => utils.pattern.isStaticPattern(pattern, settings));
      const dynamicPatterns = positivePatterns.filter((pattern) => utils.pattern.isDynamicPattern(pattern, settings));
      const staticTasks = convertPatternsToTasks(
        staticPatterns,
        negativePatterns,
        /* dynamic */
        false
      );
      const dynamicTasks = convertPatternsToTasks(
        dynamicPatterns,
        negativePatterns,
        /* dynamic */
        true
      );
      return staticTasks.concat(dynamicTasks);
    }
    exports2.generate = generate;
    function processPatterns(input, settings) {
      let patterns = input;
      if (settings.braceExpansion) {
        patterns = utils.pattern.expandPatternsWithBraceExpansion(patterns);
      }
      if (settings.baseNameMatch) {
        patterns = patterns.map((pattern) => pattern.includes("/") ? pattern : `**/${pattern}`);
      }
      return patterns.map((pattern) => utils.pattern.removeDuplicateSlashes(pattern));
    }
    function convertPatternsToTasks(positive, negative, dynamic) {
      const tasks = [];
      const patternsOutsideCurrentDirectory = utils.pattern.getPatternsOutsideCurrentDirectory(positive);
      const patternsInsideCurrentDirectory = utils.pattern.getPatternsInsideCurrentDirectory(positive);
      const outsideCurrentDirectoryGroup = groupPatternsByBaseDirectory(patternsOutsideCurrentDirectory);
      const insideCurrentDirectoryGroup = groupPatternsByBaseDirectory(patternsInsideCurrentDirectory);
      tasks.push(...convertPatternGroupsToTasks(outsideCurrentDirectoryGroup, negative, dynamic));
      if ("." in insideCurrentDirectoryGroup) {
        tasks.push(convertPatternGroupToTask(".", patternsInsideCurrentDirectory, negative, dynamic));
      } else {
        tasks.push(...convertPatternGroupsToTasks(insideCurrentDirectoryGroup, negative, dynamic));
      }
      return tasks;
    }
    exports2.convertPatternsToTasks = convertPatternsToTasks;
    function getPositivePatterns(patterns) {
      return utils.pattern.getPositivePatterns(patterns);
    }
    exports2.getPositivePatterns = getPositivePatterns;
    function getNegativePatternsAsPositive(patterns, ignore) {
      const negative = utils.pattern.getNegativePatterns(patterns).concat(ignore);
      const positive = negative.map(utils.pattern.convertToPositivePattern);
      return positive;
    }
    exports2.getNegativePatternsAsPositive = getNegativePatternsAsPositive;
    function groupPatternsByBaseDirectory(patterns) {
      const group = {};
      return patterns.reduce((collection, pattern) => {
        const base = utils.pattern.getBaseDirectory(pattern);
        if (base in collection) {
          collection[base].push(pattern);
        } else {
          collection[base] = [pattern];
        }
        return collection;
      }, group);
    }
    exports2.groupPatternsByBaseDirectory = groupPatternsByBaseDirectory;
    function convertPatternGroupsToTasks(positive, negative, dynamic) {
      return Object.keys(positive).map((base) => {
        return convertPatternGroupToTask(base, positive[base], negative, dynamic);
      });
    }
    exports2.convertPatternGroupsToTasks = convertPatternGroupsToTasks;
    function convertPatternGroupToTask(base, positive, negative, dynamic) {
      return {
        dynamic,
        positive,
        negative,
        base,
        patterns: [].concat(positive, negative.map(utils.pattern.convertToNegativePattern))
      };
    }
    exports2.convertPatternGroupToTask = convertPatternGroupToTask;
  }
});

// node_modules/@nodelib/fs.stat/out/providers/async.js
var require_async = __commonJS({
  "node_modules/@nodelib/fs.stat/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.read = void 0;
    function read(path3, settings, callback) {
      settings.fs.lstat(path3, (lstatError, lstat) => {
        if (lstatError !== null) {
          callFailureCallback(callback, lstatError);
          return;
        }
        if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) {
          callSuccessCallback(callback, lstat);
          return;
        }
        settings.fs.stat(path3, (statError, stat) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              callFailureCallback(callback, statError);
              return;
            }
            callSuccessCallback(callback, lstat);
            return;
          }
          if (settings.markSymbolicLink) {
            stat.isSymbolicLink = () => true;
          }
          callSuccessCallback(callback, stat);
        });
      });
    }
    exports2.read = read;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result2) {
      callback(null, result2);
    }
  }
});

// node_modules/@nodelib/fs.stat/out/providers/sync.js
var require_sync = __commonJS({
  "node_modules/@nodelib/fs.stat/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.read = void 0;
    function read(path3, settings) {
      const lstat = settings.fs.lstatSync(path3);
      if (!lstat.isSymbolicLink() || !settings.followSymbolicLink) {
        return lstat;
      }
      try {
        const stat = settings.fs.statSync(path3);
        if (settings.markSymbolicLink) {
          stat.isSymbolicLink = () => true;
        }
        return stat;
      } catch (error) {
        if (!settings.throwErrorOnBrokenSymbolicLink) {
          return lstat;
        }
        throw error;
      }
    }
    exports2.read = read;
  }
});

// node_modules/@nodelib/fs.stat/out/adapters/fs.js
var require_fs2 = __commonJS({
  "node_modules/@nodelib/fs.stat/out/adapters/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createFileSystemAdapter = exports2.FILE_SYSTEM_ADAPTER = void 0;
    var fs3 = require("fs");
    exports2.FILE_SYSTEM_ADAPTER = {
      lstat: fs3.lstat,
      stat: fs3.stat,
      lstatSync: fs3.lstatSync,
      statSync: fs3.statSync
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) {
        return exports2.FILE_SYSTEM_ADAPTER;
      }
      return Object.assign(Object.assign({}, exports2.FILE_SYSTEM_ADAPTER), fsMethods);
    }
    exports2.createFileSystemAdapter = createFileSystemAdapter;
  }
});

// node_modules/@nodelib/fs.stat/out/settings.js
var require_settings = __commonJS({
  "node_modules/@nodelib/fs.stat/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs3 = require_fs2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLink = this._getValue(this._options.followSymbolicLink, true);
        this.fs = fs3.createFileSystemAdapter(this._options.fs);
        this.markSymbolicLink = this._getValue(this._options.markSymbolicLink, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, true);
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.stat/out/index.js
var require_out = __commonJS({
  "node_modules/@nodelib/fs.stat/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.statSync = exports2.stat = exports2.Settings = void 0;
    var async = require_async();
    var sync = require_sync();
    var settings_1 = require_settings();
    exports2.Settings = settings_1.default;
    function stat(path3, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path3, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path3, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports2.stat = stat;
    function statSync(path3, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path3, settings);
    }
    exports2.statSync = statSync;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/queue-microtask/index.js
var require_queue_microtask = __commonJS({
  "node_modules/queue-microtask/index.js"(exports2, module2) {
    var promise;
    module2.exports = typeof queueMicrotask === "function" ? queueMicrotask.bind(typeof window !== "undefined" ? window : global) : (cb) => (promise || (promise = Promise.resolve())).then(cb).catch((err) => setTimeout(() => {
      throw err;
    }, 0));
  }
});

// node_modules/run-parallel/index.js
var require_run_parallel = __commonJS({
  "node_modules/run-parallel/index.js"(exports2, module2) {
    module2.exports = runParallel;
    var queueMicrotask2 = require_queue_microtask();
    function runParallel(tasks, cb) {
      let results, pending, keys;
      let isSync = true;
      if (Array.isArray(tasks)) {
        results = [];
        pending = tasks.length;
      } else {
        keys = Object.keys(tasks);
        results = {};
        pending = keys.length;
      }
      function done(err) {
        function end() {
          if (cb) cb(err, results);
          cb = null;
        }
        if (isSync) queueMicrotask2(end);
        else end();
      }
      function each(i, err, result2) {
        results[i] = result2;
        if (--pending === 0 || err) {
          done(err);
        }
      }
      if (!pending) {
        done(null);
      } else if (keys) {
        keys.forEach(function(key) {
          tasks[key](function(err, result2) {
            each(key, err, result2);
          });
        });
      } else {
        tasks.forEach(function(task, i) {
          task(function(err, result2) {
            each(i, err, result2);
          });
        });
      }
      isSync = false;
    }
  }
});

// node_modules/@nodelib/fs.scandir/out/constants.js
var require_constants3 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.IS_SUPPORT_READDIR_WITH_FILE_TYPES = void 0;
    var NODE_PROCESS_VERSION_PARTS = process.versions.node.split(".");
    if (NODE_PROCESS_VERSION_PARTS[0] === void 0 || NODE_PROCESS_VERSION_PARTS[1] === void 0) {
      throw new Error(`Unexpected behavior. The 'process.versions.node' variable has invalid value: ${process.versions.node}`);
    }
    var MAJOR_VERSION = Number.parseInt(NODE_PROCESS_VERSION_PARTS[0], 10);
    var MINOR_VERSION = Number.parseInt(NODE_PROCESS_VERSION_PARTS[1], 10);
    var SUPPORTED_MAJOR_VERSION = 10;
    var SUPPORTED_MINOR_VERSION = 10;
    var IS_MATCHED_BY_MAJOR = MAJOR_VERSION > SUPPORTED_MAJOR_VERSION;
    var IS_MATCHED_BY_MAJOR_AND_MINOR = MAJOR_VERSION === SUPPORTED_MAJOR_VERSION && MINOR_VERSION >= SUPPORTED_MINOR_VERSION;
    exports2.IS_SUPPORT_READDIR_WITH_FILE_TYPES = IS_MATCHED_BY_MAJOR || IS_MATCHED_BY_MAJOR_AND_MINOR;
  }
});

// node_modules/@nodelib/fs.scandir/out/utils/fs.js
var require_fs3 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/utils/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createDirentFromStats = void 0;
    var DirentFromStats = class {
      constructor(name, stats) {
        this.name = name;
        this.isBlockDevice = stats.isBlockDevice.bind(stats);
        this.isCharacterDevice = stats.isCharacterDevice.bind(stats);
        this.isDirectory = stats.isDirectory.bind(stats);
        this.isFIFO = stats.isFIFO.bind(stats);
        this.isFile = stats.isFile.bind(stats);
        this.isSocket = stats.isSocket.bind(stats);
        this.isSymbolicLink = stats.isSymbolicLink.bind(stats);
      }
    };
    function createDirentFromStats(name, stats) {
      return new DirentFromStats(name, stats);
    }
    exports2.createDirentFromStats = createDirentFromStats;
  }
});

// node_modules/@nodelib/fs.scandir/out/utils/index.js
var require_utils4 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/utils/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.fs = void 0;
    var fs3 = require_fs3();
    exports2.fs = fs3;
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/common.js
var require_common = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/common.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.joinPathSegments = void 0;
    function joinPathSegments(a, b, separator) {
      if (a.endsWith(separator)) {
        return a + b;
      }
      return a + separator + b;
    }
    exports2.joinPathSegments = joinPathSegments;
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/async.js
var require_async2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.readdir = exports2.readdirWithFileTypes = exports2.read = void 0;
    var fsStat = require_out();
    var rpl = require_run_parallel();
    var constants_1 = require_constants3();
    var utils = require_utils4();
    var common = require_common();
    function read(directory, settings, callback) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES) {
        readdirWithFileTypes(directory, settings, callback);
        return;
      }
      readdir(directory, settings, callback);
    }
    exports2.read = read;
    function readdirWithFileTypes(directory, settings, callback) {
      settings.fs.readdir(directory, { withFileTypes: true }, (readdirError, dirents) => {
        if (readdirError !== null) {
          callFailureCallback(callback, readdirError);
          return;
        }
        const entries = dirents.map((dirent) => ({
          dirent,
          name: dirent.name,
          path: common.joinPathSegments(directory, dirent.name, settings.pathSegmentSeparator)
        }));
        if (!settings.followSymbolicLinks) {
          callSuccessCallback(callback, entries);
          return;
        }
        const tasks = entries.map((entry) => makeRplTaskEntry(entry, settings));
        rpl(tasks, (rplError, rplEntries) => {
          if (rplError !== null) {
            callFailureCallback(callback, rplError);
            return;
          }
          callSuccessCallback(callback, rplEntries);
        });
      });
    }
    exports2.readdirWithFileTypes = readdirWithFileTypes;
    function makeRplTaskEntry(entry, settings) {
      return (done) => {
        if (!entry.dirent.isSymbolicLink()) {
          done(null, entry);
          return;
        }
        settings.fs.stat(entry.path, (statError, stats) => {
          if (statError !== null) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              done(statError);
              return;
            }
            done(null, entry);
            return;
          }
          entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
          done(null, entry);
        });
      };
    }
    function readdir(directory, settings, callback) {
      settings.fs.readdir(directory, (readdirError, names) => {
        if (readdirError !== null) {
          callFailureCallback(callback, readdirError);
          return;
        }
        const tasks = names.map((name) => {
          const path3 = common.joinPathSegments(directory, name, settings.pathSegmentSeparator);
          return (done) => {
            fsStat.stat(path3, settings.fsStatSettings, (error, stats) => {
              if (error !== null) {
                done(error);
                return;
              }
              const entry = {
                name,
                path: path3,
                dirent: utils.fs.createDirentFromStats(name, stats)
              };
              if (settings.stats) {
                entry.stats = stats;
              }
              done(null, entry);
            });
          };
        });
        rpl(tasks, (rplError, entries) => {
          if (rplError !== null) {
            callFailureCallback(callback, rplError);
            return;
          }
          callSuccessCallback(callback, entries);
        });
      });
    }
    exports2.readdir = readdir;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, result2) {
      callback(null, result2);
    }
  }
});

// node_modules/@nodelib/fs.scandir/out/providers/sync.js
var require_sync2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.readdir = exports2.readdirWithFileTypes = exports2.read = void 0;
    var fsStat = require_out();
    var constants_1 = require_constants3();
    var utils = require_utils4();
    var common = require_common();
    function read(directory, settings) {
      if (!settings.stats && constants_1.IS_SUPPORT_READDIR_WITH_FILE_TYPES) {
        return readdirWithFileTypes(directory, settings);
      }
      return readdir(directory, settings);
    }
    exports2.read = read;
    function readdirWithFileTypes(directory, settings) {
      const dirents = settings.fs.readdirSync(directory, { withFileTypes: true });
      return dirents.map((dirent) => {
        const entry = {
          dirent,
          name: dirent.name,
          path: common.joinPathSegments(directory, dirent.name, settings.pathSegmentSeparator)
        };
        if (entry.dirent.isSymbolicLink() && settings.followSymbolicLinks) {
          try {
            const stats = settings.fs.statSync(entry.path);
            entry.dirent = utils.fs.createDirentFromStats(entry.name, stats);
          } catch (error) {
            if (settings.throwErrorOnBrokenSymbolicLink) {
              throw error;
            }
          }
        }
        return entry;
      });
    }
    exports2.readdirWithFileTypes = readdirWithFileTypes;
    function readdir(directory, settings) {
      const names = settings.fs.readdirSync(directory);
      return names.map((name) => {
        const entryPath = common.joinPathSegments(directory, name, settings.pathSegmentSeparator);
        const stats = fsStat.statSync(entryPath, settings.fsStatSettings);
        const entry = {
          name,
          path: entryPath,
          dirent: utils.fs.createDirentFromStats(name, stats)
        };
        if (settings.stats) {
          entry.stats = stats;
        }
        return entry;
      });
    }
    exports2.readdir = readdir;
  }
});

// node_modules/@nodelib/fs.scandir/out/adapters/fs.js
var require_fs4 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/adapters/fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createFileSystemAdapter = exports2.FILE_SYSTEM_ADAPTER = void 0;
    var fs3 = require("fs");
    exports2.FILE_SYSTEM_ADAPTER = {
      lstat: fs3.lstat,
      stat: fs3.stat,
      lstatSync: fs3.lstatSync,
      statSync: fs3.statSync,
      readdir: fs3.readdir,
      readdirSync: fs3.readdirSync
    };
    function createFileSystemAdapter(fsMethods) {
      if (fsMethods === void 0) {
        return exports2.FILE_SYSTEM_ADAPTER;
      }
      return Object.assign(Object.assign({}, exports2.FILE_SYSTEM_ADAPTER), fsMethods);
    }
    exports2.createFileSystemAdapter = createFileSystemAdapter;
  }
});

// node_modules/@nodelib/fs.scandir/out/settings.js
var require_settings2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path3 = require("path");
    var fsStat = require_out();
    var fs3 = require_fs4();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.followSymbolicLinks = this._getValue(this._options.followSymbolicLinks, false);
        this.fs = fs3.createFileSystemAdapter(this._options.fs);
        this.pathSegmentSeparator = this._getValue(this._options.pathSegmentSeparator, path3.sep);
        this.stats = this._getValue(this._options.stats, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, true);
        this.fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this.followSymbolicLinks,
          fs: this.fs,
          throwErrorOnBrokenSymbolicLink: this.throwErrorOnBrokenSymbolicLink
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.scandir/out/index.js
var require_out2 = __commonJS({
  "node_modules/@nodelib/fs.scandir/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Settings = exports2.scandirSync = exports2.scandir = void 0;
    var async = require_async2();
    var sync = require_sync2();
    var settings_1 = require_settings2();
    exports2.Settings = settings_1.default;
    function scandir(path3, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        async.read(path3, getSettings(), optionsOrSettingsOrCallback);
        return;
      }
      async.read(path3, getSettings(optionsOrSettingsOrCallback), callback);
    }
    exports2.scandir = scandir;
    function scandirSync(path3, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      return sync.read(path3, settings);
    }
    exports2.scandirSync = scandirSync;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/reusify/reusify.js
var require_reusify = __commonJS({
  "node_modules/reusify/reusify.js"(exports2, module2) {
    "use strict";
    function reusify(Constructor) {
      var head = new Constructor();
      var tail = head;
      function get() {
        var current = head;
        if (current.next) {
          head = current.next;
        } else {
          head = new Constructor();
          tail = head;
        }
        current.next = null;
        return current;
      }
      function release(obj) {
        tail.next = obj;
        tail = obj;
      }
      return {
        get,
        release
      };
    }
    module2.exports = reusify;
  }
});

// node_modules/fastq/queue.js
var require_queue = __commonJS({
  "node_modules/fastq/queue.js"(exports2, module2) {
    "use strict";
    var reusify = require_reusify();
    function fastqueue(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      if (!(_concurrency >= 1)) {
        throw new Error("fastqueue concurrency must be equal to or greater than 1");
      }
      var cache = reusify(Task);
      var queueHead = null;
      var queueTail = null;
      var _running = 0;
      var errorHandler = null;
      var self = {
        push,
        drain: noop,
        saturated: noop,
        pause,
        paused: false,
        get concurrency() {
          return _concurrency;
        },
        set concurrency(value) {
          if (!(value >= 1)) {
            throw new Error("fastqueue concurrency must be equal to or greater than 1");
          }
          _concurrency = value;
          if (self.paused) return;
          for (; queueHead && _running < _concurrency; ) {
            _running++;
            release();
          }
        },
        running,
        resume,
        idle,
        length,
        getQueue,
        unshift,
        empty: noop,
        kill,
        killAndDrain,
        error
      };
      return self;
      function running() {
        return _running;
      }
      function pause() {
        self.paused = true;
      }
      function length() {
        var current = queueHead;
        var counter = 0;
        while (current) {
          current = current.next;
          counter++;
        }
        return counter;
      }
      function getQueue() {
        var current = queueHead;
        var tasks = [];
        while (current) {
          tasks.push(current.value);
          current = current.next;
        }
        return tasks;
      }
      function resume() {
        if (!self.paused) return;
        self.paused = false;
        if (queueHead === null) {
          _running++;
          release();
          return;
        }
        for (; queueHead && _running < _concurrency; ) {
          _running++;
          release();
        }
      }
      function idle() {
        return _running === 0 && self.length() === 0;
      }
      function push(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueTail) {
            queueTail.next = current;
            queueTail = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function unshift(value, done) {
        var current = cache.get();
        current.context = context;
        current.release = release;
        current.value = value;
        current.callback = done || noop;
        current.errorHandler = errorHandler;
        if (_running >= _concurrency || self.paused) {
          if (queueHead) {
            current.next = queueHead;
            queueHead = current;
          } else {
            queueHead = current;
            queueTail = current;
            self.saturated();
          }
        } else {
          _running++;
          worker.call(context, current.value, current.worked);
        }
      }
      function release(holder) {
        if (holder) {
          cache.release(holder);
        }
        var next = queueHead;
        if (next && _running <= _concurrency) {
          if (!self.paused) {
            if (queueTail === queueHead) {
              queueTail = null;
            }
            queueHead = next.next;
            next.next = null;
            worker.call(context, next.value, next.worked);
            if (queueTail === null) {
              self.empty();
            }
          } else {
            _running--;
          }
        } else if (--_running === 0) {
          self.drain();
        }
      }
      function kill() {
        queueHead = null;
        queueTail = null;
        self.drain = noop;
      }
      function killAndDrain() {
        queueHead = null;
        queueTail = null;
        self.drain();
        self.drain = noop;
      }
      function error(handler) {
        errorHandler = handler;
      }
    }
    function noop() {
    }
    function Task() {
      this.value = null;
      this.callback = noop;
      this.next = null;
      this.release = noop;
      this.context = null;
      this.errorHandler = null;
      var self = this;
      this.worked = function worked(err, result2) {
        var callback = self.callback;
        var errorHandler = self.errorHandler;
        var val = self.value;
        self.value = null;
        self.callback = noop;
        if (self.errorHandler) {
          errorHandler(err, val);
        }
        callback.call(self.context, err, result2);
        self.release(self);
      };
    }
    function queueAsPromised(context, worker, _concurrency) {
      if (typeof context === "function") {
        _concurrency = worker;
        worker = context;
        context = null;
      }
      function asyncWrapper(arg, cb) {
        worker.call(this, arg).then(function(res) {
          cb(null, res);
        }, cb);
      }
      var queue = fastqueue(context, asyncWrapper, _concurrency);
      var pushCb = queue.push;
      var unshiftCb = queue.unshift;
      queue.push = push;
      queue.unshift = unshift;
      queue.drained = drained;
      return queue;
      function push(value) {
        var p = new Promise(function(resolve, reject) {
          pushCb(value, function(err, result2) {
            if (err) {
              reject(err);
              return;
            }
            resolve(result2);
          });
        });
        p.catch(noop);
        return p;
      }
      function unshift(value) {
        var p = new Promise(function(resolve, reject) {
          unshiftCb(value, function(err, result2) {
            if (err) {
              reject(err);
              return;
            }
            resolve(result2);
          });
        });
        p.catch(noop);
        return p;
      }
      function drained() {
        if (queue.idle()) {
          return new Promise(function(resolve) {
            resolve();
          });
        }
        var previousDrain = queue.drain;
        var p = new Promise(function(resolve) {
          queue.drain = function() {
            previousDrain();
            resolve();
          };
        });
        return p;
      }
    }
    module2.exports = fastqueue;
    module2.exports.promise = queueAsPromised;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/common.js
var require_common2 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/common.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.joinPathSegments = exports2.replacePathSegmentSeparator = exports2.isAppliedFilter = exports2.isFatalError = void 0;
    function isFatalError(settings, error) {
      if (settings.errorFilter === null) {
        return true;
      }
      return !settings.errorFilter(error);
    }
    exports2.isFatalError = isFatalError;
    function isAppliedFilter(filter, value) {
      return filter === null || filter(value);
    }
    exports2.isAppliedFilter = isAppliedFilter;
    function replacePathSegmentSeparator(filepath, separator) {
      return filepath.split(/[/\\]/).join(separator);
    }
    exports2.replacePathSegmentSeparator = replacePathSegmentSeparator;
    function joinPathSegments(a, b, separator) {
      if (a === "") {
        return b;
      }
      if (a.endsWith(separator)) {
        return a + b;
      }
      return a + separator + b;
    }
    exports2.joinPathSegments = joinPathSegments;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/reader.js
var require_reader = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var common = require_common2();
    var Reader = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._root = common.replacePathSegmentSeparator(_root, _settings.pathSegmentSeparator);
      }
    };
    exports2.default = Reader;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/async.js
var require_async3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var events_1 = require("events");
    var fsScandir = require_out2();
    var fastq = require_queue();
    var common = require_common2();
    var reader_1 = require_reader();
    var AsyncReader = class extends reader_1.default {
      constructor(_root, _settings) {
        super(_root, _settings);
        this._settings = _settings;
        this._scandir = fsScandir.scandir;
        this._emitter = new events_1.EventEmitter();
        this._queue = fastq(this._worker.bind(this), this._settings.concurrency);
        this._isFatalError = false;
        this._isDestroyed = false;
        this._queue.drain = () => {
          if (!this._isFatalError) {
            this._emitter.emit("end");
          }
        };
      }
      read() {
        this._isFatalError = false;
        this._isDestroyed = false;
        setImmediate(() => {
          this._pushToQueue(this._root, this._settings.basePath);
        });
        return this._emitter;
      }
      get isDestroyed() {
        return this._isDestroyed;
      }
      destroy() {
        if (this._isDestroyed) {
          throw new Error("The reader is already destroyed");
        }
        this._isDestroyed = true;
        this._queue.killAndDrain();
      }
      onEntry(callback) {
        this._emitter.on("entry", callback);
      }
      onError(callback) {
        this._emitter.once("error", callback);
      }
      onEnd(callback) {
        this._emitter.once("end", callback);
      }
      _pushToQueue(directory, base) {
        const queueItem = { directory, base };
        this._queue.push(queueItem, (error) => {
          if (error !== null) {
            this._handleError(error);
          }
        });
      }
      _worker(item, done) {
        this._scandir(item.directory, this._settings.fsScandirSettings, (error, entries) => {
          if (error !== null) {
            done(error, void 0);
            return;
          }
          for (const entry of entries) {
            this._handleEntry(entry, item.base);
          }
          done(null, void 0);
        });
      }
      _handleError(error) {
        if (this._isDestroyed || !common.isFatalError(this._settings, error)) {
          return;
        }
        this._isFatalError = true;
        this._isDestroyed = true;
        this._emitter.emit("error", error);
      }
      _handleEntry(entry, base) {
        if (this._isDestroyed || this._isFatalError) {
          return;
        }
        const fullpath = entry.path;
        if (base !== void 0) {
          entry.path = common.joinPathSegments(base, entry.name, this._settings.pathSegmentSeparator);
        }
        if (common.isAppliedFilter(this._settings.entryFilter, entry)) {
          this._emitEntry(entry);
        }
        if (entry.dirent.isDirectory() && common.isAppliedFilter(this._settings.deepFilter, entry)) {
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
        }
      }
      _emitEntry(entry) {
        this._emitter.emit("entry", entry);
      }
    };
    exports2.default = AsyncReader;
  }
});

// node_modules/@nodelib/fs.walk/out/providers/async.js
var require_async4 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var async_1 = require_async3();
    var AsyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._storage = [];
      }
      read(callback) {
        this._reader.onError((error) => {
          callFailureCallback(callback, error);
        });
        this._reader.onEntry((entry) => {
          this._storage.push(entry);
        });
        this._reader.onEnd(() => {
          callSuccessCallback(callback, this._storage);
        });
        this._reader.read();
      }
    };
    exports2.default = AsyncProvider;
    function callFailureCallback(callback, error) {
      callback(error);
    }
    function callSuccessCallback(callback, entries) {
      callback(null, entries);
    }
  }
});

// node_modules/@nodelib/fs.walk/out/providers/stream.js
var require_stream2 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var async_1 = require_async3();
    var StreamProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new async_1.default(this._root, this._settings);
        this._stream = new stream_1.Readable({
          objectMode: true,
          read: () => {
          },
          destroy: () => {
            if (!this._reader.isDestroyed) {
              this._reader.destroy();
            }
          }
        });
      }
      read() {
        this._reader.onError((error) => {
          this._stream.emit("error", error);
        });
        this._reader.onEntry((entry) => {
          this._stream.push(entry);
        });
        this._reader.onEnd(() => {
          this._stream.push(null);
        });
        this._reader.read();
        return this._stream;
      }
    };
    exports2.default = StreamProvider;
  }
});

// node_modules/@nodelib/fs.walk/out/readers/sync.js
var require_sync3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/readers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsScandir = require_out2();
    var common = require_common2();
    var reader_1 = require_reader();
    var SyncReader = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._scandir = fsScandir.scandirSync;
        this._storage = [];
        this._queue = /* @__PURE__ */ new Set();
      }
      read() {
        this._pushToQueue(this._root, this._settings.basePath);
        this._handleQueue();
        return this._storage;
      }
      _pushToQueue(directory, base) {
        this._queue.add({ directory, base });
      }
      _handleQueue() {
        for (const item of this._queue.values()) {
          this._handleDirectory(item.directory, item.base);
        }
      }
      _handleDirectory(directory, base) {
        try {
          const entries = this._scandir(directory, this._settings.fsScandirSettings);
          for (const entry of entries) {
            this._handleEntry(entry, base);
          }
        } catch (error) {
          this._handleError(error);
        }
      }
      _handleError(error) {
        if (!common.isFatalError(this._settings, error)) {
          return;
        }
        throw error;
      }
      _handleEntry(entry, base) {
        const fullpath = entry.path;
        if (base !== void 0) {
          entry.path = common.joinPathSegments(base, entry.name, this._settings.pathSegmentSeparator);
        }
        if (common.isAppliedFilter(this._settings.entryFilter, entry)) {
          this._pushToStorage(entry);
        }
        if (entry.dirent.isDirectory() && common.isAppliedFilter(this._settings.deepFilter, entry)) {
          this._pushToQueue(fullpath, base === void 0 ? void 0 : entry.path);
        }
      }
      _pushToStorage(entry) {
        this._storage.push(entry);
      }
    };
    exports2.default = SyncReader;
  }
});

// node_modules/@nodelib/fs.walk/out/providers/sync.js
var require_sync4 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var sync_1 = require_sync3();
    var SyncProvider = class {
      constructor(_root, _settings) {
        this._root = _root;
        this._settings = _settings;
        this._reader = new sync_1.default(this._root, this._settings);
      }
      read() {
        return this._reader.read();
      }
    };
    exports2.default = SyncProvider;
  }
});

// node_modules/@nodelib/fs.walk/out/settings.js
var require_settings3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path3 = require("path");
    var fsScandir = require_out2();
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.basePath = this._getValue(this._options.basePath, void 0);
        this.concurrency = this._getValue(this._options.concurrency, Number.POSITIVE_INFINITY);
        this.deepFilter = this._getValue(this._options.deepFilter, null);
        this.entryFilter = this._getValue(this._options.entryFilter, null);
        this.errorFilter = this._getValue(this._options.errorFilter, null);
        this.pathSegmentSeparator = this._getValue(this._options.pathSegmentSeparator, path3.sep);
        this.fsScandirSettings = new fsScandir.Settings({
          followSymbolicLinks: this._options.followSymbolicLinks,
          fs: this._options.fs,
          pathSegmentSeparator: this._options.pathSegmentSeparator,
          stats: this._options.stats,
          throwErrorOnBrokenSymbolicLink: this._options.throwErrorOnBrokenSymbolicLink
        });
      }
      _getValue(option, value) {
        return option !== null && option !== void 0 ? option : value;
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/@nodelib/fs.walk/out/index.js
var require_out3 = __commonJS({
  "node_modules/@nodelib/fs.walk/out/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Settings = exports2.walkStream = exports2.walkSync = exports2.walk = void 0;
    var async_1 = require_async4();
    var stream_1 = require_stream2();
    var sync_1 = require_sync4();
    var settings_1 = require_settings3();
    exports2.Settings = settings_1.default;
    function walk(directory, optionsOrSettingsOrCallback, callback) {
      if (typeof optionsOrSettingsOrCallback === "function") {
        new async_1.default(directory, getSettings()).read(optionsOrSettingsOrCallback);
        return;
      }
      new async_1.default(directory, getSettings(optionsOrSettingsOrCallback)).read(callback);
    }
    exports2.walk = walk;
    function walkSync(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      const provider = new sync_1.default(directory, settings);
      return provider.read();
    }
    exports2.walkSync = walkSync;
    function walkStream(directory, optionsOrSettings) {
      const settings = getSettings(optionsOrSettings);
      const provider = new stream_1.default(directory, settings);
      return provider.read();
    }
    exports2.walkStream = walkStream;
    function getSettings(settingsOrOptions = {}) {
      if (settingsOrOptions instanceof settings_1.default) {
        return settingsOrOptions;
      }
      return new settings_1.default(settingsOrOptions);
    }
  }
});

// node_modules/fast-glob/out/readers/reader.js
var require_reader2 = __commonJS({
  "node_modules/fast-glob/out/readers/reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path3 = require("path");
    var fsStat = require_out();
    var utils = require_utils3();
    var Reader = class {
      constructor(_settings) {
        this._settings = _settings;
        this._fsStatSettings = new fsStat.Settings({
          followSymbolicLink: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          throwErrorOnBrokenSymbolicLink: this._settings.followSymbolicLinks
        });
      }
      _getFullEntryPath(filepath) {
        return path3.resolve(this._settings.cwd, filepath);
      }
      _makeEntry(stats, pattern) {
        const entry = {
          name: pattern,
          path: pattern,
          dirent: utils.fs.createDirentFromStats(pattern, stats)
        };
        if (this._settings.stats) {
          entry.stats = stats;
        }
        return entry;
      }
      _isFatalError(error) {
        return !utils.errno.isEnoentCodeError(error) && !this._settings.suppressErrors;
      }
    };
    exports2.default = Reader;
  }
});

// node_modules/fast-glob/out/readers/stream.js
var require_stream3 = __commonJS({
  "node_modules/fast-glob/out/readers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var fsStat = require_out();
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var ReaderStream = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkStream = fsWalk.walkStream;
        this._stat = fsStat.stat;
      }
      dynamic(root, options) {
        return this._walkStream(root, options);
      }
      static(patterns, options) {
        const filepaths = patterns.map(this._getFullEntryPath, this);
        const stream = new stream_1.PassThrough({ objectMode: true });
        stream._write = (index, _enc, done) => {
          return this._getEntry(filepaths[index], patterns[index], options).then((entry) => {
            if (entry !== null && options.entryFilter(entry)) {
              stream.push(entry);
            }
            if (index === filepaths.length - 1) {
              stream.end();
            }
            done();
          }).catch(done);
        };
        for (let i = 0; i < filepaths.length; i++) {
          stream.write(i);
        }
        return stream;
      }
      _getEntry(filepath, pattern, options) {
        return this._getStat(filepath).then((stats) => this._makeEntry(stats, pattern)).catch((error) => {
          if (options.errorFilter(error)) {
            return null;
          }
          throw error;
        });
      }
      _getStat(filepath) {
        return new Promise((resolve, reject) => {
          this._stat(filepath, this._fsStatSettings, (error, stats) => {
            return error === null ? resolve(stats) : reject(error);
          });
        });
      }
    };
    exports2.default = ReaderStream;
  }
});

// node_modules/fast-glob/out/readers/async.js
var require_async5 = __commonJS({
  "node_modules/fast-glob/out/readers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var stream_1 = require_stream3();
    var ReaderAsync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkAsync = fsWalk.walk;
        this._readerStream = new stream_1.default(this._settings);
      }
      dynamic(root, options) {
        return new Promise((resolve, reject) => {
          this._walkAsync(root, options, (error, entries) => {
            if (error === null) {
              resolve(entries);
            } else {
              reject(error);
            }
          });
        });
      }
      async static(patterns, options) {
        const entries = [];
        const stream = this._readerStream.static(patterns, options);
        return new Promise((resolve, reject) => {
          stream.once("error", reject);
          stream.on("data", (entry) => entries.push(entry));
          stream.once("end", () => resolve(entries));
        });
      }
    };
    exports2.default = ReaderAsync;
  }
});

// node_modules/fast-glob/out/providers/matchers/matcher.js
var require_matcher = __commonJS({
  "node_modules/fast-glob/out/providers/matchers/matcher.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils3();
    var Matcher = class {
      constructor(_patterns, _settings, _micromatchOptions) {
        this._patterns = _patterns;
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this._storage = [];
        this._fillStorage();
      }
      _fillStorage() {
        for (const pattern of this._patterns) {
          const segments = this._getPatternSegments(pattern);
          const sections = this._splitSegmentsIntoSections(segments);
          this._storage.push({
            complete: sections.length <= 1,
            pattern,
            segments,
            sections
          });
        }
      }
      _getPatternSegments(pattern) {
        const parts = utils.pattern.getPatternParts(pattern, this._micromatchOptions);
        return parts.map((part) => {
          const dynamic = utils.pattern.isDynamicPattern(part, this._settings);
          if (!dynamic) {
            return {
              dynamic: false,
              pattern: part
            };
          }
          return {
            dynamic: true,
            pattern: part,
            patternRe: utils.pattern.makeRe(part, this._micromatchOptions)
          };
        });
      }
      _splitSegmentsIntoSections(segments) {
        return utils.array.splitWhen(segments, (segment) => segment.dynamic && utils.pattern.hasGlobStar(segment.pattern));
      }
    };
    exports2.default = Matcher;
  }
});

// node_modules/fast-glob/out/providers/matchers/partial.js
var require_partial = __commonJS({
  "node_modules/fast-glob/out/providers/matchers/partial.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var matcher_1 = require_matcher();
    var PartialMatcher = class extends matcher_1.default {
      match(filepath) {
        const parts = filepath.split("/");
        const levels = parts.length;
        const patterns = this._storage.filter((info) => !info.complete || info.segments.length > levels);
        for (const pattern of patterns) {
          const section = pattern.sections[0];
          if (!pattern.complete && levels > section.length) {
            return true;
          }
          const match = parts.every((part, index) => {
            const segment = pattern.segments[index];
            if (segment.dynamic && segment.patternRe.test(part)) {
              return true;
            }
            if (!segment.dynamic && segment.pattern === part) {
              return true;
            }
            return false;
          });
          if (match) {
            return true;
          }
        }
        return false;
      }
    };
    exports2.default = PartialMatcher;
  }
});

// node_modules/fast-glob/out/providers/filters/deep.js
var require_deep = __commonJS({
  "node_modules/fast-glob/out/providers/filters/deep.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils3();
    var partial_1 = require_partial();
    var DeepFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
      }
      getFilter(basePath, positive, negative) {
        const matcher = this._getMatcher(positive);
        const negativeRe = this._getNegativePatternsRe(negative);
        return (entry) => this._filter(basePath, entry, matcher, negativeRe);
      }
      _getMatcher(patterns) {
        return new partial_1.default(patterns, this._settings, this._micromatchOptions);
      }
      _getNegativePatternsRe(patterns) {
        const affectDepthOfReadingPatterns = patterns.filter(utils.pattern.isAffectDepthOfReadingPattern);
        return utils.pattern.convertPatternsToRe(affectDepthOfReadingPatterns, this._micromatchOptions);
      }
      _filter(basePath, entry, matcher, negativeRe) {
        if (this._isSkippedByDeep(basePath, entry.path)) {
          return false;
        }
        if (this._isSkippedSymbolicLink(entry)) {
          return false;
        }
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._isSkippedByPositivePatterns(filepath, matcher)) {
          return false;
        }
        return this._isSkippedByNegativePatterns(filepath, negativeRe);
      }
      _isSkippedByDeep(basePath, entryPath) {
        if (this._settings.deep === Infinity) {
          return false;
        }
        return this._getEntryLevel(basePath, entryPath) >= this._settings.deep;
      }
      _getEntryLevel(basePath, entryPath) {
        const entryPathDepth = entryPath.split("/").length;
        if (basePath === "") {
          return entryPathDepth;
        }
        const basePathDepth = basePath.split("/").length;
        return entryPathDepth - basePathDepth;
      }
      _isSkippedSymbolicLink(entry) {
        return !this._settings.followSymbolicLinks && entry.dirent.isSymbolicLink();
      }
      _isSkippedByPositivePatterns(entryPath, matcher) {
        return !this._settings.baseNameMatch && !matcher.match(entryPath);
      }
      _isSkippedByNegativePatterns(entryPath, patternsRe) {
        return !utils.pattern.matchAny(entryPath, patternsRe);
      }
    };
    exports2.default = DeepFilter;
  }
});

// node_modules/fast-glob/out/providers/filters/entry.js
var require_entry = __commonJS({
  "node_modules/fast-glob/out/providers/filters/entry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils3();
    var EntryFilter = class {
      constructor(_settings, _micromatchOptions) {
        this._settings = _settings;
        this._micromatchOptions = _micromatchOptions;
        this.index = /* @__PURE__ */ new Map();
      }
      getFilter(positive, negative) {
        const positiveRe = utils.pattern.convertPatternsToRe(positive, this._micromatchOptions);
        const negativeRe = utils.pattern.convertPatternsToRe(negative, Object.assign(Object.assign({}, this._micromatchOptions), { dot: true }));
        return (entry) => this._filter(entry, positiveRe, negativeRe);
      }
      _filter(entry, positiveRe, negativeRe) {
        const filepath = utils.path.removeLeadingDotSegment(entry.path);
        if (this._settings.unique && this._isDuplicateEntry(filepath)) {
          return false;
        }
        if (this._onlyFileFilter(entry) || this._onlyDirectoryFilter(entry)) {
          return false;
        }
        if (this._isSkippedByAbsoluteNegativePatterns(filepath, negativeRe)) {
          return false;
        }
        const isDirectory = entry.dirent.isDirectory();
        const isMatched = this._isMatchToPatterns(filepath, positiveRe, isDirectory) && !this._isMatchToPatterns(filepath, negativeRe, isDirectory);
        if (this._settings.unique && isMatched) {
          this._createIndexRecord(filepath);
        }
        return isMatched;
      }
      _isDuplicateEntry(filepath) {
        return this.index.has(filepath);
      }
      _createIndexRecord(filepath) {
        this.index.set(filepath, void 0);
      }
      _onlyFileFilter(entry) {
        return this._settings.onlyFiles && !entry.dirent.isFile();
      }
      _onlyDirectoryFilter(entry) {
        return this._settings.onlyDirectories && !entry.dirent.isDirectory();
      }
      _isSkippedByAbsoluteNegativePatterns(entryPath, patternsRe) {
        if (!this._settings.absolute) {
          return false;
        }
        const fullpath = utils.path.makeAbsolute(this._settings.cwd, entryPath);
        return utils.pattern.matchAny(fullpath, patternsRe);
      }
      _isMatchToPatterns(filepath, patternsRe, isDirectory) {
        const isMatched = utils.pattern.matchAny(filepath, patternsRe);
        if (!isMatched && isDirectory) {
          return utils.pattern.matchAny(filepath + "/", patternsRe);
        }
        return isMatched;
      }
    };
    exports2.default = EntryFilter;
  }
});

// node_modules/fast-glob/out/providers/filters/error.js
var require_error = __commonJS({
  "node_modules/fast-glob/out/providers/filters/error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils3();
    var ErrorFilter = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getFilter() {
        return (error) => this._isNonFatalError(error);
      }
      _isNonFatalError(error) {
        return utils.errno.isEnoentCodeError(error) || this._settings.suppressErrors;
      }
    };
    exports2.default = ErrorFilter;
  }
});

// node_modules/fast-glob/out/providers/transformers/entry.js
var require_entry2 = __commonJS({
  "node_modules/fast-glob/out/providers/transformers/entry.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var utils = require_utils3();
    var EntryTransformer = class {
      constructor(_settings) {
        this._settings = _settings;
      }
      getTransformer() {
        return (entry) => this._transform(entry);
      }
      _transform(entry) {
        let filepath = entry.path;
        if (this._settings.absolute) {
          filepath = utils.path.makeAbsolute(this._settings.cwd, filepath);
          filepath = utils.path.unixify(filepath);
        }
        if (this._settings.markDirectories && entry.dirent.isDirectory()) {
          filepath += "/";
        }
        if (!this._settings.objectMode) {
          return filepath;
        }
        return Object.assign(Object.assign({}, entry), { path: filepath });
      }
    };
    exports2.default = EntryTransformer;
  }
});

// node_modules/fast-glob/out/providers/provider.js
var require_provider = __commonJS({
  "node_modules/fast-glob/out/providers/provider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var path3 = require("path");
    var deep_1 = require_deep();
    var entry_1 = require_entry();
    var error_1 = require_error();
    var entry_2 = require_entry2();
    var Provider = class {
      constructor(_settings) {
        this._settings = _settings;
        this.errorFilter = new error_1.default(this._settings);
        this.entryFilter = new entry_1.default(this._settings, this._getMicromatchOptions());
        this.deepFilter = new deep_1.default(this._settings, this._getMicromatchOptions());
        this.entryTransformer = new entry_2.default(this._settings);
      }
      _getRootDirectory(task) {
        return path3.resolve(this._settings.cwd, task.base);
      }
      _getReaderOptions(task) {
        const basePath = task.base === "." ? "" : task.base;
        return {
          basePath,
          pathSegmentSeparator: "/",
          concurrency: this._settings.concurrency,
          deepFilter: this.deepFilter.getFilter(basePath, task.positive, task.negative),
          entryFilter: this.entryFilter.getFilter(task.positive, task.negative),
          errorFilter: this.errorFilter.getFilter(),
          followSymbolicLinks: this._settings.followSymbolicLinks,
          fs: this._settings.fs,
          stats: this._settings.stats,
          throwErrorOnBrokenSymbolicLink: this._settings.throwErrorOnBrokenSymbolicLink,
          transform: this.entryTransformer.getTransformer()
        };
      }
      _getMicromatchOptions() {
        return {
          dot: this._settings.dot,
          matchBase: this._settings.baseNameMatch,
          nobrace: !this._settings.braceExpansion,
          nocase: !this._settings.caseSensitiveMatch,
          noext: !this._settings.extglob,
          noglobstar: !this._settings.globstar,
          posix: true,
          strictSlashes: false
        };
      }
    };
    exports2.default = Provider;
  }
});

// node_modules/fast-glob/out/providers/async.js
var require_async6 = __commonJS({
  "node_modules/fast-glob/out/providers/async.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var async_1 = require_async5();
    var provider_1 = require_provider();
    var ProviderAsync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new async_1.default(this._settings);
      }
      async read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const entries = await this.api(root, task, options);
        return entries.map((entry) => options.transform(entry));
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderAsync;
  }
});

// node_modules/fast-glob/out/providers/stream.js
var require_stream4 = __commonJS({
  "node_modules/fast-glob/out/providers/stream.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var stream_1 = require("stream");
    var stream_2 = require_stream3();
    var provider_1 = require_provider();
    var ProviderStream = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new stream_2.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const source2 = this.api(root, task, options);
        const destination = new stream_1.Readable({ objectMode: true, read: () => {
        } });
        source2.once("error", (error) => destination.emit("error", error)).on("data", (entry) => destination.emit("data", options.transform(entry))).once("end", () => destination.emit("end"));
        destination.once("close", () => source2.destroy());
        return destination;
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderStream;
  }
});

// node_modules/fast-glob/out/readers/sync.js
var require_sync5 = __commonJS({
  "node_modules/fast-glob/out/readers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fsStat = require_out();
    var fsWalk = require_out3();
    var reader_1 = require_reader2();
    var ReaderSync = class extends reader_1.default {
      constructor() {
        super(...arguments);
        this._walkSync = fsWalk.walkSync;
        this._statSync = fsStat.statSync;
      }
      dynamic(root, options) {
        return this._walkSync(root, options);
      }
      static(patterns, options) {
        const entries = [];
        for (const pattern of patterns) {
          const filepath = this._getFullEntryPath(pattern);
          const entry = this._getEntry(filepath, pattern, options);
          if (entry === null || !options.entryFilter(entry)) {
            continue;
          }
          entries.push(entry);
        }
        return entries;
      }
      _getEntry(filepath, pattern, options) {
        try {
          const stats = this._getStat(filepath);
          return this._makeEntry(stats, pattern);
        } catch (error) {
          if (options.errorFilter(error)) {
            return null;
          }
          throw error;
        }
      }
      _getStat(filepath) {
        return this._statSync(filepath, this._fsStatSettings);
      }
    };
    exports2.default = ReaderSync;
  }
});

// node_modules/fast-glob/out/providers/sync.js
var require_sync6 = __commonJS({
  "node_modules/fast-glob/out/providers/sync.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var sync_1 = require_sync5();
    var provider_1 = require_provider();
    var ProviderSync = class extends provider_1.default {
      constructor() {
        super(...arguments);
        this._reader = new sync_1.default(this._settings);
      }
      read(task) {
        const root = this._getRootDirectory(task);
        const options = this._getReaderOptions(task);
        const entries = this.api(root, task, options);
        return entries.map(options.transform);
      }
      api(root, task, options) {
        if (task.dynamic) {
          return this._reader.dynamic(root, options);
        }
        return this._reader.static(task.patterns, options);
      }
    };
    exports2.default = ProviderSync;
  }
});

// node_modules/fast-glob/out/settings.js
var require_settings4 = __commonJS({
  "node_modules/fast-glob/out/settings.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_FILE_SYSTEM_ADAPTER = void 0;
    var fs3 = require("fs");
    var os = require("os");
    var CPU_COUNT = Math.max(os.cpus().length, 1);
    exports2.DEFAULT_FILE_SYSTEM_ADAPTER = {
      lstat: fs3.lstat,
      lstatSync: fs3.lstatSync,
      stat: fs3.stat,
      statSync: fs3.statSync,
      readdir: fs3.readdir,
      readdirSync: fs3.readdirSync
    };
    var Settings = class {
      constructor(_options = {}) {
        this._options = _options;
        this.absolute = this._getValue(this._options.absolute, false);
        this.baseNameMatch = this._getValue(this._options.baseNameMatch, false);
        this.braceExpansion = this._getValue(this._options.braceExpansion, true);
        this.caseSensitiveMatch = this._getValue(this._options.caseSensitiveMatch, true);
        this.concurrency = this._getValue(this._options.concurrency, CPU_COUNT);
        this.cwd = this._getValue(this._options.cwd, process.cwd());
        this.deep = this._getValue(this._options.deep, Infinity);
        this.dot = this._getValue(this._options.dot, false);
        this.extglob = this._getValue(this._options.extglob, true);
        this.followSymbolicLinks = this._getValue(this._options.followSymbolicLinks, true);
        this.fs = this._getFileSystemMethods(this._options.fs);
        this.globstar = this._getValue(this._options.globstar, true);
        this.ignore = this._getValue(this._options.ignore, []);
        this.markDirectories = this._getValue(this._options.markDirectories, false);
        this.objectMode = this._getValue(this._options.objectMode, false);
        this.onlyDirectories = this._getValue(this._options.onlyDirectories, false);
        this.onlyFiles = this._getValue(this._options.onlyFiles, true);
        this.stats = this._getValue(this._options.stats, false);
        this.suppressErrors = this._getValue(this._options.suppressErrors, false);
        this.throwErrorOnBrokenSymbolicLink = this._getValue(this._options.throwErrorOnBrokenSymbolicLink, false);
        this.unique = this._getValue(this._options.unique, true);
        if (this.onlyDirectories) {
          this.onlyFiles = false;
        }
        if (this.stats) {
          this.objectMode = true;
        }
        this.ignore = [].concat(this.ignore);
      }
      _getValue(option, value) {
        return option === void 0 ? value : option;
      }
      _getFileSystemMethods(methods = {}) {
        return Object.assign(Object.assign({}, exports2.DEFAULT_FILE_SYSTEM_ADAPTER), methods);
      }
    };
    exports2.default = Settings;
  }
});

// node_modules/fast-glob/out/index.js
var require_out4 = __commonJS({
  "node_modules/fast-glob/out/index.js"(exports2, module2) {
    "use strict";
    var taskManager = require_tasks();
    var async_1 = require_async6();
    var stream_1 = require_stream4();
    var sync_1 = require_sync6();
    var settings_1 = require_settings4();
    var utils = require_utils3();
    async function FastGlob(source2, options) {
      assertPatternsInput(source2);
      const works = getWorks(source2, async_1.default, options);
      const result2 = await Promise.all(works);
      return utils.array.flatten(result2);
    }
    (function(FastGlob2) {
      FastGlob2.glob = FastGlob2;
      FastGlob2.globSync = sync;
      FastGlob2.globStream = stream;
      FastGlob2.async = FastGlob2;
      function sync(source2, options) {
        assertPatternsInput(source2);
        const works = getWorks(source2, sync_1.default, options);
        return utils.array.flatten(works);
      }
      FastGlob2.sync = sync;
      function stream(source2, options) {
        assertPatternsInput(source2);
        const works = getWorks(source2, stream_1.default, options);
        return utils.stream.merge(works);
      }
      FastGlob2.stream = stream;
      function generateTasks(source2, options) {
        assertPatternsInput(source2);
        const patterns = [].concat(source2);
        const settings = new settings_1.default(options);
        return taskManager.generate(patterns, settings);
      }
      FastGlob2.generateTasks = generateTasks;
      function isDynamicPattern(source2, options) {
        assertPatternsInput(source2);
        const settings = new settings_1.default(options);
        return utils.pattern.isDynamicPattern(source2, settings);
      }
      FastGlob2.isDynamicPattern = isDynamicPattern;
      function escapePath(source2) {
        assertPatternsInput(source2);
        return utils.path.escape(source2);
      }
      FastGlob2.escapePath = escapePath;
      function convertPathToPattern(source2) {
        assertPatternsInput(source2);
        return utils.path.convertPathToPattern(source2);
      }
      FastGlob2.convertPathToPattern = convertPathToPattern;
      let posix;
      (function(posix2) {
        function escapePath2(source2) {
          assertPatternsInput(source2);
          return utils.path.escapePosixPath(source2);
        }
        posix2.escapePath = escapePath2;
        function convertPathToPattern2(source2) {
          assertPatternsInput(source2);
          return utils.path.convertPosixPathToPattern(source2);
        }
        posix2.convertPathToPattern = convertPathToPattern2;
      })(posix = FastGlob2.posix || (FastGlob2.posix = {}));
      let win32;
      (function(win322) {
        function escapePath2(source2) {
          assertPatternsInput(source2);
          return utils.path.escapeWindowsPath(source2);
        }
        win322.escapePath = escapePath2;
        function convertPathToPattern2(source2) {
          assertPatternsInput(source2);
          return utils.path.convertWindowsPathToPattern(source2);
        }
        win322.convertPathToPattern = convertPathToPattern2;
      })(win32 = FastGlob2.win32 || (FastGlob2.win32 = {}));
    })(FastGlob || (FastGlob = {}));
    function getWorks(source2, _Provider, options) {
      const patterns = [].concat(source2);
      const settings = new settings_1.default(options);
      const tasks = taskManager.generate(patterns, settings);
      const provider = new _Provider(settings);
      return tasks.map(provider.read, provider);
    }
    function assertPatternsInput(input) {
      const source2 = [].concat(input);
      const isValidSource = source2.every((item) => utils.string.isString(item) && !utils.string.isEmpty(item));
      if (!isValidSource) {
        throw new TypeError("Patterns must be a string (non empty) or an array of strings");
      }
    }
    module2.exports = FastGlob;
  }
});

// electron/main.ts
var path2 = require("node:path");
var crypto = require("node:crypto");
var {
  app: app2,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell
} = require("electron");
var fs2 = require("node:fs");
var { reversePlaywrightRunner: reversePlaywrightRunner2 } = (init_reverse_playwright_runner(), __toCommonJS(reverse_playwright_runner_exports));
var BUILTIN_API_ADMIN_PASSWORD_HASH = "d4f31b6def1e6e11148cbab15b400e91528ab18880b25225d9a9f840d4d0d192";
var STARTUP_LOG_PATH = path2.join(
  process.env.TEMP || process.cwd(),
  "infinio-startup.log"
);
var mainWindow = null;
var tray = null;
var embeddedBrowserView = null;
var embeddedBrowserState = {
  visible: false,
  url: "",
  title: "",
  loading: false,
  error: ""
};
var embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
function emitEmbeddedBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("browserView:state", {
    ...embeddedBrowserState
  });
}
function attachEmbeddedBrowserEvents(view) {
  if (!view) return;
  view.webContents.on("page-title-updated", (_event, title) => {
    embeddedBrowserState.title = title;
    emitEmbeddedBrowserState();
  });
  view.webContents.on("did-start-loading", () => {
    embeddedBrowserState.loading = true;
    embeddedBrowserState.error = "";
    emitEmbeddedBrowserState();
  });
  view.webContents.on("did-stop-loading", () => {
    embeddedBrowserState.loading = false;
    embeddedBrowserState.url = view.webContents.getURL();
    emitEmbeddedBrowserState();
  });
  view.webContents.on("did-fail-load", (_event, code, description) => {
    if (code === -3) {
      log("warn", `BrowserView \u5BFC\u822A\u88AB\u4E2D\u65AD: ${description}`);
      return;
    }
    embeddedBrowserState.loading = false;
    embeddedBrowserState.error = description;
    emitEmbeddedBrowserState();
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://jimeng.jianying.com/")) {
      view.webContents.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
}
async function loadURLWithAbortTolerance(view, url) {
  try {
    await view.webContents.loadURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const currentUrl = view.webContents.getURL();
    if (message.includes("ERR_ABORTED") || message.includes("(-3)")) {
      log("warn", `BrowserView loadURL \u88AB\u4E2D\u65AD\uFF0C\u6309\u53EF\u6062\u590D\u5904\u7406: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      embeddedBrowserState.url = view.webContents.getURL() || currentUrl || url;
      embeddedBrowserState.loading = false;
      embeddedBrowserState.error = "";
      emitEmbeddedBrowserState();
      return;
    }
    throw error;
  }
}
async function ensureEmbeddedBrowserView(url) {
  if (!mainWindow) throw new Error("\u4E3B\u7A97\u53E3\u5C1A\u672A\u521B\u5EFA");
  if (!embeddedBrowserView) {
    log("info", "\u521B\u5EFA\u5185\u5D4C BrowserView");
    embeddedBrowserView = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });
    mainWindow.setBrowserView(embeddedBrowserView);
    attachEmbeddedBrowserEvents(embeddedBrowserView);
  }
  if (embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
    log("info", `\u8BBE\u7F6E BrowserView bounds: ${JSON.stringify(embeddedBrowserBounds)}`);
    embeddedBrowserView.setBounds(embeddedBrowserBounds);
    embeddedBrowserView.setAutoResize({ width: true, height: true });
  } else {
    log("warn", `BrowserView bounds \u65E0\u6548\uFF0C\u8DF3\u8FC7\u8BBE\u7F6E: ${JSON.stringify(embeddedBrowserBounds)}`);
  }
  embeddedBrowserState.visible = true;
  if (url) {
    const currentUrl = embeddedBrowserView.webContents.getURL() || embeddedBrowserState.url;
    embeddedBrowserState.url = url;
    if (currentUrl === url) {
      log("info", `BrowserView already at target URL, skipping reload: ${url}`);
    } else {
      log("info", `BrowserView \u5BFC\u822A\u5230: ${url}`);
      await loadURLWithAbortTolerance(embeddedBrowserView, url);
    }
  }
  emitEmbeddedBrowserState();
  return embeddedBrowserView;
}
function hideEmbeddedBrowserView() {
  if (!embeddedBrowserView || !mainWindow) return;
  embeddedBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  embeddedBrowserState.visible = false;
  emitEmbeddedBrowserState();
}
function closeEmbeddedBrowserView() {
  if (!embeddedBrowserView || !mainWindow) return;
  mainWindow.removeBrowserView(embeddedBrowserView);
  try {
    const wc = embeddedBrowserView.webContents;
    if (wc && !wc.isDestroyed?.()) {
      wc.destroy?.();
    }
  } catch {
  }
  embeddedBrowserView = null;
  embeddedBrowserState = { visible: false, url: "", title: "", loading: false, error: "" };
  embeddedBrowserBounds = { x: 0, y: 0, width: 0, height: 0 };
  emitEmbeddedBrowserState();
}
function getUserDataPath() {
  return app2.getPath("userData");
}
function getDefaultFilesDir() {
  if (app2.isPackaged) {
    return path2.join(path2.dirname(process.execPath), "files");
  }
  return path2.join(__dirname, "..", "files");
}
function log(level, msg) {
  const ts = (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try {
    fs2.appendFileSync(STARTUP_LOG_PATH, `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
process.on("uncaughtException", (error) => {
  log(
    "fatal",
    `uncaughtException: ${error instanceof Error ? error.stack || error.message : String(error)}`
  );
});
process.on("unhandledRejection", (reason) => {
  log(
    "fatal",
    `unhandledRejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`
  );
});
function resolveUniqueDownloadPath(targetPath) {
  const parsed = path2.parse(targetPath);
  let attempt = 1;
  let candidate = targetPath;
  while (fs2.existsSync(candidate)) {
    attempt += 1;
    candidate = path2.join(parsed.dir, `${parsed.name}(${attempt})${parsed.ext}`);
  }
  return candidate;
}
function verifyBuiltinApiAdminPassword(password) {
  if (typeof password !== "string" || !password) {
    return false;
  }
  const actualHash = crypto.createHash("sha256").update(password, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(BUILTIN_API_ADMIN_PASSWORD_HASH, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
function setupIPC() {
  ipcMain.handle(
    "runtime:verifyBuiltinApiAdminPassword",
    (_event, password) => verifyBuiltinApiAdminPassword(password)
  );
  ipcMain.handle("crash:getLogs", () => {
    const crashLogPath = path2.join(getUserDataPath(), "crash-log.json");
    try {
      if (fs2.existsSync(crashLogPath)) {
        const logs2 = JSON.parse(fs2.readFileSync(crashLogPath, "utf8"));
        return { ok: true, logs: logs2 };
      }
      return { ok: true, logs: [] };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("browserView:create", async (_event, params) => {
    if (params?.bounds) {
      embeddedBrowserBounds = params.bounds;
    }
    const view = await ensureEmbeddedBrowserView(params?.url);
    return {
      ok: true,
      id: "embedded-browser-view",
      state: {
        ...embeddedBrowserState,
        url: view.webContents.getURL() || embeddedBrowserState.url
      }
    };
  });
  ipcMain.handle("browserView:navigate", async (_event, { url }) => {
    const view = await ensureEmbeddedBrowserView();
    await loadURLWithAbortTolerance(view, url);
    embeddedBrowserState.url = view.webContents.getURL();
    emitEmbeddedBrowserState();
    return { ok: true, state: { ...embeddedBrowserState } };
  });
  ipcMain.handle("browserView:setBounds", (_event, bounds) => {
    embeddedBrowserBounds = bounds;
    log("info", `\u6536\u5230 BrowserView bounds: ${JSON.stringify(bounds)}`);
    if (embeddedBrowserView) {
      embeddedBrowserView.setBounds(bounds);
      embeddedBrowserView.setAutoResize({ width: true, height: true });
    }
    return { ok: true };
  });
  ipcMain.handle("browserView:show", async () => {
    await ensureEmbeddedBrowserView();
    if (embeddedBrowserView && embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
      embeddedBrowserView.setBounds(embeddedBrowserBounds);
    }
    embeddedBrowserState.visible = true;
    emitEmbeddedBrowserState();
    return { ok: true, state: { ...embeddedBrowserState } };
  });
  ipcMain.handle("browserView:hide", () => {
    hideEmbeddedBrowserView();
    return { ok: true, state: { ...embeddedBrowserState } };
  });
  ipcMain.handle("browserView:getState", () => ({ ...embeddedBrowserState }));
  ipcMain.handle("browserView:execute", async (_event, { script, data }) => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
    }
    try {
      if (data !== void 0) {
        const dataScript = `window.__executeData__ = ${JSON.stringify(data)};`;
        await embeddedBrowserView.webContents.executeJavaScript(dataScript, true);
      }
      const result2 = await embeddedBrowserView.webContents.executeJavaScript(script, true);
      return { ok: true, result: result2 };
    } catch (error) {
      log("error", `browserView:execute \u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle("browserView:capture", async () => {
    if (!embeddedBrowserView) {
      return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
    }
    try {
      const image = await embeddedBrowserView.webContents.capturePage();
      const png = image.toPNG();
      return { ok: true, base64: png.toString("base64"), mimeType: "image/png" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle(
    "browserView:setFileInputFiles",
    async (_event, {
      selector = 'input[type="file"]',
      index = 0,
      files
    }) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
      }
      if (!Array.isArray(files)) {
        return { ok: false, error: "\u6CA1\u6709\u53EF\u4E0A\u4F20\u7684\u6587\u4EF6" };
      }
      const tempDir = path2.join(
        app2.getPath("temp"),
        "next-chapter-browserview-files"
      );
      fs2.mkdirSync(tempDir, { recursive: true });
      const writtenFiles = files.map((file, fileIndex) => {
        const match = String(file.dataUrl || "").match(
          /^data:([^;]+);base64,(.+)$/i
        );
        if (!match) {
          throw new Error(`\u65E0\u6548 dataUrl: ${file.fileName || fileIndex}`);
        }
        const mime = match[1];
        const ext = path2.extname(file.fileName || "") || (mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg");
        const safeBase = path2.basename(file.fileName || `upload-${fileIndex}${ext}`, ext).replace(/[^\w.-]+/g, "_");
        const targetPath = path2.join(
          tempDir,
          `${Date.now()}-${fileIndex}-${safeBase}${ext}`
        );
        fs2.writeFileSync(targetPath, Buffer.from(match[2], "base64"));
        return targetPath;
      });
      const debuggerClient = embeddedBrowserView.webContents.debugger;
      const attachedByHandler = !debuggerClient.isAttached();
      try {
        if (attachedByHandler) debuggerClient.attach("1.3");
        const { root } = await debuggerClient.sendCommand("DOM.getDocument", {
          depth: -1,
          pierce: true
        });
        const { nodeIds } = await debuggerClient.sendCommand(
          "DOM.querySelectorAll",
          {
            nodeId: root.nodeId,
            selector
          }
        );
        if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
          throw new Error(`\u672A\u627E\u5230\u6587\u4EF6\u8F93\u5165\u6846: ${selector}`);
        }
        const safeIndex = Math.max(0, Math.min(index, nodeIds.length - 1));
        const described = await debuggerClient.sendCommand("DOM.describeNode", {
          nodeId: nodeIds[safeIndex]
        });
        const backendNodeId = described?.node?.backendNodeId;
        await debuggerClient.sendCommand("DOM.setFileInputFiles", {
          ...backendNodeId ? { backendNodeId } : { nodeId: nodeIds[safeIndex] },
          files: writtenFiles
        });
        return {
          ok: true,
          count: writtenFiles.length,
          selector,
          index: safeIndex
        };
      } catch (error) {
        log(
          "error",
          `browserView:setFileInputFiles \u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      } finally {
        if (attachedByHandler && debuggerClient.isAttached()) {
          try {
            debuggerClient.detach();
          } catch {
          }
        }
      }
    }
  );
  ipcMain.handle(
    "browserView:sendInputEvents",
    async (_event, {
      events
    }) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
      }
      if (!Array.isArray(events) || events.length === 0) {
        return { ok: false, error: "\u6CA1\u6709\u53EF\u53D1\u9001\u7684\u8F93\u5165\u4E8B\u4EF6" };
      }
      try {
        embeddedBrowserView.webContents.focus();
        for (const event of events) {
          embeddedBrowserView.webContents.sendInputEvent({
            type: event.type,
            keyCode: event.keyCode,
            modifiers: event.modifiers,
            x: event.x,
            y: event.y,
            button: event.button,
            clickCount: event.clickCount
          });
        }
        return { ok: true };
      } catch (error) {
        log(
          "error",
          `browserView:sendInputEvents \u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle(
    "browserView:download",
    async (_event, {
      savePath,
      script,
      timeoutMs = 2e4
    }) => {
      if (!embeddedBrowserView) {
        return { ok: false, error: "\u6D4F\u89C8\u5668\u89C6\u56FE\u5C1A\u672A\u521B\u5EFA" };
      }
      if (!savePath) {
        return { ok: false, error: "\u7F3A\u5C11\u4FDD\u5B58\u8DEF\u5F84" };
      }
      const finalSavePath = resolveUniqueDownloadPath(savePath);
      const targetDir = path2.dirname(finalSavePath);
      fs2.mkdirSync(targetDir, { recursive: true });
      return await new Promise((resolve) => {
        const session = embeddedBrowserView.webContents.session;
        let finished = false;
        const cleanup = () => {
          session.removeListener("will-download", onWillDownload);
          clearTimeout(timer);
        };
        const finish = (payload) => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(payload);
        };
        const onWillDownload = (_downloadEvent, item, webContents) => {
          if (webContents !== embeddedBrowserView.webContents) return;
          item.setSavePath(finalSavePath);
          item.once("done", (_doneEvent, state) => {
            if (state === "completed") {
              finish({
                ok: true,
                savePath: finalSavePath,
                url: item.getURL()
              });
            } else {
              finish({
                ok: false,
                error: `\u4E0B\u8F7D\u672A\u5B8C\u6210: ${state}`,
                savePath: finalSavePath
              });
            }
          });
        };
        const timer = setTimeout(() => {
          finish({ ok: false, error: "\u7B49\u5F85\u4E0B\u8F7D\u8D85\u65F6", savePath: finalSavePath });
        }, timeoutMs);
        session.on("will-download", onWillDownload);
        if (!script) {
          finish({ ok: false, error: "\u7F3A\u5C11\u4E0B\u8F7D\u89E6\u53D1\u811A\u672C", savePath: finalSavePath });
          return;
        }
        embeddedBrowserView.webContents.executeJavaScript(script, true).catch((error) => {
          finish({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            savePath: finalSavePath
          });
        });
      });
    }
  );
  ipcMain.handle("browserView:close", () => {
    closeEmbeddedBrowserView();
    return { ok: true };
  });
  ipcMain.handle("browserView:setIgnoreMouseEvents", (_event, ignore) => {
    if (embeddedBrowserView) {
      embeddedBrowserView.webContents.executeJavaScript(`
        (() => {
          const OVERLAY_ID = '__jimeng_browser_lock_overlay__';
          const existing = document.getElementById(OVERLAY_ID);
          if (${ignore ? "true" : "false"}) {
            if (!existing) {
              const overlay = document.createElement('div');
              overlay.id = OVERLAY_ID;
              overlay.style.position = 'fixed';
              overlay.style.inset = '0';
              overlay.style.zIndex = '2147483647';
              overlay.style.background = 'transparent';
              overlay.style.cursor = 'not-allowed';
              overlay.addEventListener('wheel', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, { passive: false });
              overlay.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, true);
              overlay.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
              }, true);
              document.body.appendChild(overlay);
            }
          } else if (existing) {
            existing.remove();
          }
        })();
      `, true).catch(() => {
      });
    }
    return { ok: true };
  });
  ipcMain.handle(
    "reversePlaywright:prepareSegment",
    async (_event, params) => {
      return reversePlaywrightRunner2.prepareSegment(params);
    }
  );
  ipcMain.handle(
    "reversePlaywright:runSegments",
    async (_event, params) => {
      return reversePlaywrightRunner2.runSegments(params);
    }
  );
  ipcMain.handle("reversePlaywright:capture", async () => {
    return reversePlaywrightRunner2.capture();
  });
  ipcMain.handle("reversePlaywright:close", async () => {
    await reversePlaywrightRunner2.close();
    return { ok: true };
  });
  ipcMain.handle(
    "jimeng:writeFile",
    async (_event, { filePath, content }) => {
      try {
        const normalizedPath = path2.normalize(filePath);
        fs2.mkdirSync(path2.dirname(normalizedPath), { recursive: true });
        fs2.writeFileSync(normalizedPath, Buffer.from(content, "base64"));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle("storage:getDefaultPath", () => {
    const filesDir = getDefaultFilesDir();
    try {
      fs2.mkdirSync(filesDir, { recursive: true });
    } catch {
    }
    const userData = app2.getPath("userData");
    return {
      files: filesDir,
      db: path2.join(userData, "db")
    };
  });
  ipcMain.handle("storage:selectFolder", async () => {
    const { dialog } = require("electron");
    const result2 = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "\u9009\u62E9\u5B58\u50A8\u6587\u4EF6\u5939"
    });
    if (result2.canceled || result2.filePaths.length === 0) return null;
    return result2.filePaths[0];
  });
  ipcMain.handle("storage:openFolder", (_event, folderPath) => {
    shell.openPath(folderPath);
  });
  ipcMain.handle(
    "storage:writeText",
    async (_event, { filePath, content }) => {
      try {
        fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
        fs2.writeFileSync(filePath, content, "utf8");
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle(
    "storage:readText",
    async (_event, { filePath }) => {
      try {
        if (!fs2.existsSync(filePath)) {
          return { ok: true, exists: false, content: "" };
        }
        return {
          ok: true,
          exists: true,
          content: fs2.readFileSync(filePath, "utf8")
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  ipcMain.handle(
    "storage:readBase64",
    async (_event, { filePath }) => {
      try {
        const normalizedPath = path2.normalize(filePath);
        if (!fs2.existsSync(normalizedPath)) {
          return { ok: true, exists: false, base64: "" };
        }
        const ext = path2.extname(normalizedPath).toLowerCase();
        const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : ext === ".mp4" ? "video/mp4" : "image/jpeg";
        return {
          ok: true,
          exists: true,
          base64: fs2.readFileSync(normalizedPath).toString("base64"),
          mimeType
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );
  const { QueryEngine: QueryEngine2 } = (init_query_engine(), __toCommonJS(query_engine_exports));
  const agentSessions = /* @__PURE__ */ new Map();
  ipcMain.handle(
    "agent:submitMessage",
    async (event, {
      sessionId,
      prompt: prompt2,
      config
    }) => {
      let engine = agentSessions.get(sessionId);
      if (!engine) {
        engine = new QueryEngine2(config);
        agentSessions.set(sessionId, engine);
      } else {
        if (config.apiKey) engine["config"].apiKey = config.apiKey;
        if (config.model) engine.setModel(config.model);
      }
      try {
        for await (const sdkMsg of engine.submitMessage(prompt2)) {
          if (event.sender.isDestroyed()) break;
          event.sender.send("agent:event", { sessionId, message: sdkMsg });
        }
      } catch (err) {
        if (!event.sender.isDestroyed()) {
          event.sender.send("agent:event", {
            sessionId,
            message: {
              type: "result",
              subtype: "success",
              isError: true,
              result: String(err),
              durationMs: 0,
              numTurns: 0,
              sessionId,
              totalCostUsd: 0,
              usage: { inputTokens: 0, outputTokens: 0 },
              uuid: crypto.randomUUID()
            }
          });
        }
      }
      return { ok: true };
    }
  );
  ipcMain.handle("agent:interrupt", (_event, { sessionId }) => {
    agentSessions.get(sessionId)?.interrupt();
    return { ok: true };
  });
  ipcMain.handle("agent:clearSession", (_event, { sessionId }) => {
    agentSessions.delete(sessionId);
    return { ok: true };
  });
  const glob = require_out4();
  const { exec } = require("node:child_process");
  const { promisify } = require("node:util");
  const execAsync = promisify(exec);
  ipcMain.handle(
    "tool:execute",
    async (_event, { toolName, args }) => {
      try {
        switch (toolName) {
          // ── FileRead ──────────────────────────────────────────────────
          case "FileRead": {
            const filePath = String(args.filePath);
            const IMAGE_EXTS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);
            const ext = path2.extname(filePath).toLowerCase();
            if (IMAGE_EXTS.has(ext)) {
              if (!fs2.existsSync(filePath)) return { error: `File not found: ${filePath}` };
              const base64 = fs2.readFileSync(filePath).toString("base64");
              return { content: `[Image: data:image/${ext.slice(1)};base64,${base64}]` };
            }
            if (!fs2.existsSync(filePath)) return { error: `File not found: ${filePath}` };
            const raw = fs2.readFileSync(filePath, "utf8");
            const lines = raw.split("\n");
            const offset = Number(args.offset ?? 0);
            const limit = args.limit ? Number(args.limit) : void 0;
            const slice = limit ? lines.slice(offset, offset + limit) : lines.slice(offset);
            const numbered = slice.map((line, i) => `${offset + i + 1}	${line}`).join("\n");
            return { content: numbered };
          }
          // ── FileWrite ─────────────────────────────────────────────────
          case "FileWrite": {
            const filePath = String(args.filePath);
            const content = String(args.content ?? "");
            fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
            fs2.writeFileSync(filePath, content, "utf8");
            return { ok: true };
          }
          // ── FileEdit ──────────────────────────────────────────────────
          case "FileEdit": {
            const filePath = String(args.filePath);
            if (!fs2.existsSync(filePath)) return { error: `File not found: ${filePath}` };
            let content = fs2.readFileSync(filePath, "utf8");
            const oldStr = String(args.oldString);
            const newStr = String(args.newString ?? "");
            const replaceAll = Boolean(args.replaceAll);
            if (!content.includes(oldStr)) {
              return { error: `old_string not found in ${filePath}` };
            }
            if (replaceAll) {
              content = content.split(oldStr).join(newStr);
            } else {
              const idx = content.indexOf(oldStr);
              content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
            }
            fs2.writeFileSync(filePath, content, "utf8");
            return { ok: true, message: `Edited ${filePath}` };
          }
          // ── Glob ──────────────────────────────────────────────────────
          case "Glob": {
            const pattern = String(args.pattern);
            const cwd = args.path ? String(args.path) : process.cwd();
            const files = await glob(pattern, {
              cwd,
              absolute: true,
              dot: false,
              ignore: ["**/node_modules/**", "**/.git/**"]
            });
            const withStat = files.map((f) => ({
              f,
              mtime: fs2.statSync(f).mtimeMs
            }));
            withStat.sort((a, b) => b.mtime - a.mtime);
            return { files: withStat.map((x) => x.f) };
          }
          // ── Grep ──────────────────────────────────────────────────────
          case "Grep": {
            const pattern = String(args.pattern);
            const searchPath = args.path ? String(args.path) : process.cwd();
            const globFilter = args.glob ? String(args.glob) : void 0;
            const outputMode = String(args.output_mode ?? "files_with_matches");
            const caseInsensitive = Boolean(args["-i"]);
            const contextLines = Number(args.context ?? 0);
            const headLimit = Number(args.head_limit ?? 250);
            let rgCmd = `rg --no-heading`;
            if (caseInsensitive) rgCmd += ` -i`;
            if (contextLines > 0) rgCmd += ` -C ${contextLines}`;
            if (globFilter) rgCmd += ` --glob "${globFilter}"`;
            if (outputMode === "files_with_matches") rgCmd += ` -l`;
            else if (outputMode === "count") rgCmd += ` --count`;
            else rgCmd += ` -n`;
            rgCmd += ` "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
            try {
              const { stdout } = await execAsync(rgCmd, { maxBuffer: 10 * 1024 * 1024 });
              const lines = stdout.split("\n").filter(Boolean).slice(0, headLimit);
              return { output: lines.join("\n") };
            } catch (e) {
              const exitCode = e.code;
              if (exitCode === 1) return { output: "" };
              const { stdout } = await execAsync(
                `grep -r ${caseInsensitive ? "-i" : ""} -l "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`,
                { maxBuffer: 5 * 1024 * 1024 }
              ).catch(() => ({ stdout: "" }));
              return { output: stdout.trim() };
            }
          }
          // ── Bash ──────────────────────────────────────────────────────
          case "Bash": {
            const command = String(args.command);
            const timeout = Math.min(Number(args.timeout ?? 12e4), 6e5);
            const cwd = args.cwd ? String(args.cwd) : process.cwd();
            try {
              const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout,
                maxBuffer: 10 * 1024 * 1024,
                shell: process.platform === "win32" ? "powershell.exe" : "/bin/bash"
              });
              const output = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
              return { output: output || "(no output)" };
            } catch (e) {
              const err = e;
              const output = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trimEnd();
              return { output: output || "Command failed" };
            }
          }
          default:
            return { error: `Unknown tool: ${toolName}` };
        }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
  const { spawn } = require("node:child_process");
  const mcpProcesses = /* @__PURE__ */ new Map();
  function sendMcpRequest(name, method, params) {
    const session = mcpProcesses.get(name);
    if (!session) throw new Error(`MCP server "${name}" not connected`);
    const id = session.nextId++;
    return new Promise((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      session.proc.stdin.write(msg);
      setTimeout(() => {
        if (session.pending.has(id)) {
          session.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 3e4);
    });
  }
  ipcMain.handle("mcp:connect", async (_event, { config }) => {
    try {
      if (config.transport !== "stdio" || !config.command) {
        return { error: "Only stdio transport supported currently" };
      }
      if (mcpProcesses.has(config.name)) {
        mcpProcesses.get(config.name)?.proc.kill();
        mcpProcesses.delete(config.name);
      }
      const proc = spawn(config.command, config.args ?? [], {
        env: { ...process.env, ...config.env ?? {} },
        stdio: ["pipe", "pipe", "pipe"]
      });
      const session = { proc, pending: /* @__PURE__ */ new Map(), nextId: 1 };
      mcpProcesses.set(config.name, session);
      let buffer = "";
      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            const pend = session.pending.get(msg.id);
            if (pend) {
              session.pending.delete(msg.id);
              if (msg.error) pend.reject(new Error(msg.error.message));
              else pend.resolve(msg.result);
            }
          } catch {
          }
        }
      });
      await sendMcpRequest(config.name, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "next-chapter", version: "1.0.0" }
      });
      const toolsResult = await sendMcpRequest(config.name, "tools/list", {});
      const tools = (toolsResult?.tools ?? []).map((t) => {
        const tool = t;
        return { serverName: config.name, name: tool.name, description: tool.description ?? "", inputSchema: tool.inputSchema ?? {} };
      });
      const resResult = await sendMcpRequest(config.name, "resources/list", {});
      const resources = (resResult?.resources ?? []).map((r) => {
        const res = r;
        return { serverName: config.name, uri: res.uri, name: res.name, description: res.description, mimeType: res.mimeType };
      });
      return { ok: true, tools, resources };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("mcp:disconnect", (_event, { name }) => {
    mcpProcesses.get(name)?.proc.kill();
    mcpProcesses.delete(name);
    return { ok: true };
  });
  ipcMain.handle("mcp:call-tool", async (_event, {
    serverName,
    toolName,
    args
  }) => {
    try {
      const result2 = await sendMcpRequest(serverName, "tools/call", { name: toolName, arguments: args });
      const content = result2?.content;
      return { ok: true, content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("mcp:read-resource", async (_event, {
    serverName,
    uri
  }) => {
    try {
      const result2 = await sendMcpRequest(serverName, "resources/read", { uri });
      const content = result2?.contents?.[0]?.text ?? "";
      return { ok: true, content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
function createWindow() {
  log("info", "createWindow start");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path2.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path2.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    title: "InFinio-\u4E00\u7AD9\u5F0F\u667A\u80FD\u4F53\u81EA\u52A8\u5316\u5E73\u53F0"
  });
  mainWindow.once("ready-to-show", () => {
    log("info", "main window ready-to-show");
    mainWindow?.show();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    log("info", "main window did-finish-load");
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    log("error", `main window did-fail-load code=${code} description=${description} url=${url}`);
  });
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    log("error", `========== \u6E32\u67D3\u8FDB\u7A0B\u5D29\u6E83 ==========`);
    log("error", `\u539F\u56E0: ${details.reason}`);
    log("error", `\u9000\u51FA\u7801: ${details.exitCode}`);
    console.error("\u6E32\u67D3\u8FDB\u7A0B\u5D29\u6E83\u8BE6\u60C5:", details);
    const crashInfo = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      reason: details.reason,
      exitCode: details.exitCode,
      // 添加内存使用信息
      memoryUsage: process.memoryUsage(),
      // 添加系统信息
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };
    const crashLogPath = path2.join(getUserDataPath(), "crash-log.json");
    try {
      let logs2 = [];
      if (fs2.existsSync(crashLogPath)) {
        logs2 = JSON.parse(fs2.readFileSync(crashLogPath, "utf8"));
      }
      logs2.unshift(crashInfo);
      if (logs2.length > 20) logs2.length = 20;
      fs2.writeFileSync(crashLogPath, JSON.stringify(logs2, null, 2));
      log("info", `\u5D29\u6E83\u65E5\u5FD7\u5DF2\u4FDD\u5B58\u5230: ${crashLogPath}`);
    } catch (err) {
      log("error", `\u65E0\u6CD5\u4FDD\u5B58\u5D29\u6E83\u65E5\u5FD7: ${err}`);
    }
  });
  mainWindow.webContents.on("unresponsive", () => {
    log("warn", "\u6E32\u67D3\u8FDB\u7A0B\u672A\u54CD\u5E94");
  });
  mainWindow.webContents.on("responsive", () => {
    log("info", "\u6E32\u67D3\u8FDB\u7A0B\u5DF2\u6062\u590D\u54CD\u5E94");
  });
  mainWindow.on("resize", () => {
    if (embeddedBrowserView && embeddedBrowserState.visible && embeddedBrowserBounds.width > 0 && embeddedBrowserBounds.height > 0) {
      embeddedBrowserView.setBounds(embeddedBrowserBounds);
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    log("info", `loading dev url: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const indexPath = path2.join(__dirname, "../dist/index.html");
    log("info", `loading file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }
}
function createTray() {
  const icon = nativeImage.createFromPath(path2.join(__dirname, "../build/icon.ico"));
  log("info", `createTray icon empty=${icon.isEmpty()}`);
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "\u663E\u793A\u7A97\u53E3", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "\u9000\u51FA", click: () => app2.quit() }
  ]);
  tray.setToolTip("InFinio-\u4E00\u7AD9\u5F0F\u667A\u80FD\u4F53\u81EA\u52A8\u5316\u5E73\u53F0");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}
app2.whenReady().then(() => {
  log("info", "========== Electron \u4E3B\u8FDB\u7A0B\u542F\u52A8 ==========");
  setupIPC();
  createWindow();
  createTray();
  app2.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app2.on("window-all-closed", () => {
  if (process.platform !== "darwin") app2.quit();
});
app2.on("before-quit", () => {
});
/*! Bundled license information:

is-extglob/index.js:
  (*!
   * is-extglob <https://github.com/jonschlinkert/is-extglob>
   *
   * Copyright (c) 2014-2016, Jon Schlinkert.
   * Licensed under the MIT License.
   *)

is-glob/index.js:
  (*!
   * is-glob <https://github.com/jonschlinkert/is-glob>
   *
   * Copyright (c) 2014-2017, Jon Schlinkert.
   * Released under the MIT License.
   *)

is-number/index.js:
  (*!
   * is-number <https://github.com/jonschlinkert/is-number>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

to-regex-range/index.js:
  (*!
   * to-regex-range <https://github.com/micromatch/to-regex-range>
   *
   * Copyright (c) 2015-present, Jon Schlinkert.
   * Released under the MIT License.
   *)

fill-range/index.js:
  (*!
   * fill-range <https://github.com/jonschlinkert/fill-range>
   *
   * Copyright (c) 2014-present, Jon Schlinkert.
   * Licensed under the MIT License.
   *)

queue-microtask/index.js:
  (*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)

run-parallel/index.js:
  (*! run-parallel. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
