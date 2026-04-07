import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrCreateHomeAgentEngine } from "./home-agent-engine-runtime";

const createDefaultTools = () => [];

const runtimeState = {
  sessionId: "session-1",
  currentProjectSnapshot: null,
};

function createApiConfigModule(config: {
  geminiEndpoint?: string;
  geminiKey?: string;
  gptEndpoint?: string;
  gptKey?: string;
  claudeEndpoint?: string;
  claudeKey?: string;
  grokEndpoint?: string;
  grokKey?: string;
  modelMappings?: Record<string, string>;
}) {
  return {
    getApiConfig: () => ({
      apiMode: "builtin" as const,
      geminiEndpoint: "",
      geminiKey: "",
      gptEndpoint: "",
      gptKey: "",
      claudeEndpoint: "",
      claudeKey: "",
      grokEndpoint: "",
      grokKey: "",
      seedreamEndpoint: "",
      seedreamKey: "",
      jimengEndpoint: "",
      jimengKey: "",
      jimengExecutionMode: "api" as const,
      tuziEndpoint: "",
      tuziKey: "",
      modelMappings: {},
      firstFrameMaxDim: 2048,
      firstFrameMaxKB: 1024,
      retryCount: 1,
      retryDelayMs: 800,
      ...config,
    }),
    resolveConfiguredModelName: (model: string) => config.modelMappings?.[model] || model,
  };
}

async function collectResult(engine: Awaited<ReturnType<typeof getOrCreateHomeAgentEngine>>) {
  const events = [];
  for await (const event of engine.submitMessage("测试一下")) {
    events.push(event);
  }
  return events;
}

describe("home-agent engine runtime provider routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.electronAPI;
  });

  it("routes Claude through /v1/messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "claude-ok" }],
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    } as Response);

    const engine = await getOrCreateHomeAgentEngine({
      existingEngine: null,
      loadEngineDeps: async () => ({ createDefaultTools }),
      loadApiConfigModule: async () =>
        createApiConfigModule({
          claudeEndpoint: "https://claude.example.com/v1",
          claudeKey: "claude-key",
        }) as never,
      messages: [],
      compactedMessageCount: 0,
      recentMessageSummary: "",
      systemPrompt: "system",
      toQuery: (messages) => messages as never,
      getAppState: () => runtimeState as never,
      setRuntime: () => runtimeState as never,
      setCompactedMessageCount: () => {},
      selectedTextModelKey: "claude-sonnet-4-6",
    });

    await collectResult(engine);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://claude.example.com/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes Gemini through native generateContent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
      }),
    } as Response);

    const engine = await getOrCreateHomeAgentEngine({
      existingEngine: null,
      loadEngineDeps: async () => ({ createDefaultTools }),
      loadApiConfigModule: async () =>
        createApiConfigModule({
          geminiEndpoint: "https://gemini.example.com/v1beta",
          geminiKey: "gemini-key",
        }) as never,
      messages: [],
      compactedMessageCount: 0,
      recentMessageSummary: "",
      systemPrompt: "system",
      toQuery: (messages) => messages as never,
      getAppState: () => runtimeState as never,
      setRuntime: () => runtimeState as never,
      setCompactedMessageCount: () => {},
      selectedTextModelKey: "gemini-3-flash-preview",
    });

    await collectResult(engine);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://gemini.example.com/v1beta/models/gemini-3-flash-preview:streamGenerateContent?alt=sse",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes GPT through /v1/chat/completions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "gpt-ok" } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    } as Response);

    const engine = await getOrCreateHomeAgentEngine({
      existingEngine: null,
      loadEngineDeps: async () => ({ createDefaultTools }),
      loadApiConfigModule: async () =>
        createApiConfigModule({
          gptEndpoint: "https://gpt.example.com/v1",
          gptKey: "gpt-key",
        }) as never,
      messages: [],
      compactedMessageCount: 0,
      recentMessageSummary: "",
      systemPrompt: "system",
      toQuery: (messages) => messages as never,
      getAppState: () => runtimeState as never,
      setRuntime: () => runtimeState as never,
      setCompactedMessageCount: () => {},
      selectedTextModelKey: "gpt-5.4",
    });

    await collectResult(engine);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://gpt.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes Grok through /v1/chat/completions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "grok-ok" } }],
        usage: { prompt_tokens: 3, completion_tokens: 4 },
      }),
    } as Response);

    const engine = await getOrCreateHomeAgentEngine({
      existingEngine: null,
      loadEngineDeps: async () => ({ createDefaultTools }),
      loadApiConfigModule: async () =>
        createApiConfigModule({
          grokEndpoint: "https://grok.example.com/v1",
          grokKey: "grok-key",
        }) as never,
      messages: [],
      compactedMessageCount: 0,
      recentMessageSummary: "",
      systemPrompt: "system",
      toQuery: (messages) => messages as never,
      getAppState: () => runtimeState as never,
      setRuntime: () => runtimeState as never,
      setCompactedMessageCount: () => {},
      selectedTextModelKey: "grok-4.1",
    });

    await collectResult(engine);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://grok.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
