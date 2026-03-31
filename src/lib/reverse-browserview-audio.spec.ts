// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { buildTypeAtMentionScript } from "./reverse-browserview-scripts";

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

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value(command: string, _showUi?: boolean, value?: string) {
      if (command === "insertText") {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
          active.value = `${active.value}${value || ""}`;
          active.setSelectionRange(active.value.length, active.value.length);
          return true;
        }
      }
      if (command === "selectAll" || command === "delete") return true;
      return false;
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

describe("buildTypeAtMentionScript audio mentions", () => {
  it("clicks the audio asset card container instead of falling back to an image option", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox"></textarea>
        <div class="asset-card image-card" id="image-card">
          <span>图片1</span>
        </div>
        <div class="asset-card audio-card" id="audio-card">
          <div class="asset-card-body">
            <span class="asset-label">音频1</span>
          </div>
        </div>
      </div>
    `;

    const textbox = document.querySelector("textarea") as HTMLTextAreaElement;
    let clickedImage = false;
    let clickedAudio = false;

    document.getElementById("image-card")?.addEventListener("click", () => {
      clickedImage = true;
      textbox.value = `${textbox.value}[image-chip]`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    document.getElementById("audio-card")?.addEventListener("click", () => {
      clickedAudio = true;
      textbox.value = `${textbox.value}[audio-chip]`;
      textbox.setSelectionRange(textbox.value.length, textbox.value.length);
    });

    const script = buildTypeAtMentionScript("Ava", 0, 0, "audio");
    expect(script).toContain(String.raw`(?:^|\s)(?:音频|audio)(?:\s*\d+)?(?:$|\s)`);

    const result = await evalScript<{
      ok: boolean;
      step: string;
      selectedText?: string;
      optionCount?: number;
      debug?: string;
    }>(script);

    expect(result.ok).toBe(true);
    expect(result.step).toBe("mention-inserted");
    expect(clickedAudio).toBe(true);
    expect(clickedImage).toBe(false);
    expect(result.selectedText).toBe("音频1");
    expect(textbox.value).toContain("[audio-chip]");
  });
});
