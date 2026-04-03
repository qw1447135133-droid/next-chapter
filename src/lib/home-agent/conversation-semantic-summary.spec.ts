import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/api-client", () => ({
  callModelAPI: vi.fn(async () => ({
    message: {
      content: [
        {
          type: "text",
          text: "目标与约束\n- 保留女频都市悬疑基调\n已确认内容\n- 已完成镜头包与待审阅项整理\n待继续推进\n- 继续推进审阅与出片",
        },
      ],
    },
  })),
}));

import {
  buildProjectAwareFallbackSummary,
  buildProjectAwareSummaryPrompt,
  refineCompactedConversationSummary,
} from "./conversation-semantic-summary";
import type { ConversationProjectSnapshot, HomeAgentMessage } from "./types";

function createMessages(): HomeAgentMessage[] {
  return [
    {
      id: "msg-1",
      role: "user",
      content: "这个项目保持都市悬疑，但情绪不要太苦。",
      createdAt: "2026-04-03T00:00:00.000Z",
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "已保留都市悬疑基调，情绪拉扯会收得更克制。",
      createdAt: "2026-04-03T00:00:01.000Z",
    },
  ];
}

function createScriptSnapshot(): ConversationProjectSnapshot {
  return {
    projectId: "script-1",
    projectKind: "script",
    title: "契约婚姻反转录",
    currentObjective: "锁定角色和第 1 集剧情 beat。",
    derivedStage: "单集细纲",
    agentSummary: "当前在推进角色状态卡和剧情 beat。",
    recommendedActions: ["锁定角色状态卡", "锁定剧情 beat", "继续写第 1 集"],
    artifacts: [
      {
        id: "artifact-1",
        kind: "characters",
        label: "角色状态卡",
        summary: "主角关系已经成型。",
        updatedAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    memory: {
      characterStateCards: [
        {
          id: "card-1",
          name: "沈昭",
          role: "女主",
          coreConflict: "在自保与信任之间摇摆。",
          desire: "查清旧案。",
          riskNote: "一旦失手会失去全部筹码。",
          relationshipAxis: ["顾承砚：先婚后爱"],
          stageFocus: "继续强化人物拉扯",
          status: "pending",
        },
      ],
      storyBeatPackets: [
        {
          id: "beat-1",
          episodeNumber: 1,
          title: "签下契约",
          beatSummary: "女主签下契约婚姻。",
          hook: "契约签订",
          payoff: "发现男主另有目的。",
          status: "drafted",
        },
      ],
      complianceRevisionPackets: [
        {
          id: "compliance-1",
          issueTitle: "胁迫感过重",
          riskLevel: "high",
          recommendation: "改成双方交换条件。",
          status: "pending",
        },
      ],
    },
  };
}

function createVideoSnapshot(): ConversationProjectSnapshot {
  return {
    projectId: "video-1",
    projectKind: "video",
    title: "夜雨追击预告片",
    currentObjective: "先审阅镜头并准备出片。",
    derivedStage: "审阅与修复",
    agentSummary: "当前有镜头包与待审阅项。",
    recommendedActions: ["整理待审阅项", "通过稳定镜头", "准备出片"],
    artifacts: [
      {
        id: "artifact-1",
        kind: "shot-packet",
        label: "镜头指令包",
        summary: "镜头节奏和画面意图已整理。",
        updatedAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    memory: {
      shotPackets: [
        {
          id: "packet-1",
          sceneId: "scene-1",
          sceneNumber: 1,
          title: "雨夜追击",
          durationSec: 5,
          camera: {
            shotSize: "中景",
            movement: "跟拍",
          },
          characterRefs: [],
          sourceAssetIds: [],
          promptSeed: "女主在雨夜奔跑，回头看见追兵。",
          forbiddenChanges: ["不要改变主角色的服装连续性"],
          renderMode: "img2video",
          reviewStatus: "pending",
        },
      ],
      reviewQueue: [
        {
          id: "review-1",
          title: "审阅镜头 1",
          summary: "检查雨夜镜头的颗粒感与动作连贯性。",
          targetIds: ["packet-1"],
          status: "pending",
          createdAt: "2026-04-03T00:00:00.000Z",
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      ],
      assetManifest: {
        updatedAt: "2026-04-03T00:00:00.000Z",
        items: [
          {
            id: "asset-1",
            kind: "image",
            label: "角色参考图",
            status: "ready",
            source: "generated",
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
        ],
      },
      styleLock: {
        genre: ["都市悬疑"],
        tone: "克制紧张",
        visualStyle: "电影感夜景",
        cameraLanguage: ["手持跟拍"],
        performanceDirection: "主角保持警觉克制",
        negativeRules: ["不要暖色调"],
        updatedAt: "2026-04-03T00:00:00.000Z",
      },
    },
  };
}

describe("conversation-semantic-summary", () => {
  it("adds project-aware script memory to fallback summaries", () => {
    const summary = buildProjectAwareFallbackSummary("目标与约束\n- 保持女频都市悬疑。", createScriptSnapshot());

    expect(summary).toContain("关键项目记忆");
    expect(summary).toContain("角色状态卡：1 张");
    expect(summary).toContain("剧情 beat：1 条");
    expect(summary).toContain("合规修订：1 条");
  });

  it("builds video-specific semantic summary prompts", () => {
    const prompt = buildProjectAwareSummaryPrompt(createVideoSnapshot());

    expect(prompt.systemPrompt.join("\n")).toContain("视频项目要优先保留镜头意图");
    expect(prompt.projectContext).toContain("镜头指令包：1 个");
    expect(prompt.projectContext).toContain("待审阅项：1 条");
    expect(prompt.projectContext).toContain("素材资产：1 项");
  });

  it("returns a project-aware refined summary when model output is available", async () => {
    const result = await refineCompactedConversationSummary({
      existingSummary: "旧摘要",
      compactedMessages: createMessages(),
      projectSnapshot: createVideoSnapshot(),
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      baseUrl: "https://example.test",
    });

    expect(result).toContain("已完成镜头包与待审阅项整理");
    expect(result).toContain("关键项目记忆");
    expect(result).toContain("镜头指令包：1 个");
  });
});
