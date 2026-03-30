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

// src/lib/reverse-playwright-dom.ts
var reverse_playwright_dom_exports = {};
__export(reverse_playwright_dom_exports, {
  selectAspectRatioInDom: () => selectAspectRatioInDom,
  selectFullReferenceInDom: () => selectFullReferenceInDom
});
module.exports = __toCommonJS(reverse_playwright_dom_exports);
async function selectAspectRatioInDom(payload) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const normalizeAspectRatioText = (value) => {
    const match = normalize(value).match(/\b(16:9|9:16|3:2|2:3|1:1|21:9)\b/);
    return match ? match[1] : normalize(value);
  };
  const isExactRatioText = (value) => /^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(normalize(value));
  const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (node) => normalize(
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
    const role = normalize(node.getAttribute("role") || "");
    if (role === "option" || role === "menuitem") return false;
    if (popupRootOf(node)) return false;
    return isExactRatioText(textOf(node));
  });
  const optionNodes = (anchorRect2) => interactiveNodes().filter((node) => {
    const role = normalize(node.getAttribute("role") || "");
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
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  };
  const textOf = (node) => normalize(
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
    const role = normalize(node.getAttribute("role") || "");
    if (!isReferenceLabel(text)) return false;
    if (popupRootOf(node)) return false;
    return role === "combobox" || role === "button" || node.tagName.toLowerCase() !== "li";
  });
  const optionCandidates = () => interactiveNodes().filter((node) => {
    const text = textOf(node);
    if (!isReferenceLabel(text)) return false;
    const role = normalize(node.getAttribute("role") || "");
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  selectAspectRatioInDom,
  selectFullReferenceInDom
});
