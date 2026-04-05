import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeTextModelPicker } from "./HomeTextModelPicker";
import { groupHomeAgentTextModelOptions } from "@/lib/home-agent/text-models";

describe("HomeTextModelPicker", () => {
  it("opens a provider popup first and then a provider-specific model popup", () => {
    const onSelect = vi.fn();
    render(
      <HomeTextModelPicker
        activeTheme
        selectedKey="claude-sonnet-4-6"
        selectedLabel="Claude Sonnet 4.6"
        groups={groupHomeAgentTextModelOptions()}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Anthropic \/ Sonnet 4\.6/i }));
    expect(screen.getByText("选择模型系列")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google \/ Gemini/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /OpenAI \/ GPT/i }));
    expect(screen.getAllByText("GPT").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^5\.4$/i }));
    expect(onSelect).toHaveBeenCalledWith("gpt-5.4");
  });

  it("closes the popup when clicking outside", () => {
    const onSelect = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <HomeTextModelPicker
          activeTheme
          selectedKey="claude-sonnet-4-6"
          selectedLabel="Claude Sonnet 4.6"
          groups={groupHomeAgentTextModelOptions()}
          onSelect={onSelect}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Anthropic \/ Sonnet 4\.6/i }));
    expect(screen.getByText("选择模型系列")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /outside/i }));
    expect(screen.queryByText("选择模型系列")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
