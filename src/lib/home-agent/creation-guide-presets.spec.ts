import { describe, expect, it } from "vitest";
import { isCreationGuideAssistantMessage, splitCreationGuideContent } from "./creation-guide-presets";

describe("isCreationGuideAssistantMessage", () => {
  it("accepts classic three paths + section cue", () => {
    const s =
      "前言说明文字足够长说明文字足够长说明文字足够长说明文字足够长\n\n### x\n\n请从 **从题材出发**、**从媒介出发**、**从核心冲突出发** 里选。\n\n选项 | 描述\n--- | ---";
    expect(isCreationGuideAssistantMessage(s)).toBe(true);
  });

  it("accepts bracket labels + markdown table", () => {
    const s =
      "说明文字足够长说明文字足够长说明文字足够长说明文字足够长说明文字足够长说明文字足够长\n\n" +
      "| 选项 | 描述 |\n|---|---|\n| **【创作起点·题材】** | a |\n| **【创作起点·媒介】** | b |\n| **【创作起点·冲突】** | c |\n";
    expect(isCreationGuideAssistantMessage(s)).toBe(true);
  });

  it("rejects short text", () => {
    expect(isCreationGuideAssistantMessage("从题材出发 从媒介出发 从核心冲突出发")).toBe(false);
  });
});

describe("splitCreationGuideContent", () => {
  it("splits classic bold tokens", () => {
    const parts = splitCreationGuideContent("前文 **从题材出发** 后文 **从媒介出发** 尾");
    const chips = parts.filter((p) => p.type === "chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ type: "chip", dimension: "theme", label: "从题材出发" });
  });

  it("splits bracket-style bold tokens", () => {
    const parts = splitCreationGuideContent("x **【创作起点·题材】** y **【创作起点·媒介】** z");
    const chips = parts.filter((p) => p.type === "chip");
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ type: "chip", dimension: "theme", label: "【创作起点·题材】" });
  });
});
