// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildForceApplySettingsScriptV2,
  buildPromptFillScript,
  buildSafeInspectJimengPageScript,
  buildTargetVerificationScriptV2,
} from "./MultimodalAgentPanel";

function installDomTestPolyfills() {
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
        right: 200,
        bottom: 40,
        width: 200,
        height: 40,
        toJSON() {
          return this;
        },
      };
    },
  });

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  });

  class TestDataTransfer {
    private _items: Array<{
      kind: string;
      type: string;
      getAsFile: () => File | null;
    }> = [];

    get files() {
      const files = this._items
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      return files;
    }

    get items() {
      return {
        add: (file: File) => {
          this._items.push({
            kind: "file",
            type: file.type,
            getAsFile: () => file,
          });
        },
      };
    }

    constructor() {}
  }

  (globalThis as any).DataTransfer = TestDataTransfer;
}

async function evalScript<T>(script: string): Promise<T> {
  return await window.eval(script);
}

beforeEach(() => {
  document.body.innerHTML = "";
  installDomTestPolyfills();
});

describe("reverse mode automation scripts", () => {
  it("normalizes model and duration text during verification", async () => {
    document.body.innerHTML = `
      <div role="combobox">Seedance 2.0 Fast 推荐</div>
      <div role="combobox">4s 极速</div>
    `;

    const result = await evalScript<{
      currentModel: string;
      currentDuration: string;
      hasTargetModel: boolean;
      hasTargetDuration: boolean;
    }>(buildTargetVerificationScriptV2("Seedance 2.0 Fast", "4s"));

    expect(result.currentModel).toBe("Seedance 2.0 Fast");
    expect(result.currentDuration).toBe("4s");
    expect(result.hasTargetModel).toBe(true);
    expect(result.hasTargetDuration).toBe(true);
  });

  it("switches combobox selections to the requested model and duration", async () => {
    document.body.innerHTML = `
      <div role="combobox" id="model-combo">Seedance 2.0 Fast</div>
      <div role="combobox" id="duration-combo">4s</div>
      <div role="option" id="model-option">Seedance 2.0</div>
      <div role="option" id="duration-option">15s</div>
    `;

    const modelCombo = document.getElementById("model-combo")!;
    const durationCombo = document.getElementById("duration-combo")!;
    document.getElementById("model-option")!.addEventListener("click", () => {
      modelCombo.textContent = "Seedance 2.0";
    });
    document.getElementById("duration-option")!.addEventListener("click", () => {
      durationCombo.textContent = "15s";
    });

    const result = await evalScript<{
      currentModel: string;
      currentDuration: string;
      success: boolean;
    }>(buildForceApplySettingsScriptV2("Seedance 2.0", "15s"));

    expect(result.success).toBe(true);
    expect(result.currentModel).toBe("Seedance 2.0");
    expect(result.currentDuration).toBe("15s");
  });

  it("detects a ready page with dynamic target duration", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("https://jimeng.jianying.com/ai-tool/home?type=video&workspace=0"),
    });

    document.body.innerHTML = `
      <button>视频生成</button>
      <div role="combobox">Seedance 2.0</div>
      <button>全能参考</button>
      <div>参考内容</div>
      <button>16:9</button>
      <button>15s</button>
      <button>@</button>
    `;

    const result = await evalScript<{ targetMatched: boolean; hasTargetDuration: boolean }>(
      buildSafeInspectJimengPageScript("15s"),
    );

    expect(result.hasTargetDuration).toBe(true);
    expect(result.targetMatched).toBe(true);
  });

  it("fills the full prompt and uploads references without submitting", async () => {
    document.body.innerHTML = `
      <div class="section-generator-N3XwXD">
        <textarea role="textbox"></textarea>
        <input id="ref-input" type="file" />
      </div>
    `;

    const input = document.getElementById("ref-input") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      writable: true,
      value: [],
    });

    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0xkAAAAASUVORK5CYII=";

    const result = await evalScript<{
      ok: boolean;
      uploaded: number;
      filled: boolean;
      promptLength: number;
    }>(
      buildPromptFillScript("这是一整段提示词。", [
        { dataUrl, fileName: "reference-1.png" },
      ]),
    );

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;

    expect(result.ok).toBe(true);
    expect(result.filled).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(result.promptLength).toBe("这是一整段提示词。".length);
    expect(textarea.value).toBe("这是一整段提示词。");
    expect((input.files as unknown as File[]).length).toBe(1);
  });
});
