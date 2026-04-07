import { QueryEngine } from "./query-engine";
import { queryLoop } from "./query-loop";

vi.mock("./query-loop", () => ({
  queryLoop: vi.fn(),
}));

const mockedQueryLoop = vi.mocked(queryLoop);

describe("QueryEngine tool progress surfacing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("turns intermediate tool_use assistants into lightweight progress events", async () => {
    mockedQueryLoop.mockImplementation(async function* () {
      yield { type: "stream_request_start" } as const;
      yield {
        type: "assistant" as const,
        uuid: "assistant-tool",
        message: {
          role: "assistant" as const,
          content: [
            {
              type: "tool_use" as const,
              id: "tool-1",
              name: "HomeStudioWorkflow",
              input: { action: "generate_outlines" },
            },
          ],
          stop_reason: "tool_use",
        },
      };
      yield {
        type: "assistant" as const,
        uuid: "assistant-final",
        message: {
          role: "assistant" as const,
          content: [{ type: "text" as const, text: "最终结果" }],
          stop_reason: "end_turn",
        },
      };
    });

    const engine = new QueryEngine({
      apiKey: "test-key",
      tools: [],
      model: "claude-sonnet-4-6",
    });

    const events = [];
    for await (const event of engine.submitMessage("继续")) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toContain("progress");
    expect(events.some((event) => event.type === "assistant" && event.uuid === "assistant-tool")).toBe(false);
    const progress = events.find((event) => event.type === "progress");
    expect(progress).toMatchObject({
      type: "progress",
      message: {
        content: "正在执行工作流",
      },
    });
    expect(events.some((event) => event.type === "assistant" && event.uuid === "assistant-final")).toBe(true);
  });
});
