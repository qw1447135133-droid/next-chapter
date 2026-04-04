import { beforeEach, describe, expect, it } from "vitest";
import {
  createDramaSnapshot,
  createVideoSnapshot,
  listRecentConversationSnapshots,
  listStoredDramaProjects,
} from "./project-store";
import type { PersistedVideoProject } from "@/hooks/use-local-persistence";

const DRAMA_PROJECTS_KEY = "storyforge_drama_projects";

describe("project-store legacy compatibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes legacy drama projects with missing workflow arrays", () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "legacy-drama-1",
          dramaTitle: "契约婚姻反转录",
          currentStep: "creative-plan",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
          },
        },
      ]),
    );

    const [project] = listStoredDramaProjects();

    expect(project.directory).toEqual([]);
    expect(project.episodes).toEqual([]);
    expect(project.creativePlan).toBe("");
    expect(project.characters).toBe("");
    expect(project.directoryRaw).toBe("");
  });

  it("creates recent conversation snapshots from partial legacy drama projects", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "legacy-drama-2",
          dramaTitle: "契约婚姻反转录",
          currentStep: "creative-plan",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
            creativeInput: "替父还债的女主和冷面继承人签下契约婚姻。",
          },
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.title).toBe("契约婚姻反转录");
    expect(snapshots[0]?.projectKind).toBe("script");
    expect(snapshots[0]?.recommendedActions.length).toBeGreaterThan(0);
    expect(snapshots[0]?.artifacts.length).toBeGreaterThan(0);
    expect(snapshots[0]?.memory?.styleLock?.genre[0]).toBe("都市言情");
    expect(snapshots[0]?.memory?.worldModel?.continuityRules.length).toBeGreaterThan(0);
  });

  it("derives recovery recommendations from missing setup fields instead of generic stage text", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "drama-missing-setup",
          dramaTitle: "未完成立项",
          currentStep: "setup",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: [],
            audience: "",
            tone: "",
            ending: "HE",
            totalEpisodes: 0,
            targetMarket: "",
          },
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots[0]?.recommendedActions[0]).toContain("补齐");
    expect(snapshots[0]?.recommendedActions.join(" ")).toContain("目标市场");
  });

  it("derives the next episode recommendation from actual completed progress", async () => {
    localStorage.setItem(
      DRAMA_PROJECTS_KEY,
      JSON.stringify([
        {
          id: "drama-episodes-1",
          dramaTitle: "更新中的项目",
          currentStep: "episodes",
          updatedAt: "2026-04-02T00:00:00.000Z",
          createdAt: "2026-04-01T00:00:00.000Z",
          setup: {
            genres: ["都市言情"],
            audience: "女频",
            tone: "甜虐",
            ending: "HE",
            totalEpisodes: 40,
            targetMarket: "cn",
          },
          directory: [
            { number: 1, title: "第一集", summary: "开场", outline: "已完成细纲" },
            { number: 2, title: "第二集", summary: "升级", outline: "已完成细纲" },
            { number: 3, title: "第三集", summary: "反转", outline: "已完成细纲" },
          ],
          episodes: [
            { number: 1, title: "第一集", content: "正文 1" },
            { number: 2, title: "第二集", content: "正文 2" },
          ],
        },
      ]),
    );

    const snapshots = await listRecentConversationSnapshots();

    expect(snapshots[0]?.recommendedActions[0]).toContain("第 3 集");
    expect(snapshots[0]?.agentSummary).toContain("建议下一步先");
  });

  it("builds hidden script production memory into drama snapshots", () => {
    const snapshot = createDramaSnapshot({
      id: "drama-memory-1",
      mode: "traditional",
      setup: {
        genres: ["都市言情"],
        audience: "女频",
        tone: "甜虐",
        ending: "HE",
        totalEpisodes: 40,
        targetMarket: "cn",
        creativeInput: "契约婚姻外壳下的双向救赎。",
      },
      creativePlan: "女主与冷面继承人在契约婚姻里不断试探，逐步发现彼此都在隐瞒旧伤。",
      characters: "沈昭\n身份：女主\n核心冲突：需要在自保与信任之间做选择\n动机：查清父亲旧案\n关系：与顾承砚先婚后爱",
      directory: [
        {
          number: 1,
          title: "签下契约",
          summary: "女主被迫签下婚姻契约。",
          hookType: "强钩子",
          isKey: true,
          isClimax: false,
          isPaywall: false,
          outline: "女主在债务压力下签下契约婚姻，但发现男主另有目的。",
        },
      ],
      directoryRaw: "第1集：签下契约 - 女主被迫签下婚姻契约。",
      episodes: [],
      complianceReport: "1. 高风险：契约胁迫描写过重，建议改成双方各有交换条件。\n2. 中风险：复仇台词过激，建议弱化明确违法引导。",
      currentStep: "compliance",
      dramaTitle: "契约婚姻反转录",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
      referenceScript: "",
      referenceStructure: "",
      frameworkStyle: "",
      structureTransform: "",
      characterTransform: "",
      exportDocument: "",
      styleLock: null,
      worldModel: null,
      characterStateCards: [],
      storyBeatPackets: [],
      complianceRevisionPackets: [],
    });

    expect(snapshot.memory?.characterStateCards?.length).toBeGreaterThan(0);
    expect(snapshot.memory?.storyBeatPackets?.[0]?.episodeNumber).toBe(1);
    expect(snapshot.memory?.complianceRevisionPackets?.length).toBeGreaterThan(0);
    expect(snapshot.artifacts.some((artifact) => artifact.kind === "character-card")).toBe(true);
    expect(snapshot.artifacts.some((artifact) => artifact.kind === "beat-packet")).toBe(true);
    expect(snapshot.recommendedActions[0]).toContain("合规修订包");
  });

  it("builds video production memory into homepage snapshots", () => {
    const videoProject: PersistedVideoProject = {
      id: "video-project-1",
      title: "古风反转短片",
      script: "夜晚，女主在长廊回头，看见刺客逼近。",
      targetPlatform: "抖音",
      shotStyle: "电影感近景",
      outputGoal: "情绪预告片",
      productionNotes: "冷色夜景，保留女主红衣识别点。",
      scenes: [
        {
          id: "scene-1",
          sceneNumber: 1,
          sceneName: "长廊回头",
          description: "女主在长廊回头，刺客逼近。",
          characters: ["沈昭", "刺客"],
          dialogue: "",
          cameraDirection: "中近景，缓推",
          duration: 6,
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
          name: "长廊",
          description: "夜色冷光下的古风长廊",
          imageUrl: "https://example.com/setting-1.jpg",
          isAIGenerated: false,
          source: "auto",
        },
      ],
      artStyle: "live-action",
      currentStep: 3,
      systemPrompt: "",
      analysisSummary: "已完成第一轮镜头拆解。",
      storyboardPlan: "镜头 1：长廊回头",
      videoPromptBatch: "",
      sourceProjectId: "drama-1",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T01:00:00.000Z",
      styleLock: null,
      worldModel: null,
      assetManifest: null,
      shotPackets: [
        {
          id: "packet:video-project-1:scene-1",
          sceneId: "scene-1",
          sceneNumber: 1,
          title: "长廊回头",
          durationSec: 6,
          camera: {
            shotSize: "标准镜头",
            movement: "中近景，缓推",
          },
          characterRefs: [
            {
              characterId: "char-1",
              name: "沈昭",
              assetIds: ["char:char-1:primary"],
              mustPreserve: ["沈昭", "红衣、清冷、警觉"],
            },
          ],
          sourceAssetIds: ["char:char-1:primary", "shot:scene-1:storyboard"],
          promptSeed: "女主在长廊回头，刺客逼近。",
          forbiddenChanges: ["不要改变主角色的识别特征和服装连续性"],
          renderMode: "img2video",
          reviewStatus: "pending",
        },
      ],
      reviewQueue: [
        {
          id: "review:packet:video-project-1:scene-1",
          title: "审阅镜头 1 · 长廊回头",
          summary: "镜头已有可审阅素材，确认是否通过或需要重做。",
          targetIds: ["packet:video-project-1:scene-1"],
          status: "pending",
          createdAt: "2026-04-03T01:00:00.000Z",
          updatedAt: "2026-04-03T01:00:00.000Z",
        },
      ],
    };

    const snapshot = createVideoSnapshot(videoProject);

    expect(snapshot.memory?.styleLock?.genre.length).toBeGreaterThan(0);
    expect(snapshot.memory?.worldModel?.characters[0]?.name).toBe("沈昭");
    expect(snapshot.memory?.assetManifest?.items.length).toBeGreaterThan(0);
    expect(snapshot.memory?.shotPackets?.length).toBe(1);
    expect(snapshot.artifacts.some((artifact) => artifact.kind === "shot-packet")).toBe(true);
  });

  it("includes failed video reasons in homepage recovery snapshots", () => {
    const videoProject: PersistedVideoProject = {
      id: "video-project-failed",
      title: "失败镜头回补",
      script: "女主在雨巷回头，追兵逼近。",
      targetPlatform: "抖音",
      shotStyle: "电影感预告片",
      outputGoal: "补发失败镜头",
      productionNotes: "保持夜雨和红衣识别点。",
      scenes: [
        {
          id: "scene-failed-1",
          sceneNumber: 1,
          sceneName: "雨巷回头",
          description: "女主回头确认追兵距离。",
          characters: ["沈昭"],
          dialogue: "",
          cameraDirection: "手持推近",
          duration: 5,
          videoTaskId: "task-failed-1",
          videoStatus: "failed",
          videoFailure: {
            message: "Seedance rate limit exceeded",
            provider: "jimeng",
            stage: "submit",
            updatedAt: "2026-04-03T01:00:00.000Z",
          },
        },
      ],
      characters: [],
      sceneSettings: [],
      artStyle: "live-action",
      currentStep: 5,
      systemPrompt: "",
      analysisSummary: "有失败镜头待回补。",
      storyboardPlan: "镜头 1：雨巷回头",
      videoPromptBatch: "批次 1：雨巷回头",
      sourceProjectId: "drama-failed-1",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T01:00:00.000Z",
      styleLock: null,
      worldModel: null,
      assetManifest: null,
      shotPackets: [
        {
          id: "packet:video-project-failed:scene-failed-1",
          sceneId: "scene-failed-1",
          sceneNumber: 1,
          title: "雨巷回头",
          durationSec: 5,
          camera: {
            shotSize: "标准镜头",
            movement: "手持推近",
          },
          characterRefs: [],
          sourceAssetIds: [],
          promptSeed: "女主回头确认追兵距离。",
          forbiddenChanges: [],
          renderMode: "text2video",
          reviewStatus: "redo",
        },
      ],
      reviewQueue: [],
    };

    const snapshot = createVideoSnapshot(videoProject);

    expect(snapshot.agentSummary).toContain("Seedance rate limit exceeded");
    expect(snapshot.recommendedActions.join(" ")).toContain("对需要重做的镜头发起修复");
    expect(snapshot.memory?.reviewQueue?.[0]?.reason).toContain("Seedance rate limit exceeded");
  });

  it("restores exported production bundle metadata into homepage video snapshots", () => {
    const videoProject: PersistedVideoProject = {
      id: "video-project-bundle",
      title: "雨夜追击预告片",
      script: "女主在雨夜奔跑，回头看见追兵。",
      targetPlatform: "抖音",
      shotStyle: "电影感近景",
      outputGoal: "预告片",
      productionNotes: "保留主角红衣和夜雨气氛。",
      scenes: [],
      characters: [],
      sceneSettings: [],
      artStyle: "live-action",
      currentStep: 4,
      systemPrompt: "",
      analysisSummary: "镜头指令包已准备好。",
      storyboardPlan: "镜头 1：雨夜追击",
      videoPromptBatch: "批次 1：雨夜追击",
      sourceProjectId: "drama-bundle-1",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T01:30:00.000Z",
      styleLock: null,
      worldModel: null,
      assetManifest: null,
      shotPackets: [],
      reviewQueue: [],
      productionStateBundle: {
        directoryPath: "D:/StoryForgeFiles/home-agent/production-state/雨夜追击预告片-video-project-bundle",
        overviewPath:
          "D:/StoryForgeFiles/home-agent/production-state/雨夜追击预告片-video-project-bundle/README.md",
        filePaths: [
          "D:/StoryForgeFiles/home-agent/production-state/雨夜追击预告片-video-project-bundle/overview.json",
        ],
        exportedCount: 7,
        exportedAt: "2026-04-03T01:20:00.000Z",
      },
    };

    const snapshot = createVideoSnapshot(videoProject);

    expect(snapshot.artifacts.some((artifact) => artifact.label === "生产状态包")).toBe(true);
    expect(snapshot.recommendedActions).toEqual(
      expect.arrayContaining(["预览生产状态摘要", "打开生产状态目录", "导出生产状态包"]),
    );
  });
});
