// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildEnterVideoGenerationModeScript,
  buildFillPromptScript,
  buildFillPromptWithReferenceMentionsScript,
  buildTypeAtMentionScript,
  buildLocatePromptAreaScript,
  buildReadPromptValueScript,
  buildSubmitCurrentPromptStrictScript,
  buildWaitForPromptScopeReadyScript,
  buildReadToolbarStateScript,
  buildSetAspectRatioScript,
  buildSetDurationScript,
  buildSetFullReferenceScript,
  buildSetModelScript,
} from "./reverse-browserview-scripts";

function installDomTestPolyfills() {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {
      return undefined;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent || "";
    },
    set(value: string) {
      this.textContent = value;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 48,
        width: 320,
        height: 48,
        toJSON() {
          return this;
        },
      };
    },
  });
}

async function evalScript<T>(script: string): Promise<T> {
  return await window.eval(script);
}
beforeEach(() => {
  document.body.innerHTML = "";
  installDomTestPolyfills();
});

describe("reverse-browserview-scripts", () => {
  it("enters the page in the order left generate then bottom video generate", async () => {
    const callOrder: string[] = [];
    document.body.innerHTML = `
      <button id="left-generate">鐢熸垚</button>
      <button id="video-entry">瑙嗛鐢熸垚</button>
      <div id="toolbar"></div>
    `;

    document.getElementById("left-generate")?.addEventListener("click", () => {
      callOrder.push("left");
    });
    document.getElementById("video-entry")?.addEventListener("click", () => {
      callOrder.push("bottom");
      document.getElementById("toolbar")!.innerHTML =
        '<div role="combobox">Seedance 2.0</div>';
    });

    const result = await evalScript<{ ok: boolean; stage: string; clicked: string }>(
      buildEnterVideoGenerationModeScript(),
    );

    expect(result.ok).toBe(true);
    expect(result.stage).toContain("Seedance 2.0");
    expect(result.clicked).toContain("1-left-generate");
    expect(result.clicked).toContain("2-bottom-video");
    expect(callOrder).toEqual(["left", "bottom"]);
  });

  it("reads toolbar state from combobox values only", async () => {
    document.body.innerHTML = `
      <div role="combobox">Seedance 2.0 Fast</div>
      <div role="combobox">鍏ㄨ兘鍙傝€?/div>
      <div role="combobox">16:9</div>
      <div role="combobox">15s</div>
      <div>椤甸潰涓婂埆鐨勬枃妗堥噷涔熸湁鍏ㄨ兘鍙傝€?/div>
    `;

    const result = await evalScript<{
      currentModel: string;
      currentDuration: string;
      currentReference: string;
      currentAspectRatio: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
      hasTargetAspectRatio: boolean;
      hasReferenceMode: boolean;
    }>(buildReadToolbarStateScript("Seedance 2.0 Fast", "15s", "16:9"));

    expect(result.currentModel).toBe("Seedance 2.0 Fast");
    expect(result.currentDuration).toBe("15s");
    expect(result.currentReference).toBe("鍏ㄨ兘鍙傝€?");
    expect(result.currentAspectRatio).toBe("16:9");
    expect(result.hasTargetModel).toBe(true);
    expect(result.hasTargetDuration).toBe(true);
    expect(result.hasTargetAspectRatio).toBe(true);
    expect(result.hasReferenceMode).toBe(true);
  });

  it("updates controls in the intended order", async () => {
    const callOrder: string[] = [];
    document.body.innerHTML = `
      <div role="combobox" id="reference-combo">棣栧熬甯?/div>
      <div role="combobox" id="model-combo">Seedance 2.0 Fast</div>
      <div role="combobox" id="ratio-combo">9:16</div>
      <div role="combobox" id="duration-combo">4s</div>
      <div role="option" id="reference-option">鍏ㄨ兘鍙傝€?/div>
      <div role="option" id="model-option">Seedance 2.0</div>
      <div role="option" id="ratio-option">16:9</div>
      <div role="option" id="duration-option">15s</div>
    `;

    document.getElementById("reference-option")?.addEventListener("click", () => {
      callOrder.push("reference");
      document.getElementById("reference-combo")!.textContent = "鍏ㄨ兘鍙傝€?";
    });
    document.getElementById("model-option")?.addEventListener("click", () => {
      callOrder.push("model");
      document.getElementById("model-combo")!.textContent = "Seedance 2.0";
    });
    document.getElementById("ratio-option")?.addEventListener("click", () => {
      callOrder.push("ratio");
      document.getElementById("ratio-combo")!.textContent = "16:9";
    });
    document.getElementById("duration-option")?.addEventListener("click", () => {
      callOrder.push("duration");
      document.getElementById("duration-combo")!.textContent = "15s";
    });

    const referenceResult = await evalScript<{ ok: boolean; currentReference: string }>(
      buildSetFullReferenceScript(),
    );
    const modelResult = await evalScript<{ ok: boolean }>(
      buildSetModelScript("Seedance 2.0"),
    );
    const durationResult = await evalScript<{ ok: boolean }>(
      buildSetDurationScript("15s"),
    );
    const ratioResult = await evalScript<{ ok: boolean }>(
      buildSetAspectRatioScript("16:9"),
    );

    expect(referenceResult.ok).toBe(true);
    expect(referenceResult.currentReference).toBe("鍏ㄨ兘鍙傝€?");
    expect(modelResult.ok).toBe(true);
    expect(ratioResult.ok).toBe(true);
    expect(durationResult.ok).toBe(true);
    expect(callOrder).toEqual(["reference", "model", "duration", "ratio"]);
  });

  it("selects aspect ratio from the popup options instead of re-clicking the current value", async () => {
    document.body.innerHTML = `
      <button id="ratio-current">16:9</button>
      <div role="tooltip" id="ratio-popup">
        <label id="ratio-option">9:16</label>
      </div>
    `;

    const current = document.getElementById("ratio-current")!;
    const option = document.getElementById("ratio-option")!;
    let currentClicks = 0;
    current.addEventListener("click", () => {
      currentClicks += 1;
    });
    option.addEventListener("click", () => {
      current.textContent = "9:16";
    });

    Object.defineProperty(current, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 700, y: 300, top: 300, left: 700, right: 760, bottom: 336, width: 60, height: 36,
          toJSON() { return this; },
        };
      },
    });
    Object.defineProperty(option, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 740, y: 348, top: 348, left: 740, right: 800, bottom: 404, width: 60, height: 56,
          toJSON() { return this; },
        };
      },
    });

    const result = await evalScript<{ ok: boolean; step: string }>(
      buildSetAspectRatioScript("9:16"),
    );

    expect(result.ok).toBe(true);
    expect(result.step).toBe("ratio-selected");
    expect(current.textContent).toBe("9:16");
    expect(currentClicks).toBeGreaterThan(0);
  });

  it("ignores oversized page cards when selecting the target model", async () => {
    document.body.innerHTML = `
      <div role="combobox" id="model-combo">Seedance 2.0 Fast</div>
      <div id="misleading-card">Agent 妯″紡 S2.0瑙嗛鍒涗綔 Seedance 2.0 鍏ㄨ兘瑙嗛鍒涗綔</div>
      <div role="option" id="model-option">Seedance 2.0</div>
    `;

    const combo = document.getElementById("model-combo")!;
    const misleading = document.getElementById("misleading-card")!;
    const option = document.getElementById("model-option")!;
    let clickedMisleading = false;

    Object.defineProperty(combo, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 400,
          y: 100,
          top: 100,
          left: 400,
          right: 560,
          bottom: 136,
          width: 160,
          height: 36,
          toJSON() {
            return this;
          },
        };
      },
    });

    Object.defineProperty(option, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 400,
          y: 140,
          top: 140,
          left: 400,
          right: 560,
          bottom: 176,
          width: 160,
          height: 36,
          toJSON() {
            return this;
          },
        };
      },
    });

    Object.defineProperty(misleading, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 20,
          y: 20,
          top: 20,
          left: 20,
          right: 520,
          bottom: 120,
          width: 500,
          height: 100,
          toJSON() {
            return this;
          },
        };
      },
    });

    misleading.addEventListener("click", () => {
      clickedMisleading = true;
    });
    option.addEventListener("click", () => {
      combo.textContent = "Seedance 2.0";
    });

    const result = await evalScript<{ ok: boolean; step: string; text?: string }>(
      buildSetModelScript("Seedance 2.0"),
    );

    expect(result.ok).toBe(true);
    expect(result.step).toBe("model-selected");
    expect(clickedMisleading).toBe(false);
    expect(combo.textContent).toBe("Seedance 2.0");
  });

  it("locates prompt area and fills the entire prompt", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox" placeholder="缁撳悎鍥剧墖锛屾弿杩颁綘鎯崇敓鎴愮殑鐢婚潰鍜屽姩浣?></textarea>
        <input type="file" />
      </div>
      <input type="file" />
    `;

    const located = await evalScript<{ ok: boolean; fileInputIndex: number }>(
      buildLocatePromptAreaScript(),
    );
    const prompt = [
      "鍦烘櫙/浜虹墿鏍囩:",
      "銆怉va@锛堝搴旂殑璁惧畾鍥撅級銆戙€愬簾寮冨尰鐤楄埍@锛堝搴旂殑璁惧畾鍥撅級銆?,
      "鍒嗛暅1:鍐板喎鐨勫簾寮冨尰鐤楄埍閲岋紝Ava鐚涘湴鐫佸紑鍙岀溂锛岀溂绁炴儕鎭愯€岃糠鑼€?,
      "鏃犲瓧骞曘€佹棤姘村嵃銆佹棤鑳屾櫙闊充箰",
    ].join("\n");

    const fillResult = await evalScript<{ ok: boolean; promptLength: number }>(
      buildFillPromptScript(prompt),
    );
    const readBack = await evalScript<string>(buildReadPromptValueScript());

    expect(located.ok).toBe(true);
    expect(located.fileInputIndex).toBe(0);
    expect(fillResult.ok).toBe(true);
    expect(fillResult.promptLength).toBe(prompt.length);
    expect(readBack).toBe(prompt);
  });

  it("prefers the reference-content upload input over unrelated file inputs", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox" placeholder="缁撳悎鍥剧墖锛屾弿杩颁綘鎯崇敓鎴愮殑鐢婚潰鍜屽姩浣?></textarea>
        <div class="toolbar-upload">鏅€氫笂浼?input id="generic-input" type="file" /></div>
        <div class="reference-upload">鍙傝€冨唴瀹?input id="reference-input" type="file" /></div>
      </div>
      <input id="outside-input" type="file" />
    `;

    const result = await evalScript<{ ok: boolean; fileInputIndex: number }>(
      buildLocatePromptAreaScript(),
    );

    expect(result.ok).toBe(true);
    expect(result.fileInputIndex).toBe(1);
  });

  it("inserts uploaded image mentions through the @ menu", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <div role="textbox" contenteditable="true"></div>
        <button id="mention-trigger">@</button>
        <div class="mention-popup">鍙兘@鐨勫唴瀹?div role="option" id="ref-1">鍥剧墖1</div><div role="option" id="ref-2">鍥剧墖2</div></div>
      </div>
    `;

    const textbox = document.querySelector('[role="textbox"]') as HTMLDivElement;
    const selected: string[] = [];
    document.getElementById("ref-1")?.addEventListener("click", () => {
      textbox.textContent = (textbox.textContent || "") + "鍥剧墖1";
      selected.push("鍥剧墖1");
    });
    document.getElementById("ref-2")?.addEventListener("click", () => {
      textbox.textContent = (textbox.textContent || "") + "鍥剧墖2";
      selected.push("鍥剧墖2");
    });

    const prompt = ["鍦烘櫙/浜虹墿鏍囩:", "銆怉va銆戙€愬簾寮冨尰鐤楄埍銆?, "鍒嗛暅1:娴嬭瘯鍐呭"].join("\n");
    const result = await evalScript<{
      ok: boolean;
      insertedRefs: number;
      selectedRefs: string[];
    }>(
      buildFillPromptWithReferenceMentionsScript(prompt, ["Ava", "搴熷純鍖荤枟鑸?]),
    );

    expect(result.ok).toBe(true);
    expect(result.insertedRefs).toBe(2);
    expect(result.selectedRefs).toEqual(["鍥剧墖1", "鍥剧墖2"]);
    expect(textbox.textContent || "").toContain("Ava@鍥剧墖1");
    expect(textbox.textContent || "").toContain("搴熷純鍖荤枟鑸盄鍥剧墖2");
  });

  it("moves the caret to the end before opening the @ picker", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <button id="mention-trigger">@</button>
        <div class="mention-popup">鍙兘@鐨勫唴瀹?div role="option" id="ref-1">鍥剧墖1</div></div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    const mentionTrigger = document.getElementById("mention-trigger")!;
    mentionTrigger.addEventListener("click", () => {
      const start = textbox.selectionStart ?? 0;
      const end = textbox.selectionEnd ?? 0;
      const value = textbox.value || "";
      textbox.value = `${value.slice(0, start)}@${value.slice(end)}`;
      textbox.setSelectionRange(start + 1, start + 1);
    });
    document.getElementById("ref-1")?.addEventListener("click", () => {
      const start = textbox.selectionStart ?? textbox.value.length;
      const end = textbox.selectionEnd ?? start;
      const value = textbox.value || "";
      textbox.value = `${value.slice(0, start)}鍥剧墖1${value.slice(end)}`;
      const next = start + "鍥剧墖1".length;
      textbox.setSelectionRange(next, next);
    });

    const prompt = ["鍦烘櫙/浜虹墿鏍囩:", "銆怉va銆?, "鍒嗛暅1:娴嬭瘯鍐呭"].join("\n");
    const result = await evalScript<{
      ok: boolean;
      insertedRefs: number;
    }>(
      buildFillPromptWithReferenceMentionsScript(prompt, ["Ava"]),
    );

    expect(result.ok).toBe(true);
    expect(result.insertedRefs).toBe(1);
    expect(textbox.value).toContain("銆怉va@鍥剧墖1銆?);
    expect(textbox.value.startsWith("@")).toBe(false);
  });

  it("clicks the textbox after inserting @ so the picker can open", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <button id="mention-trigger">@</button>
        <div class="mention-popup">鍙兘@鐨勫唴瀹?div role="option" id="ref-1">鍥剧墖1</div></div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    let pickerOpened = false;
    textbox.addEventListener("click", () => {
      pickerOpened = true;
    });
    document.getElementById("mention-trigger")?.addEventListener("click", () => {
      const start = textbox.selectionStart ?? textbox.value.length;
      const end = textbox.selectionEnd ?? start;
      const value = textbox.value || "";
      textbox.value = `${value.slice(0, start)}@${value.slice(end)}`;
      const next = start + 1;
      textbox.setSelectionRange(next, next);
    });
    document.getElementById("ref-1")?.addEventListener("click", () => {
      if (!pickerOpened) return;
      const start = textbox.selectionStart ?? textbox.value.length;
      const end = textbox.selectionEnd ?? start;
      const value = textbox.value || "";
      textbox.value = `${value.slice(0, start)}鍥剧墖1${value.slice(end)}`;
      const next = start + "鍥剧墖1".length;
      textbox.setSelectionRange(next, next);
    });

    const prompt = ["鍦烘櫙/浜虹墿鏍囩:", "銆怉va銆?, "鍒嗛暅1:娴嬭瘯鍐呭"].join("\n");
    const result = await evalScript<{
      ok: boolean;
      insertedRefs: number;
    }>(buildFillPromptWithReferenceMentionsScript(prompt, ["Ava"]));

    expect(result.ok).toBe(true);
    expect(result.insertedRefs).toBe(1);
    expect(pickerOpened).toBe(true);
    expect(textbox.value).toContain("銆怉va@鍥剧墖1銆?);
  });

  it("selects an image-only reference option from the global visible candidates", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <div class="floating-reference-card" role="button" id="img-option">
          <img src="ref.png" alt="Ava 医疗服" />
        </div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    document.getElementById("img-option")?.addEventListener("click", () => {
      const value = textbox.value || "";
      textbox.value = `${value}Ava 医疗服`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    const result = await evalScript<{
      ok: boolean;
      step: string;
      selectedText?: string;
      optionCount?: number;
      debug?: string;
    }>(buildTypeAtMentionScript("Ava 医疗服", 0, 0));

    expect(result.ok).toBe(true);
    expect(result.step).toBe("mention-inserted");
    expect(result.optionCount).toBeGreaterThan(0);
    expect(textbox.value.endsWith("@")).toBe(false);
  });

  it("prefers indexed image options over generic visual cards", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <div class="floating-reference-card" role="button" id="img-card">
          <img src="ref.png" />
        </div>
        <div role="option" id="image-1">图片1</div>
        <button id="back-to-bottom">回到底部</button>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    document.getElementById("img-card")?.addEventListener("click", () => {
      // Generic thumbnail cards should not win over the numbered picker option.
    });
    document.getElementById("image-1")?.addEventListener("click", () => {
      const value = textbox.value || "";
      textbox.value = `${value}Ava 医疗服`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    const result = await evalScript<{
      ok: boolean;
      step: string;
      selectedText?: string;
      optionCount?: number;
      debug?: string;
    }>(buildTypeAtMentionScript("Ava 医疗服", 0, 0));

    expect(result.ok).toBe(true);
    expect(result.step).toBe("mention-inserted");
    expect(result.selectedText).toBe("图片1");
    expect(result.debug).toContain("图片1");
    expect(textbox.value.endsWith("@")).toBe(false);
  });

  it("can use a nearby @ trigger button to open the picker", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <button id="at-trigger">@</button>
        <div id="picker" style="display:none">
          <div role="option" id="ref-1">Ava 医疗服</div>
        </div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    document.getElementById("at-trigger")?.addEventListener("click", () => {
      const picker = document.getElementById("picker") as HTMLDivElement;
      picker.style.display = "block";
    });
    document.getElementById("ref-1")?.addEventListener("click", () => {
      const value = textbox.value || "";
      textbox.value = `${value}Ava 医疗服`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    const result = await evalScript<{
      ok: boolean;
      step: string;
      selectedText?: string;
    }>(buildTypeAtMentionScript("Ava 医疗服", 0, 0));

    expect(result.ok).toBe(true);
    expect(result.step).toBe("mention-inserted");
    expect(result.selectedText).toBe("Ava 医疗服");
  });

  it("prefers audio options and treats picker dismissal as applied for audio mentions", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <div role="option" id="image-1">图片1</div>
        <div role="option" id="audio-1">音频1</div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    const imageOption = document.getElementById("image-1") as HTMLDivElement;
    const audioOption = document.getElementById("audio-1") as HTMLDivElement;

    imageOption.addEventListener("click", () => {
      const value = textbox.value || "";
      textbox.value = `${value}图片1`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    audioOption.addEventListener("click", () => {
      const value = textbox.value || "";
      textbox.value = `${value}[audio-chip]`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
      audioOption.style.display = "none";
      imageOption.style.display = "none";
    });

    const result = await evalScript<{
      ok: boolean;
      step: string;
      selectedText?: string;
      optionCount?: number;
      debug?: string;
    }>(buildTypeAtMentionScript("Ava 医疗服", 0, 0, "audio"));

    expect(result.ok).toBe(true);
    expect(result.step).toBe("mention-inserted");
    expect(result.selectedText).toBe("音频1");
    expect(textbox.value).toContain("[audio-chip]");
    expect(textbox.value).not.toContain("图片1");
  });
});
