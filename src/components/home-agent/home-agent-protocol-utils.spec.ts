import { stripHiddenThoughtBlocks, textOf } from "./home-agent-protocol-utils";

describe("home-agent protocol text sanitization", () => {
  it("removes think blocks from assistant text", () => {
    expect(
      stripHiddenThoughtBlocks([
        "<think>",
        "Initiating Plan Generation",
        "Internal reasoning",
        "</think>",
        "",
        "创作方案：豪门婚恋（40集）",
      ].join("\n")),
    ).toBe("创作方案：豪门婚恋（40集）");
  });

  it("sanitizes visible text when extracting text blocks", () => {
    const content = [
      {
        type: "text",
        text: "<think>\nHidden chain\n</think>\n\n可见结论",
      },
      {
        type: "thinking",
        thinking: "Should already be ignored",
      },
    ];

    expect(textOf(content)).toBe("可见结论");
  });
});
