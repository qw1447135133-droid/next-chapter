import {
  selectAspectRatioInDom,
  selectFullReferenceInDom,
} from "./reverse-playwright-dom";

describe("selectAspectRatioInDom", () => {
  it("finds popup options that are rendered only after the current ratio is clicked", () => {
    document.body.innerHTML = `
      <button id="ratio-current">16:9</button>
      <div id="portal-root"></div>
    `;

    const current = document.getElementById("ratio-current") as HTMLButtonElement;
    const portalRoot = document.getElementById("portal-root") as HTMLDivElement;

    Object.defineProperty(current, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 700,
          y: 300,
          top: 300,
          left: 700,
          right: 760,
          bottom: 336,
          width: 60,
          height: 36,
          toJSON() {
            return this;
          },
        };
      },
    });

    current.addEventListener("click", () => {
      if (document.getElementById("ratio-popup")) return;
      window.setTimeout(() => {
        portalRoot.innerHTML = `
          <div role="tooltip" id="ratio-popup">
            <label id="ratio-option">9:16</label>
          </div>
        `;

        const option = document.getElementById("ratio-option") as HTMLLabelElement;
        Object.defineProperty(option, "getBoundingClientRect", {
          configurable: true,
          value() {
            return {
              x: 740,
              y: 348,
              top: 348,
              left: 740,
              right: 800,
              bottom: 404,
              width: 60,
              height: 56,
              toJSON() {
                return this;
              },
            };
          },
        });
        option.addEventListener("click", () => {
          current.textContent = "9:16";
        });
      }, 60);
    });

    return selectAspectRatioInDom({ targetAspectRatio: "9:16" }).then((result) => {
      expect(result.ok).toBe(true);
      expect(result.step).toBe("target-selected");
      expect(current.textContent).toBe("9:16");
    });
  });

  it("ignores tooltip container text and selects the exact ratio label inside it", async () => {
    document.body.innerHTML = `
      <button id="ratio-current">16:9</button>
      <div role="tooltip" id="ratio-popup">
        <div id="ratio-summary">选择比例 21:9 16:9 4:3 1:1 3:4 9:16</div>
        <div role="radiogroup">
          <label id="ratio-option">9:16</label>
        </div>
      </div>
    `;

    const current = document.getElementById("ratio-current") as HTMLButtonElement;
    const summary = document.getElementById("ratio-summary") as HTMLDivElement;
    const option = document.getElementById("ratio-option") as HTMLLabelElement;

    Object.defineProperty(current, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 659,
          y: 341,
          top: 341,
          left: 659,
          right: 729,
          bottom: 377,
          width: 70,
          height: 36,
          toJSON() {
            return this;
          },
        };
      },
    });
    Object.defineProperty(summary, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 660,
          y: 402,
          top: 402,
          left: 660,
          right: 960,
          bottom: 486,
          width: 300,
          height: 84,
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
          x: 910,
          y: 428,
          top: 428,
          left: 910,
          right: 958,
          bottom: 484,
          width: 48,
          height: 56,
          toJSON() {
            return this;
          },
        };
      },
    });

    option.addEventListener("click", () => {
      current.textContent = "9:16";
    });

    const result = await selectAspectRatioInDom({ targetAspectRatio: "9:16" });

    expect(result.ok).toBe(true);
    expect(result.step).toBe("target-selected");
    expect(current.textContent).toBe("9:16");
  });

  it("selects full reference from a combobox popup", async () => {
    document.body.innerHTML = `
      <div role="combobox" id="reference-current">首尾帧</div>
      <div role="listbox" id="reference-popup" hidden>
        <li role="option" id="reference-full">全能参考</li>
        <li role="option">首尾帧</li>
      </div>
    `;

    const current = document.getElementById("reference-current") as HTMLDivElement;
    const popup = document.getElementById("reference-popup") as HTMLDivElement;
    const full = document.getElementById("reference-full") as HTMLLIElement;

    Object.defineProperty(current, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 549,
          y: 341,
          top: 341,
          left: 549,
          right: 655,
          bottom: 377,
          width: 106,
          height: 36,
          toJSON() {
            return this;
          },
        };
      },
    });
    Object.defineProperty(popup, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 538,
          y: 390,
          top: 390,
          left: 538,
          right: 716,
          bottom: 526,
          width: 178,
          height: 136,
          toJSON() {
            return this;
          },
        };
      },
    });
    Object.defineProperty(full, "getBoundingClientRect", {
      configurable: true,
      value() {
        return {
          x: 538,
          y: 390,
          top: 390,
          left: 538,
          right: 712,
          bottom: 434,
          width: 174,
          height: 44,
          toJSON() {
            return this;
          },
        };
      },
    });

    current.addEventListener("click", () => {
      popup.hidden = false;
    });
    full.addEventListener("click", () => {
      current.textContent = "全能参考";
    });

    const result = await selectFullReferenceInDom();

    expect(result.ok).toBe(true);
    expect(result.step).toBe("reference-selected");
    expect(current.textContent).toBe("全能参考");
  });
});
