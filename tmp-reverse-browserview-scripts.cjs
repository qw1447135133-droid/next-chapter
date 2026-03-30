var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/reverse-browserview-scripts.ts
var reverse_browserview_scripts_exports = {};
__export(reverse_browserview_scripts_exports, {
  buildCollectResultCardsScript: () => buildCollectResultCardsScript,
  buildDismissInterferingOverlaysScript: () => buildDismissInterferingOverlaysScript,
  buildEnterVideoGenerationModeScript: () => buildEnterVideoGenerationModeScript,
  buildFillPromptScript: () => buildFillPromptScript,
  buildFillPromptWithReferenceMentionsScript: () => buildFillPromptWithReferenceMentionsScript,
  buildLocatePromptAreaScript: () => buildLocatePromptAreaScript,
  buildReadPromptScopeStateScript: () => buildReadPromptScopeStateScript,
  buildReadPromptValueScript: () => buildReadPromptValueScript,
  buildReadToolbarStateScript: () => buildReadToolbarStateScript,
  buildScrollResultsIntoViewScript: () => buildScrollResultsIntoViewScript,
  buildSetAspectRatioScript: () => buildSetAspectRatioScript,
  buildSetDurationScript: () => buildSetDurationScript,
  buildSetFullReferenceScript: () => buildSetFullReferenceScript,
  buildSetModelScript: () => buildSetModelScript,
  buildSubmitCurrentPromptScript: () => buildSubmitCurrentPromptScript,
  buildSubmitCurrentPromptStrictScript: () => buildSubmitCurrentPromptStrictScript,
  buildTriggerDownloadButtonScript: () => buildTriggerDownloadButtonScript,
  buildTypePromptScript: () => buildTypePromptScript,
  buildWaitForPromptScopeReadyScript: () => buildWaitForPromptScopeReadyScript
});
module.exports = __toCommonJS(reverse_browserview_scripts_exports);
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
    const setTextboxValue = (textbox, value) => {
      if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
        textbox.focus();
        const proto =
          textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(textbox, value);
        else textbox.value = value;
        textbox.setSelectionRange(value.length, value.length);
        textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
        textbox.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (textbox instanceof HTMLElement) {
        textbox.focus?.();
        textbox.textContent = value;
        textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
        textbox.dispatchEvent(new Event("change", { bubbles: true }));
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
          texts.some((text) => /16:9|9:16|3:2|2:3|1:1|21:9/.test(text))
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
      const scope =
        textbox.closest("[class*='generator']") ||
        textbox.closest("[class*='section']") ||
        textbox.closest("[class*='panel']") ||
        textbox.parentElement ||
        document;
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
              }
            : null,
      };
    };
  `;
}
function buildDismissInterferingOverlaysScript() {
  return `
    (() => {
      ${sharedHelpers()}
      const closeWords = ["\u95B8\u5FD4\u5A0A\u59AB?, "\u95B8\u6B10\u7257\u7EC9?, "\u7F01\u5B2A\u79F4\u93AE?, "\u5A34\u72AE\u5131\u93AE\u6945\u5D18\u5BA5\u582B\u569B", "\u95BB\uE15C\u5135\u6D5C\u70AC\u798D?, "\u9420\u54C4\u7587\u7EFB?, "close", "cancel", "dismiss"];
      const roots = interactiveNodes().filter((node) => {
        const role = normalize(node.getAttribute?.("role") || "");
        const cls = normalize(node.className || "");
        return role === "dialog" || /modal|dialog|popup|drawer/.test(cls);
      });
      for (const root of roots) {
        if (!(root instanceof HTMLElement)) continue;
        const candidates = Array.from(root.querySelectorAll("button, [role='button'], [aria-label], span, div")).filter(isVisible);
        const target = candidates.find((node) => {
          const text = textOf(node).toLowerCase();
          const aria = normalize(node.getAttribute("aria-label") || "").toLowerCase();
          return text === "x" || closeWords.some((item) => text.includes(item) || aria.includes(item));
        });
        if (target instanceof HTMLElement) {
          return { dismissed: !!clickLikeHuman(target), text: textOf(target) };
        }
      }
      return { dismissed: false, text: "" };
    })()
  `;
}
function buildEnterVideoGenerationModeScript(allowAlreadyOnGeneratePage = true) {
  return `
    (() => {
      ${sharedHelpers()}
      const hasVisiblePromptTextbox = () => {
        const textbox = findPromptTextbox();
        if (!(textbox instanceof HTMLElement)) return false;
        const rect = rectOf(textbox);
        return rect.width >= 240 && rect.height >= 32;
      };
      const hasReadyToolbar = () => {
        const texts = readToolbarTexts();
        return (
          texts.some((text) => /\u89C6\u9891\u751F\u6210/.test(text)) &&
          texts.some((text) => /Seedance 2\\.0/i.test(text)) &&
          texts.some((text) => /\\b\\d+s\\b/i.test(text)) &&
          texts.some((text) => /16:9|9:16|3:2|2:3|1:1|21:9/.test(text))
        );
      };
      const exactControls = (text, options = {}) => {
        const { maxWidth = 180, preferLeft = false, preferLower = false } = options;
        const nodes = interactiveNodes().filter((node) => {
          const rect = rectOf(node);
          const currentText = textOf(node);
          return currentText === text || currentText.startsWith(text) && rect.width <= maxWidth;
        });
        if (preferLeft) {
          nodes.sort((a, b) => rectOf(a).left - rectOf(b).left || rectOf(a).top - rectOf(b).top);
        } else if (preferLower) {
          nodes.sort((a, b) => rectOf(b).top - rectOf(a).top || rectOf(a).left - rectOf(b).left);
        }
        return nodes[0] || null;
      };
      const clicks = [];
      const leftGenerate =
        exactControls("\u751F\u6210", { maxWidth: 120, preferLeft: true }) ||
        interactiveNodes().find((node) => {
          const text = textOf(node);
          const rect = rectOf(node);
          return text.startsWith("\u751F\u6210") && rect.width <= 120 && rect.left <= 120;
        }) ||
        null;
      const videoEntry =
        exactControls("\u89C6\u9891\u751F\u6210", { maxWidth: 180, preferLower: true }) ||
        interactiveNodes().find((node) => {
          const text = textOf(node);
          const rect = rectOf(node);
          return /\u89C6\u9891\u751F\u6210/.test(text) && rect.width <= 220;
        }) ||
        null;
      if (leftGenerate instanceof HTMLElement) {
        clicks.push("1-left-generate:" + clickLikeHuman(leftGenerate));
      }
      if (videoEntry instanceof HTMLElement) {
        clicks.push("2-bottom-video:" + clickLikeHuman(videoEntry));
      }
      if (${q(allowAlreadyOnGeneratePage)} && clicks.length === 0 && hasVisiblePromptTextbox() && hasReadyToolbar()) {
        return { ok: true, clicked: "already-on-generate-page", stage: "toolbar-ready" };
      }
      return {
        ok: hasVisiblePromptTextbox() && hasReadyToolbar(),
        clicked: clicks.join(" -> ") || "\u672A\u70B9\u51FB\u5230\u76EE\u6807",
        stage: readToolbarTexts().slice(0, 20).join(" | "),
      };
    })()
  `;
}
function buildSelectScript(controlMatcher, optionMatcher, currentMatcher, successStep) {
  return `
    (() => {
      ${sharedHelpers()}
      const nodes = compactToolbarControls();
      const current = nodes.find((node) => ${currentMatcher});
      if (current) return { ok: true, step: "already-set" };
      const control = nodes.find((node) => ${controlMatcher});
      if (!(control instanceof HTMLElement)) return { ok: false, step: "target-not-found" };
      fireOpenMenu(control);
      const option = compactToolbarControls().find((node) => ${optionMatcher}) || interactiveNodes().find((node) => ${optionMatcher});
      if (!(option instanceof HTMLElement)) return { ok: false, step: "option-not-found" };
      clickLikeHuman(option);
      return { ok: true, step: ${q(successStep)} };
    })()
  `;
}
function buildSetFullReferenceScript() {
  return `
    (() => {
      ${sharedHelpers()}
      const nodes = compactToolbarControls();
      const current = nodes.find(
        (node) =>
          normalize(node.getAttribute("role") || "") === "combobox" &&
          /\u5168\u80FD\u53C2\u8003|Full Reference/.test(textOf(node)),
      );
      if (current) return { ok: true, step: "already-set", currentReference: textOf(current) };
      const control = nodes.find(
        (node) =>
          normalize(node.getAttribute("role") || "") === "combobox" &&
          /\u5168\u80FD\u53C2\u8003|Full Reference|\u9996\u5C3E\u5E27|\u667A\u80FD\u591A\u5E27|\u56FE\u7247\u53C2\u8003/.test(textOf(node)),
      );
      if (!(control instanceof HTMLElement)) return { ok: false, step: "target-not-found", currentReference: "" };
      fireOpenMenu(control);
      const option =
        compactToolbarControls().find((node) => textOf(node) === "\u5168\u80FD\u53C2\u8003" || textOf(node) === "Full Reference") ||
        interactiveNodes().find((node) => textOf(node) === "\u5168\u80FD\u53C2\u8003" || textOf(node) === "Full Reference");
      if (!(option instanceof HTMLElement)) return { ok: false, step: "option-not-found", currentReference: textOf(control) };
      clickLikeHuman(option);
      return { ok: true, step: "reference-selected", currentReference: textOf(option) };
    })()
  `;
}
function buildSetModelScript(targetModel) {
  return buildSelectScript(
    `normalize(node.getAttribute("role") || "") === "combobox" && /Seedance 2\\\\.0/i.test(textOf(node))`,
    `textOf(node) === ${q(targetModel)}`,
    `normalize(node.getAttribute("role") || "") === "combobox" && textOf(node) === ${q(targetModel)}`,
    "model-selected"
  );
}
function buildSetDurationScript(targetDuration) {
  return buildSelectScript(
    `normalize(node.getAttribute("role") || "") === "combobox" && /^\\d+s$/i.test(textOf(node))`,
    `textOf(node) === ${q(targetDuration)}`,
    `normalize(node.getAttribute("role") || "") === "combobox" && textOf(node) === ${q(targetDuration)}`,
    "duration-selected"
  );
}
function buildSetAspectRatioScript(targetAspectRatio) {
  return buildSelectScript(
    `/^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(textOf(node)) && normalize(node.getAttribute("role") || "") !== "combobox"`,
    `textOf(node) === ${q(targetAspectRatio)}`,
    `/^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(textOf(node)) && textOf(node) === ${q(targetAspectRatio)}`,
    "ratio-selected"
  );
}
function buildReadToolbarStateScript(targetModel, targetDuration, targetAspectRatio = "16:9") {
  return `
    (() => {
      ${sharedHelpers()}
      const texts = readToolbarTexts();
      const controls = compactToolbarControls();
      const currentModel =
        controls.map((node) => textOf(node)).find((text) => /^Seedance 2\\.0 Fast\\b/i.test(text)) ||
        controls.map((node) => textOf(node)).find((text) => /^Seedance 2\\.0\\b/i.test(text)) ||
        "";
      const currentDuration =
        controls.map((node) => textOf(node)).find((text) => /^\\d+s$/i.test(text)) || "";
      const currentAspectRatio =
        controls.map((node) => textOf(node)).find((text) => /^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(text)) || "";
      const currentReference =
        controls
          .filter((node) => normalize(node.getAttribute("role") || "") === "combobox")
          .map((node) => textOf(node))
          .find((text) => /\u5168\u80FD\u53C2\u8003|Full Reference|\u9996\u5C3E\u5E27|\u667A\u80FD\u591A\u5E27|\u56FE\u7247\u53C2\u8003/.test(text)) || "";
      return {
        currentModel,
        currentDuration,
        currentAspectRatio,
        currentReference,
        hasTargetModel: currentModel === ${q(targetModel)},
        hasTargetDuration: currentDuration === ${q(targetDuration)},
        hasTargetAspectRatio: currentAspectRatio === ${q(targetAspectRatio)},
        hasReferenceMode: /\u5168\u80FD\u53C2\u8003|Full Reference/.test(currentReference),
        hasFirstLastFrameMode: /\u9996\u5C3E\u5E27/.test(currentReference),
        referenceLayout: /\u5168\u80FD\u53C2\u8003|Full Reference/.test(currentReference)
          ? "full-reference"
          : /\u9996\u5C3E\u5E27/.test(currentReference)
            ? "first-last-frame"
            : "unknown",
      };
    })()
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
function buildFillPromptScript(prompt, files = [], fileInputIndex = 0, textboxIndex = 0) {
  return `
    (async () => {
      ${sharedHelpers()}
      const prompt = ${q(prompt)};
      const files = ${q(files)};
      const explicitFileInputIndex = ${q(fileInputIndex)};
      const explicitTextboxIndex = ${q(textboxIndex)};
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
function buildTypePromptScript(prompt, textboxIndex = 0, delayMs = 20) {
  return `
    (async () => {
      ${sharedHelpers()}
      const prompt = ${q(prompt)};
      const explicitTextboxIndex = ${q(textboxIndex)};
      const delayMs = ${q(delayMs)};
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, explicitTextboxIndex)] || findPromptTextbox();
      if (!(textbox instanceof HTMLElement)) {
        return { ok: false, filled: false, promptLength: 0, currentValue: "", message: "\u95BA\u582B\u4E9D\u6FB9\u6A40\u5D1A\u9417\u581D\u7D79\u7F01\u20AC\u6966\u8DE8\u69E4\u93C9\u581F\u6338\u9359\u55DB\u5D20? };
      }
      let nextValue = "";
      setTextboxValue(textbox, "");
      for (const char of prompt) {
        nextValue += char;
        setTextboxValue(textbox, nextValue);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return {
        ok: true,
        filled: true,
        promptLength: prompt.length,
        currentValue: getTextboxValue(textbox),
        message: "\u7039\u544A\u7161\u9227\uE101\u5295\u9421\u0447\u5D18\u5A06\u5FD3\u5F33\u95B9\u7ED8\u5297\u9287\u6C31\u62E0?,
      };
    })()
  `;
}
function buildReadPromptValueScript(textboxIndex = 0) {
  return `
    (() => {
      ${sharedHelpers()}
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
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
function buildFillPromptWithReferenceMentionsScript(prompt, _referenceLabels, textboxIndex = 0) {
  return buildTypePromptScript(prompt, textboxIndex, 20);
}
function buildReadPromptScopeStateScript(textboxIndex = 0) {
  return `
    (() => {
      ${sharedHelpers()}
      return readScope(${q(textboxIndex)});
    })()
  `;
}
function buildSubmitCurrentPromptScript() {
  return buildSubmitCurrentPromptStrictScript(0);
}
function buildSubmitCurrentPromptStrictScript(textboxIndex = 0) {
  return `
    (async () => {
      ${sharedHelpers()}
      const before = readScope(${q(textboxIndex)});
      if (!before.ok || !before.submitButton) {
        return { ok: false, step: before.step || "submit-not-found" };
      }
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
      const scope =
        textbox instanceof HTMLElement
          ? textbox.closest("[class*='generator']") ||
            textbox.closest("[class*='section']") ||
            textbox.closest("[class*='panel']") ||
            textbox.parentElement ||
            document
          : document;
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
      clickLikeHuman(target);
      const startedAt = Date.now();
      let after = before;
      while (Date.now() - startedAt <= 2500) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        after = readScope(${q(textboxIndex)});
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
        const verified =
          ((submitChanged || signalsChanged) && (after.hasPostSubmitSignals || !!after.submitButton?.disabled)) ||
          (promptChanged && (after.hasPostSubmitSignals || signalsChanged || submitDisappeared)) ||
          (submitDisappeared && promptChanged);
        if (verified) {
          return {
            ok: true,
            step: "submitted",
            beforeValue,
            afterValue: after.promptValue,
            beforeDisabled,
            afterDisabled: after.submitButton?.disabled || false,
            signalTextKey: after.signalTextKey,
            taskIndicatorCount: after.taskIndicatorCount,
          };
        }
      }
      return {
        ok: false,
        step: "submit-not-confirmed",
        beforeValue,
        afterValue: after.promptValue,
        beforeDisabled,
        afterDisabled: after.submitButton?.disabled || false,
        signalTextKey: after.signalTextKey,
        taskIndicatorCount: after.taskIndicatorCount,
      };
    })()
  `;
}
function buildWaitForPromptScopeReadyScript(textboxIndex = 0, timeoutMs = 3e4) {
  return `
    (async () => {
      ${sharedHelpers()}
      const startedAt = Date.now();
      while (Date.now() - startedAt <= ${q(timeoutMs)}) {
        const state = readScope(${q(textboxIndex)});
        if (
          state.ok &&
          ((state.submitButton && !state.submitButton.disabled) || normalize(state.promptValue).length === 0)
        ) {
          return { ok: true, step: "ready", state };
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return { ok: false, step: "ready-timeout", state: readScope(${q(textboxIndex)}) };
    })()
  `;
}
function buildScrollResultsIntoViewScript() {
  return `
    (() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      return { ok: true, anchor: "" };
    })()
  `;
}
function buildCollectResultCardsScript() {
  return `
    (() => ({ cards: [] }))()
  `;
}
function buildTriggerDownloadButtonScript(index = 0) {
  return `
    (() => {
      ${sharedHelpers()}
      const buttons = interactiveNodes().filter((node) => /\u5A11\u64B3\uE0C8\u5A34\u565Fdownload|\u5A23\u56E8\u7E42\u9421?i.test(textOf(node)));
      const target = buttons[Math.max(0, ${q(index)})] || null;
      if (!(target instanceof HTMLElement)) return { ok: false, step: "download-button-not-found" };
      clickLikeHuman(target);
      return { ok: true, step: "download-clicked" };
    })()
  `;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  buildCollectResultCardsScript,
  buildDismissInterferingOverlaysScript,
  buildEnterVideoGenerationModeScript,
  buildFillPromptScript,
  buildFillPromptWithReferenceMentionsScript,
  buildLocatePromptAreaScript,
  buildReadPromptScopeStateScript,
  buildReadPromptValueScript,
  buildReadToolbarStateScript,
  buildScrollResultsIntoViewScript,
  buildSetAspectRatioScript,
  buildSetDurationScript,
  buildSetFullReferenceScript,
  buildSetModelScript,
  buildSubmitCurrentPromptScript,
  buildSubmitCurrentPromptStrictScript,
  buildTriggerDownloadButtonScript,
  buildTypePromptScript,
  buildWaitForPromptScopeReadyScript
});
