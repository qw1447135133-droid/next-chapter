import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposerQuestion } from "@/lib/home-agent/types";
import { ComposerChoicePanel } from "./composer-choice-panel";

function createQuestion(overrides?: Partial<ComposerQuestion>): ComposerQuestion {
  return {
    id: "question-collapse-1",
    title: "请选择最符合你心中《半平米的余温》的创作方向：",
    description: "点任一建议即可直接提交。",
    options: [
      { id: "opt-1", label: "方案一", value: "方案一", rationale: "温情烟火感" },
      { id: "opt-2", label: "方案二", value: "方案二", rationale: "职业竞技感" },
    ],
    allowCustomInput: true,
    submissionMode: "immediate",
    multiSelect: false,
    stepIndex: 0,
    totalSteps: 1,
    answerKey: "direction",
    ...overrides,
  };
}

describe("ComposerChoicePanel", () => {
  it("collapses into a single expand button without keeping option buttons visible", () => {
    render(
      <ComposerChoicePanel
        question={createQuestion()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /方案一/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起选择窗" }));

    expect(screen.queryByRole("button", { name: /方案一/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /方案二/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `展开选择窗：${createQuestion().title}`,
      }),
    ).toBeInTheDocument();
  });
});
