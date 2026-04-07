import { describe, expect, it, vi } from "vitest";
import type { SDKMessage } from "@/lib/agent/types";
import { handleSendEngineEvent } from "./home-agent-send-flow";

function buildAssistantEvent(text: string): SDKMessage {
  return {
    type: "assistant",
    uuid: "sdk-assistant",
    sessionId: "session-1",
    message: {
      type: "assistant",
      uuid: "assistant-1",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    },
  };
}

describe("handleSendEngineEvent", () => {
  it("clears the streaming bubble when structured payloads consume the whole assistant message", async () => {
    const finalizeStreamingMessage = vi.fn();
    const setQuestionRequest = vi.fn();

    await handleSendEngineEvent({
      event: buildAssistantEvent("raw tool payload"),
      loadStructuredQuestionParser: async () => ({
        extractStructuredQuestion: () => ({
          cleanedText: "",
          request: {
            id: "request-1",
            allowCustomInput: true,
            submissionMode: "immediate" as const,
            questions: [
              {
                header: "角色",
                question: "如何开启人设？",
                multiSelect: false,
                options: [{ label: "极致反差", value: "contrast" }],
              },
            ],
          },
          workflowCall: null,
        }),
      }),
      textOf: (content) =>
        Array.isArray(content) ? String(content[0]?.text || "") : String(content || ""),
      push: vi.fn(),
      appendStreamingDelta: vi.fn(),
      updateStreamingLabel: vi.fn(),
      finalizeStreamingMessage,
      setQuestionRequest,
    });

    expect(finalizeStreamingMessage).toHaveBeenCalledWith("");
    expect(setQuestionRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy fallback behavior for empty plain assistant text without structured payloads", async () => {
    const finalizeStreamingMessage = vi.fn();

    await handleSendEngineEvent({
      event: buildAssistantEvent(""),
      loadStructuredQuestionParser: async () => ({
        extractStructuredQuestion: () => ({
          cleanedText: "",
          request: null,
          workflowCall: null,
        }),
      }),
      textOf: () => "",
      push: vi.fn(),
      appendStreamingDelta: vi.fn(),
      updateStreamingLabel: vi.fn(),
      finalizeStreamingMessage,
      setQuestionRequest: vi.fn(),
    });

    expect(finalizeStreamingMessage).toHaveBeenCalledWith(undefined);
  });
});
