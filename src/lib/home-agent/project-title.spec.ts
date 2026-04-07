import { describe, expect, it } from "vitest";
import { extractAssistantProjectTitle } from "./project-title";

describe("extractAssistantProjectTitle", () => {
  it("extracts a tentative title on the next line", () => {
    const result = extractAssistantProjectTitle(`
- 暂定项目名称：
  《食光深处的告白》
`);

    expect(result).toBe("食光深处的告白");
  });

  it("extracts a renamed title from an inline sentence", () => {
    const result = extractAssistantProjectTitle(
      "这一版我建议把项目名更新为《雾港来信》，更贴近悬疑和情绪拉扯。",
    );

    expect(result).toBe("雾港来信");
  });

  it("returns null when no explicit naming cue exists", () => {
    const result = extractAssistantProjectTitle("当前阶段先继续完善角色关系和冲突，不急着定标题。");
    expect(result).toBeNull();
  });
});
