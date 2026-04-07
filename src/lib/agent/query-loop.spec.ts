import { queryLoop } from "./query-loop";
import { ToolUseContext } from "./tool";
import type { AssistantMessage } from "./types";
import { callModelAPIStream } from "./api-client";

vi.mock("./api-client", () => ({
  callModelAPIStream: vi.fn(),
  toAPIMessages: vi.fn((messages) => messages),
}));

const mockedCallModelAPIStream = vi.mocked(callModelAPIStream);

function createAssistantMessage(text: string): AssistantMessage {
  return {
    type: "assistant",
    uuid: "assistant-1",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    },
  };
}

describe("queryLoop streaming", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forwards text deltas before the final assistant message", async () => {
    mockedCallModelAPIStream.mockImplementation(async function* () {
      yield { type: "delta", text: "你好" };
      yield { type: "delta", text: "，世界" };
      yield { type: "message", message: createAssistantMessage("你好，世界") };
    });

    const ctx = new ToolUseContext({
      options: {
        model: "claude-sonnet-4-6",
        tools: [],
      },
      messages: [],
    });

    const events = [];
    for await (const event of queryLoop({
      messages: [],
      systemPrompt: ["system"],
      toolUseContext: ctx,
      apiKey: "test-key",
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "stream_request_start",
      "text_delta",
      "text_delta",
      "assistant",
    ]);
    expect(events[1]).toMatchObject({ type: "text_delta", delta: "你好" });
    expect(events[2]).toMatchObject({ type: "text_delta", delta: "，世界" });
  });
});
