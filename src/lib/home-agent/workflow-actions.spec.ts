import { describe, expect, it } from "vitest";
import { runWorkflowAction } from "./workflow-actions";
import type { StudioRuntimeState } from "./types";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { DramaProject } from "@/types/drama";

function createRuntime(): StudioRuntimeState {
  return {
    sessionId: "session-1",
    currentProjectSnapshot: {
      projectId: "project-1",
      projectKind: "script",
      title: "契约婚姻反转录",
      currentObjective: "继续完善创意方案。",
      derivedStage: "创意方案",
      agentSummary: "已整理创意方案和角色设定，建议优先进入分集目录。",
      recommendedActions: ["生成分集目录", "强化角色冲突", "补充人物口吻要求"],
      artifacts: [
        {
          id: "artifact-1",
          kind: "plan",
          label: "创意方案",
          summary: "女主与继承人的契约婚姻进入反转阶段。",
          updatedAt: "2026-04-03T00:00:00.000Z",
        },
      ],
      memory: {
        styleLock: null,
        worldModel: null,
        assetManifest: null,
        shotPackets: [],
        reviewQueue: [],
        characterStateCards: [
          {
            id: "drama-action-1-character-card-0",
            name: "沈昭",
            role: "女主",
            coreConflict: "在自保与信任之间摇摆。",
            desire: "查清旧案。",
            riskNote: "一旦失手会失去全部筹码。",
            relationshipAxis: ["顾承砚：先婚后爱"],
            stageFocus: "继续强化人物拉扯",
            status: "locked",
          },
        ],
        storyBeatPackets: [
          {
            id: "beat-1",
            episodeNumber: 1,
            title: "签下契约",
            beatSummary: "女主被迫签下婚姻契约。",
            hook: "契约签订",
            payoff: "发现男主另有目的。",
            status: "drafted",
          },
        ],
        complianceRevisionPackets: [
          {
            id: "compliance-1",
            issueTitle: "胁迫描写过重",
            riskLevel: "high",
            recommendation: "改成双方交换条件。",
            status: "pending",
          },
        ],
      },
    },
    currentDramaProject: null,
    currentVideoProject: null,
    currentSetupDraft: null,
    skillDrafts: [],
    maintenanceReports: [],
    recentProjects: [],
    recentMessageSummary: "assistant: 继续保留第 2 集的张力。",
  };
}

describe("workflow-actions get_context", () => {
  it("returns an agent-readable structured summary instead of raw JSON", async () => {
    const result = await runWorkflowAction("get_context", {}, createRuntime());

    expect(result.summary).toContain("当前项目：契约婚姻反转录 / script / 创意方案");
    expect(result.summary).toContain("推荐动作：");
    expect(result.summary).toContain("创意方案: 女主与继承人的契约婚姻进入反转阶段。");
    expect(result.summary).toContain("最近会话摘要：assistant: 继续保留第 2 集的张力。");
    expect(result.summary).toContain("角色状态卡：1 张");
    expect(result.summary).toContain("剧情 beat 包：1 条");
    expect(result.summary).toContain("合规修订包：1 条");
  });

  it("compiles shot packets and review memory for video projects", async () => {
    const videoProject: PersistedVideoProject = {
      id: "video-1",
      title: "古风追击短片",
      script: "女主在雨夜奔跑，回头看见追兵。",
      targetPlatform: "抖音",
      shotStyle: "电影感近景",
      outputGoal: "预告片",
      productionNotes: "保留主角红衣和夜雨气氛。",
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          sceneName: "雨夜追击",
          description: "女主在雨夜奔跑，回头看见追兵。",
          characters: ["沈昭"],
          dialogue: "",
          cameraDirection: "中景，跟拍",
          duration: 5,
          storyboardUrl: "https://example.com/storyboard-1.jpg",
          videoUrl: "https://example.com/video-1.mp4",
          videoStatus: "completed",
        },
      ],
      characters: [
        {
          id: "char-1",
          name: "沈昭",
          description: "红衣、清冷、警觉",
          imageUrl: "https://example.com/char-1.jpg",
          isAIGenerated: false,
          source: "auto",
        },
      ],
      sceneSettings: [
        {
          id: "setting-1",
          name: "雨夜长街",
          description: "冷色夜雨中的长街",
          imageUrl: "https://example.com/scene-1.jpg",
          isAIGenerated: false,
          source: "auto",
        },
      ],
      artStyle: "live-action",
      currentStep: 3,
      systemPrompt: "",
      analysisSummary: "已拆镜并整理角色场景。",
      storyboardPlan: "镜头 1：雨夜追击",
      videoPromptBatch: "",
      sourceProjectId: "drama-1",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:30:00.000Z",
      styleLock: null,
      worldModel: null,
      assetManifest: null,
      shotPackets: [],
      reviewQueue: [],
    };

    const runtime: StudioRuntimeState = {
      ...createRuntime(),
      currentProjectSnapshot: null,
      currentVideoProject: videoProject,
    };

    const compiled = await runWorkflowAction("compile_video_shot_packets", {}, runtime);
    expect(compiled.projectSnapshot?.memory?.shotPackets?.length).toBe(1);
    expect(compiled.projectSnapshot?.memory?.assetManifest?.items.length).toBeGreaterThan(0);

    const reviewed = await runWorkflowAction(
      "redo_video_assets",
      { targetIds: [compiled.projectSnapshot?.memory?.shotPackets?.[0]?.id], reason: "夜雨颗粒感不够强" },
      {
        ...runtime,
        currentVideoProject: compiled.data?.videoProject ?? null,
        currentProjectSnapshot: compiled.projectSnapshot ?? null,
      },
    );

    expect(reviewed.projectSnapshot?.memory?.reviewQueue?.some((item) => item.status === "redo")).toBe(true);
    expect(reviewed.summary).toContain("重做");
  });

  it("locks script beat packets and resolves compliance revision packets", async () => {
    const dramaProject: DramaProject = {
      id: "drama-action-1",
      mode: "traditional",
      setup: {
        genres: ["都市言情"],
        audience: "女频",
        tone: "甜虐",
        ending: "HE",
        totalEpisodes: 40,
        targetMarket: "cn",
      },
      creativePlan: "契约婚姻里的双向试探。",
      characters: "沈昭\n身份：女主\n核心冲突：在自保与信任之间摇摆",
      directory: [
        {
          number: 1,
          title: "签下契约",
          summary: "女主签下契约婚姻。",
          hookType: "强钩子",
          isKey: true,
          isClimax: false,
          isPaywall: false,
          outline: "签约后发现男主另有目的。",
        },
      ],
      directoryRaw: "第1集：签下契约 - 女主签下契约婚姻。",
      episodes: [],
      complianceReport: "1. 高风险：契约胁迫感过重，建议改成双方交换条件。",
      currentStep: "compliance",
      dramaTitle: "契约婚姻反转录",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:30:00.000Z",
      referenceScript: "",
      referenceStructure: "",
      frameworkStyle: "",
      structureTransform: "",
      characterTransform: "",
      exportDocument: "",
      styleLock: null,
      worldModel: null,
      characterStateCards: [
        {
          id: "drama-action-1-character-card-0",
          name: "沈昭",
          role: "女主",
          coreConflict: "在自保与信任之间摇摆。",
          desire: "查清旧案。",
          riskNote: "失去最后筹码。",
          relationshipAxis: ["顾承砚：先婚后爱"],
          stageFocus: "继续强化人物拉扯",
          status: "pending",
        },
      ],
      storyBeatPackets: [
        {
          id: "drama-action-1-beat-1",
          episodeNumber: 1,
          title: "签下契约",
          beatSummary: "女主签下契约婚姻。",
          hook: "契约签订",
          payoff: "男主另有目的。",
          status: "drafted",
        },
      ],
      complianceRevisionPackets: [
        {
          id: "drama-action-1-compliance-0",
          issueTitle: "契约胁迫感过重",
          riskLevel: "high",
          recommendation: "改成双方交换条件。",
          status: "pending",
        },
      ],
    };

    const runtime: StudioRuntimeState = {
      ...createRuntime(),
      currentDramaProject: dramaProject,
      currentProjectSnapshot: null,
    };

    const locked = await runWorkflowAction(
      "lock_character_cards",
      { targetIds: ["drama-action-1-character-card-0"] },
      runtime,
    );
    expect(locked.projectSnapshot?.memory?.characterStateCards?.[0]?.status).toBe("locked");

    const beatLocked = await runWorkflowAction(
      "lock_story_beats",
      { targetIds: ["drama-action-1-beat-1"] },
      {
        ...runtime,
        currentDramaProject: locked.data?.dramaProject ?? null,
        currentProjectSnapshot: locked.projectSnapshot ?? null,
      },
    );
    expect(beatLocked.projectSnapshot?.memory?.storyBeatPackets?.[0]?.status).toBe("locked");

    const resolved = await runWorkflowAction(
      "resolve_compliance_revisions",
      { targetIds: ["drama-action-1-compliance-0"] },
      {
        ...runtime,
        currentDramaProject: beatLocked.data?.dramaProject ?? null,
        currentProjectSnapshot: beatLocked.projectSnapshot ?? null,
      },
    );
    expect(resolved.projectSnapshot?.memory?.complianceRevisionPackets?.[0]?.status).toBe("resolved");
  });
});
