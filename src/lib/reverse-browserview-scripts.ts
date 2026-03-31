function q(value: unknown): string {
  return JSON.stringify(value);
}

function sharedHelpers(): string {
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
        if (/閹绘劗銇氱拠宄緋rompt|閸欏倽鈧啫鍞寸€圭畬@/i.test(scopeText)) score += 50000;
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
          texts.some((text) => /视频生成/.test(text)) &&
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
        .filter((text) => /閹烘帡妲閻㈢喐鍨氭稉鐡呮径鍕倞娑撶搮妫板嫯顓竱閸欐牗绉烽悽鐔稿灇|闁插秵鏌婄紓鏍帆|閸愬秵顐奸悽鐔稿灇|queue|processing|cancel|retry|regenerate|details/i.test(text))
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

export function buildDismissInterferingOverlaysScript(): string {
  return `
    (() => {
      ${sharedHelpers()}
      const closeWords = ["閸忔娊妫?, "閸欐牗绉?, "缁嬪秴鎮?, "娴犮儱鎮楅崘宥堫嚛", "閻儵浜炬禍?, "鐠哄疇绻?, "close", "cancel", "dismiss"];
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

export function buildEnterVideoGenerationModeScript(
  allowAlreadyOnGeneratePage = true,
): string {
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
          texts.some((text) => /视频生成/.test(text)) &&
          texts.some((text) => /Seedance 2\\.0/i.test(text)) &&
          texts.some((text) => /\\b\\d+s\\b/i.test(text)) &&
          texts.some((text) => /16:9|9:16|3:2|2:3|1:1|21:9|4:3/.test(text))
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
        exactControls("生成", { maxWidth: 120, preferLeft: true }) ||
        interactiveNodes().find((node) => {
          const text = textOf(node);
          const rect = rectOf(node);
          return text.startsWith("生成") && rect.width <= 120 && rect.left <= 120;
        }) ||
        null;
      const videoEntry =
        exactControls("视频生成", { maxWidth: 180, preferLower: true }) ||
        interactiveNodes().find((node) => {
          const text = textOf(node);
          const rect = rectOf(node);
          return /视频生成/.test(text) && rect.width <= 220;
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
        clicked: clicks.join(" -> ") || "未点击到目标",
        stage: readToolbarTexts().slice(0, 20).join(" | "),
      };
    })()
  `;
}

function buildSelectScript(
  controlMatcher: string,
  optionMatcher: string,
  currentMatcher: string,
  successStep: string,
): string {
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

export function buildSetFullReferenceScript(): string {
  return `
    (() => {
      ${sharedHelpers()}
      const nodes = compactToolbarControls();
      const current = nodes.find(
        (node) =>
          normalize(node.getAttribute("role") || "") === "combobox" &&
          /全能参考|Full Reference/.test(textOf(node)),
      );
      if (current) return { ok: true, step: "already-set", currentReference: textOf(current) };
      const control = nodes.find(
        (node) =>
          normalize(node.getAttribute("role") || "") === "combobox" &&
          /全能参考|Full Reference|首尾帧|智能多帧|图片参考/.test(textOf(node)),
      );
      if (!(control instanceof HTMLElement)) return { ok: false, step: "target-not-found", currentReference: "" };
      fireOpenMenu(control);
      const popup = document.querySelector("div.lv-select-popup");
      const popupOptions =
        popup instanceof HTMLElement
          ? Array.from(
              popup.querySelectorAll(
                "div.lv-select-popup-inner[role='listbox'] li[role='option'], div.lv-select-popup-inner[role='listbox'] [role='option'], li.lv-select-option",
              ),
            ).filter(isVisible)
          : [];
      const popupOption = popupOptions.find((node) => {
        const text = textOf(node);
        return text === "全能参考" || text === "Full Reference" || /全能参考|Full Reference/.test(text);
      });
      if (popupOption instanceof HTMLElement) {
        clickLikeHuman(popupOption);
        return {
          ok: true,
          step: "reference-selected-popup",
          currentReference: textOf(popupOption),
        };
      }
      const option =
        compactToolbarControls().find((node) => textOf(node) === "全能参考" || textOf(node) === "Full Reference") ||
        interactiveNodes().find((node) => textOf(node) === "全能参考" || textOf(node) === "Full Reference");
      if (!(option instanceof HTMLElement)) return { ok: false, step: "option-not-found", currentReference: textOf(control) };
      clickLikeHuman(option);
      return { ok: true, step: "reference-selected", currentReference: textOf(option) };
    })()
  `;
}

export function buildSetModelScript(targetModel: string): string {
  return `
    (() => {
      ${sharedHelpers()}
      const normalizeModelText = (value) => {
        const text = normalize(value);
        if (/^Seedance 2\\.0 Fast\\b/i.test(text)) return "Seedance 2.0 Fast";
        if (/^Seedance 2\\.0\\b/i.test(text)) return "Seedance 2.0";
        return text;
      };
      const target = ${q(targetModel)};
      const controls = compactToolbarControls();
      const current = controls.find(
        (node) =>
          /Seedance 2\\.0/i.test(textOf(node)) &&
          normalizeModelText(textOf(node)) === target,
      );
      if (current) return { ok: true, step: "already-set", currentModel: textOf(current) };

      const control =
        controls.find((node) => /Seedance 2\\.0/i.test(textOf(node)) && (
          normalize(node.getAttribute("role") || "") === "combobox" ||
          node.tagName.toLowerCase() === "button" ||
          normalize(node.getAttribute("role") || "") === "button"
        )) ||
        interactiveNodes().find((node) => /Seedance 2\\.0/i.test(textOf(node)) && (
          normalize(node.getAttribute("role") || "") === "combobox" ||
          node.tagName.toLowerCase() === "button" ||
          normalize(node.getAttribute("role") || "") === "button"
        ));

      if (!(control instanceof HTMLElement)) {
        return { ok: false, step: "control-not-found" };
      }

      const cRect = rectOf(control);
      fireOpenMenu(control);
      const popup = document.querySelector("div.lv-select-popup");
      const popupOptions =
        popup instanceof HTMLElement
          ? Array.from(
              popup.querySelectorAll(
                "div.lv-select-popup-inner[role='listbox'] li[role='option'], div.lv-select-popup-inner[role='listbox'] [role='option'], li.lv-select-option",
              ),
            ).filter(isVisible)
          : [];
      const popupOptionText = (node) => {
        if (!(node instanceof HTMLElement)) return "";
        const label =
          node.querySelector(".option-label-Fv9c0E") ||
          node.querySelector("[alt]") ||
          node;
        return textOf(label);
      };
      const scoreOption = (node) => {
        const labelText = popupOptionText(node) || textOf(node);
        const normalized = normalizeModelText(labelText);
        if (normalized === target && labelText === target) return 1400;
        if (normalized === target) return 1200;
        if (labelText.includes(target)) return 900;
        if (target.includes(labelText)) return 700;
        return 0;
      };
      const popupOption = popupOptions
        .filter((node) => /Seedance 2\\.0/i.test(popupOptionText(node) || textOf(node)))
        .sort((a, b) => scoreOption(b) - scoreOption(a))[0] || null;
      if (popupOption instanceof HTMLElement && scoreOption(popupOption) > 0) {
        clickLikeHuman(popupOption);
        return {
          ok: true,
          step: "model-selected-popup",
          currentModel: popupOptionText(popupOption) || textOf(popupOption),
          debug: popupOptions
            .slice(0, 6)
            .map((node) => popupOptionText(node) || textOf(node))
            .join(" | "),
        };
      }
      const options = interactiveNodes()
        .filter((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const text = textOf(node);
          if (!/Seedance 2\\.0/i.test(text)) return false;
          const rect = rectOf(node);
          return (
            (
              normalize(node.getAttribute("role") || "") === "option" ||
              normalize(node.getAttribute("role") || "") === "menuitem" ||
              normalize(node.getAttribute("role") || "") === "button" ||
              /option|item|menu|popup|dropdown|select|list/i.test(normalize(node.className || ""))
            ) &&
            Math.abs(rect.top - cRect.top) <= 500
          );
        })
        .sort((a, b) => {
          return scoreOption(b) - scoreOption(a);
        });

      const option = options[0] || null;

      if (!(option instanceof HTMLElement) || scoreOption(option) <= 0) {
        const visibleSeedanceTexts = interactiveNodes()
          .map((node) => textOf(node))
          .filter((text) => /Seedance 2\\.0/i.test(text))
          .slice(0, 12);
        return {
          ok: false,
          step: "option-not-found",
          currentModel: textOf(control),
          debug: visibleSeedanceTexts.join(" | "),
        };
      }

      clickLikeHuman(option);
      return {
        ok: true,
        step: "model-selected",
        currentModel: popupOptionText(option) || textOf(option),
        debug: options.slice(0, 8).map((node) => popupOptionText(node) || textOf(node)).join(" | "),
      };
    })()
  `;
}

export function buildSetDurationScript(targetDuration: string): string {
  return `
    (() => {
      ${sharedHelpers()}
      const target = ${q(targetDuration)};
      const isDurationTrigger = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const role = normalize(node.getAttribute("role") || "");
        const tag = node.tagName.toLowerCase();
        const text = textOf(node);
        return (
          /^\\d+s$/i.test(text) &&
          (tag === "button" || role === "combobox" || role === "button" ||
           /btn|dropdown|select|trigger/.test(normalize(node.className || ""))) &&
          role !== "option" && role !== "menuitem"
        );
      };
      // "Already set": only if the trigger itself shows the target duration
      const nodes = compactToolbarControls();
      const current = nodes.find((node) => isDurationTrigger(node) && textOf(node) === target);
      if (current) return { ok: true, step: "already-set", debug: "trigger-shows-target" };
      // Find the duration trigger
      const control =
        nodes.find(isDurationTrigger) ||
        interactiveNodes().find((node) => isDurationTrigger(node));
      if (!(control instanceof HTMLElement)) return { ok: false, step: "target-not-found" };
      const cRect = rectOf(control);
      fireOpenMenu(control);
      // Locate the duration selection popup by its header text
      const findDurationPopup = () => {
        const allVisible = Array.from(document.querySelectorAll("*")).filter(
          (n) => n instanceof HTMLElement && isVisible(n)
        );
        // Find element containing the popup header
        const header = allVisible.find(
          (n) => /选择视频生成时长|Select.*duration|duration.*select/i.test(textOf(n)) &&
                 rectOf(n).width < 400
        );
        if (header instanceof HTMLElement) {
          // Walk up to find the scrollable container
          let el = header.parentElement;
          for (let i = 0; i < 6 && el && el !== document.body; i++) {
            if (el.scrollHeight > el.clientHeight + 10) return el;
            el = el.parentElement;
          }
          return header.parentElement;
        }
        // Fallback: find a popup-like container near the trigger with multiple \\d+s items
        return allVisible.find((n) => {
          const r = rectOf(n);
          if (Math.abs(r.top - cRect.top) > 700) return false;
          const durationItems = Array.from(n.children).filter(
            (c) => /^\\d+s$/i.test(textOf(c))
          );
          return durationItems.length >= 3;
        }) || null;
      };
      const popup = findDurationPopup();
      // Scroll popup to top so shorter durations (like 5s) are visible
      if (popup instanceof HTMLElement) {
        popup.scrollTop = 0;
      }
      // Find target within popup first, then fall back to proximity search
      const findOption = () => {
        if (popup instanceof HTMLElement) {
          const inPopup = Array.from(popup.querySelectorAll("*")).find(
            (n) => n instanceof HTMLElement && isVisible(n) && textOf(n) === target
          );
          if (inPopup instanceof HTMLElement) return inPopup;
        }
        // Proximity fallback: pick the candidate closest to trigger, excluding non-option roles
        return interactiveNodes()
          .filter((n) => {
            if (textOf(n) !== target) return false;
            const r = rectOf(n);
            return (
              Math.abs(r.top - cRect.top) <= 700 &&
              r.left >= cRect.left - 400 &&
              r.right <= cRect.right + 400
            );
          })
          .sort((a, b) => {
            const ar = rectOf(a); const br = rectOf(b);
            return Math.abs(ar.top - cRect.top) - Math.abs(br.top - cRect.top);
          })[0] || null;
      };
      const option = findOption();
      if (!(option instanceof HTMLElement)) {
        return { ok: false, step: "option-not-found", debug: "trigger-text=" + textOf(control) + " popup=" + (popup ? "found" : "missing") };
      }
      option.scrollIntoView?.({ block: "nearest" });
      const oRect = rectOf(option);
      const cx = oRect.left + oRect.width / 2;
      const cy = oRect.top + oRect.height / 2;
      option.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: cx, clientY: cy }));
      option.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", clientX: cx, clientY: cy }));
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      option.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", clientX: cx, clientY: cy }));
      option.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
      option.click();
      return { ok: true, step: "duration-selected", debug: textOf(option) };
    })()
  `;
}

export function buildSetAspectRatioScript(targetAspectRatio: string): string {
  return buildSelectScript(
    `/^(16:9|9:16|3:2|2:3|1:1|21:9|4:3)$/.test(textOf(node)) && normalize(node.getAttribute("role") || "") !== "combobox"`,
    `textOf(node) === ${q(targetAspectRatio)}`,
    `/^(16:9|9:16|3:2|2:3|1:1|21:9|4:3)$/.test(textOf(node)) && textOf(node) === ${q(targetAspectRatio)}`,
    "ratio-selected",
  );
}

export function buildReadToolbarStateScript(
  targetModel: string,
  targetDuration: string,
  targetAspectRatio = "16:9",
): string {
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
        controls.map((node) => textOf(node)).find((text) => /^(16:9|9:16|3:2|2:3|1:1|21:9|4:3)$/.test(text)) || "";
      const currentReference =
        controls
          .filter((node) => normalize(node.getAttribute("role") || "") === "combobox")
          .map((node) => textOf(node))
          .find((text) => /全能参考|Full Reference|首尾帧|智能多帧|图片参考/.test(text)) || "";
      return {
        currentModel,
        currentDuration,
        currentAspectRatio,
        currentReference,
        hasTargetModel: currentModel === ${q(targetModel)},
        hasTargetDuration: currentDuration === ${q(targetDuration)},
        hasTargetAspectRatio: currentAspectRatio === ${q(targetAspectRatio)},
        hasReferenceMode: /全能参考|Full Reference/.test(currentReference),
        hasFirstLastFrameMode: /首尾帧/.test(currentReference),
        referenceLayout: /全能参考|Full Reference/.test(currentReference)
          ? "full-reference"
          : /首尾帧/.test(currentReference)
            ? "first-last-frame"
            : "unknown",
      };
    })()
  `;
}

export function buildLocatePromptAreaScript(): string {
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

export function buildFillPromptScript(
  prompt: string,
  files: Array<{ dataUrl: string; fileName: string }> = [],
  fileInputIndex = 0,
  textboxIndex = 0,
): string {
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
        return { ok: false, uploaded: 0, filled: false, promptLength: 0, message: "閺堫亝澹橀崚鐗堝絹缁€楦跨槤鏉堟挸鍙嗛崠? };
      }
      const allFileInputs = Array.from(document.querySelectorAll("input[type='file']"));
      const targetInput = allFileInputs[Math.max(0, explicitFileInputIndex)] || located.input || allFileInputs[0] || null;
      if (files.length > 0) {
        if (!(targetInput instanceof HTMLInputElement)) {
          return { ok: false, uploaded: 0, filled: false, promptLength: 0, message: "閺堫亝澹橀崚棰佺瑐娴肩姾绶崗銉︻攱" };
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
        message: "瀹告彃鍟撻崗銉﹀絹缁€楦跨槤",
      };
    })()
  `;
}

export function buildTypePromptScript(
  prompt: string,
  textboxIndex = 0,
  delayMs = 20,
  append = false,
): string {
  // NOTE: prompt text is injected via window.__executeData__.prompt to avoid
  // unicode encoding issues when embedding Chinese/special chars in script strings
  return `
    (async () => {
      try {
        const allTextboxes = Array.from(document.querySelectorAll(
          "textarea, input[type='text'], [role='textbox'], [contenteditable='true']"
        )).filter((n) => {
          if (!(n instanceof HTMLElement)) return false;
          const s = window.getComputedStyle(n);
          const r = n.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
        });
        const idx = ${q(textboxIndex)};
        const textbox = allTextboxes[Math.max(0, idx)] || allTextboxes[0];
        if (!(textbox instanceof HTMLElement)) {
          return { ok: false, filled: false, promptLength: 0, currentValue: "", error: "textbox-not-found" };
        }
        const promptText = (window.__executeData__ && window.__executeData__.prompt) || "";
        const appendMode = ${q(append)};
        const delayMs = ${q(delayMs)};
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const insertChar = (char) => {
          try {
            const inserted = document.execCommand("insertText", false, char);
            if (inserted) return true;
          } catch (e0) {}
          if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
            const proto = textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, "value");
            const currentVal = textbox.value || "";
            const nextValue = currentVal + char;
            if (desc && desc.set) desc.set.call(textbox, nextValue);
            else textbox.value = nextValue;
            textbox.setSelectionRange(nextValue.length, nextValue.length);
            textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
            return true;
          }
          if (textbox instanceof HTMLElement) {
            textbox.textContent = (textbox.textContent || "") + char;
            textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
            return true;
          }
          return false;
        };
        textbox.focus();
        if (!appendMode) {
          try { document.execCommand("selectAll", false, null); } catch (e1) {}
          try { document.execCommand("delete", false, null); } catch (e2) {}
        }
        for (const char of String(promptText)) {
          insertChar(char);
          await wait(delayMs);
        }
        textbox.dispatchEvent(new Event("input", { bubbles: true }));
        const currentValue = textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement
          ? textbox.value
          : (textbox.innerText || textbox.textContent || "");
        return { ok: true, filled: true, promptLength: promptText.length, currentValue, error: "" };
      } catch (err) {
        return { ok: false, filled: false, promptLength: 0, currentValue: "", error: String(err && err.message ? err.message : err) };
      }
    })()
  `;
}

export function buildTypePromptData(prompt: string): { prompt: string } {
  return { prompt };
}

export function buildReadPromptValueScript(textboxIndex = 0): string {
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

export function buildFillPromptWithReferenceMentionsScript(
  prompt: string,
  _referenceLabels: string[],
  textboxIndex = 0,
): string {
  return buildTypePromptScript(prompt, textboxIndex, 20);
}

export function buildComposePromptWithReferenceMentionsScript(
  textboxIndex = 0,
): string {
  return `
    (async () => {
      try {
        ${sharedHelpers()}
        const payload = (window.__executeData__ || {});
        const tagPrefix = String(payload.tagPrefix || "");
        const refs = Array.isArray(payload.refs) ? payload.refs : [];
        const body = String(payload.body || "");
        const textboxes = promptTextboxes();
        const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
        if (!(textbox instanceof HTMLElement)) {
          return { ok: false, step: "textbox-not-found", insertedMentions: [] };
        }
        const charDelayMs = Number.isFinite(payload.charDelayMs) ? Number(payload.charDelayMs) : 35;
        const mentionOpenDelayMs = Number.isFinite(payload.mentionOpenDelayMs) ? Number(payload.mentionOpenDelayMs) : 450;
        const mentionPickedDelayMs = Number.isFinite(payload.mentionPickedDelayMs) ? Number(payload.mentionPickedDelayMs) : 650;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const placeCaretAtEnd = (node) => {
          if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
            const value = node.value || "";
            node.focus();
            node.setSelectionRange(value.length, value.length);
            return;
          }
          if (node instanceof HTMLElement) {
            node.focus?.();
            const selection = window.getSelection?.();
            if (!selection) return;
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        };

        const insertPlainText = async (value) => {
          if (!value) return;
          for (const char of String(value)) {
            placeCaretAtEnd(textbox);
            if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
              const currentValue = textbox.value || "";
              const nextValue = currentValue + char;
              const proto =
                textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
              if (setter) setter.call(textbox, nextValue);
              else textbox.value = nextValue;
              textbox.setSelectionRange(nextValue.length, nextValue.length);
              textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
              textbox.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              const inserted = document.execCommand("insertText", false, char);
              if (!inserted && textbox instanceof HTMLElement) {
                textbox.textContent = (textbox.textContent || "") + char;
                textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
                textbox.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            await wait(charDelayMs);
          }
        };

        const textboxRect = () => rectOf(textbox);

        const insertLineBreak = async () => {
          placeCaretAtEnd(textbox);
          if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
            const currentValue = textbox.value || "";
            const nextValue = currentValue + "\n";
            const proto =
              textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter) setter.call(textbox, nextValue);
            else textbox.value = nextValue;
            textbox.setSelectionRange(nextValue.length, nextValue.length);
            textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: "\n", inputType: "insertLineBreak" }));
            textbox.dispatchEvent(new Event("change", { bubbles: true }));
            await wait(charDelayMs);
            return;
          }
          try {
            document.execCommand("insertParagraph", false);
          } catch (e0) {
            try {
              document.execCommand("insertHTML", false, "<br>");
            } catch (e1) {
              if (textbox instanceof HTMLElement) {
                textbox.appendChild(document.createElement("br"));
                textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: "\n", inputType: "insertLineBreak" }));
                textbox.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
          }
          await wait(charDelayMs);
        };

        const openMentionDropdown = async () => {
          await insertPlainText("@");
          await wait(mentionOpenDelayMs);
          const deadline = Date.now() + 4000;
          while (Date.now() < deadline) {
            await wait(150);
            const candidates = Array.from(
              document.querySelectorAll("[role='listbox'], [role='menu'], [class*='mention'], [class*='dropdown'], [class*='suggest'], [class*='popup'], [class*='at-'], [class*='picker']")
            ).filter(isVisible).sort((a, b) => {
              const rectA = rectOf(a);
              const rectB = rectOf(b);
              const base = textboxRect();
              const distA = Math.abs(rectA.top - base.bottom) + Math.abs(rectA.left - base.left);
              const distB = Math.abs(rectB.top - base.bottom) + Math.abs(rectB.left - base.left);
              return distA - distB;
            });
            if (candidates.length > 0) return candidates[0];
          }
          return null;
        };

        const readOptionText = (node) => {
          if (!(node instanceof HTMLElement)) return "";
          const ownText = normalize(node.innerText || node.textContent || "");
          if (ownText) return ownText;
          const nested = Array.from(node.querySelectorAll("*"))
            .map((child) => normalize(child instanceof HTMLElement ? child.innerText || child.textContent || "" : ""))
            .find(Boolean);
          return nested || normalize(node.getAttribute("aria-label") || "");
        };

        const insertedMentions = [];
        setTextboxValue(textbox, "");
        placeCaretAtEnd(textbox);

        if (tagPrefix) {
          await insertPlainText(tagPrefix);
        }

        for (let index = 0; index < refs.length; index += 1) {
          const ref = refs[index] || {};
          const label = String(ref.label || "");
          const optionIndex = Number.isFinite(ref.optionIndex) ? Number(ref.optionIndex) : index;
          const leadText =
            typeof ref.leadText === "string"
              ? String(ref.leadText)
              : (index === 0 ? "" : " ") + "【" + label + " ";
          const tailText =
            typeof ref.tailText === "string"
              ? String(ref.tailText)
              : "】";
          await insertPlainText(leadText);

          const dropdown = await openMentionDropdown();
          if (!dropdown) {
            return { ok: false, step: "dropdown-not-appeared", insertedMentions };
          }

          const options = Array.from(
            dropdown.querySelectorAll("[role='option'], [role='menuitem'], li, [class*='item'], [class*='option']")
          ).filter((node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (!isVisible(node) || node === dropdown) return false;
            const rect = rectOf(node);
            const text = readOptionText(node);
            return rect.height > 0 && rect.height < 140 && !!text;
          }).map((node) => {
            const clickable =
              node.closest("[role='option'], [role='menuitem'], li, button, [role='button']") || node;
            return clickable instanceof HTMLElement ? clickable : node;
          }).filter((node, index, arr) => arr.indexOf(node) === index);

          if (options.length === 0) {
            return { ok: false, step: "no-options-in-dropdown", insertedMentions };
          }

          const exactOption =
            options.find((node) => readOptionText(node) === label) ||
            options.find((node) => readOptionText(node).includes(label));
          const target =
            exactOption ||
            options[Math.max(0, Math.min(optionIndex, options.length - 1))];

          if (!(target instanceof HTMLElement)) {
            return { ok: false, step: "option-not-element", insertedMentions };
          }

          clickLikeHuman(target);
          const selectedText = readOptionText(target);
          insertedMentions.push(selectedText);
          await wait(mentionPickedDelayMs);
          const promptAfterMention = normalize(getTextboxValue(textbox));
          if (promptAfterMention.endsWith("@") || !selectedText) {
            return { ok: false, step: "mention-not-applied", insertedMentions };
          }
          await insertPlainText(tailText);
        }

        if (body) {
          if (refs.length > 0) {
            await insertLineBreak();
          }
          await insertPlainText(body);
        }

        return {
          ok: true,
          step: "prompt-composed",
          insertedMentions,
          currentValue: getTextboxValue(textbox),
        };
      } catch (e) {
        return { ok: false, step: "error", error: String(e && e.message ? e.message : e), insertedMentions: [] };
      }
    })()
  `;
}

export function buildInsertLineBreakScript(textboxIndex = 0): string {
  return `
    (() => {
      ${sharedHelpers()}
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
      if (!(textbox instanceof HTMLElement)) {
        return { ok: false, step: "textbox-not-found" };
      }
      // Jimeng's prompt box behaves like a chat composer on some builds:
      // dispatching line-break/Enter style input can trigger generation.
      // Use a plain space separator instead of a real newline.
      const spacer = " ";
      textbox.focus?.();
      if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
        const currentValue = textbox.value || "";
        const nextValue = currentValue + spacer;
        const proto =
          textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(textbox, nextValue);
        else textbox.value = nextValue;
        textbox.setSelectionRange(nextValue.length, nextValue.length);
        textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: spacer, inputType: "insertText" }));
        textbox.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, step: "space-inserted" };
      }
      try {
        const inserted = document.execCommand("insertText", false, spacer);
        if (!inserted && textbox instanceof HTMLElement) {
          textbox.textContent = (textbox.textContent || "") + spacer;
        }
      } catch (e0) {
        if (textbox instanceof HTMLElement) {
          textbox.textContent = (textbox.textContent || "") + spacer;
        }
      }
      textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: spacer, inputType: "insertText" }));
      textbox.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, step: "space-inserted" };
    })()
  `;
}

export function buildTypeAtMentionScript(
  label: string,
  optionIndex: number,
  textboxIndex = 0,
): string {
  return `
    (async () => {
      try {
        ${sharedHelpers()}
        const label = ${q(label)};
        const optionIndex = ${q(optionIndex)};
        const textboxes = promptTextboxes();
        const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
        if (!(textbox instanceof HTMLElement)) {
          return { ok: false, step: "textbox-not-found" };
        }

        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const baseRect = () => rectOf(textbox);
        const forbiddenWords = [
          "\u521b\u5efa\u4e3b\u4f53",
          "\u53ef\u80fd@\u7684\u5185\u5bb9",
          "\u8d44\u4ea7",
          "\u753b\u5e03",
          "\u9ad8\u7ea7\u4f1a\u5458",
          "\u4f1a\u5458",
          "\u8ba2\u9605",
          "\u6a21\u677f",
          "\u9996\u9875",
          "\u5386\u53f2",
          "\u8bbe\u7f6e",
          "\u5e2e\u52a9",
          "\u767b\u5f55",
          "\u4e0a\u4f20",
          "\u4e0b\u8f7d",
          "\u89c6\u9891\u751f\u6210",
          "\u5168\u80fd\u53c2\u8003",
          "\u9996\u5c3e\u5e27",
          "Seedance",
          "\u573a\u666f/\u4eba\u7269\u6807\u7b7e",
          "\u53c2\u8003\u5185\u5bb9",
          "\u56de\u5230\u5e95\u90e8",
          "\u56de\u5230\u9876\u90e8",
          "back to top",
        ];
        const readOptionText = (node) => {
          if (!(node instanceof HTMLElement)) return "";
          const ownText = normalize(node.innerText || node.textContent || "");
          if (ownText) return ownText;
          const imgAlt = Array.from(node.querySelectorAll("img"))
            .map((img) => normalize(img.getAttribute("alt") || ""))
            .find(Boolean);
          if (imgAlt) return imgAlt;
          return normalize(node.getAttribute("aria-label") || "") || normalize(node.getAttribute("title") || "");
        };
        const hasVisualPayload = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const bg = window.getComputedStyle(node).backgroundImage || "";
          return !!node.querySelector("img, picture, canvas, video, svg") || (!!bg && bg !== "none");
        };
        const isForbidden = (node, text) => {
          if (!(node instanceof HTMLElement)) return true;
          const cls = normalize(node.className || "").toLowerCase();
          const textValue = String(text || "");
          return (
            forbiddenWords.some((word) => textValue.includes(word)) ||
            /toolbar|sidebar|nav|header|footer|tabbar|menu-bar|topbar/i.test(cls)
          );
        };
        const indexedImagePattern = new RegExp("^(?:\\u56fe\\u7247|image)\\s*" + (optionIndex + 1) + "$", "i");
        const isIndexedImageText = (text) => indexedImagePattern.test(String(text || ""));
        const isGenericImageText = (text) => /^(?:\u56fe\u7247|image)\s*\d+$/i.test(String(text || ""));
        const candidatePriority = (node) => {
          const text = readOptionText(node);
          if (text === label) return 6;
          if (text && text.includes(label)) return 5;
          if (isIndexedImageText(text)) return 4;
          if (isGenericImageText(text)) return 3;
          if (hasVisualPayload(node)) return 2;
          return 1;
        };
        const collectCandidates = () => {
          const rect = baseRect();
          return Array.from(
            document.querySelectorAll("[role='option'], [role='menuitem'], li, button, [role='button'], [class*='item'], [class*='option'], [class*='card'], [class*='mention'], [class*='reference'], [class*='asset'], [class*='thumb']")
          )
            .filter((node) => {
              if (!(node instanceof HTMLElement)) return false;
              if (node === textbox || node.contains(textbox) || textbox.contains(node)) return false;
              if (!isVisible(node)) return false;
              const text = readOptionText(node);
              const visual = hasVisualPayload(node);
              if (isForbidden(node, text)) return false;
              const r = rectOf(node);
              const nearTextbox =
                r.bottom >= rect.top - 260 &&
                r.top <= rect.bottom + 120 &&
                r.left >= rect.left - 40 &&
                r.left <= rect.right + 220;
              const sizeOk =
                (r.height > 0 && r.height < 160) ||
                (visual && r.height <= 220 && r.width <= 260);
              return nearTextbox && sizeOk && (!!text || visual);
            })
            .map((node) => {
              const clickable = node.closest("[role='option'], [role='menuitem'], li, button, [role='button']") || node;
              return clickable instanceof HTMLElement ? clickable : node;
            })
            .filter((node, index, arr) => arr.indexOf(node) === index)
            .sort((a, b) => {
              const rect = baseRect();
              const ra = rectOf(a);
              const rb = rectOf(b);
              const scoreA = candidatePriority(a);
              const scoreB = candidatePriority(b);
              const distA = Math.abs(ra.top - rect.bottom) + Math.abs(ra.left - rect.left);
              const distB = Math.abs(rb.top - rect.bottom) + Math.abs(rb.left - rect.left);
              return scoreB - scoreA || distA - distB;
            });
        };
        const applyAtChar = () => {
          textbox.focus?.();
          try {
            const inserted = document.execCommand("insertText", false, "@");
            if (inserted) return;
          } catch (e0) {}
          if (textbox instanceof HTMLTextAreaElement || textbox instanceof HTMLInputElement) {
            const value = textbox.value || "";
            const next = value + "@";
            const proto = textbox instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter) setter.call(textbox, next);
            else textbox.value = next;
            textbox.setSelectionRange(next.length, next.length);
            textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: "@", inputType: "insertText" }));
            textbox.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }
          textbox.dispatchEvent(new KeyboardEvent("keydown", { key: "@", keyCode: 50, bubbles: true }));
          textbox.dispatchEvent(new KeyboardEvent("keypress", { key: "@", keyCode: 50, bubbles: true }));
          textbox.dispatchEvent(new InputEvent("input", { bubbles: true, data: "@", inputType: "insertText" }));
          textbox.dispatchEvent(new KeyboardEvent("keyup", { key: "@", keyCode: 50, bubbles: true }));
        };

        applyAtChar();
        await wait(300);
        textbox.click?.();
        textbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        textbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        textbox.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));

        let options = [];
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          await wait(200);
          options = collectCandidates();
          if (options.length > 0) break;
          const atButton = interactiveNodes().find((node) => {
            if (!(node instanceof HTMLElement) || node === textbox) return false;
            const t = textOf(node);
            const a = normalize(node.getAttribute("aria-label") || "");
            const r = rectOf(node);
            const rect = baseRect();
            return r.top >= rect.top - 40 && r.top <= rect.bottom + 180 && r.left >= rect.right - 20 && r.left <= rect.right + 220 && (t === "@" || a === "@");
          });
          if (atButton instanceof HTMLElement) clickLikeHuman(atButton);
        }

        if (options.length === 0) {
          return { ok: false, step: "no-options-in-dropdown", optionCount: 0, debug: "local-visible-options=0" };
        }

        const preview = options.slice(0, 8).map((node, idx) => readOptionText(node) || ("[image-option-" + (idx + 1) + "]")).join(" | ");
        const exactOption = options.find((node) => readOptionText(node) === label) || options.find((node) => readOptionText(node).includes(label));
        const indexedImageOption = options.find((node) => isIndexedImageText(readOptionText(node)));
        const textualImageOptions = options.filter((node) => isGenericImageText(readOptionText(node)));
        const visualOnlyOption = options.find((node) => hasVisualPayload(node));
        const target =
          exactOption ||
          indexedImageOption ||
          textualImageOptions[Math.max(0, Math.min(optionIndex, textualImageOptions.length - 1))] ||
          visualOnlyOption ||
          options[Math.max(0, Math.min(optionIndex, options.length - 1))];
        if (!(target instanceof HTMLElement)) {
          return { ok: false, step: "option-not-element", debug: preview };
        }

        const tryApply = async () => {
          const valueBeforeApply = normalize(getTextboxValue(textbox));
          const waitForMentionApplied = async () => {
            const settleDeadline = Date.now() + 1800;
            while (Date.now() < settleDeadline) {
              await wait(150);
              const afterValue = normalize(getTextboxValue(textbox));
              if (afterValue !== valueBeforeApply && !afterValue.endsWith("@")) return true;
            }
            return false;
          };
          const clickTargets = [
            target,
            target.querySelector("img, picture, canvas, video"),
            Array.from(target.querySelectorAll("*")).find((child) => child instanceof HTMLElement && !!readOptionText(child)),
          ].filter(Boolean);
          for (const candidate of clickTargets) {
            if (!(candidate instanceof HTMLElement)) continue;
            clickLikeHuman(candidate);
            if (await waitForMentionApplied()) return true;
          }
          target.focus?.();
          target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          target.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
          return await waitForMentionApplied();
        };

        const applied = await tryApply();
        if (!applied) {
          return {
            ok: false,
            step: "mention-not-applied",
            selectedText: readOptionText(target),
            optionCount: options.length,
            debug: preview,
          };
        }

        return {
          ok: true,
          step: "mention-inserted",
          selectedText: readOptionText(target),
          optionCount: options.length,
          debug: preview,
        };
      } catch (e) {
        return { ok: false, step: "error", error: String(e && e.message ? e.message : e) };
      }
    })()
  `;
}

export function buildClickSubmitButtonScript(textboxIndex = 0): string {
  return `
    (() => {
      ${sharedHelpers()}
      const textboxes = promptTextboxes();
      const textbox = textboxes[Math.max(0, ${q(textboxIndex)})] || findPromptTextbox();
      if (!(textbox instanceof HTMLElement)) {
        return { ok: false, step: "textbox-not-found" };
      }
      // Walk up from textbox to find a scope that contains a submit button
      // Look for button with submit-button class, or the rightmost small button near the textbox
      const tRect = rectOf(textbox);
      const allButtons = Array.from(document.querySelectorAll("button, [role='button']")).filter(isVisible);
      const candidates = allButtons
        .map((node) => {
          const rect = rectOf(node);
          const cls = normalize(node instanceof HTMLElement ? node.className || "" : "");
          let score = 0;
          // Strong signal: class contains submit-button
          if (/submit.?button|send.?button/i.test(cls)) score += 1000;
          // Penalize toolbar/swap buttons
          if (/swap.?button|toolbar.?button|tool.?bar/i.test(cls)) score -= 800;
          // Penalize disabled
          if (node instanceof HTMLButtonElement && node.disabled) score -= 500;
          // Prefer small square buttons (icon buttons)
          if (rect.width >= 28 && rect.width <= 56 && rect.height >= 28 && rect.height <= 56) score += 200;
          // Prefer buttons to the right of and vertically aligned with textbox
          const verticalOverlap = rect.top < tRect.bottom + 40 && rect.bottom > tRect.top - 40;
          const rightOfTextbox = rect.left > tRect.left + tRect.width * 0.5;
          if (verticalOverlap) score += 150;
          if (rightOfTextbox) score += 200;
          // Prefer buttons below the textbox
          if (rect.top >= tRect.bottom - 10) score += 100;
          return { node, score, rect };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = candidates[0];
      if (!best) {
        return { ok: false, step: "no-submit-candidate" };
      }
      const target = best.node;
      if (!(target instanceof HTMLElement)) {
        return { ok: false, step: "target-not-element" };
      }
      if (target instanceof HTMLButtonElement && target.disabled) {
        return { ok: false, step: "button-disabled" };
      }
      const rect = best.rect;
      const clickX = Math.round(rect.left + rect.width / 2);
      const clickY = Math.round(rect.top + rect.height / 2);
      // JS click
      target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.click();
      return {
        ok: true,
        step: "clicked",
        clickX,
        clickY,
        btnText: normalize(target.innerText || target.textContent || ""),
        btnClass: normalize(target.className || ""),
      };
    })()
  `;
}

export function buildReadPromptScopeStateScript(textboxIndex = 0): string {
  return `
    (() => {
      ${sharedHelpers()}
      return readScope(${q(textboxIndex)});
    })()
  `;
}

export function buildSubmitCurrentPromptScript(): string {
  return buildSubmitCurrentPromptStrictScript(0);
}

export function buildSubmitCurrentPromptStrictScript(textboxIndex = 0): string {
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
          .filter((text) => /队列|排队|生成中|处理中|重试|重新生成|详情|查看|queue|processing|retry|regenerate|details/i.test(text))
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
        after = readScope(${q(textboxIndex)});
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

export function buildWaitForPromptScopeReadyScript(
  textboxIndex = 0,
  timeoutMs = 30000,
): string {
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

export function buildScrollResultsIntoViewScript(): string {
  return `
    (() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      return { ok: true, anchor: "" };
    })()
  `;
}

export function buildCollectResultCardsScript(): string {
  return `
    (() => ({ cards: [] }))()
  `;
}

export function buildTriggerDownloadButtonScript(index = 0): string {
  return `
    (() => {
      ${sharedHelpers()}
      const buttons = interactiveNodes().filter((node) => /娑撳娴噟download|娣囨繂鐡?i.test(textOf(node)));
      const target = buttons[Math.max(0, ${q(index)})] || null;
      if (!(target instanceof HTMLElement)) return { ok: false, step: "download-button-not-found" };
      clickLikeHuman(target);
      return { ok: true, step: "download-clicked" };
    })()
  `;
}
