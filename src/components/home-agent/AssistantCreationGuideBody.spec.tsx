import { fireEvent, render, screen } from "@testing-library/react";

import { AssistantCreationGuideBody } from "./AssistantCreationGuideBody";

describe("AssistantCreationGuideBody", () => {
  it("renders chinese-numbered major headings as collapsible sections", () => {
    render(
      <AssistantCreationGuideBody
        content={[
          "一. 项目基本信息",
          "- 项目类型：原创电视剧",
          "- 题材类型：都市言情",
          "",
          "二、项目定位",
          "1. 核心定位",
          "一句话定位内容。",
        ].join("\n")}
      />,
    );

    const firstToggle = screen.getByRole("button", { name: /一\. 项目基本信息/ });
    expect(screen.getByText("项目类型：原创电视剧")).toBeInTheDocument();

    fireEvent.click(firstToggle);
    expect(screen.queryByText("项目类型：原创电视剧")).not.toBeInTheDocument();

    fireEvent.click(firstToggle);
    expect(screen.getByText("项目类型：原创电视剧")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /二、项目定位/ })).toBeInTheDocument();
  });

  it("falls back to plain markdown rendering when no major sections exist", () => {
    render(<AssistantCreationGuideBody content={"普通说明文字\n\n- 第一条\n- 第二条"} />);

    expect(screen.queryByRole("button", { name: /项目基本信息/ })).not.toBeInTheDocument();
    expect(screen.getByText("普通说明文字")).toBeInTheDocument();
    expect(screen.getByText("第一条")).toBeInTheDocument();
  });

  it("does not render hidden think blocks", () => {
    render(
      <AssistantCreationGuideBody
        content={[
          "<think>",
          "Initiating Plan Generation",
          "Internal chain",
          "</think>",
          "",
          "最终给用户的中文结论。",
        ].join("\n")}
      />,
    );

    expect(screen.queryByText("Initiating Plan Generation")).not.toBeInTheDocument();
    expect(screen.getByText("最终给用户的中文结论。")).toBeInTheDocument();
  });
});
