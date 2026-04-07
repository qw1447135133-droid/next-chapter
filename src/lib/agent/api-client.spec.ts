import { afterEach, describe, expect, it, vi } from "vitest";
import { callModelAPI, callModelAPIStream } from "./api-client";

const baseOptions = {
  messages: [{ role: "user" as const, content: "hello" }],
  systemPrompt: ["system"],
  model: "claude-sonnet-4-6",
  tools: [],
  apiKey: "test-key",
  baseUrl: "https://api.anthropic.com",
};

describe("callModelAPI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.electronAPI;
  });

  it("uses the electron model bridge when available", async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "bridge-ok" }],
        usage: {
          input_tokens: 10,
          output_tokens: 12,
        },
      },
    });

    window.electronAPI = {
      invoke,
    } as unknown as Window["electronAPI"];

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await callModelAPI(baseOptions);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(
      "agent:callModelApi",
      expect.objectContaining({
        url: "https://api.anthropic.com/v1/messages",
        apiKey: "test-key",
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.message.content).toEqual([{ type: "text", text: "bridge-ok" }]);
  });

  it("falls back to fetch when the electron bridge is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "fetch-ok" }],
        usage: {
          input_tokens: 5,
          output_tokens: 6,
        },
      }),
    } as Response);

    const result = await callModelAPI(baseOptions);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(result.message.content).toEqual([{ type: "text", text: "fetch-ok" }]);
  });

  it("routes Gemini models through the native Gemini endpoint instead of the electron bridge", async () => {
    const invoke = vi.fn();
    window.electronAPI = {
      invoke,
    } as unknown as Window["electronAPI"];

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "gemini-ok" }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 7,
          candidatesTokenCount: 9,
        },
      }),
    } as Response);

    const result = await callModelAPI({
      ...baseOptions,
      model: "gemini-3-flash-preview",
      provider: "gemini",
      baseUrl: "https://api.tu-zi.com/v1beta",
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.tu-zi.com/v1beta/models/gemini-3-flash-preview:generateContent",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.message.content).toEqual([{ type: "text", text: "gemini-ok" }]);
  });

  it("routes GPT models through chat completions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "gpt-ok",
            },
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 7,
        },
      }),
    } as Response);

    const result = await callModelAPI({
      ...baseOptions,
      model: "gpt-5.4",
      provider: "gpt",
      baseUrl: "https://api.tu-zi.com/v1",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.tu-zi.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.message.content).toEqual([{ type: "text", text: "gpt-ok" }]);
  });

  it("routes Grok models through chat completions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "grok-ok",
            },
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 6,
        },
      }),
    } as Response);

    const result = await callModelAPI({
      ...baseOptions,
      model: "grok-4.1",
      provider: "grok",
      baseUrl: "https://api.tu-zi.com/v1",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.tu-zi.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.message.content).toEqual([{ type: "text", text: "grok-ok" }]);
  });

  it("keeps Claude models on the messages API bridge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "claude-ok" }],
        usage: {
          input_tokens: 5,
          output_tokens: 6,
        },
      }),
    } as Response);

    const result = await callModelAPI({
      ...baseOptions,
      model: "claude-sonnet-4-6",
      provider: "claude",
      baseUrl: "https://api.tu-zi.com/v1",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.tu-zi.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.message.content).toEqual([{ type: "text", text: "claude-ok" }]);
  });

  it("streams Gemini native text and tool calls", async () => {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                candidates: [{ content: { parts: [{ text: "你好" }] } }],
                usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 2 },
              })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          functionCall: {
                            name: "AskUserQuestion",
                            args: { prompt: "继续" },
                          },
                        },
                      ],
                    },
                  },
                ],
                usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 },
              })}\n\n`,
            ),
          );
          controller.close();
        },
      }),
    } as Response);

    const events = [];
    for await (const event of callModelAPIStream({
      ...baseOptions,
      model: "gemini-3-flash-preview",
      provider: "gemini",
      baseUrl: "https://api.tu-zi.com/v1beta",
      tools: [
        {
          name: "AskUserQuestion",
          searchHint: "Ask the user a structured follow-up",
          call: vi.fn(),
          inputSchema: () => ({ type: "object", properties: { prompt: { type: "string" } } }),
          isEnabled: () => true,
          isReadOnly: () => true,
          isConcurrencySafe: () => true,
          checkPermissions: async () => ({ behavior: "allow" as const }),
          userFacingName: () => "AskUserQuestion",
          mapToolResultToBlock: (content, toolUseId) => ({ type: "tool_result", tool_use_id: toolUseId, content: String(content ?? "") }),
        },
      ],
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "delta", text: "你好" });
    expect(events[1]).toMatchObject({
      type: "message",
      message: {
        message: {
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "你好" },
            { type: "tool_use", name: "AskUserQuestion", input: { prompt: "继续" } },
          ],
        },
      },
    });
  });

  it("streams GPT tool calls through chat completions", async () => {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [
                  {
                    delta: {
                      content: "hello",
                    },
                  },
                ],
              })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call-1",
                          function: { name: "AskUserQuestion", arguments: "{\"prompt\":\"继续\"}" },
                        },
                      ],
                    },
                  },
                ],
              })}\n\n`,
            ),
          );
          controller.close();
        },
      }),
    } as Response);

    const events = [];
    for await (const event of callModelAPIStream({
      ...baseOptions,
      model: "gpt-5.4",
      provider: "gpt",
      baseUrl: "https://api.tu-zi.com/v1",
      tools: [
        {
          name: "AskUserQuestion",
          searchHint: "Ask the user a structured follow-up",
          call: vi.fn(),
          inputSchema: () => ({ type: "object", properties: { prompt: { type: "string" } } }),
          isEnabled: () => true,
          isReadOnly: () => true,
          isConcurrencySafe: () => true,
          checkPermissions: async () => ({ behavior: "allow" as const }),
          userFacingName: () => "AskUserQuestion",
          mapToolResultToBlock: (content, toolUseId) => ({ type: "tool_result", tool_use_id: toolUseId, content: String(content ?? "") }),
        },
      ],
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "delta", text: "hello" });
    expect(events[1]).toMatchObject({
      type: "message",
      message: {
        message: {
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "hello" },
            { type: "tool_use", id: "call-1", name: "AskUserQuestion", input: { prompt: "继续" } },
          ],
        },
      },
    });
  });
});
