import { fireEvent, render, screen } from "@testing-library/react";

import { HomeComposer } from "./home-agent-shell";

describe("HomeComposer", () => {
  it("accepts text input when no structured question modal is shown", () => {
    const onDraftChange = vi.fn();

    render(
      <HomeComposer
        idle
        initialDraft=""
        draftResetVersion={0}
        draftPresence={false}
        onDraftChange={onDraftChange}
        placeholder="和 Agent 说出你的目标"
        question={null}
        qState={null}
        selectedValues={[]}
        streaming={false}
        reduceMotion
        composerShellClass="rounded-[28px]"
        activeTheme
        selectedTextModelKey="google/gemini-3-flash"
        selectedTextModelLabel="Google / 3 Flash"
        textModelGroups={[]}
        onSelectTextModel={vi.fn()}
        onSelectChoice={vi.fn()}
        onSubmit={vi.fn()}
        onInterrupt={vi.fn()}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "测试输入" } });

    expect(textarea.value).toBe("测试输入");
    expect(onDraftChange).toHaveBeenCalledWith("测试输入");
  });
});
