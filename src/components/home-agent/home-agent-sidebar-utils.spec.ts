import { describe, expect, it } from "vitest";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";
import type { ConversationProjectSnapshot } from "@/lib/home-agent/types";
import { collectConversationAssets } from "./home-agent-sidebar-utils";

function createVideoProject(): PersistedVideoProject {
  return {
    id: "video-project-1",
    title: "雨夜追击预告片",
    script: "女主在雨夜奔跑。",
    targetPlatform: "抖音",
    shotStyle: "电影感",
    outputGoal: "预告片",
    productionNotes: "",
    scenes: [],
    characters: [],
    sceneSettings: [],
    artStyle: "live-action",
    currentStep: 5,
    systemPrompt: "",
    analysisSummary: "",
    storyboardPlan: "",
    videoPromptBatch: "",
    sourceProjectId: "script-1",
    createdAt: "2026-04-03T00:00:00.000Z",
    updatedAt: "2026-04-03T01:00:00.000Z",
    styleLock: null,
    worldModel: null,
    assetManifest: null,
    shotPackets: [],
    reviewQueue: [],
    productionStateBundle: {
      directoryPath: "D:/StoryForgeFiles/home-agent/production-state/video-project-1",
      overviewPath: "D:/StoryForgeFiles/home-agent/production-state/video-project-1/README.md",
      filePaths: [
        "D:/StoryForgeFiles/home-agent/production-state/video-project-1/README.md",
        "D:/StoryForgeFiles/home-agent/production-state/video-project-1/project.json",
      ],
      exportedCount: 2,
      exportedAt: "2026-04-03T01:00:00.000Z",
    },
  };
}

function createSnapshot(): ConversationProjectSnapshot {
  return {
    projectId: "video-project-1",
    projectKind: "video",
    title: "雨夜追击预告片",
    derivedStage: "生成中",
    currentObjective: "继续回收当前镜头结果。",
    agentSummary: "可以继续轮询或审阅当前资产。",
    recommendedActions: [],
    artifacts: [],
    memory: {
      styleLock: null,
      worldModel: null,
      shotPackets: [],
      reviewQueue: [],
      assetManifest: {
        version: "1",
        items: [
          {
            id: "asset-video-1",
            kind: "video-segment",
            label: "镜头 1 视频",
            url: "https://example.com/video-1.mp4",
            meta: "已完成",
            reusable: false,
            status: "ready",
          },
          {
            id: "asset-image-1",
            kind: "character-sheet",
            label: "沈昭角色图",
            url: "https://example.com/char-1.jpg",
            meta: "角色",
            reusable: true,
            status: "ready",
          },
        ],
      },
      characterStateCards: [],
      storyBeatPackets: [],
      complianceRevisionPackets: [],
    },
  };
}

describe("collectConversationAssets", () => {
  it("prepends the persisted production bundle before manifest-backed assets", () => {
    const assets = collectConversationAssets(createVideoProject(), createSnapshot());

    expect(assets[0]).toMatchObject({
      kind: "bundle",
      label: "生产状态包",
      path: "D:/StoryForgeFiles/home-agent/production-state/video-project-1",
    });
    expect(assets[1]).toMatchObject({
      kind: "video",
      label: "镜头 1 视频",
      url: "https://example.com/video-1.mp4",
    });
    expect(assets[2]).toMatchObject({
      kind: "image",
      label: "沈昭角色图",
      url: "https://example.com/char-1.jpg",
    });
  });
});
