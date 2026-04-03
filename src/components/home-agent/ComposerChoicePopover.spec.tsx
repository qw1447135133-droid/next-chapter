import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { ComposerQuestion } from "@/lib/home-agent/types";

import ComposerChoicePopover from "./ComposerChoicePopover";

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

    expect(screen.getByText("先选一个方向，再确认继续。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
