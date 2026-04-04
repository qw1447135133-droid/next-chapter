import { describe, expect, it } from "vitest";
import {
  AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT,
  AUTO_COMPACT_TRIGGER_MESSAGE_COUNT,
  buildFallbackCompactedChunkSummary,
  buildCompactedHistoryPrompt,
  planConversationCompaction,
} from "./conversation-compact";
import type { HomeAgentMessage } from "./types";

function createMessages(count: number): HomeAgentMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `msg-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index}-content`,
    createdAt: `2026-04-03T00:00:${String(index).padStart(2, "0")}.000Z`,
  }));
}

describe("planConversationCompaction", () => {
  it("does not compact short conversations", () => {
    const plan = planConversationCompaction(createMessages(8), 0, "");
    expect(plan.shouldCompact).toBe(false);
    expect(plan.nextCompactedMessageCount).toBe(0);
  });

  it("compacts older messages and keeps the newest window", () => {
    const total = AUTO_COMPACT_TRIGGER_MESSAGE_COUNT + 4;
    const messages = createMessages(total);
    const plan = planConversationCompaction(messages, 0, "");

    expect(plan.shouldCompact).toBe(true);
    expect(plan.compactedMessages.length).toBe(total - AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT);
    expect(plan.retainedMessages.length).toBe(AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT);
    expect(plan.nextCompactedMessageCount).toBe(total - AUTO_COMPACT_KEEP_RECENT_MESSAGE_COUNT);
    expect(plan.nextSummary).toContain("目标与约束");
    expect(plan.nextSummary).toContain("已确认内容");
  });
});

describe("buildFallbackCompactedChunkSummary", () => {
  it("formats compacted chunks into a semantic fallback summary", () => {
    const summary = buildFallbackCompactedChunkSummary([
      {
        id: "msg-1",
        role: "user",
        content: "我希望这个项目更偏都市悬疑，但不要太苦情。",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "已确认主方向是都市悬疑，情绪基调保留克制拉扯。",
        createdAt: "2026-04-03T00:00:01.000Z",
      },
    ]);

    expect(summary).toContain("目标与约束");
    expect(summary).toContain("已确认内容");
    expect(summary).toContain("都市悬疑");
  });
});

describe("buildCompactedHistoryPrompt", () => {
  it("returns undefined for empty summaries", () => {
    expect(buildCompactedHistoryPrompt("")).toBeUndefined();
  });

  it("wraps compacted summaries into an agent-readable system prompt appendix", () => {
    expect(buildCompactedHistoryPrompt("用户：旧需求\nAgent：旧结论")).toContain("已自动压缩的较早会话摘要");
  });
});
