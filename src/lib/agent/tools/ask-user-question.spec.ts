import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AskUserQuestionTool,
  rejectAskUserQuestion,
  resolveAskUserQuestion,
} from "./ask-user-question";

describe("AskUserQuestionTool", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches the homepage question event and resolves with the submitted answer", async () => {
    const tool = new AskUserQuestionTool();
    const eventHandler = vi.fn();
    window.addEventListener("agent:ask-user-question", eventHandler);

    const callPromise = tool.call(
      {
        questions: [
          {
            header: "平台",
            question: "选择目标平台",
            multiSelect: false,
            options: [{ label: "抖音" }],
          },
        ],
      },
      {} as never,
      vi.fn(),
      {} as never,
    );

    expect(eventHandler).toHaveBeenCalledTimes(1);
    const detail = eventHandler.mock.calls[0]?.[0]?.detail;
    expect(detail.allowCustomInput).toBe(true);
    expect(detail.submissionMode).toBe("immediate");

    expect(resolveAskUserQuestion(detail.id, "抖音")).toBe(true);
    expect(resolveAskUserQuestion(detail.id, "再次提交")).toBe(false);

    await expect(callPromise).resolves.toEqual({ data: "抖音" });
    window.removeEventListener("agent:ask-user-question", eventHandler);
  });

  it("rejects when the active UI consumer cancels the request", async () => {
    const tool = new AskUserQuestionTool();
    const eventHandler = vi.fn();
    window.addEventListener("agent:ask-user-question", eventHandler);

    const callPromise = tool.call(
      {
        questions: [
          {
            header: "风格",
            question: "选择镜头风格",
            multiSelect: false,
            options: [{ label: "纪录片感" }],
          },
        ],
      },
      {} as never,
      vi.fn(),
      {} as never,
    );

    const detail = eventHandler.mock.calls[0]?.[0]?.detail;
    expect(rejectAskUserQuestion(detail.id, "User cancelled")).toBe(true);
    expect(rejectAskUserQuestion(detail.id, "Again")).toBe(false);

    await expect(callPromise).rejects.toThrow("User cancelled");
    window.removeEventListener("agent:ask-user-question", eventHandler);
  });

  it("times out when no homepage response arrives", async () => {
    const tool = new AskUserQuestionTool();

    const callPromise = tool.call(
      {
        questions: [
          {
            header: "目标",
            question: "补充你的创作目标",
            multiSelect: false,
            options: [{ label: "原创短剧" }],
          },
        ],
      },
      {} as never,
      vi.fn(),
      {} as never,
    );
    const rejection = expect(callPromise).rejects.toThrow("Timeout waiting for user response");

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

    await rejection;
  });
});
