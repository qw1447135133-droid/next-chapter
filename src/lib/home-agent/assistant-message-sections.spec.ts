import { splitAssistantMessageSections } from "./assistant-message-sections";

describe("splitAssistantMessageSections", () => {
  it("splits chinese-numbered major sections and preserves lead text", () => {
    const result = splitAssistantMessageSections([
      "这是开场说明。",
      "",
      "一. 项目基本信息",
      "- 项目类型：原创电视剧",
      "- 题材类型：都市言情",
      "",
      "二、项目定位",
      "1. 核心定位",
      "一句话定位内容。",
    ].join("\n"));

    expect(result.lead).toContain("这是开场说明");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({
      heading: "一. 项目基本信息",
    });
    expect(result.sections[0]?.body).toContain("项目类型");
    expect(result.sections[1]).toMatchObject({
      heading: "二、项目定位",
    });
    expect(result.sections[1]?.body).toContain("1. 核心定位");
  });

  it("splits markdown h1/h2 sections", () => {
    const result = splitAssistantMessageSections([
      "# 项目概览",
      "这里是概览。",
      "",
      "## 下一步建议",
      "- 先确认角色关系",
    ].join("\n"));

    expect(result.lead).toBe("");
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.heading).toBe("项目概览");
    expect(result.sections[1]?.heading).toBe("下一步建议");
  });

  it("does not split headings inside fenced code blocks", () => {
    const result = splitAssistantMessageSections([
      "```md",
      "一. 项目基本信息",
      "- 只是示例",
      "```",
    ].join("\n"));

    expect(result.sections).toHaveLength(0);
    expect(result.lead).toContain("一. 项目基本信息");
  });
});
