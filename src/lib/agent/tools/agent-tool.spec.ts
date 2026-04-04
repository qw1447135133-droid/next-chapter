import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentTool, getBackgroundTaskResult } from "./agent-tool";
import { ToolUseContext } from "../tool";
import { clearTaskRegistry, getTask } from "./task-tools";

vi.mock("../query-engine", () => ({
  QueryEngine: class MockQueryEngine {
    interrupt() {}

    async *submitMessage(prompt: string) {
      yield {
        type: "result",
        subtype: "success",
        result: `subagent:${prompt}`,
      };
    }
  },
}));

const parentMessage = {
  type: "assistant",
  uuid: "assistant-parent",
  message: {
    role: "assistant",
    content: "parent",
  },
} as const;

describe("AgentTool", () => {
  beforeEach(() => {
    clearTaskRegistry();
  });

  it("writes and completes a background sub-agent task", async () => {
    const tool = new AgentTool();
    const context = new ToolUseContext({
      options: {
        model: "claude-sonnet-4-6",
        tools: [],
        apiKey: "test-key",
        baseUrl: "https://example.test",
      },
    });

    const result = await tool.call(
      {
        prompt: "拆解这个项目的研究方向",
        description: "并行研究",
        run_in_background: true,
      },
      context,
      vi.fn(),
      parentMessage,
    );

    const taskId = String(result.data).match(/Task ID:\s*([a-f0-9-]+)/i)?.[1];
    expect(taskId).toBeTruthy();
    expect(getTask(taskId!)?.status).toBe("running");

    await expect(getBackgroundTaskResult(taskId!)).resolves.toBe("subagent:拆解这个项目的研究方向");
    expect(getTask(taskId!)?.status).toBe("completed");
    expect(getTask(taskId!)?.output).toBe("subagent:拆解这个项目的研究方向");
  });

  it("stores homepage session metadata on background tasks", async () => {
    const tool = new AgentTool();
    const context = new ToolUseContext({
      options: {
        model: "claude-sonnet-4-6",
        tools: [],
        apiKey: "test-key",
        baseUrl: "https://example.test",
      },
      getAppState: () => ({
        sessionId: "session-home-fallback",
        currentProjectSnapshot: { projectId: "project-fallback" },
      }),
    });

    const result = await tool.call(
      {
        prompt: "分析当前项目的下一步",
        description: "并行研究",
        run_in_background: true,
      },
      context,
      vi.fn(),
      parentMessage,
    );

    const taskId = String(result.data).match(/Task ID:\s*([a-f0-9-]+)/i)?.[1];
    expect(getTask(taskId!)?.sessionId).toBe("session-home-fallback");
    expect(getTask(taskId!)?.projectId).toBe("project-fallback");
  });

  it("requires an api key in tool context", async () => {
    const tool = new AgentTool();
    const context = new ToolUseContext({
      options: {
        model: "claude-sonnet-4-6",
        tools: [],
      },
    });

    await expect(
      tool.call(
        {
          prompt: "整理任务",
          description: "测试",
        },
        context,
        vi.fn(),
        parentMessage,
      ),
    ).rejects.toThrow(/API key/i);
  });
});
