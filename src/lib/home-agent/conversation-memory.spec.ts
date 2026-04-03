import { describe, expect, it } from "vitest";
import {
  buildConversationMemoryCorpus,
  buildConversationMemoryPrompt,
  searchConversationMemory,
} from "./conversation-memory";
import type { StudioRuntimeState } from "./types";

function createRuntime(): StudioRuntimeState {
  return {
    sessionId: "session-1",
    currentProjectSnapshot: {
      projectId: "project-current",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "继续完善创意方案。",
      derivedStage: "创意方案",
      agentSummary: "已整理创意方案和人物卖点。",
      recommendedActions: ["强化角色冲突", "生成分集目录"],
      artifacts: [
        {
          id: "artifact-current-1",
          kind: "plan",
          label: "创意方案",
          summary: "女主与继承人的契约婚姻进入反转阶段。",
          content: "女主与继承人的契约婚姻进入反转阶段。",
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      ],
    },
    currentDramaProject: null,
    currentVideoProject: null,
    currentSetupDraft: null,
    skillDrafts: [
      {
        id: "skill-1",
        sourceConversationIds: ["session-1"],
        proposedSkillName: "女频钩子强化",
        proposedContent: "总结强钩子短剧开篇写法。",
        reason: "多次女频项目都需要强化开篇钩子。",
        status: "pending",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    ],
    maintenanceReports: [],
    recentProjects: [
      {
        projectId: "project-old-video",
        projectKind: "video",
        title: "夜雨追击预告片",
        currentObjective: "继续审阅镜头并准备出片。",
        derivedStage: "审阅与修复",
        agentSummary: "当前有镜头指令包和待审阅项。",
        recommendedActions: ["整理待审阅项", "准备出片"],
        artifacts: [
          {
            id: "artifact-video-1",
            kind: "shot-packet",
            label: "镜头指令包",
            summary: "雨夜追击镜头包已经整理。",
            content: "雨夜追击镜头包已经整理。",
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
        ],
      },
      {
        projectId: "project-old-script",
        projectKind: "script",
        title: "都市悬疑女频项目",
        currentObjective: "强化角色反转和人物关系。",
        derivedStage: "角色设定",
        agentSummary: "已有女频都市悬疑方向和角色拉扯。",
        recommendedActions: ["锁定角色状态卡", "继续写第 1 集"],
        artifacts: [
          {
            id: "artifact-script-1",
            kind: "characters",
            label: "角色状态卡",
            summary: "角色冲突集中在信任与背叛。",
            content: "角色冲突集中在信任与背叛。",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ],
      },
    ],
    recentMessageSummary: "",
  };
}

describe("conversation-memory", () => {
  it("builds a local memory corpus from projects and meta records", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());

    expect(corpus.some((document) => document.kind === "project-summary")).toBe(true);
    expect(corpus.some((document) => document.kind === "artifact")).toBe(true);
    expect(corpus.some((document) => document.kind === "skill-draft")).toBe(true);
  });

  it("retrieves the most relevant historical memory for the current query", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const results = searchConversationMemory("我想继续做女频都市悬疑的人物关系和反转", corpus, "project-current");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((document) => document.title.includes("都市悬疑女频项目"))).toBe(true);
  });

  it("formats retrieved memories into an agent-readable overlay prompt", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const results = searchConversationMemory("继续审阅镜头并准备出片", corpus, "project-current");
    const prompt = buildConversationMemoryPrompt(results);

    expect(prompt).toContain("以下是与当前输入相关的历史记忆");
    expect(prompt).toContain("摘要：");
  });
});
