var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
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
}
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
}
function createWindow() {
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
    title: "Infinio"
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
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
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path2.join(__dirname, "../dist/index.html"));
  }
}
function createTray() {
  const icon = nativeImage.createFromPath(path2.join(__dirname, "../build/icon.ico"));
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "\u663E\u793A\u7A97\u53E3", click: () => mainWindow?.show() },
    { type: "separator" },
    { label: "\u9000\u51FA", click: () => app2.quit() }
  ]);
  tray.setToolTip("Infinio");
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
