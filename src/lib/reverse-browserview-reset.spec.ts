// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLocatePromptAreaScript,
  buildReadPromptValueScript,
  buildResetPromptAreaScript,
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

  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value(command: string) {
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

describe("buildResetPromptAreaScript", () => {
  it("clears the current prompt textbox", async () => {
    document.body.innerHTML = `
      <div class="section-generator-panel">
        <textarea role="textbox">old prompt content</textarea>
        <input type="file" />
      </div>
    `;

    const located = await evalScript<{ ok: boolean; textboxIndex: number }>(
      buildLocatePromptAreaScript(),
    );
    expect(located.ok).toBe(true);

    const result = await evalScript<{
      ok: boolean;
      step: string;
      currentValue?: string;
    }>(buildResetPromptAreaScript(located.textboxIndex));

    const readBack = await evalScript<string>(
      buildReadPromptValueScript(located.textboxIndex),
    );

    expect(result.ok).toBe(true);
    expect(result.step).toBe("prompt-area-reset");
    expect(result.currentValue).toBe("");
    expect(readBack).toBe("");
  });
});
