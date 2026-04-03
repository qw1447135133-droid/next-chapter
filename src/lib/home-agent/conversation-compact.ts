import type { HomeAgentMessage } from "./types";

export const AUTO_COMPACT_TRIGGER_MESSAGE_COUNT = 18;
export const AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT = 8;
const AUTO_COMPACT_MAX_SUMMARY_CHARS = 1200;

function compactLine(value: string, max = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function uniqueLines(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function collectRecentHighlights(
  messages: HomeAgentMessage[],
  role: HomeAgentMessage["role"],
  limit: number,
): string[] {
  return uniqueLines(
    messages
      .filter((message) => message.role === role)
      .slice(-limit * 2)
      .reverse()
      .map((message) => compactLine(message.content, 96)),
  )
    .slice(0, limit)
    .reverse();
}

function buildSection(title: string, items: string[]): string {
  if (!items.length) return "";
  return `${title}\n- ${items.join("\n- ")}`;
}

export function buildFallbackCompactedChunkSummary(messages: HomeAgentMessage[]): string {
  const userGoals = collectRecentHighlights(messages, "user", 3);
  const agentTakeaways = collectRecentHighlights(messages, "assistant", 3);
  const recentContext = uniqueLines(
    messages
      .slice(-4)
      .map((message) => `${message.role === "user" ? "用户" : "Agent"}：${compactLine(message.content, 88)}`),
  ).slice(-2);

  return [
    buildSection("目标与约束", userGoals),
    buildSection("已确认内容", agentTakeaways),
    buildSection("最近上下文", recentContext),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mergeCompactedSummary(existingSummary: string, nextChunk: string): string {
  const merged = [existingSummary.trim(), nextChunk.trim()].filter(Boolean).join("\n");
  if (merged.length <= AUTO_COMPACT_MAX_SUMMARY_CHARS) return merged;
  return `…${merged.slice(-(AUTO_COMPACT_MAX_SUMMARY_CHARS - 1))}`;
}

export function buildFallbackCompactedConversationSummary(
  existingSummary: string,
  messages: HomeAgentMessage[],
): string {
  return mergeCompactedSummary(existingSummary, buildFallbackCompactedChunkSummary(messages));
}

export interface ConversationCompactionPlan {
  shouldCompact: boolean;
  nextCompactedMessageCount: number;
  nextSummary: string;
  compactedMessages: HomeAgentMessage[];
  retainedMessages: HomeAgentMessage[];
}

export function planConversationCompaction(
  messages: HomeAgentMessage[],
  compactedMessageCount: number,
  existingSummary: string,
): ConversationCompactionPlan {
  const candidateMessages = messages.slice(compactedMessageCount);
  if (candidateMessages.length <= AUTO_COMPACT_TRIGGER_MESSAGE_COUNT) {
    return {
      shouldCompact: false,
      nextCompactedMessageCount: compactedMessageCount,
      nextSummary: existingSummary,
      compactedMessages: [],
      retainedMessages: candidateMessages,
    };
  }

  const compactCount = Math.max(0, candidateMessages.length - AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT);
  const compactedMessages = candidateMessages.slice(0, compactCount);
  const retainedMessages = candidateMessages.slice(compactCount);
  const nextSummary = buildFallbackCompactedConversationSummary(existingSummary, compactedMessages);

  return {
    shouldCompact: compactedMessages.length > 0,
    nextCompactedMessageCount: compactedMessageCount + compactedMessages.length,
    nextSummary,
    compactedMessages,
    retainedMessages,
  };
}

export function buildCompactedHistoryPrompt(summary: string): string | undefined {
  const normalized = summary.trim();
  if (!normalized) return undefined;
  return [
    "以下是已自动压缩的较早会话摘要，请把它视为仍然有效的工作上下文，不要要求用户重复提供：",
    normalized,
  ].join("\n\n");
}
