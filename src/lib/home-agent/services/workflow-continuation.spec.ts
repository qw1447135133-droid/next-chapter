import { describe, expect, it } from "vitest";
import { createEmptyDramaProject, type DramaProject, type DramaSetup } from "@/types/drama";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import { planDramaWorkflowContinuation } from "./drama-workflow-service";
import { planVideoWorkflowContinuation } from "./video-workflow-service";

function createDramaSetup(): DramaSetup {
  return {
    genres: ["都市言情"],
    audience: "女频",
    tone: "甜虐",
    ending: "HE",
    totalEpisodes: 40,
    targetMarket: "cn",
    setupMode: "creative",
    creativeInput: "一个都市反转短剧创意",
  };
}

function createDramaProject(
  overrides: Partial<DramaProject> = {},
  mode: DramaProject["mode"] = "traditional",
): DramaProject {
  return {
    ...createEmptyDramaProject(mode),
    setup: createDramaSetup(),
    ...overrides,
  };
}

function createVideoProject(
  overrides: Partial<PersistedVideoProject> = {},
): PersistedVideoProject {
  const now = "2026-04-02T00:00:00.000Z";
  return {
    id: "video-project-1",
    title: "视频项目",
    script: "第一集剧情脚本正文",
    targetPlatform: "",
    shotStyle: "",
    outputGoal: "",
    productionNotes: "",
    scenes: [],
    characters: [],
    sceneSettings: [],
    artStyle: "live-action",
    currentStep: 1,
    systemPrompt: "",
    analysisSummary: "",
    storyboardPlan: "",
    videoPromptBatch: "",
    sourceProjectId: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("workflow continuation planners", () => {
  it("plans the creative plan first for a new traditional drama project", () => {
    const project = createDramaProject({
      creativePlan: "",
      characters: "",
      directory: [],
      directoryRaw: "",
      episodes: [],
    });

    const plan = planDramaWorkflowContinuation(project);

    expect(plan.actionKind).toBe("generate_creative_plan");
  });

  it("plans the next missing outline batch for a drama directory", () => {
    const project = createDramaProject({
      creativePlan: "创作方案",
      characters: "角色设定",
      directoryRaw: "目录",
      directory: [
        {
          number: 1,
          title: "第一集",
          summary: "第一集摘要",
          hookType: "反转",
          isKey: true,
          isClimax: false,
          isPaywall: false,
          outline: "已存在细纲",
        },
        {
          number: 2,
          title: "第二集",
          summary: "第二集摘要",
          hookType: "悬念",
          isKey: false,
          isClimax: false,
          isPaywall: true,
        },
        {
          number: 3,
          title: "第三集",
          summary: "第三集摘要",
          hookType: "升级",
          isKey: false,
          isClimax: true,
          isPaywall: false,
        },
      ],
    });

    const plan = planDramaWorkflowContinuation(project);

    expect(plan.actionKind).toBe("generate_outlines");
    expect(plan.input).toMatchObject({
      rangeStart: 2,
      rangeEnd: 3,
    });
  });

  it("plans the first missing episode after outlines are ready", () => {
    const project = createDramaProject({
      creativePlan: "创作方案",
      characters: "角色设定",
      directoryRaw: "目录",
      directory: [
        {
          number: 1,
          title: "第一集",
          summary: "第一集摘要",
          hookType: "反转",
          isKey: true,
          isClimax: false,
          isPaywall: false,
          outline: "第一集细纲",
        },
        {
          number: 2,
          title: "第二集",
          summary: "第二集摘要",
          hookType: "升级",
          isKey: false,
          isClimax: true,
          isPaywall: false,
          outline: "第二集细纲",
        },
      ],
      episodes: [
        {
          number: 1,
          title: "第一集",
          content: "第一集正文",
          wordCount: 1200,
        },
      ],
    });

    const plan = planDramaWorkflowContinuation(project);

    expect(plan.actionKind).toBe("generate_episode");
    expect(plan.input).toMatchObject({
      episodeNumber: 2,
    });
  });

  it("plans reference analysis first for adaptation projects", () => {
    const project = createDramaProject(
      {
        referenceScript: "参考剧本正文",
        referenceStructure: "",
        structureTransform: "",
        characterTransform: "",
        characters: "",
      },
      "adaptation",
    );

    const plan = planDramaWorkflowContinuation(project);

    expect(plan.actionKind).toBe("analyze_reference_script");
  });

  it("plans script analysis first when a video project still has no scenes", () => {
    const project = createVideoProject({
      scenes: [],
      characters: [],
      sceneSettings: [],
    });

    const plan = planVideoWorkflowContinuation(project);

    expect(plan.actionKind).toBe("analyze_script_for_video");
  });

  it("plans entity extraction when scene settings are still missing", () => {
    const project = createVideoProject({
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          sceneName: "开场",
          description: "角色进入空间",
          characters: ["主角"],
          dialogue: "",
          cameraDirection: "",
          duration: 5,
        },
      ],
      characters: [
        {
          id: "char-1",
          name: "主角",
          description: "女主角",
          isAIGenerated: false,
          source: "auto",
        },
      ],
      sceneSettings: [],
    });

    const plan = planVideoWorkflowContinuation(project);

    expect(plan.actionKind).toBe("extract_video_entities");
  });
});
