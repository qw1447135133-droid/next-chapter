import { describe, expect, it } from "vitest";
import {
  buildConversationMemoryHint,
  buildConversationMemoryCorpus,
  buildConversationMemoryPrompt,
  isProjectInternalMemoryQuery,
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
    maintenanceReports: [
      {
        id: "maintenance-1",
        compressedConversationCount: 2,
        archivedProjectCount: 1,
        clearedCacheKeys: ["shot-cache-1"],
        mergedDraftCount: 1,
        summary: "已整理旧项目摘要并清理重复素材。",
        notes: ["归并了旧项目里的重复镜头包。", "保留了关键角色状态卡。"],
        createdAt: "2026-04-03T00:30:00.000Z",
      },
    ],
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
    recentProjectSessions: [
      {
        mode: "active",
        messages: [
          {
            id: "old-session-user-1",
            role: "user",
            content: "男主要先装冷淡，再在第一个反转点护住女主。",
            createdAt: "2026-04-02T00:05:00.000Z",
          },
          {
            id: "old-session-assistant-1",
            role: "assistant",
            content: "已确认：男主表面克制，关键节点反向护妻，作为前 3 集的稳定人物策略。",
            createdAt: "2026-04-02T00:06:00.000Z",
          },
        ],
        currentProjectSnapshot: {
          projectId: "project-old-script",
          projectKind: "script",
          title: "都市悬疑女频项目",
          currentObjective: "强化角色反转和人物关系。",
          derivedStage: "角色设定",
          agentSummary: "已有女频都市悬疑方向和角色拉扯。",
          recommendedActions: ["锁定角色状态卡", "继续写第 1 集"],
          artifacts: [],
        },
        recentMessageSummary: "已确认：男主表面克制，关键节点反向护妻，作为前 3 集的稳定人物策略。",
        projectId: "project-old-script",
        draft: "",
        qState: null,
        selectedValues: [],
      },
    ],
    recentMessageSummary: "",
  };
}

describe("conversation-memory", () => {
  it("builds a local memory corpus from projects and meta records", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());

    expect(corpus.some((document) => document.kind === "project-summary")).toBe(true);
    expect(corpus.some((document) => document.kind === "conversation-summary")).toBe(true);
    expect(corpus.some((document) => document.kind === "artifact")).toBe(true);
    expect(corpus.some((document) => document.kind === "skill-draft")).toBe(true);
  });

  it("retrieves the most relevant historical memory for the current query", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const results = searchConversationMemory("我想继续做女频都市悬疑的人物关系和反转", corpus, "project-current");

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((document) => document.title.includes("都市悬疑女频项目"))).toBe(true);
  });

  it("prioritizes artifact-like memory when the query directly targets a concrete asset", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const [topResult] = searchConversationMemory("继续完善角色状态卡，聚焦信任与背叛", corpus, "project-current");

    expect(topResult?.kind).toBe("artifact");
    expect(topResult?.title).toContain("角色状态卡");
  });

  it("can retrieve a saved session conclusion when the query matches past conversation decisions", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const [topResult] = searchConversationMemory("男主先装冷淡后反向护妻", corpus, "project-current");

    expect(topResult?.kind).toBe("conversation-summary");
    expect(topResult?.summary).toContain("反向护妻");
  });

  it("keeps the top results semantically varied instead of over-favoring one source bucket", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const results = searchConversationMemory("女频 强化 开篇 钩子 清理旧项目", corpus, "project-current");
    const kinds = new Set(results.map((document) => document.kind));

    expect(results.length).toBeGreaterThan(1);
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("formats retrieved memories into an agent-readable overlay prompt", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const results = searchConversationMemory("继续审阅镜头并准备出片", corpus, "project-current");
    const prompt = buildConversationMemoryPrompt(results);

    expect(prompt).toContain("以下是与当前输入相关的历史记忆");
    expect(prompt).toContain("摘要：");
  });

  it("builds a source-aware hint for retrieved memories", () => {
    const corpus = buildConversationMemoryCorpus(createRuntime());
    const skillDraft = corpus.find((document) => document.kind === "skill-draft")!;
    const projectSummary = corpus.find((document) => document.kind === "project-summary")!;

    expect(buildConversationMemoryHint([skillDraft])).toBe("已参考 1 条技能草案");
    expect(buildConversationMemoryHint([skillDraft, projectSummary])).toBe("已参考 2 条历史经验");
  });

  it("prioritizes current-project runtime memory for internal retrieval queries", () => {
    const runtime = createRuntime();
    runtime.currentProjectSnapshot = {
      projectId: "project-current-video",
      projectKind: "video",
      title: "雨夜追击预告片",
      currentObjective: "先把失败镜头补发，再处理待审项。",
      derivedStage: "审阅与修复",
      agentSummary: "当前有失败镜头和待审素材需要继续处理。",
      recommendedActions: ["补发失败镜头", "处理待审项"],
      artifacts: [],
      memory: {
        styleLock: null,
        worldModel: null,
        assetManifest: null,
        videoScenes: [
          {
            id: "scene-failed-1",
            sceneNumber: 3,
            sceneName: "雨夜追车",
            videoStatus: "failed",
            videoFailureMessage: "当前镜头生成失败，需要重新补发。",
          },
          {
            id: "scene-running-1",
            sceneNumber: 4,
            sceneName: "高架疾驰",
            videoStatus: "processing",
            videoTaskId: "task-4",
          },
        ],
        shotPackets: [],
        reviewQueue: [
          {
            id: "review-1",
            title: "审阅镜头 5",
            summary: "需要决定是否通过。",
            targetIds: ["scene-review-1"],
            status: "pending",
            createdAt: "2026-04-03T00:00:00.000Z",
            updatedAt: "2026-04-03T00:00:00.000Z",
          },
        ],
      },
    };
    runtime.recentProjects = [];

    const corpus = buildConversationMemoryCorpus(runtime);
    const results = searchConversationMemory(
      "把上次失败的镜头找出来",
      corpus,
      "project-current-video",
      { preferCurrentProject: true },
    );

    expect(isProjectInternalMemoryQuery("把上次失败的镜头找出来")).toBe(true);
    expect(results[0]?.title).toContain("失败镜头");
    expect(results[0]?.projectId).toBe("project-current-video");
  });
});
