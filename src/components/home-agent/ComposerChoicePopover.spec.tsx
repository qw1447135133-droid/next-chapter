import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ComposerQuestion } from "@/lib/home-agent/types";
import { GENRES } from "@/types/drama";

import ComposerChoicePopover from "./ComposerChoicePopover";

class ResizeObserverMock {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

const OriginalResizeObserver = globalThis.ResizeObserver;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = ResizeObserverMock;

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = OriginalResizeObserver;
});

function createQuestion(overrides?: Partial<ComposerQuestion>): ComposerQuestion {
  return {
    id: "question-1",
    title: "选择方向",
    description: "这里是一个简短说明。",
    options: [
      { id: "opt-1", label: "都市", value: "都市" },
      { id: "opt-2", label: "悬疑", value: "悬疑" },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "genre",
    ...overrides,
  };
}

describe("ComposerChoicePopover", () => {
  function renderPopover(ui: ReactElement) {
    return render(ui);
  }

  function createGenreQuestion(): ComposerQuestion {
    const category = "古风与幻想";
    const options = GENRES.filter((genre) => genre.category === category).map((genre) => ({
      id: genre.value,
      label: genre.label,
      value: genre.value,
    }));

    return createQuestion({
      title: "选择题材",
      description: "按传统面板继续细化。",
      answerKey: "题材选择",
      multiSelect: true,
      submissionMode: "confirm",
      options,
    });
  }

  it("renders compact chip mode for short immediate options and forwards selection", () => {
    const onSelect = vi.fn();

    renderPopover(
      <ComposerChoicePopover
        question={createQuestion({
          description: undefined,
          options: [
            { id: "opt-1", label: "都市", value: "都市" },
            { id: "opt-2", label: "悬疑", value: "悬疑" },
          ],
        })}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "都市" }));
    expect(onSelect).toHaveBeenCalledWith("都市", "都市");
    expect(screen.getByText("点任一建议即可直接提交。")).toBeInTheDocument();
  });

  it("renders detailed card mode when options include rationale", () => {
    renderPopover(
      <ComposerChoicePopover
        question={createQuestion({
          options: [
            {
              id: "opt-1",
              label: "都市情感",
              value: "都市情感",
              rationale: "节奏快，适合短剧市场。",
            },
          ],
        })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("节奏快，适合短剧市场。")).toBeInTheDocument();
  });

  it("honors explicit card presentation for short options", () => {
    const { container } = renderPopover(
      <ComposerChoicePopover
        question={createQuestion({
          description: undefined,
          presentation: "card",
          options: [
            { id: "opt-1", label: "女频", value: "女频" },
            { id: "opt-2", label: "男频", value: "男频" },
            { id: "opt-3", label: "全龄", value: "全龄" },
          ],
        })}
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-choice-mode="card"]')).not.toBeNull();
  });

  it("shows confirm mode affordances and calls onConfirm", () => {
    const onConfirm = vi.fn();

    renderPopover(
      <ComposerChoicePopover
        question={createQuestion({
          submissionMode: "confirm",
          options: [{ id: "opt-1", label: "保留反转", value: "反转", selected: true }],
        })}
        onSelect={vi.fn()}
        onConfirm={onConfirm}
        canConfirm
      />,
    );

    expect(screen.getByText("确认后直接执行。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the secondary genre panel top aligned with the primary list", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-primary-list") return 320;
        if (this.getAttribute?.("data-choice-mode") === "card") return 420;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-picker-root") return 96;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-secondary-list") return 160;
        return 0;
      },
    });

    renderPopover(
      <ComposerChoicePopover
        question={createGenreQuestion()}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        canConfirm={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "古风与幻想" }));
    const panel = screen.getByTestId("genre-secondary-panel");
    expect(panel).toHaveStyle({ top: "-96px" });
  });

  it("shrinks the secondary genre panel when the content is shorter than the primary list", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-primary-list") return 300;
        if (this.getAttribute?.("data-choice-mode") === "card") return 420;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-picker-root") return 96;
        return 0;
      },
    });

    let secondaryScrollHeight = 120;
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-secondary-list") return secondaryScrollHeight;
        return 0;
      },
    });

    renderPopover(
      <ComposerChoicePopover
        question={createGenreQuestion()}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        canConfirm={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "古风与幻想" }));
    const panel = screen.getByTestId("genre-secondary-panel");
    const list = screen.getByTestId("genre-secondary-list");

    expect(panel.style.height).toBe("124px");
    expect(list.style.height).toBe("120px");
  });

  it("caps the secondary genre panel at the primary list height when there are many options", () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-primary-list") return 300;
        if (this.getAttribute?.("data-choice-mode") === "card") return 420;
        return 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-picker-root") return 96;
        return 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        const testId = this.getAttribute?.("data-testid");
        if (testId === "genre-secondary-list") return 520;
        return 0;
      },
    });

    renderPopover(
      <ComposerChoicePopover
        question={createGenreQuestion()}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        canConfirm={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "古风与幻想" }));
    const cappedPanel = screen.getByTestId("genre-secondary-panel");
    const cappedList = screen.getByTestId("genre-secondary-list");

    expect(cappedPanel.style.height).toBe("420px");
    expect(cappedList.style.height).toBe("416px");
  });
});
