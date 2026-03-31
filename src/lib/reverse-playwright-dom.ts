export interface AspectRatioDomSelectionPayload {
  targetAspectRatio: string;
}

export interface AspectRatioDomSelectionResult {
  ok: boolean;
  step: string;
  currentText?: string;
  targetText?: string;
}

export interface FullReferenceDomSelectionResult {
  ok: boolean;
  step: string;
  currentReference?: string;
}

export interface ModelDomSelectionPayload {
  targetModel: string;
}

export interface ModelDomSelectionResult {
  ok: boolean;
  step: string;
  currentModel?: string;
  targetText?: string;
  debug?: string;
}

export async function selectAspectRatioInDom(
  payload: AspectRatioDomSelectionPayload,
): Promise<AspectRatioDomSelectionResult> {
  const normalize = (value: string | null | undefined) =>
    String(value || "").replace(/\s+/g, " ").trim();
  const normalizeAspectRatioText = (value: string | null | undefined) => {
    const match = normalize(value).match(/\b(16:9|9:16|3:2|2:3|1:1|21:9)\b/);
    return match ? match[1] : normalize(value);
  };
  const isExactRatioText = (value: string | null | undefined) =>
    /^(16:9|9:16|3:2|2:3|1:1|21:9)$/.test(normalize(value));
  const rectOf = (node: Element) =>
    node instanceof HTMLElement
      ? node.getBoundingClientRect()
      : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node: Element) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const textOf = (node: Element) =>
    normalize(
      node instanceof HTMLElement
        ? node.innerText || node.textContent || ""
        : node.textContent || "",
    );
  const isCompactCandidate = (node: Element) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
    const rect = rectOf(node);
    const text = textOf(node);
    if (!text) return false;
    if (rect.width > 420 || rect.height > 96) return false;
    if (text.length > 40 && rect.width > 280) return false;
    return true;
  };
  const interactiveSelector =
    "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const sortByVisualOrder = (nodes: Element[]) =>
    [...nodes].sort((a, b) => {
      const rectA = rectOf(a);
      const rectB = rectOf(b);
      return rectA.top - rectB.top || rectA.left - rectB.left;
    });
  const interactiveNodes = () =>
    sortByVisualOrder(
      Array.from(document.querySelectorAll(interactiveSelector)).filter(
        isCompactCandidate,
      ),
    );
  const popupRootOf = (node: Element) =>
    node.closest(
      "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]",
    );
  const clickableOf = (node: Element | null) => {
    if (!(node instanceof HTMLElement)) return null;
    return (
      node.closest(
        "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a",
      ) || node
    );
  };
  const humanClick = (node: Element | null) => {
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
  const controlNodes = () =>
    interactiveNodes().filter((node) => {
      const role = normalize(node.getAttribute("role") || "");
      if (role === "option" || role === "menuitem") return false;
      if (popupRootOf(node)) return false;
      return isExactRatioText(textOf(node));
    });
  const optionNodes = (
    anchorRect?: DOMRect | { top: number; left: number; right: number; bottom: number },
  ) =>
    interactiveNodes().filter((node) => {
      const role = normalize(node.getAttribute("role") || "");
      const rawText = textOf(node);
      if (!isExactRatioText(rawText)) return false;
      const popupRoot = popupRootOf(node);
      if (role !== "option" && role !== "menuitem" && !popupRoot) return false;
      if (!anchorRect) return true;
      const rect = rectOf(node);
      const horizontallyNear =
        rect.right >= anchorRect.left - 80 && rect.left <= anchorRect.right + 240;
        const verticallyNear =
          rect.top >= anchorRect.top - 80 && rect.top <= anchorRect.bottom + 420;
        return horizontallyNear && verticallyNear;
      });
  const waitForTargetOption = async (
    anchorRect: DOMRect | { top: number; left: number; right: number; bottom: number },
    timeoutMs = 1200,
  ) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const nearby =
        optionNodes(anchorRect).find(
          (node) => normalizeAspectRatioText(textOf(node)) === payload.targetAspectRatio,
        ) ||
        interactiveNodes().find((node) => {
          const rawText = textOf(node);
          if (!isExactRatioText(rawText)) return false;
          const text = normalizeAspectRatioText(rawText);
          if (text !== payload.targetAspectRatio) return false;
          const rect = rectOf(node);
          const horizontallyNear =
            rect.right >= anchorRect.left - 80 && rect.left <= anchorRect.right + 240;
          const verticallyNear =
            rect.top >= anchorRect.top - 80 && rect.top <= anchorRect.bottom + 420;
          return horizontallyNear && verticallyNear;
        }) ||
        optionNodes().find(
          (node) => normalizeAspectRatioText(textOf(node)) === payload.targetAspectRatio,
        ) ||
        null;
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
      currentText,
    };
  }

  const targetText = normalizeAspectRatioText(humanClick(targetOption));
  return {
    ok: true,
    step: "target-selected",
    currentText,
    targetText,
  };
}

export async function selectFullReferenceInDom(): Promise<FullReferenceDomSelectionResult> {
  const normalize = (value: string | null | undefined) =>
    String(value || "").replace(/\s+/g, " ").trim();
  const rectOf = (node: Element) =>
    node instanceof HTMLElement
      ? node.getBoundingClientRect()
      : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node: Element) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const textOf = (node: Element) =>
    normalize(
      node instanceof HTMLElement
        ? node.innerText || node.textContent || ""
        : node.textContent || "",
    );
  const interactiveSelector =
    "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const popupRootOf = (node: Element) =>
    node.closest(
      "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]",
    );
  const sortByVisualOrder = (nodes: Element[]) =>
    [...nodes].sort((a, b) => {
      const rectA = rectOf(a);
      const rectB = rectOf(b);
      return rectA.top - rectB.top || rectA.left - rectB.left;
    });
  const interactiveNodes = () =>
    sortByVisualOrder(
      Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible),
    );
  const clickableOf = (node: Element | null) => {
    if (!(node instanceof HTMLElement)) return null;
    return (
      node.closest(
        "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a",
      ) || node
    );
  };
  const humanClick = (node: Element | null) => {
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
  const referenceLabels = ["全能参考", "Full Reference", "首尾帧", "智能多帧", "图片参考"];
  const isReferenceLabel = (text: string) => referenceLabels.includes(text);
  const controlCandidates = () =>
    interactiveNodes().filter((node) => {
      const text = textOf(node);
      const role = normalize(node.getAttribute("role") || "");
      if (!isReferenceLabel(text)) return false;
      if (popupRootOf(node)) return false;
      return role === "combobox" || role === "button" || node.tagName.toLowerCase() !== "li";
    });
  const optionCandidates = () =>
    interactiveNodes().filter((node) => {
      const text = textOf(node);
      if (!isReferenceLabel(text)) return false;
      const role = normalize(node.getAttribute("role") || "");
      return role === "option" || role === "menuitem" || !!popupRootOf(node);
    });

  const current =
    controlCandidates().find((node) => textOf(node) === "全能参考" || textOf(node) === "Full Reference") ||
    controlCandidates()[0] ||
    null;
  if (!current) return { ok: false, step: "reference-not-found" };

  const currentReference = textOf(current);
  if (currentReference === "全能参考" || currentReference === "Full Reference") {
    return { ok: true, step: "already-set", currentReference };
  }

  humanClick(current);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 1500) {
    const option =
      optionCandidates().find((node) => textOf(node) === "全能参考") ||
      optionCandidates().find((node) => textOf(node) === "Full Reference") ||
      null;
    if (option) {
      const targetText = humanClick(option);
      return {
        ok: true,
        step: "reference-selected",
        currentReference: targetText || "全能参考",
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  return {
    ok: false,
    step: "option-not-found",
    currentReference,
  };
}

export async function selectModelInDom(
  payload: ModelDomSelectionPayload,
): Promise<ModelDomSelectionResult> {
  const normalize = (value: string | null | undefined) =>
    String(value || "").replace(/\s+/g, " ").trim();
  const normalizeModelText = (value: string | null | undefined) => {
    const text = normalize(value);
    if (/^Seedance 2\.0 Fast\b/i.test(text)) return "Seedance 2.0 Fast";
    if (/^Seedance 2\.0\b/i.test(text)) return "Seedance 2.0";
    return text;
  };
  const rectOf = (node: Element) =>
    node instanceof HTMLElement
      ? node.getBoundingClientRect()
      : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const isVisible = (node: Element) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    const rect = rectOf(node);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0
    );
  };
  const textOf = (node: Element) =>
    normalize(
      node instanceof HTMLElement
        ? node.innerText || node.textContent || ""
        : node.textContent || "",
    );
  const isCompactCandidate = (node: Element) => {
    if (!(node instanceof HTMLElement) || !isVisible(node)) return false;
    const rect = rectOf(node);
    const text = textOf(node);
    if (!text) return false;
    if (rect.width > 420 || rect.height > 96) return false;
    if (text.length > 40 && rect.width > 280) return false;
    return true;
  };
  const interactiveSelector =
    "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a, div, span";
  const popupRootOf = (node: Element) =>
    node.closest(
      "[role='listbox'], [role='menu'], [role='tooltip'], [role='dialog'], [class*='popup'], [class*='dropdown'], [class*='tooltip'], [data-radix-popper-content-wrapper]",
    );
  const sortByVisualOrder = (nodes: Element[]) =>
    [...nodes].sort((a, b) => {
      const rectA = rectOf(a);
      const rectB = rectOf(b);
      return rectA.top - rectB.top || rectA.left - rectB.left;
    });
  const interactiveNodes = () =>
    sortByVisualOrder(
      Array.from(document.querySelectorAll(interactiveSelector)).filter(
        isCompactCandidate,
      ),
    );
  const clickableOf = (node: Element | null) => {
    if (!(node instanceof HTMLElement)) return null;
    return (
      node.closest(
        "button, [role='button'], [role='tab'], [role='combobox'], [role='option'], [role='menuitem'], label, li, a",
      ) || node
    );
  };
  const humanClick = (node: Element | null) => {
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
  const controlCandidates = () =>
    interactiveNodes().filter((node) => {
      const text = textOf(node);
      const role = normalize(node.getAttribute("role") || "");
      if (!/Seedance 2\.0/i.test(text)) return false;
      if (popupRootOf(node)) return false;
      return (
        role === "combobox" ||
        role === "button" ||
        node.tagName.toLowerCase() === "button"
      );
    });
  const optionCandidates = (
    anchorRect?: DOMRect | { top: number; left: number; right: number; bottom: number },
    current?: Element | null,
  ) =>
    interactiveNodes().filter((node) => {
      if (node === current) return false;
      const text = textOf(node);
      if (!/Seedance 2\.0/i.test(text)) return false;
      const role = normalize(node.getAttribute("role") || "");
      const popupRoot = popupRootOf(node);
      const isPopupOption =
        role === "option" ||
        role === "menuitem" ||
        role === "button" ||
        node.tagName.toLowerCase() === "button" ||
        !!popupRoot ||
        /option|item|menu|popup|dropdown|select|list/i.test(
          normalize((node as HTMLElement).className || ""),
        );
      if (!isPopupOption) return false;
      if (!anchorRect) return true;
      const rect = rectOf(node);
      const horizontallyNear =
        rect.right >= anchorRect.left - 120 &&
        rect.left <= anchorRect.right + 280;
      const verticallyNear =
        rect.top >= anchorRect.top - 80 &&
        rect.top <= anchorRect.bottom + 520;
      return horizontallyNear && verticallyNear;
    });
  const scoreOption = (node: Element) => {
    const text = textOf(node);
    const normalized = normalizeModelText(text);
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

  const currentModel = normalizeModelText(textOf(current));
  if (currentModel === payload.targetModel) {
    return { ok: true, step: "already-set", currentModel: textOf(current) };
  }

  humanClick(current);
  const anchorRect = rectOf(current);
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 1500) {
    const options = optionCandidates(anchorRect, current)
      .filter((node) => scoreOption(node) > 0)
      .sort((a, b) => scoreOption(b) - scoreOption(a));
    const option = options[0] || null;
    if (option) {
      const targetText = humanClick(option);
      return {
        ok: true,
        step: "model-selected",
        currentModel: targetText,
        targetText,
        debug: options.slice(0, 6).map((node) => textOf(node)).join(" | "),
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  return {
    ok: false,
    step: "option-not-found",
    currentModel: textOf(current),
    debug: interactiveNodes()
      .map((node) => textOf(node))
      .filter((text) => /Seedance 2\.0/i.test(text))
      .slice(0, 12)
      .join(" | "),
  };
}
