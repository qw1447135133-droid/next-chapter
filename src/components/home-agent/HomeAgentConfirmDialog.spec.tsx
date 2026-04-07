import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomeAgentConfirmDialog from "./HomeAgentConfirmDialog";

describe("HomeAgentConfirmDialog", () => {
  it("renders the in-app destructive confirm content and fires confirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <HomeAgentConfirmDialog
        open
        title="删除「夜雨追击」？"
        meta="视频工作流 · 镜头审阅"
        description="这会同时移除本地会话记录、项目数据和恢复快照。"
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("危险操作")).toBeInTheDocument();
    expect(screen.getByText("删除「夜雨追击」？")).toBeInTheDocument();
    expect(screen.getByText("视频工作流 · 镜头审阅")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("emits close when cancel is pressed", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <HomeAgentConfirmDialog
        open
        title="删除「契约婚姻反转录」？"
        description="删除后无法恢复。"
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
