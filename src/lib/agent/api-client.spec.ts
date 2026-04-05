import { afterEach, describe, expect, it, vi } from "vitest";
import { callModelAPI } from "./api-client";

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
});
