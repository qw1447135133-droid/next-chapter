import { QueryEngine } from "@/lib/agent/query-engine";
import type { Message as QueryMessage } from "@/lib/agent/types";
import { AgentTool } from "@/lib/agent/tools/agent-tool";
import { ToolUseContext } from "@/lib/agent/tool";
import {
  AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT,
  buildCompactedHistoryPrompt,
  planConversationCompaction,
} from "@/lib/home-agent/conversation-compact";
import { buildAutoResearchPlan } from "@/lib/home-agent/auto-research";
import type { HomeAgentMessage, StudioRuntimeState } from "@/lib/home-agent/types";
import { resolveHomeAgentTextModelRuntime } from "@/lib/home-agent/text-models";

export type HomeAgentEngineDeps = {
  createDefaultTools: typeof import("@/lib/agent/tools").createDefaultTools;
};

export type HomeAgentApiConfigModule = typeof import("@/lib/api-config");

export async function getOrCreateHomeAgentEngine(params: {
  existingEngine: QueryEngine | null;
  loadEngineDeps: () => Promise<HomeAgentEngineDeps>;
  loadApiConfigModule: () => Promise<HomeAgentApiConfigModule>;
  messages: HomeAgentMessage[];
  compactedMessageCount: number;
  recentMessageSummary: string;
  systemPrompt: string;
  toQuery: (messages: HomeAgentMessage[]) => QueryMessage[];
  getAppState: () => StudioRuntimeState;
  setRuntime: (updater: (prev: StudioRuntimeState) => StudioRuntimeState) => void;
  setCompactedMessageCount: (count: number) => void;
  selectedTextModelKey: string;
}): Promise<QueryEngine> {
  const {
    existingEngine,
    loadEngineDeps,
    loadApiConfigModule,
    messages,
    compactedMessageCount,
    recentMessageSummary,
    systemPrompt,
    toQuery,
    getAppState,
    setRuntime,
    setCompactedMessageCount,
    selectedTextModelKey,
  } = params;

  const deps = await loadEngineDeps();
  const apiConfig = await loadApiConfigModule();
  const tools = deps
    .createDefaultTools()
    .filter((tool) =>
      ["AskUserQuestion", "HomeStudioWorkflow", "Agent", "TaskOutput", "TaskStop"].includes(tool.name),
    );
  const resolvedRuntime = resolveHomeAgentTextModelRuntime(apiConfig, selectedTextModelKey);

  if (!resolvedRuntime.apiKey) {
    throw new Error(`当前未配置 ${resolvedRuntime.option.supplierLabel} / ${resolvedRuntime.option.familyLabel} 的文本模型密钥，请先在设置中完成配置。`);
  }

  if (existingEngine) {
    existingEngine.setModel(resolvedRuntime.model);
    return existingEngine;
  }

  const preflightPlan = planConversationCompaction(messages, compactedMessageCount, recentMessageSummary);

  let engineSummary = recentMessageSummary;
  let engineCompactedCount = compactedMessageCount;
  let engineInitialMessages = messages.slice(
    Math.min(compactedMessageCount, Math.max(0, messages.length - AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT)),
  );

  if (preflightPlan.shouldCompact) {
    engineSummary = preflightPlan.nextSummary;
    engineCompactedCount = preflightPlan.nextCompactedMessageCount;
    engineInitialMessages = preflightPlan.retainedMessages;
    setCompactedMessageCount(engineCompactedCount);
    setRuntime((prev) => ({
      ...prev,
      recentMessageSummary: engineSummary,
    }));
  }

  const engineCompactedHistoryPrompt =
    engineCompactedCount > 0 ? buildCompactedHistoryPrompt(engineSummary) : undefined;

  return new QueryEngine({
    apiKey: resolvedRuntime.apiKey,
    baseUrl: resolvedRuntime.baseUrl,
    model: resolvedRuntime.model,
    tools,
    systemPrompt,
    appendSystemPrompt: engineCompactedHistoryPrompt,
    initialMessages: toQuery(engineInitialMessages),
    maxTurns: 12,
    getAppState,
    setAppState: (updater) => setRuntime((prev) => updater(prev) as StudioRuntimeState),
  });
}

export async function launchHomeAgentAutoResearchTasks(params: {
  prompt: string;
  runtime: Pick<StudioRuntimeState, "sessionId" | "currentProjectSnapshot">;
  loadApiConfigModule: () => Promise<HomeAgentApiConfigModule>;
  selectedTextModelKey: string;
}): Promise<{ plan: ReturnType<typeof buildAutoResearchPlan>; taskIds: string[] } | null> {
  const { prompt, runtime, loadApiConfigModule, selectedTextModelKey } = params;
  const plan = buildAutoResearchPlan(prompt, runtime.currentProjectSnapshot);
  if (!plan) return null;

  const apiConfig = await loadApiConfigModule();
  const resolvedRuntime = resolveHomeAgentTextModelRuntime(apiConfig, selectedTextModelKey);
  if (!resolvedRuntime.apiKey) return null;

  const tool = new AgentTool();
  const context = new ToolUseContext({
    options: {
      model: resolvedRuntime.model,
      tools: [],
      apiKey: resolvedRuntime.apiKey,
      baseUrl: resolvedRuntime.baseUrl,
    },
  });

  const parentMessage = {
    type: "assistant",
    uuid: crypto.randomUUID(),
    message: {
      role: "assistant" as const,
      content: "auto-research-launch",
    },
  };

  const taskIds: string[] = [];
  const results = await Promise.all(
    plan.tasks.map((task) =>
      tool.call(
        {
          prompt: task.prompt,
          description: `并行研究 ${task.title}`,
          session_id: runtime.sessionId,
          project_id: runtime.currentProjectSnapshot?.projectId,
          subagent_type: "research",
          run_in_background: true,
        },
        context,
        async () => ({ behavior: "allow" }),
        parentMessage,
      ),
    ),
  );

  for (const result of results) {
    const taskId = String(result.data).match(/Task ID:\s*([a-f0-9-]+)/i)?.[1];
    if (taskId) taskIds.push(taskId);
  }

  if (!taskIds.length) return null;
  return { plan, taskIds };
}
